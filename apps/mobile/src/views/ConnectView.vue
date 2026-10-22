<script setup lang="ts">
import { computed, ref } from "vue";
import { useConnectionStore } from "../stores/connection.js";
import { useSettingsStore } from "../stores/settings.js";

const connection = useConnectionStore();
const settingsStore = useSettingsStore();

const host = ref(settingsStore.lastHost);
const port = ref(settingsStore.lastPort);
const pin = ref("");

const connecting = computed(() => connection.status === "connecting");
const validPin = computed(() => /^\d{6}$/.test(pin.value));
const validPort = computed(() => Number.isInteger(port.value) && port.value >= 1 && port.value <= 65535);
const canSubmit = computed(() => host.value.trim() !== "" && validPort.value && validPin.value && !connecting.value);

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
      <p class="hint">Start the server on your PC and enter the address and PIN it shows.</p>
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
