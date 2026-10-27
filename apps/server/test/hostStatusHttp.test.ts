import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  type HostStatusSnapshot,
  createHostStatusHttp,
  isLoopbackAddress,
  isLoopbackHost,
} from "../src/adapters/hostStatusHttp.js";
import { renderHostStatusPage } from "../src/adapters/hostStatusPage.js";

const PIN = "135790";

const snapshot = (): HostStatusSnapshot => ({
  addresses: ["192.168.1.20:7531"],
  port: 7531,
  pin: PIN,
  mode: "dry-run",
  driver: { kind: "gamepad", name: "Virtual Xbox 360 pad (dry run)" },
  controller: { connected: false, remoteAddress: null },
  pending: null,
});

interface FakeResponse {
  status: number | undefined;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
}

function request(url: string, remoteAddress: string | undefined, host = "localhost:7531", method = "GET") {
  const fake: FakeResponse = { status: undefined, headers: {}, body: "", ended: false };
  const req = { url, method, headers: { host }, socket: { remoteAddress }, on: () => req } as unknown as IncomingMessage;
  const res = {
    writeHead(status: number, headers: Record<string, string> = {}) {
      fake.status = status;
      fake.headers = headers;
      return res;
    },
    write(chunk: string) {
      fake.body += chunk;
      return true;
    },
    end(chunk?: string) {
      if (chunk) fake.body += chunk;
      fake.ended = true;
      return res;
    },
    on: () => res,
  } as unknown as ServerResponse;
  createHostStatusHttp({ snapshot }).handle(req, res);
  return fake;
}

describe("isLoopbackAddress", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("accepts %s", (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each(["192.168.1.20", "::ffff:192.168.1.20", "10.0.0.1", "fe80::1", "0.0.0.0", "", undefined])(
    "rejects %s",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(false);
    },
  );
});

describe("isLoopbackHost", () => {
  it.each(["localhost", "localhost:7531", "127.0.0.1:7531", "[::1]:7531", "LOCALHOST:7531"])("accepts %s", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(["evil.example:7531", "192.168.1.20:7531", "localhost.evil.example", "", undefined])("rejects %s", (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("host status HTTP handler", () => {
  it("rejects non-loopback clients with 403 and no PIN", () => {
    for (const path of ["/", "/status", "/events", "/missing"]) {
      const res = request(path, "192.168.1.50");
      expect(res.status).toBe(403);
      expect(res.body).not.toContain(PIN);
    }
  });

  it("rejects loopback requests with a foreign Host header (DNS rebinding)", () => {
    const res = request("/status", "127.0.0.1", "attacker.example:7531");
    expect(res.status).toBe(403);
    expect(res.body).not.toContain(PIN);
  });

  it("returns 404 for unknown paths", () => {
    expect(request("/nope", "127.0.0.1").status).toBe(404);
  });

  it("returns 405 for non-GET methods", () => {
    expect(request("/status", "127.0.0.1", "localhost:7531", "POST").status).toBe(405);
  });

  it("serves the snapshot as JSON to loopback clients", () => {
    const res = request("/status?x=1", "::ffff:127.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual(snapshot());
  });
});

describe("public discovery endpoint", () => {
  it("answers /discover to any address and Host header, with CORS and without the PIN", () => {
    const res = request("/discover", "192.168.1.50", "192.168.1.20:7531");
    expect(res.status).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Content-Type"]).toContain("application/json");
    expect(res.body).not.toContain(PIN);
    expect(JSON.parse(res.body)).toEqual({ service: "alejox-gamepad", protocol: 1, name: hostname(), port: 7531 });
  });

  it("answers the CORS preflight for /discover", () => {
    const res = request("/discover", "192.168.1.50", "192.168.1.20:7531", "OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(res.body).toBe("");
  });

  it("rejects other methods on /discover", () => {
    const res = request("/discover", "192.168.1.50", "192.168.1.20:7531", "POST");
    expect(res.status).toBe(405);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("keeps approve/deny loopback-only", () => {
    for (const path of ["/approve", "/deny"]) {
      expect(request(path, "192.168.1.50", "192.168.1.20:7531", "POST").status).toBe(403);
      expect(request(path, "127.0.0.1", "attacker.example:7531", "POST").status).toBe(403);
    }
  });
});

describe("quit action", () => {
  function quitRequest(
    stop: (() => void) | undefined,
    opts: { address?: string; host?: string; origin?: string; method?: string } = {},
  ) {
    const fake: FakeResponse = { status: undefined, headers: {}, body: "", ended: false };
    const req = {
      url: "/quit",
      method: opts.method ?? "POST",
      headers: {
        host: opts.host ?? "localhost:7531",
        origin: opts.origin ?? "http://localhost:7531",
        "content-type": "application/json",
      },
      socket: { remoteAddress: opts.address ?? "127.0.0.1" },
      on: () => req,
      resume: () => {},
    } as unknown as IncomingMessage;
    const res = {
      writeHead(status: number, headers: Record<string, string> = {}) {
        fake.status = status;
        fake.headers = headers;
        return res;
      },
      write(chunk: string) {
        fake.body += chunk;
        return true;
      },
      end(chunk?: string) {
        if (chunk) fake.body += chunk;
        fake.ended = true;
        return res;
      },
      on: () => res,
    } as unknown as ServerResponse;
    const options = stop === undefined ? { snapshot } : { snapshot, stop };
    createHostStatusHttp(options).handle(req, res);
    return fake;
  }

  it("stops and answers 204 for a trusted loopback POST", async () => {
    const stop = vi.fn();
    const res = quitRequest(stop);
    expect(res.status).toBe(204);
    await new Promise((resolve) => setImmediate(resolve));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("answers 409 when no stop handler is wired", () => {
    expect(quitRequest(undefined).status).toBe(409);
  });

  it("stays loopback-only and rejects cross-site requests", () => {
    expect(quitRequest(vi.fn(), { address: "192.168.1.50" }).status).toBe(403);
    expect(quitRequest(vi.fn(), { origin: "http://evil.example" }).status).toBe(403);
    expect(quitRequest(vi.fn(), { method: "GET" }).status).toBe(405);
  });
});

describe("renderHostStatusPage", () => {
  it("renders the PIN, addresses and mode", () => {
    const html = renderHostStatusPage(snapshot());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(PIN);
    expect(html).toContain("192.168.1.20:7531");
    expect(html).toContain("Dry run");
    expect(html).toContain("Virtual Xbox 360 pad (dry run)");
    expect(html).toContain('id="driver"');
    expect(html).toContain("EventSource");
  });

  it("escapes interpolated values", () => {
    const html = renderHostStatusPage({ ...snapshot(), addresses: ["<script>alert(1)</script>"] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a pending request card with escaped device name and Allow/Deny buttons", () => {
    const html = renderHostStatusPage({
      ...snapshot(),
      pending: { remoteAddress: "192.168.1.77", device: "<img src=x onerror=alert(1)>" },
    });
    expect(html).toContain("Connection request from");
    expect(html).toContain("192.168.1.77");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(">Allow<");
    expect(html).toContain(">Deny<");
  });

  it("hides the request card when nothing is pending", () => {
    expect(renderHostStatusPage(snapshot())).toMatch(/id="request"[^>]*hidden/);
  });

  it("renders a Stop button that posts /quit", () => {
    const html = renderHostStatusPage(snapshot());
    expect(html).toContain('id="stop"');
    expect(html).toContain("/quit");
  });

  it("allows exactly the page script through a CSP hash", () => {
    const res = request("/", "127.0.0.1");
    const csp = res.headers["Content-Security-Policy"] ?? "";
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/);
    const script = /<script>([\s\S]*?)<\/script>/.exec(res.body)?.[1] ?? "";
    const digest = createHash("sha256").update(script).digest("base64");
    expect(scriptSrc).toBe(`'sha256-${digest}'`);
  });
});
