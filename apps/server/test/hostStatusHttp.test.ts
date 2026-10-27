import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
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
  controller: { connected: false, remoteAddress: null },
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

describe("renderHostStatusPage", () => {
  it("renders the PIN, addresses and mode", () => {
    const html = renderHostStatusPage(snapshot());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(PIN);
    expect(html).toContain("192.168.1.20:7531");
    expect(html).toContain("Dry run");
    expect(html).toContain("EventSource");
  });

  it("escapes interpolated values", () => {
    const html = renderHostStatusPage({ ...snapshot(), addresses: ["<script>alert(1)</script>"] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
