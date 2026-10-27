<script setup lang="ts">
import { computed, ref } from "vue";
import PadEmblem from "../components/PadEmblem.vue";
import { useConnectionStore } from "../stores/connection.js";
import { useSettingsStore } from "../stores/settings.js";

const connection = useConnectionStore();
const settingsStore = useSettingsStore();

const host = ref(settingsStore.lastHost);
const port = ref(settingsStore.lastPort);
const pin = ref("");

// hostName is only set by the approval (find PC) flow.
const autoBusy = computed(
  () =>
    connection.status === "searching" ||
    connection.status === "awaiting" ||
    (connection.status === "connecting" && connection.hostName !== ""),
);
const connecting = computed(() => connection.status === "connecting" && !autoBusy.value);
const busy = computed(() => connecting.value || autoBusy.value);
const findText = computed(() => {
  switch (connection.status) {
    case "searching":
      return "Searching for your PC…";
    case "awaiting":
      return `Waiting for approval on ${connection.hostName}… Tap Allow on the PC.`;
    case "connecting":
      if (autoBusy.value) return `Connecting to ${connection.hostName}…`;
  }
  return "Tap to find your PC on this Wi-Fi";
});
const validPin = computed(() => /^\d{6}$/.test(pin.value));
const validPort = computed(() => Number.isInteger(port.value) && port.value >= 1 && port.value <= 65535);
const canSubmit = computed(() => host.value.trim() !== "" && validPort.value && validPin.value && !busy.value);

function onPinInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  pin.value = input.value.replace(/\D/g, "").slice(0, 6);
  input.value = pin.value;
}

function submit(): void {
  if (!canSubmit.value) return;
  const trimmed = host.value.trim();
  settingsStore.rememberServer(trimmed, port.value);
  connection.connect(trimmed, port.value, pin.value);
}
</script>

<template>
  <section class="connect">
    <form class="card" novalidate @submit.prevent="submit">
      <h1>Gamepad</h1>
      <div class="finder">
        <button
          type="button"
          class="find"
          :class="{ busy: autoBusy }"
          :disabled="autoBusy"
          aria-label="Find PC and connect"
          @click="connection.autoConnect()"
        >
          <PadEmblem />
        </button>
        <p class="find-status" role="status" aria-live="polite">{{ findText }}</p>
        <button v-if="autoBusy" type="button" class="cancel" @click="connection.disconnect()">Cancel</button>
      </div>
      <p class="hint">Or start the server on your PC and enter the address and PIN it shows.</p>
      <div class="row">
        <label class="field grow">
          <span>PC address</span>
          <input
            v-model="host"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="192.168.1.20"
          />
        </label>
        <label class="field port">
          <span>Port</span>
          <input v-model.number="port" type="number" inputmode="numeric" min="1" max="65535" />
        </label>
      </div>
      <label class="field">
        <span>PIN</span>
        <input
          :value="pin"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="6 digits"
          class="pin"
          @input="onPinInput"
        />
      </label>
      <p v-if="connection.status === 'error'" class="error" role="alert">{{ connection.errorMessage }}</p>
      <button type="submit" :disabled="!canSubmit">{{ connecting ? "Connecting…" : "Connect" }}</button>
    </form>
  </section>
</template>

<style scoped>
.connect {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 12px;
  overflow-y: auto;
}
.card {
  width: min(520px, 100%);
  display: grid;
  gap: 10px;
  padding: 18px 22px;
  border-radius: 16px;
  background: #151925;
  border: 1px solid #262c3d;
}
h1 {
  margin: 0;
  font-size: 1.3rem;
}
.finder {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 4px 0 8px;
}
.find {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  padding: 0;
  border-radius: 50%;
  color: #9cc6ff;
  background: radial-gradient(circle at 50% 40%, #1d2028 0%, #0b0c0f 70%);
  border: 2px solid #3d8bff;
  box-shadow: 0 0 14px rgb(61 139 255 / 65%), inset 0 0 12px rgb(61 139 255 / 35%);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.find:active:not(:disabled) {
  transform: scale(0.94);
  box-shadow: 0 0 22px rgb(61 139 255 / 90%), inset 0 0 18px rgb(61 139 255 / 60%);
}
.find:focus-visible {
  outline: 2px solid #e8ecf4;
  outline-offset: 3px;
}
.find:disabled {
  opacity: 1;
}
.find.busy {
  animation: pulse 1.2s ease-in-out infinite;
}
.find svg {
  width: 62%;
  height: 62%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px rgb(61 139 255 / 80%));
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 26px rgb(61 139 255 / 95%), inset 0 0 18px rgb(61 139 255 / 55%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .find.busy {
    animation: none;
  }
}
.find-status {
  margin: 0;
  text-align: center;
  color: #c9d2e6;
  font-size: 0.9rem;
}
.cancel {
  padding: 6px 18px;
  color: #e8ecf4;
  background: transparent;
  border: 1px solid #2f3648;
}
.hint {
  margin: 0;
  color: #9aa3b8;
  font-size: 0.85rem;
}
.row {
  display: flex;
  gap: 10px;
}
.grow {
  flex: 1;
}
.port {
  width: 96px;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
  color: #9aa3b8;
}
input {
  font: inherit;
  font-size: 1rem;
  color: #e8ecf4;
  background: #0b0d12;
  border: 1px solid #2f3648;
  border-radius: 10px;
  padding: 9px 11px;
  width: 100%;
}
.pin {
  letter-spacing: 0.4em;
  font-variant-numeric: tabular-nums;
}
.error {
  margin: 0;
  color: #ff7a7a;
  font-size: 0.85rem;
}
button {
  font: inherit;
  font-weight: 600;
  padding: 11px;
  border: 0;
  border-radius: 10px;
  color: #04121f;
  background: #3fb8ff;
}
button:disabled {
  opacity: 0.45;
}
</style>
