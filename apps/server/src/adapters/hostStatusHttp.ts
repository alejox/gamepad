import type { IncomingMessage, ServerResponse } from "node:http";
import { hostname } from "node:os";
import { DISCOVERY_SERVICE, type DiscoveryInfo, PROTOCOL_VERSION } from "@gamepad/shared";
import type { ControllerStatus, PairingApproval, PendingRequest } from "../ports/ControllerStatus.js";
import { HOST_STATUS_SCRIPT_HASH, renderHostStatusPage } from "./hostStatusPage.js";
import type { HttpRequestHandler } from "./WebSocketGamepadServer.js";

export type HostMode = "dry-run" | "emulation";

/** The output driver in use: a virtual pad or keyboard/mouse emulation. */
export interface HostDriver {
  kind: "gamepad" | "keyboard";
  /** Display name, e.g. "Keyboard / mouse". */
  name: string;
}

/** Everything the host status page shows. Contains the PIN: loopback only. */
export interface HostStatusSnapshot {
  /** Reachable `ip:port` addresses for the phone. */
  addresses: string[];
  port: number;
  pin: string;
  mode: HostMode;
  driver: HostDriver;
  controller: ControllerStatus;
  /** Phone waiting for Allow / Deny, or null. */
  pending: PendingRequest | null;
}

export interface HostStatusHttp extends HttpRequestHandler {
  /** Pushes the current snapshot to every open /events stream. */
  notify(): void;
}

export interface HostStatusHttpOptions {
  snapshot: () => HostStatusSnapshot;
  /** Backs `POST /approve` and `POST /deny`; without it both answer 409. */
  approval?: PairingApproval;
  /** Name announced by `/discover`; defaults to the OS host name. */
  hostName?: string;
}

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const PAGE_CSP = `default-src 'none'; style-src 'unsafe-inline'; script-src '${HOST_STATUS_SCRIPT_HASH}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;
const DISCOVER_HEADERS = {
  ...NO_STORE,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "600",
};
const PAGE_PATHS = new Set(["/", "/status", "/events"]);
const ACTION_PATHS = new Set(["/approve", "/deny"]);

/** True only for requests that originate on this machine. */
export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}

/**
 * True when the Host header names this machine, which blocks DNS rebinding:
 * a foreign page cannot make the browser send `Host: localhost`.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/**
 * CSRF guard for state-changing actions: a JSON body (never sendable by a
 * plain form) and an Origin naming exactly the loopback host this page is on.
 */
export function isTrustedAction(req: IncomingMessage): boolean {
  const contentType = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return false;
  const origin = req.headers.origin;
  const host = req.headers.host?.toLowerCase();
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && url.host === host && isLoopbackHost(url.host);
  } catch {
    return false;
  }
}

/**
 * Serves the public `/discover` probe to anyone, and `/` (HTML), `/status`
 * (JSON), `/events` (SSE), `POST /approve` and `POST /deny` to loopback clients.
 */
export function createHostStatusHttp({
  snapshot,
  approval,
  hostName = hostname(),
}: HostStatusHttpOptions): HostStatusHttp {
  const streams = new Set<ServerResponse>();

  const sendEvent = (res: ServerResponse): void => {
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  };

  const plain = (res: ServerResponse, status: number, text: string, extra: Record<string, string> = {}): void => {
    res.writeHead(status, { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", ...extra });
    res.end(text);
  };

  const discover = (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, DISCOVER_HEADERS);
      res.end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { ...DISCOVER_HEADERS, Allow: "GET, OPTIONS" });
      res.end();
      return;
    }
    const info: DiscoveryInfo = {
      service: DISCOVERY_SERVICE,
      protocol: PROTOCOL_VERSION,
      name: hostName,
      port: req.socket.localPort ?? snapshot().port,
    };
    res.writeHead(200, { ...DISCOVER_HEADERS, "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(info));
  };

  const act = (req: IncomingMessage, res: ServerResponse, path: string): void => {
    if (req.method !== "POST") {
      plain(res, 405, "Method not allowed\n", { Allow: "POST" });
      return;
    }
    if (!isTrustedAction(req)) {
      plain(res, 403, "Forbidden: cross-site request rejected.\n");
      return;
    }
    req.resume(); // The body carries nothing; drain it so the connection can be reused.
    const done = path === "/approve" ? approval?.approve() : approval?.deny();
    if (!done) {
      plain(res, 409, "No pending connection request\n");
      return;
    }
    res.writeHead(204, NO_STORE);
    res.end();
  };

  return {
    handle(req, res) {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      // Public and cheap: answered before any other check so subnet scans stay fast.
      if (path === "/discover") {
        discover(req, res);
        return;
      }
      if (!isLoopbackAddress(req.socket.remoteAddress) || !isLoopbackHost(req.headers.host)) {
        plain(res, 403, "Forbidden: the host status page is only available on this computer.\n");
        return;
      }
      if (ACTION_PATHS.has(path)) {
        act(req, res, path);
        return;
      }
      if (!PAGE_PATHS.has(path)) {
        plain(res, 404, "Not found\n");
        return;
      }
      if (req.method !== "GET") {
        plain(res, 405, "Method not allowed\n", { Allow: "GET" });
        return;
      }

      if (path === "/") {
        res.writeHead(200, {
          ...NO_STORE,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": PAGE_CSP,
          "Referrer-Policy": "no-referrer",
        });
        res.end(renderHostStatusPage(snapshot()));
      } else if (path === "/status") {
        res.writeHead(200, { ...NO_STORE, "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(snapshot()));
      } else {
        res.writeHead(200, {
          ...NO_STORE,
          "Content-Type": "text/event-stream; charset=utf-8",
          Connection: "keep-alive",
        });
        streams.add(res);
        res.on("close", () => streams.delete(res));
        sendEvent(res);
      }
    },

    notify() {
      for (const res of streams) sendEvent(res);
    },

    close() {
      for (const res of streams) res.end();
      streams.clear();
    },
  };
}
