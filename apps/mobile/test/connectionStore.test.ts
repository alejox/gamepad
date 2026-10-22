import { DEFAULT_MAPPING } from "@gamepad/shared";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocketHandlers } from "../src/adapters/socket.js";
import { reconnectDelay } from "../src/domain/reconnect.js";
import { configureConnection, useConnectionStore } from "../src/stores/connection.js";
import { memoryPersistence, setPersistence } from "../src/adapters/persistence.js";

class FakeSocket {
  readonly sent: Record<string, unknown>[] = [];
  closed = false;

  constructor(
    readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.drop();
  }

  open(): void {
    this.handlers.onOpen();
  }

  receive(message: unknown): void {
    this.handlers.onMessage(JSON.stringify(message));
  }

  drop(): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClose();
  }
}

let sockets: FakeSocket[];
let clock: number;

function lastSocket(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error("no socket created");
  return socket;
}

function pairedStore() {
  const store = useConnectionStore();
  store.connect("192.168.1.20", 7531, "123456");
  lastSocket().open();
  lastSocket().receive({ t: "welcome" });
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  clock = 1000;
  setPersistence(memoryPersistence());
  setActivePinia(createPinia());
  configureConnection({
    socketFactory: (url, handlers) => {
      const socket = new FakeSocket(url, handlers);
      sockets.push(socket);
      return socket;
    },
    now: () => clock,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connection store", () => {
  it("sends hello with PIN and mapping on open, then pairs on welcome", () => {
    const store = useConnectionStore();
    store.connect("192.168.1.20", 7531, "123456");
    expect(store.status).toBe("connecting");
    expect(lastSocket().url).toBe("ws://192.168.1.20:7531");

    lastSocket().open();
    expect(lastSocket().sent[0]).toMatchObject({ t: "hello", v: 1, pin: "123456", mapping: DEFAULT_MAPPING });

    lastSocket().receive({ t: "welcome" });
    expect(store.status).toBe("paired");
  });

  it("shows a human message on bad_pin and never reconnects", () => {
    const store = useConnectionStore();
    store.connect("10.0.0.2", 7531, "000000");
    lastSocket().open();
    lastSocket().receive({ t: "error", code: "bad_pin" });
    lastSocket().drop();

    expect(store.status).toBe("error");
    expect(store.errorMessage).toMatch(/PIN/);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it("reports an unreachable server as an error without reconnecting", () => {
    const store = useConnectionStore();
    store.connect("10.0.0.9", 7531, "123456");
    lastSocket().drop();
    expect(store.status).toBe("error");
    expect(store.errorMessage).toMatch(/10\.0\.0\.9:7531/);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it("pings every 2 seconds and reports the round-trip latency", () => {
    const store = pairedStore();
    vi.advanceTimersByTime(2000);
    const ping = lastSocket().sent.find((m) => m.t === "ping");
    expect(ping).toBeDefined();
    clock += 35;
    lastSocket().receive({ t: "pong", ts: ping?.ts });
    expect(store.latencyMs).toBe(35);
  });

  it("reconnects with backoff after a paired session drops", () => {
    const store = pairedStore();
    lastSocket().drop();
    expect(store.status).toBe("connecting");
    expect(store.reconnecting).toBe(true);

    vi.advanceTimersByTime(reconnectDelay(0));
    expect(sockets).toHaveLength(2);
    lastSocket().open();
    expect(lastSocket().sent[0]).toMatchObject({ t: "hello", pin: "123456" });
    lastSocket().receive({ t: "welcome" });
    expect(store.status).toBe("paired");
    expect(store.reconnecting).toBe(false);
  });

  it("only sends input while paired", () => {
    const store = useConnectionStore();
    store.connect("10.0.0.2", 7531, "123456");
    lastSocket().open();
    store.pressButton("a", true);
    expect(lastSocket().sent.filter((m) => m.t === "btn")).toEqual([]);
  });

  it("releases held buttons and zeroes both sticks", () => {
    const store = pairedStore();
    store.pressButton("a", true);
    store.pressButton("l1", true);
    store.pressButton("l1", false);
    store.moveStick("R", 0.5, 0.2);
    const socket = lastSocket();
    socket.sent.length = 0;

    store.releaseAll();
    expect(socket.sent).toEqual([
      { t: "btn", id: "a", down: false },
      { t: "stick", id: "L", x: 0, y: 0 },
      { t: "stick", id: "R", x: 0, y: 0 },
    ]);
  });

  it("releases input before a user disconnect and does not reconnect", () => {
    const store = pairedStore();
    store.pressButton("b", true);
    const socket = lastSocket();
    store.disconnect();

    expect(socket.sent).toContainEqual({ t: "btn", id: "b", down: false });
    expect(socket.closed).toBe(true);
    expect(store.status).toBe("idle");
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});

describe("reconnectDelay", () => {
  it("grows exponentially and is capped", () => {
    expect(reconnectDelay(0)).toBe(500);
    expect(reconnectDelay(1)).toBe(1000);
    expect(reconnectDelay(10)).toBe(8000);
  });
});
