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
import { type GamepadSocket, type SocketFactory, browserSocketFactory } from "../adapters/socket.js";
import { serverUrl } from "../domain/address.js";
import { describeError, unreachableMessage } from "../domain/errors.js";
import { reconnectDelay } from "../domain/reconnect.js";
import { useSettingsStore } from "./settings.js";

export type ConnectionStatus = "idle" | "connecting" | "paired" | "error";

interface ConnectionDeps {
  socketFactory: SocketFactory;
  now: () => number;
}

let deps: ConnectionDeps = {
  socketFactory: browserSocketFactory,
  now: () => performance.now(),
};

/** Overrides adapters (used by tests). */
export function configureConnection(next: Partial<ConnectionDeps>): void {
  deps = { ...deps, ...next };
}

const PING_INTERVAL_MS = 2000;
const CONNECT_TIMEOUT_MS = 6000;

interface Target {
  host: string;
  port: number;
  pin: string;
}

export const useConnectionStore = defineStore("connection", () => {
  const settingsStore = useSettingsStore();

  const status = ref<ConnectionStatus>("idle");
  const reconnecting = ref(false);
  const errorMessage = ref("");
  const latencyMs = ref<number | null>(null);
  /** Bumped whenever all input is force-released, so controls reset visuals. */
  const releaseEpoch = ref(0);

  let socket: GamepadSocket | undefined;
  let target: Target | undefined;
  let rejected = false;
  let wasPaired = false;
  let attempt = 0;
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

  function open(): void {
    if (!target) return;
    const { host, port, pin } = target;
    rejected = false;
    status.value = "connecting";
    let current: GamepadSocket | undefined;
    try {
      current = deps.socketFactory(serverUrl(host, port), {
        onOpen: () => {
          if (socket !== current) return;
          clearTimeout(connectTimer);
          send(hello(pin));
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
        attempt = 0;
        reconnecting.value = false;
        errorMessage.value = "";
        clearInterval(pingTimer);
        pingTimer = setInterval(() => send({ t: "ping", ts: deps.now() }), PING_INTERVAL_MS);
        return;
      case "error":
        rejected = true;
        errorMessage.value = describeError(message.code);
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
    if (wasPaired && !rejected && target) {
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

  /** Closes the current socket without triggering reconnect logic. */
  function teardown(): void {
    clearTimers();
    const current = socket;
    socket = undefined;
    current?.close();
    held.clear();
    latencyMs.value = null;
  }

  function connect(host: string, port: number, pin: string): void {
    teardown();
    target = { host: host.trim(), port, pin };
    wasPaired = false;
    attempt = 0;
    reconnecting.value = false;
    errorMessage.value = "";
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
    releaseEpoch,
    connect,
    disconnect,
    releaseAll,
    pressButton,
    moveStick,
  };
});
