import { DEFAULT_MAPPING, type ServerMessage } from "@gamepad/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { type HostStatusSnapshot, createHostStatusHttp } from "../src/adapters/hostStatusHttp.js";
import { WebSocketGamepadServer } from "../src/adapters/WebSocketGamepadServer.js";
import type { ControllerStatus } from "../src/ports/ControllerStatus.js";
import { FakeInputDriver } from "./FakeInputDriver.js";

const PIN = "864213";
const silent = { info: () => {}, warn: () => {} };

let server: WebSocketGamepadServer | undefined;
let changes: ControllerStatus[] = [];

async function startServer(): Promise<number> {
  changes = [];
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
  });
  server = new WebSocketGamepadServer({
    host: "127.0.0.1",
    port: 0,
    pin: PIN,
    driver: new FakeInputDriver(),
    logger: silent,
    deadzone: 0.3,
    mouse: { deadzone: 0.1, sensitivity: 2000, exponent: 1 },
    http,
    onStatusChange: (status) => {
      changes.push(status);
      http.notify();
    },
  });
  port = await server.start();
  return port;
}

async function pair(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: ServerMessage[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(String(data)) as ServerMessage));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ t: "hello", v: 1, pin: PIN, mapping: DEFAULT_MAPPING }));
  await vi.waitFor(() => expect(messages).toContainEqual({ t: "welcome" }));
  return ws;
}

async function getStatus(port: number): Promise<HostStatusSnapshot> {
  const response = await fetch(`http://127.0.0.1:${port}/status`);
  expect(response.status).toBe(200);
  return (await response.json()) as HostStatusSnapshot;
}

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("host status page on the WebSocket port", () => {
  it("serves the HTML page with the PIN to loopback clients", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain(PIN);
  });

  it("returns 404 for unknown paths", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/missing`);
    expect(response.status).toBe(404);
    await response.body?.cancel();
  });

  it("reflects the controller connecting and disconnecting in /status", async () => {
    const port = await startServer();
    expect((await getStatus(port)).controller).toEqual({ connected: false, remoteAddress: null });

    const ws = await pair(port);
    expect((await getStatus(port)).controller).toEqual({ connected: true, remoteAddress: "127.0.0.1" });

    ws.close();
    await vi.waitFor(async () => expect((await getStatus(port)).controller.connected).toBe(false));
    expect(changes.map((change) => change.connected)).toEqual([true, false]);
  });

  it("pushes snapshots over /events and ends the stream on stop", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/events`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();

    let buffer = "";
    const nextEvent = async (): Promise<HostStatusSnapshot> => {
      while (!buffer.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buffer += value;
      }
      const end = buffer.indexOf("\n\n");
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = event.split("\n").find((line) => line.startsWith("data: "));
      return JSON.parse(data!.slice("data: ".length)) as HostStatusSnapshot;
    };

    expect((await nextEvent()).controller.connected).toBe(false);
    const ws = await pair(port);
    expect((await nextEvent()).controller).toEqual({ connected: true, remoteAddress: "127.0.0.1" });

    await server?.stop();
    server = undefined;
    // The disconnect snapshot may arrive first; afterwards the stream must end.
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    ws.terminate();
  });

  it("keeps rejecting plain HTTP upgrades without the page handler", async () => {
    server = new WebSocketGamepadServer({
      host: "127.0.0.1",
      port: 0,
      pin: PIN,
      driver: new FakeInputDriver(),
      logger: silent,
      deadzone: 0.3,
      mouse: { deadzone: 0.1, sensitivity: 2000, exponent: 1 },
    });
    const port = await server.start();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(426);
    await response.body?.cancel();
  });
});
