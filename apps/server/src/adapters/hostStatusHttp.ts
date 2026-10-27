import type { ServerResponse } from "node:http";
import type { ControllerStatus } from "../ports/ControllerStatus.js";
import { renderHostStatusPage } from "./hostStatusPage.js";
import type { HttpRequestHandler } from "./WebSocketGamepadServer.js";

export type HostMode = "dry-run" | "emulation";

/** Everything the host status page shows. Contains the PIN: loopback only. */
export interface HostStatusSnapshot {
  /** Reachable `ip:port` addresses for the phone. */
  addresses: string[];
  port: number;
  pin: string;
  mode: HostMode;
  controller: ControllerStatus;
}

export interface HostStatusHttp extends HttpRequestHandler {
  /** Pushes the current snapshot to every open /events stream. */
  notify(): void;
}

export interface HostStatusHttpOptions {
  snapshot: () => HostStatusSnapshot;
}

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

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

/** Serves `/` (HTML), `/status` (JSON) and `/events` (SSE) to loopback clients. */
export function createHostStatusHttp({ snapshot }: HostStatusHttpOptions): HostStatusHttp {
  const streams = new Set<ServerResponse>();

  const sendEvent = (res: ServerResponse): void => {
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  };

  const plain = (res: ServerResponse, status: number, text: string, extra: Record<string, string> = {}): void => {
    res.writeHead(status, { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", ...extra });
    res.end(text);
  };

  return {
    handle(req, res) {
      if (!isLoopbackAddress(req.socket.remoteAddress) || !isLoopbackHost(req.headers.host)) {
        plain(res, 403, "Forbidden: the host status page is only available on this computer.\n");
        return;
      }
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      const known = path === "/" || path === "/status" || path === "/events";
      if (!known) {
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
