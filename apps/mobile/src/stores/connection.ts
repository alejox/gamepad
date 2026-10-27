import {
  type ButtonId,
  type ClientMessage,
  PROTOCOL_VERSION,
  type StickId,
  encodeMessage,
  parseServerMessage,
} from "@gamepad/shared";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { type Discover, browserDiscover } from "../adapters/discovery.js";
import { type GamepadSocket, type SocketFactory, browserSocketFactory } from "../adapters/socket.js";
import { serverUrl } from "../domain/address.js";
import { deviceName } from "../domain/device.js";
import { discoveryCandidates } from "../domain/discovery.js";
import {
  deniedMessage,
  describeError,
  describeRequestError,
  notFoundMessage,
  unreachableMessage,
} from "../domain/errors.js";
import { reconnectDelay } from "../domain/reconnect.js";
import { useSettingsStore } from "./settings.js";

/** "searching": scanning the LAN; "awaiting": waiting for Allow on the PC. */
export type ConnectionStatus = "idle" | "searching" | "connecting" | "awaiting" | "paired" | "error";

interface ConnectionDeps {
  socketFactory: SocketFactory;
  now: () => number;
  discover: Discover;
  deviceName: () => string;
  /** Hostname the app is served from (the PC in the browser dev loop). */
  pageHost: () => string;
}

let deps: ConnectionDeps = {
  socketFactory: browserSocketFactory,
  now: () => performance.now(),
  discover: browserDiscover,
  deviceName: () => deviceName(typeof navigator === "undefined" ? "" : navigator.userAgent),
  pageHost: () => (typeof location === "undefined" ? "" : location.hostname),
};

/** Overrides adapters (used by tests). */
export function configureConnection(next: Partial<ConnectionDeps>): void {
  deps = { ...deps, ...next };
}

const PING_INTERVAL_MS = 2000;
const CONNECT_TIMEOUT_MS = 6000;

/** PIN pairing, or host approval (no PIN) after LAN discovery. */
type Target =
  | { kind: "pin"; host: string; port: number; pin: string }
  | { kind: "request"; host: string; port: number; device: string };

export const useConnectionStore = defineStore("connection", () => {
  const settingsStore = useSettingsStore();

  const status = ref<ConnectionStatus>("idle");
  const reconnecting = ref(false);
  const errorMessage = ref("");
  const latencyMs = ref<number | null>(null);
  /** Name of the discovered PC (approval flow only). */
  const hostName = ref("");
  /** Bumped whenever all input is force-released, so controls reset visuals. */
  const releaseEpoch = ref(0);

  let socket: GamepadSocket | undefined;
  let target: Target | undefined;
  let rejected = false;
  let wasPaired = false;
  let attempt = 0;
  /** A reconnect already re-asked the PC user; never prompt again in a loop. */
  let reRequested = false;
  let discovery: AbortController | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const held = new Set<ButtonId>();

  function send(message: ClientMessage): void {
    socket?.send(encodeMessage(message));
  }

  function clearTimers(): void {
    clearInterval(pingTimer);
    clearTimeout(connectTimer);
    clearTimeout(reconnectTimer);
    pingTimer = connectTimer = reconnectTimer = undefined;
  }

  function hello(pin: string): ClientMessage {
    const { mapping, mouseSensitivity } = settingsStore.settings;
    return { t: "hello", v: PROTOCOL_VERSION, pin, mapping, mouseSensitivity };
  }

  function request(device: string): ClientMessage {
    const { mapping, mouseSensitivity } = settingsStore.settings;
    return { t: "request", v: PROTOCOL_VERSION, device, mapping, mouseSensitivity };
  }

  function open(): void {
    if (!target) return;
    const opening = target;
    const { host, port } = opening;
    rejected = false;
    status.value = "connecting";
    let current: GamepadSocket | undefined;
    try {
      current = deps.socketFactory(serverUrl(host, port), {
        onOpen: () => {
          if (socket !== current) return;
          clearTimeout(connectTimer);
          send(opening.kind === "pin" ? hello(opening.pin) : request(opening.device));
        },
        onMessage: (raw) => {
          if (socket === current) handleMessage(raw);
        },
        onClose: () => {
          if (socket === current) handleClose();
        },
      });
    } catch {
      fail(`Invalid server address "${host}".`);
      return;
    }
    socket = current;
    // Unreachable hosts can hang for a long time before the socket gives up.
    connectTimer = setTimeout(() => socket?.close(), CONNECT_TIMEOUT_MS);
  }

  function handleMessage(raw: string): void {
    const message = parseServerMessage(raw);
    switch (message?.t) {
      case "welcome":
        status.value = "paired";
        wasPaired = true;
        reRequested = false;
        if (target?.kind === "request") settingsStore.rememberServer(target.host, target.port);
        attempt = 0;
        reconnecting.value = false;
        errorMessage.value = "";
        clearInterval(pingTimer);
        pingTimer = setInterval(() => send({ t: "ping", ts: deps.now() }), PING_INTERVAL_MS);
        return;
      case "pending":
        status.value = "awaiting";
        if (wasPaired) reRequested = true;
        return;
      case "denied":
        rejected = true;
        errorMessage.value = deniedMessage(hostName.value || "the PC");
        return;
      case "error":
        rejected = true;
        errorMessage.value =
          target?.kind === "request" ? describeRequestError(message.code) : describeError(message.code);
        return;
      case "pong":
        latencyMs.value = Math.max(0, Math.round(deps.now() - message.ts));
        return;
    }
  }

  function handleClose(): void {
    socket = undefined;
    clearTimers();
    held.clear();
    latencyMs.value = null;
    // An approval re-request that ended without a decision is not retried.
    const retry = wasPaired && !rejected && !(target?.kind === "request" && reRequested);
    if (retry && target) {
      reconnecting.value = true;
      status.value = "connecting";
      reconnectTimer = setTimeout(open, reconnectDelay(attempt++));
      return;
    }
    const lost = target;
    fail(errorMessage.value || (lost ? unreachableMessage(lost.host, lost.port) : "Disconnected."));
  }

  function fail(message: string): void {
    reconnecting.value = false;
    errorMessage.value = message;
    status.value = "error";
  }

  /** Closes the current socket (and any scan) without triggering reconnect logic. */
  function teardown(): void {
    discovery?.abort();
    discovery = undefined;
    clearTimers();
    const current = socket;
    socket = undefined;
    current?.close();
    held.clear();
    latencyMs.value = null;
  }

  function reset(): void {
    teardown();
    target = undefined;
    wasPaired = false;
    reRequested = false;
    attempt = 0;
    reconnecting.value = false;
    errorMessage.value = "";
  }

  function connect(host: string, port: number, pin: string): void {
    reset();
    hostName.value = "";
    target = { kind: "pin", host: host.trim(), port, pin };
    open();
  }

  /**
   * Finds the PC on the LAN, then asks its user to approve this device (no
   * PIN). Cancel with disconnect().
   */
  async function autoConnect(): Promise<void> {
    releaseAll();
    reset();
    hostName.value = "";
    status.value = "searching";
    const scan = new AbortController();
    discovery = scan;
    const port = settingsStore.lastPort;
    const hosts = discoveryCandidates({ lastHost: settingsStore.lastHost, pageHost: deps.pageHost() });
    const found = await deps.discover(hosts, port, scan.signal);
    // Cancelled or superseded by another connect while scanning.
    if (discovery !== scan) return;
    discovery = undefined;
    if (!found) {
      fail(notFoundMessage(port));
      return;
    }
    hostName.value = found.info.name;
    target = { kind: "request", host: found.host, port: found.info.port, device: deps.deviceName() };
    open();
  }

  /** Sends "up" for every held button and centres both sticks. */
  function releaseAll(): void {
    if (status.value === "paired") {
      for (const id of held) send({ t: "btn", id, down: false });
      send({ t: "stick", id: "L", x: 0, y: 0 });
      send({ t: "stick", id: "R", x: 0, y: 0 });
    }
    held.clear();
    releaseEpoch.value++;
  }

  function disconnect(): void {
    releaseAll();
    target = undefined;
    teardown();
    reconnecting.value = false;
    errorMessage.value = "";
    status.value = "idle";
  }

  function pressButton(id: ButtonId, down: boolean): void {
    if (status.value !== "paired" || held.has(id) === down) return;
    if (down) held.add(id);
    else held.delete(id);
    send({ t: "btn", id, down });
  }

  function moveStick(id: StickId, x: number, y: number): void {
    if (status.value === "paired") send({ t: "stick", id, x, y });
  }

  // Mapping and sensitivity edits apply immediately to a paired session.
  watch(
    () => [settingsStore.settings.mapping, settingsStore.settings.mouseSensitivity] as const,
    ([mapping, mouseSensitivity]) => {
      if (status.value === "paired") send({ t: "mapping", mapping, mouseSensitivity });
    },
    { deep: true },
  );

  return {
    status,
    reconnecting,
    errorMessage,
    latencyMs,
    hostName,
    releaseEpoch,
    connect,
    autoConnect,
    disconnect,
    releaseAll,
    pressButton,
    moveStick,
  };
});
