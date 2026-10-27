<script setup lang="ts">
import { BUTTON_IDS, type ButtonId, DIRECTIONS, type Direction, KEY_NAMES, MOUSE_SENSITIVITY_RANGE } from "@gamepad/shared";
import { DEADZONE_RANGE, SKINS } from "../domain/settings.js";
import { useSettingsStore } from "../stores/settings.js";

const emit = defineEmits<{ close: [] }>();
const store = useSettingsStore();

const BUTTON_LABELS: Record<ButtonId, string> = {
  dpad_up: "D-pad up",
  dpad_down: "D-pad down",
  dpad_left: "D-pad left",
  dpad_right: "D-pad right",
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l1: "L1",
  r1: "R1",
  l2: "L2",
  r2: "R2",
  start: "Start",
  select: "Select",
  l3: "L3 (left stick click)",
  r3: "R3 (right stick click)",
};

function setButtonKey(id: ButtonId, event: Event): void {
  const key = (event.target as HTMLSelectElement).value;
  const buttons = store.settings.mapping.buttons;
  if (key === "") delete buttons[id];
  else buttons[id] = key;
}

function setStickKey(direction: Direction, event: Event): void {
  store.settings.mapping.leftStick[direction] = (event.target as HTMLSelectElement).value;
}

function numberFrom(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="settings">
    <header>
      <h1>Settings</h1>
      <button type="button" class="primary" @click="emit('close')">Done</button>
    </header>

    <h2>Skin</h2>
    <div class="skins" role="radiogroup" aria-label="Skin">
      <button
        v-for="skin in SKINS"
        :key="skin.id"
        type="button"
        role="radio"
        class="skin"
        :class="{ selected: store.settings.skin === skin.id }"
        :aria-checked="store.settings.skin === skin.id"
        @click="store.settings.skin = skin.id"
      >
        <span class="preview" :data-skin="skin.id" aria-hidden="true">
          <span class="mini-dpad" />
          <span class="mini-faces">
            <span class="mini-face" style="background: var(--face-y-bg); color: var(--face-y-fg)" />
            <span class="mini-face" style="background: var(--face-x-bg); color: var(--face-x-fg)" />
            <span class="mini-face" style="background: var(--face-b-bg); color: var(--face-b-fg)" />
            <span class="mini-face" style="background: var(--face-a-bg); color: var(--face-a-fg)" />
          </span>
        </span>
        <span class="skin-name">{{ skin.name }}</span>
        <span class="skin-desc">{{ skin.description }}</span>
      </button>
    </div>

    <h2>Feel</h2>
    <label class="row">
      <span>Haptic feedback</span>
      <input v-model="store.settings.haptics" type="checkbox" />
    </label>
    <label class="row">
      <span>Stick deadzone <small>{{ Math.round(store.settings.stickDeadzone * 100) }}%</small></span>
      <input
        type="range"
        :min="DEADZONE_RANGE.min"
        :max="DEADZONE_RANGE.max"
        step="0.01"
        :value="store.settings.stickDeadzone"
        @input="store.settings.stickDeadzone = numberFrom($event)"
      />
    </label>
    <label class="row">
      <span>Mouse sensitivity <small>{{ store.settings.mouseSensitivity }} px/s</small></span>
      <input
        type="range"
        :min="MOUSE_SENSITIVITY_RANGE.min"
        :max="MOUSE_SENSITIVITY_RANGE.max"
        step="50"
        :value="store.settings.mouseSensitivity"
        @input="store.settings.mouseSensitivity = numberFrom($event)"
      />
    </label>

    <h2>Key mapping</h2>
    <div class="mapping">
      <label v-for="id in BUTTON_IDS" :key="id" class="map-row">
        <span>{{ BUTTON_LABELS[id] }}</span>
        <select :value="store.settings.mapping.buttons[id] ?? ''" @change="setButtonKey(id, $event)">
          <option value="">(none)</option>
          <option v-for="key in KEY_NAMES" :key="key" :value="key">{{ key }}</option>
        </select>
      </label>
      <label v-for="direction in DIRECTIONS" :key="direction" class="map-row">
        <span>Left stick {{ direction }}</span>
        <select :value="store.settings.mapping.leftStick[direction]" @change="setStickKey(direction, $event)">
          <option v-for="key in KEY_NAMES" :key="key" :value="key">{{ key }}</option>
        </select>
      </label>
    </div>

    <footer>
      <button type="button" @click="store.resetDefaults()">Reset to defaults</button>
    </footer>
  </section>
</template>

<style scoped>
.settings {
  height: 100%;
  overflow-y: auto;
  touch-action: pan-y;
  padding: 12px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left));
  background: #10131b;
  color: #e8ecf4;
}
header {
  position: sticky;
  top: -12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  background: #10131b;
  z-index: 1;
}
h1 {
  margin: 0;
  font-size: 1.2rem;
}
h2 {
  margin: 18px 0 8px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9aa3b8;
}
button {
  font: inherit;
  color: inherit;
  background: #1c2130;
  border: 1px solid #2f3648;
  border-radius: 10px;
  padding: 8px 14px;
}
.primary {
  background: #3fb8ff;
  color: #04121f;
  border: 0;
  font-weight: 600;
}
.skins {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.skin {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 8px;
}
.skin.selected {
  border-color: #3fb8ff;
  box-shadow: 0 0 0 2px #3fb8ff;
}
.preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--pad-bg);
}
.mini-dpad {
  width: 30px;
  height: 30px;
  background: var(--dpad-bg);
  clip-path: polygon(33% 0, 67% 0, 67% 33%, 100% 33%, 100% 67%, 67% 67%, 67% 100%, 33% 100%, 33% 67%, 0 67%, 0 33%, 33% 33%);
}
.mini-faces {
  display: grid;
  grid-template-columns: repeat(2, 13px);
  gap: 3px;
  transform: rotate(45deg);
}
.mini-face {
  width: 13px;
  height: 13px;
  border-radius: var(--face-radius);
  border: 2px solid currentColor;
}
.skin-name {
  font-weight: 600;
}
.skin-desc {
  font-size: 0.75rem;
  color: #9aa3b8;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid #1f2433;
}
.row small {
  color: #9aa3b8;
  margin-left: 6px;
}
.row input[type="range"] {
  width: min(320px, 50%);
}
.row input[type="checkbox"] {
  width: 22px;
  height: 22px;
}
.mapping {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 6px 16px;
}
.map-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}
select {
  font: inherit;
  color: inherit;
  background: #0b0d12;
  border: 1px solid #2f3648;
  border-radius: 8px;
  padding: 5px 8px;
  min-width: 120px;
}
footer {
  margin-top: 20px;
}
</style>
