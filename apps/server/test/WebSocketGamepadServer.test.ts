import { DEFAULT_MAPPING, type ServerMessage } from "@gamepad/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { type GamepadServerOptions, WebSocketGamepadServer } from "../src/adapters/WebSocketGamepadServer.js";
import { NEUTRAL_PAD } from "../src/domain/PadState.js";
import { FakeGamepadDriver } from "./FakeGamepadDriver.js";
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

async function startServer(overrides: Partial<GamepadServerOptions> = {}): Promise<number> {
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

  describe("per-session mouse sensitivity", () => {
    // Each call advances the clock 10 ms, so every tick covers exactly 10 ms.
    const steppedClock = (): (() => number) => {
      let t = 0;
      return () => (t += 10);
    };

    async function pairWith(extra: Record<string, unknown>): Promise<Client> {
      const client = await connect(await startServer({ now: steppedClock() }));
      client.send({ t: "hello", v: 1, pin: PIN, ...extra });
      await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "welcome" }));
      return client;
    }

    it("falls back to the server default without mouseSensitivity", async () => {
      const client = await pairWith({});
      client.send({ t: "stick", id: "R", x: 1, y: 0 });
      // 2000 px/s * 10 ms = 20 px per tick.
      await vi.waitFor(() => expect(driver.moves[0]).toEqual([20, 0]));
      client.ws.close();
    });

    it("uses the sensitivity sent in hello", async () => {
      const client = await pairWith({ mouseSensitivity: 500 });
      client.send({ t: "stick", id: "R", x: 1, y: 0 });
      await vi.waitFor(() => expect(driver.moves[0]).toEqual([5, 0]));
      client.ws.close();
    });

    it("applies a sensitivity change from a mapping message immediately", async () => {
      const client = await pairWith({ mouseSensitivity: 500 });
      client.send({ t: "stick", id: "R", x: 1, y: 0 });
      await vi.waitFor(() => expect(driver.moves.length).toBeGreaterThan(0));
      client.send({ t: "mapping", mapping: DEFAULT_MAPPING, mouseSensitivity: 1000 });
      await vi.waitFor(() => expect(driver.moves.at(-1)).toEqual([10, 0]));
      client.ws.close();
    });

    it("keeps the current sensitivity when a mapping omits it", async () => {
      const client = await pairWith({ mouseSensitivity: 500 });
      client.send({ t: "mapping", mapping: DEFAULT_MAPPING });
      client.send({ t: "stick", id: "R", x: 1, y: 0 });
      await vi.waitFor(() => expect(driver.moves.length).toBeGreaterThan(2));
      expect(new Set(driver.moves.map(([dx]) => dx))).toEqual(new Set([5]));
      client.ws.close();
    });
  });

  describe("gamepad mode", () => {
    let pad: FakeGamepadDriver;

    async function startPadServer(): Promise<number> {
      pad = new FakeGamepadDriver();
      return startServer({ driver: undefined, gamepad: pad });
    }

    it("refuses to start without exactly one output driver", () => {
      const base = { port: 0, pin: PIN, logger: silent, deadzone: 0.3, mouse: { deadzone: 0.1, sensitivity: 1, exponent: 1 } };
      expect(() => new WebSocketGamepadServer(base)).toThrow(/exactly one/);
      expect(
        () => new WebSocketGamepadServer({ ...base, driver: new FakeInputDriver(), gamepad: new FakeGamepadDriver() }),
      ).toThrow(/exactly one/);
    });

    it("turns buttons, triggers and sticks into pad reports instead of keys", async () => {
      const client = await pair(await startPadServer());
      client.send({ t: "btn", id: "a", down: true });
      client.send({ t: "btn", id: "r2", down: true });
      client.send({ t: "stick", id: "L", x: 0.5, y: -1 });
      client.send({ t: "stick", id: "R", x: 1, y: 0 });
      await vi.waitFor(() => expect(pad.updates).toHaveLength(4));
      expect(pad.last()).toEqual({
        buttons: new Set(["a"]),
        leftStick: { x: 0.5, y: 1 },
        rightStick: { x: 1, y: 0 },
        leftTrigger: 0,
        rightTrigger: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(driver.calls).toEqual([]);
      expect(driver.moves).toEqual([]);
      client.ws.close();
    });

    it("skips reports when the state did not change", async () => {
      const client = await pair(await startPadServer());
      client.send({ t: "btn", id: "a", down: true });
      client.send({ t: "btn", id: "a", down: true });
      client.send({ t: "stick", id: "L", x: 0, y: 0 });
      client.send({ t: "ping", ts: 1 });
      await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "pong", ts: 1 }));
      expect(pad.updates).toHaveLength(1);
      client.ws.close();
    });

    it("accepts mapping messages without touching the pad", async () => {
      const client = await pair(await startPadServer());
      client.send({ t: "mapping", mapping: DEFAULT_MAPPING, mouseSensitivity: 900 });
      client.send({ t: "ping", ts: 2 });
      await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "pong", ts: 2 }));
      expect(client.messages).not.toContainEqual({ t: "error", code: "bad_message" });
      expect(pad.updates).toEqual([]);
      client.ws.close();
    });

    it("sends a neutral report on disconnect", async () => {
      const client = await pair(await startPadServer());
      client.send({ t: "btn", id: "x", down: true });
      client.send({ t: "stick", id: "R", x: 1, y: 1 });
      await vi.waitFor(() => expect(pad.updates).toHaveLength(2));
      client.ws.close();
      await vi.waitFor(() => expect(pad.last()).toEqual(NEUTRAL_PAD));
    });

    it("sends a neutral report when the server stops", async () => {
      const client = await pair(await startPadServer());
      client.send({ t: "btn", id: "start", down: true });
      await vi.waitFor(() => expect(pad.updates).toHaveLength(1));
      await server?.stop();
      server = undefined;
      expect(pad.last()).toEqual(NEUTRAL_PAD);
      await client.closed;
    });

    it("logs and survives a failing pad driver", async () => {
      const warnings: string[] = [];
      pad = new FakeGamepadDriver();
      pad.update = () => {
        throw new Error("device gone");
      };
      const client = await pair(
        await startServer({ driver: undefined, gamepad: pad, logger: { info: () => {}, warn: (m) => warnings.push(m) } }),
      );
      client.send({ t: "btn", id: "a", down: true });
      client.send({ t: "ping", ts: 3 });
      await vi.waitFor(() => expect(client.messages).toContainEqual({ t: "pong", ts: 3 }));
      expect(warnings.some((w) => w.includes("device gone"))).toBe(true);
      client.ws.close();
    });
  });
});
