import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { WebSocketGamepadServer } from "../src/adapters/WebSocketGamepadServer.js";
import { isAddrInUse, startServerWithFallback } from "../src/application/startServer.js";
import { FakeInputDriver } from "./FakeInputDriver.js";

const PIN = "246810";

function makeServer(port: number, warn: (message: string) => void = () => {}) {
  return new WebSocketGamepadServer({
    host: "127.0.0.1",
    port,
    pin: PIN,
    driver: new FakeInputDriver(),
    logger: { info: () => {}, warn },
    deadzone: 0.3,
    mouse: { deadzone: 0.1, sensitivity: 2000, exponent: 1 },
  });
}

function listen(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

const held: Server[] = [];
const started: WebSocketGamepadServer[] = [];

afterEach(async () => {
  await Promise.all(started.map((server) => server.stop()));
  started.length = 0;
  await Promise.all(held.map((server) => close(server)));
  held.length = 0;
});

describe("isAddrInUse", () => {
  it("recognizes an EADDRINUSE error", () => {
    const error = new Error("listen EADDRINUSE: address already in use 0.0.0.0:7531");
    (error as NodeJS.ErrnoException).code = "EADDRINUSE";
    expect(isAddrInUse(error)).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    const error = new Error("boom");
    (error as NodeJS.ErrnoException).code = "ECONNREFUSED";
    expect(isAddrInUse(error)).toBe(false);
    expect(isAddrInUse(undefined)).toBe(false);
    expect(isAddrInUse("EADDRINUSE")).toBe(false);
    expect(isAddrInUse(null)).toBe(false);
  });
});

describe("startServerWithFallback", () => {
  it("binds the preferred port when it is free", async () => {
    const { server, port } = await listen();
    held.push(server);
    await close(server);
    const gamepad = makeServer(port);
    started.push(gamepad);
    await expect(startServerWithFallback(gamepad, port, { info: () => {}, warn: () => {} })).resolves.toBe(port);
  });

  it("falls back to another port when the preferred port is taken", async () => {
    const { server, port } = await listen();
    held.push(server);
    const warn = vi.fn();
    const gamepad = makeServer(port, warn);
    started.push(gamepad);

    const bound = await startServerWithFallback(gamepad, port, { info: () => {}, warn });
    expect(bound).not.toBe(port);
    expect(warn).toHaveBeenCalledWith(`Port ${port} is in use; using an available port instead.`);

    // The fallback server is actually listening: a bad PIN gets an error reply.
    const messages: unknown[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${bound}`);
    ws.on("message", (data) => messages.push(JSON.parse(String(data))));
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => {
        ws.send(JSON.stringify({ t: "hello", v: 1, pin: "000000" }));
        resolve();
      });
      ws.once("error", reject);
    });
    await vi.waitFor(() => expect(messages).toContainEqual({ t: "error", code: "bad_pin" }));
    ws.close();
  });
});
