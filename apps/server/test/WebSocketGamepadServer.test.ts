import { DEFAULT_MAPPING, type ServerMessage } from "@gamepad/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { WebSocketGamepadServer } from "../src/adapters/WebSocketGamepadServer.js";
import { FakeInputDriver } from "./FakeInputDriver.js";

const PIN = "246810";
const silent = { info: () => {}, warn: () => {} };

interface Client {
  ws: WebSocket;
  messages: ServerMessage[];
  closed: Promise<number>;
  send(value: unknown): void;
}

let server: WebSocketGamepadServer | undefined;
let driver: FakeInputDriver;

async function startServer(overrides: { helloTimeoutMs?: number } = {}): Promise<number> {
  driver = new FakeInputDriver();
  server = new WebSocketGamepadServer({
    host: "127.0.0.1",
    port: 0,
    pin: PIN,
    driver,
    logger: silent,
    deadzone: 0.3,
    mouse: { deadzone: 0.1, sensitivity: 2000, exponent: 1 },
    tickIntervalMs: 5,
    ...overrides,
  });
  return server.start();
}

async function connect(port: number): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: ServerMessage[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(String(data)) as ServerMessage));
  const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, messages, closed, send: (value) => ws.send(JSON.stringify(value)) };
}

async function pair(port: number): Promise<Client> {
  const client = await connect(port);
  client.send({ t: "hello", v: 1, pin: PIN, mapping: DEFAULT_MAPPING });
  await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "welcome" }));
  return client;
}

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("WebSocketGamepadServer", () => {
  it("welcomes a client with the right PIN and answers pings", async () => {
    const client = await pair(await startServer());
    client.send({ t: "ping", ts: 7 });
    await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "pong", ts: 7 }));
    client.ws.close();
  });

  it("rejects a wrong PIN and closes the connection", async () => {
    const client = await connect(await startServer());
    client.send({ t: "hello", v: 1, pin: "000000" });
    await client.closed;
    expect(client.messages).toEqual([{ t: "error", code: "bad_pin" }]);
  });

  it("rejects an unsupported protocol version", async () => {
    const client = await connect(await startServer());
    client.send({ t: "hello", v: 2, pin: PIN });
    await client.closed;
    expect(client.messages).toEqual([{ t: "error", code: "version" }]);
  });

  it("rejects input sent before hello", async () => {
    const client = await connect(await startServer());
    client.send({ t: "btn", id: "a", down: true });
    await client.closed;
    expect(client.messages).toEqual([{ t: "error", code: "not_paired" }]);
    expect(driver.calls).toEqual([]);
  });

  it("closes connections that do not say hello in time", async () => {
    const client = await connect(await startServer({ helloTimeoutMs: 50 }));
    await client.closed;
    expect(client.messages).toEqual([{ t: "error", code: "timeout" }]);
  });

  it("rejects a second controller while one is active", async () => {
    const port = await startServer();
    const first = await pair(port);
    const second = await connect(port);
    second.send({ t: "hello", v: 1, pin: PIN });
    await second.closed;
    expect(second.messages).toEqual([{ t: "error", code: "busy" }]);
    first.ws.close();
  });

  it("accepts a new controller after the previous one disconnects", async () => {
    const port = await startServer();
    const first = await pair(port);
    first.ws.close();
    await first.closed;
    await vi.waitFor(async () => {
      const next = await pair(port);
      next.ws.close();
    });
  });

  it("presses mapped keys and releases them all on disconnect", async () => {
    const client = await pair(await startServer());
    client.send({ t: "btn", id: "a", down: true });
    client.send({ t: "btn", id: "r2", down: true });
    client.send({ t: "stick", id: "L", x: 0, y: -1 });
    await vi.waitFor(() =>
      expect(driver.calls).toEqual(["keyDown space", "mouseButton left down", "keyDown w"]),
    );
    client.ws.close();
    await vi.waitFor(() =>
      expect(driver.calls.slice(3).sort()).toEqual(["keyUp space", "keyUp w", "mouseButton left up"]),
    );
  });

  it("applies mapping updates and replies bad_message to invalid frames", async () => {
    const client = await pair(await startServer());
    client.send({ t: "mapping", mapping: { buttons: { a: "j" }, leftStick: DEFAULT_MAPPING.leftStick } });
    client.send({ t: "btn", id: "a", down: true });
    client.send({ t: "btn", id: "nope", down: true });
    await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "error", code: "bad_message" }));
    expect(driver.calls).toEqual(["keyDown j"]);
    client.ws.close();
  });

  it("moves the mouse while the right stick is deflected and stops at rest", async () => {
    const client = await pair(await startServer());
    client.send({ t: "stick", id: "R", x: 1, y: 0 });
    await vi.waitFor(() => expect(driver.mouseX).toBeGreaterThan(10));
    client.send({ t: "stick", id: "R", x: 0, y: 0 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const settled = driver.mouseX;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(driver.mouseX).toBe(settled);
    expect(driver.mouseY).toBe(0);
    client.ws.close();
  });

  it("releases held keys when the server stops", async () => {
    const client = await pair(await startServer());
    client.send({ t: "btn", id: "a", down: true });
    await vi.waitFor(() => expect(driver.calls).toEqual(["keyDown space"]));
    await server?.stop();
    server = undefined;
    expect(driver.calls).toEqual(["keyDown space", "keyUp space"]);
    await client.closed;
  });
});
