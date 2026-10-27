import { hostname } from "node:os";
import { DEFAULT_MAPPING, type ServerMessage } from "@gamepad/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { type HostStatusSnapshot, createHostStatusHttp } from "../src/adapters/hostStatusHttp.js";
import { type GamepadServerOptions, WebSocketGamepadServer } from "../src/adapters/WebSocketGamepadServer.js";
import { FakeInputDriver } from "./FakeInputDriver.js";

const PIN = "975310";
const silent = { info: () => {}, warn: () => {} };

interface Client {
  ws: WebSocket;
  messages: ServerMessage[];
  closed: Promise<{ code: number; reason: string }>;
  send(value: unknown): void;
}

let server: WebSocketGamepadServer | undefined;
let driver: FakeInputDriver;

async function startServer(overrides: Partial<GamepadServerOptions> = {}): Promise<number> {
  driver = new FakeInputDriver();
  let port = 0;
  const http = createHostStatusHttp({
    snapshot: (): HostStatusSnapshot => ({
      addresses: [`192.168.1.20:${port}`],
      port,
      pin: PIN,
      mode: "dry-run",
      controller: server?.controllerStatus() ?? { connected: false, remoteAddress: null },
      pending: server?.pendingRequest() ?? null,
    }),
    approval: {
      approve: () => server?.approvePending() ?? false,
      deny: () => server?.denyPending() ?? false,
    },
  });
  server = new WebSocketGamepadServer({
    host: "127.0.0.1",
    port: 0,
    pin: PIN,
    driver,
    logger: silent,
    deadzone: 0.3,
    mouse: { deadzone: 0.1, sensitivity: 2000, exponent: 1 },
    http,
    onStatusChange: () => http.notify(),
    ...overrides,
  });
  port = await server.start();
  return port;
}

async function connect(port: number): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: ServerMessage[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(String(data)) as ServerMessage));
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.on("close", (code, reason) => resolve({ code, reason: String(reason) })),
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, messages, closed, send: (value) => ws.send(JSON.stringify(value)) };
}

async function requestApproval(port: number, device = "Pixel 8"): Promise<Client> {
  const client = await connect(port);
  client.send({ t: "request", v: 1, device, mapping: DEFAULT_MAPPING });
  await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "pending" }));
  return client;
}

async function getStatus(port: number): Promise<HostStatusSnapshot> {
  const response = await fetch(`http://127.0.0.1:${port}/status`);
  expect(response.status).toBe(200);
  return (await response.json()) as HostStatusSnapshot;
}

function post(
  port: number,
  path: "/approve" | "/deny",
  headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: `http://127.0.0.1:${port}`,
  },
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: "{}" });
}

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("GET /discover", () => {
  it("answers the service, protocol, host name and port without the PIN, with CORS", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/discover`);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const text = await response.text();
    expect(text).not.toContain(PIN);
    expect(JSON.parse(text)).toEqual({ service: "alejox-gamepad", protocol: 1, name: hostname(), port });
  });
});

describe("approval pairing", () => {
  it("shows the pending request, and approving makes it the active controller", async () => {
    const port = await startServer();
    const client = await requestApproval(port);
    expect((await getStatus(port)).pending).toEqual({ remoteAddress: "127.0.0.1", device: "Pixel 8" });

    const response = await post(port, "/approve");
    expect(response.status).toBe(204);
    await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "welcome" }));

    const status = await getStatus(port);
    expect(status.pending).toBeNull();
    expect(status.controller).toEqual({ connected: true, remoteAddress: "127.0.0.1" });

    client.send({ t: "btn", id: "a", down: true });
    await vi.waitFor(() => expect(driver.calls.length).toBeGreaterThan(0));
    client.ws.close();
    await vi.waitFor(async () => expect((await getStatus(port)).controller.connected).toBe(false));
  });

  it("denying sends denied and closes the connection", async () => {
    const port = await startServer();
    const client = await requestApproval(port);
    expect((await post(port, "/deny")).status).toBe(204);
    await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "denied" }));
    expect((await client.closed).code).toBe(1008);
    const status = await getStatus(port);
    expect(status.pending).toBeNull();
    expect(status.controller.connected).toBe(false);
  });

  it("answers 409 when there is nothing to approve or deny", async () => {
    const port = await startServer();
    expect((await post(port, "/approve")).status).toBe(409);
    expect((await post(port, "/deny")).status).toBe(409);
  });

  it("times out an unanswered request", async () => {
    const port = await startServer({ approvalTimeoutMs: 50 });
    const client = await requestApproval(port);
    expect((await client.closed).code).toBe(1008);
    expect(client.messages).toContainEqual({ t: "error", code: "timeout" });
    expect((await getStatus(port)).pending).toBeNull();
  });

  it("clears the pending request when the phone disconnects", async () => {
    const port = await startServer();
    const client = await requestApproval(port);
    client.ws.close();
    await vi.waitFor(async () => expect((await getStatus(port)).pending).toBeNull());
    expect((await post(port, "/approve")).status).toBe(409);
  });

  it("answers busy when a controller is already active", async () => {
    const port = await startServer();
    const paired = await connect(port);
    paired.send({ t: "hello", v: 1, pin: PIN });
    await vi.waitFor(() => expect(paired.messages).toContainEqual({ t: "welcome" }));

    const late = await connect(port);
    late.send({ t: "request", v: 1, device: "Late" });
    expect((await late.closed).code).toBe(1008);
    expect(late.messages).toContainEqual({ t: "error", code: "busy" });
    paired.ws.close();
  });

  it("answers busy when another request is already pending", async () => {
    const port = await startServer();
    const first = await requestApproval(port, "First");
    const second = await connect(port);
    second.send({ t: "request", v: 1, device: "Second" });
    expect((await second.closed).code).toBe(1008);
    expect(second.messages).toContainEqual({ t: "error", code: "busy" });
    expect((await getStatus(port)).pending).toEqual({ remoteAddress: "127.0.0.1", device: "First" });
    first.ws.close();
  });

  it("rejects an unsupported protocol version", async () => {
    const port = await startServer();
    const client = await connect(port);
    client.send({ t: "request", v: 99, device: "Phone" });
    await client.closed;
    expect(client.messages).toContainEqual({ t: "error", code: "version" });
  });

  it("keeps PIN pairing working", async () => {
    const port = await startServer();
    const client = await connect(port);
    client.send({ t: "hello", v: 1, pin: PIN });
    await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "welcome" }));
    expect((await getStatus(port)).controller.connected).toBe(true);
    client.ws.close();
  });
});

describe("approve/deny CSRF protection", () => {
  it.each([
    ["a missing Origin", { "Content-Type": "application/json" }],
    ["a foreign Origin", { "Content-Type": "application/json", Origin: "http://evil.example" }],
    ["an Origin on another port", { "Content-Type": "application/json", Origin: "http://127.0.0.1:1" }],
    ["a null Origin", { "Content-Type": "application/json", Origin: "null" }],
  ])("rejects %s with 403 and keeps the request pending", async (_name, headers) => {
    const port = await startServer();
    const client = await requestApproval(port);
    expect((await post(port, "/approve", headers)).status).toBe(403);
    expect((await post(port, "/deny", headers)).status).toBe(403);
    expect((await getStatus(port)).pending).not.toBeNull();
    client.ws.close();
  });

  it("rejects a non-JSON content type (simple form POST) with 403", async () => {
    const port = await startServer();
    const client = await requestApproval(port);
    const response = await post(port, "/approve", {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: `http://127.0.0.1:${port}`,
    });
    expect(response.status).toBe(403);
    expect((await getStatus(port)).pending).not.toBeNull();
    client.ws.close();
  });

  it("rejects GET on the actions", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/approve`);
    expect(response.status).toBe(405);
    await response.body?.cancel();
  });
});
