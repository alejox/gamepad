import { DEFAULT_MAPPING, DISCOVERY_SERVICE, type DiscoveryInfo } from "@gamepad/shared";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocketHandlers } from "../src/adapters/socket.js";
import { reconnectDelay } from "../src/domain/reconnect.js";
import { configureConnection, useConnectionStore } from "../src/stores/connection.js";
import { useSettingsStore } from "../src/stores/settings.js";
import { nextTick } from "vue";
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
let discoverCalls: { hosts: readonly string[]; port: number; signal: AbortSignal }[];
let discoverResult: (() => Promise<{ host: string; info: DiscoveryInfo } | null>) | undefined;

const deskInfo: DiscoveryInfo = { service: DISCOVERY_SERVICE, protocol: 1, name: "Desk PC", port: 7531 };
const found = () => Promise.resolve({ host: "192.168.1.30", info: deskInfo });

/** Runs autoConnect through discovery and opens the request socket. */
async function requestingStore() {
  const store = useConnectionStore();
  discoverResult = found;
  await store.autoConnect();
  lastSocket().open();
  return store;
}

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
  discoverCalls = [];
  discoverResult = undefined;
  setPersistence(memoryPersistence());
  setActivePinia(createPinia());
  configureConnection({
    socketFactory: (url, handlers) => {
      const socket = new FakeSocket(url, handlers);
      sockets.push(socket);
      return socket;
    },
    now: () => clock,
    discover: (hosts, port, signal) => {
      discoverCalls.push({ hosts, port, signal });
      return discoverResult ? discoverResult() : Promise.resolve(null);
    },
    deviceName: () => "Pixel 7",
    pageHost: () => "",
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
    expect(lastSocket().sent[0]).toMatchObject({
      t: "hello",
      v: 1,
      pin: "123456",
      mapping: DEFAULT_MAPPING,
      mouseSensitivity: 1200,
    });

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

  it("sends mapping and sensitivity changes immediately while paired", async () => {
    pairedStore();
    const settings = useSettingsStore();
    settings.settings.mouseSensitivity = 2000;
    await nextTick();
    expect(lastSocket().sent.at(-1)).toMatchObject({ t: "mapping", mapping: DEFAULT_MAPPING, mouseSensitivity: 2000 });

    settings.settings.mapping.buttons.a = "j";
    await nextTick();
    expect(lastSocket().sent.at(-1)).toMatchObject({ t: "mapping", mouseSensitivity: 2000 });
    expect((lastSocket().sent.at(-1)?.mapping as { buttons: Record<string, string> }).buttons.a).toBe("j");
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

describe("auto connect (host approval)", () => {
  it("discovers the PC, sends a request with the device name and waits for approval", async () => {
    const store = await requestingStore();
    expect(discoverCalls[0]?.port).toBe(7531);
    expect(lastSocket().url).toBe("ws://192.168.1.30:7531");
    expect(lastSocket().sent[0]).toMatchObject({
      t: "request",
      v: 1,
      device: "Pixel 7",
      mapping: DEFAULT_MAPPING,
      mouseSensitivity: 1200,
    });
    expect(store.hostName).toBe("Desk PC");

    lastSocket().receive({ t: "pending" });
    expect(store.status).toBe("awaiting");

    lastSocket().receive({ t: "welcome" });
    expect(store.status).toBe("paired");
    const settings = useSettingsStore();
    expect(settings.lastHost).toBe("192.168.1.30");
    expect(settings.lastPort).toBe(7531);
  });

  it("puts the last host first in the discovery candidates", async () => {
    useSettingsStore().rememberServer("192.168.7.40", 7531);
    const store = useConnectionStore();
    await store.autoConnect();
    expect(discoverCalls[0]?.hosts[0]).toBe("192.168.7.40");
  });

  it("is searching while discovery runs and reports when no PC is found", async () => {
    const store = useConnectionStore();
    let finish: (value: null) => void = () => {};
    discoverResult = () => new Promise((resolve) => (finish = resolve));
    const running = store.autoConnect();
    expect(store.status).toBe("searching");
    finish(null);
    await running;
    expect(store.status).toBe("error");
    expect(store.errorMessage).toMatch(/No PC/);
    expect(sockets).toHaveLength(0);
  });

  it("cancels a running search", async () => {
    const store = useConnectionStore();
    let finish: (value: { host: string; info: DiscoveryInfo }) => void = () => {};
    discoverResult = () => new Promise((resolve) => (finish = resolve));
    const running = store.autoConnect();
    store.disconnect();
    expect(discoverCalls[0]?.signal.aborted).toBe(true);
    expect(store.status).toBe("idle");
    finish({ host: "192.168.1.30", info: deskInfo });
    await running;
    expect(store.status).toBe("idle");
    expect(sockets).toHaveLength(0);
  });

  it("cancels while waiting for approval and withdraws the request", async () => {
    const store = await requestingStore();
    lastSocket().receive({ t: "pending" });
    store.disconnect();
    expect(lastSocket().closed).toBe(true);
    expect(store.status).toBe("idle");
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it.each([
    ["denied", { t: "denied" }, /denied/i],
    ["timeout", { t: "error", code: "timeout" }, /in time/i],
    ["busy", { t: "error", code: "busy" }, /already/i],
    ["version", { t: "error", code: "version" }, /versions/i],
  ])("stops on %s without retrying", async (_name, message, text) => {
    const store = await requestingStore();
    lastSocket().receive({ t: "pending" });
    lastSocket().receive(message);
    lastSocket().drop();
    expect(store.status).toBe("error");
    expect(store.errorMessage).toMatch(text);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it("re-requests approval once after an approved session drops", async () => {
    const store = await requestingStore();
    lastSocket().receive({ t: "welcome" });
    lastSocket().drop();
    expect(store.reconnecting).toBe(true);

    vi.advanceTimersByTime(reconnectDelay(0));
    expect(sockets).toHaveLength(2);
    lastSocket().open();
    expect(lastSocket().sent[0]).toMatchObject({ t: "request", device: "Pixel 7" });
    lastSocket().receive({ t: "pending" });
    expect(store.status).toBe("awaiting");
    expect(store.reconnecting).toBe(true);

    // The re-request ends without a decision: give up instead of prompting again.
    lastSocket().drop();
    expect(store.status).toBe("error");
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it("does not re-request after a denied reconnect", async () => {
    const store = await requestingStore();
    lastSocket().receive({ t: "welcome" });
    lastSocket().drop();
    vi.advanceTimersByTime(reconnectDelay(0));
    lastSocket().open();
    lastSocket().receive({ t: "denied" });
    lastSocket().drop();
    expect(store.status).toBe("error");
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it("keeps PIN sessions reconnecting with hello after an auto connect elsewhere", async () => {
    await requestingStore();
    const store = pairedStore();
    lastSocket().drop();
    vi.advanceTimersByTime(reconnectDelay(0));
    lastSocket().open();
    expect(lastSocket().sent[0]).toMatchObject({ t: "hello", pin: "123456" });
    expect(store.status).toBe("connecting");
  });
});

describe("reconnectDelay", () => {
  it("grows exponentially and is capped", () => {
    expect(reconnectDelay(0)).toBe(500);
    expect(reconnectDelay(1)).toBe(1000);
    expect(reconnectDelay(10)).toBe(8000);
  });
});
