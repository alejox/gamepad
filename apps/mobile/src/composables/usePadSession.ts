import type { ButtonId, StickId } from "@gamepad/shared";
import { computed } from "vue";
import { tapFeedback } from "../adapters/haptics.js";
import type { Vector } from "../domain/stick.js";
import { useConnectionStore } from "../stores/connection.js";
import { useSettingsStore } from "../stores/settings.js";

/** Input forwarding and connection status shared by every pad layout. */
export function usePadSession() {
  const connection = useConnectionStore();
  const settingsStore = useSettingsStore();

  const resetKey = computed(() => connection.releaseEpoch);
  const paired = computed(() => connection.status === "paired");
  const awaiting = computed(() => connection.status === "awaiting");
  const deadzone = computed(() => settingsStore.settings.stickDeadzone);

  const statusText = computed(() => {
    if (awaiting.value) return "Waiting for approval…";
    if (connection.reconnecting) return "Reconnecting…";
    return connection.latencyMs === null ? "– ms" : `${connection.latencyMs} ms`;
  });

  const emblemLabel = computed(() => {
    if (paired.value) return connection.hostName ? `Connected to ${connection.hostName}` : "Connected";
    if (awaiting.value) return "Waiting for approval on the PC";
    return "Find PC and connect";
  });

  /** "Find PC": searches again while not paired; inert while paired. */
  function onEmblem(): void {
    if (paired.value || awaiting.value) return;
    void connection.autoConnect();
  }

  function onButton(id: ButtonId, down: boolean): void {
    if (down && settingsStore.settings.haptics) tapFeedback();
    connection.pressButton(id, down);
  }

  function onStick(id: StickId, vector: Vector): void {
    connection.moveStick(id, vector.x, vector.y);
  }

  function disconnect(): void {
    connection.disconnect();
  }

  return { resetKey, paired, awaiting, deadzone, statusText, emblemLabel, onEmblem, onButton, onStick, disconnect };
}
