<script setup lang="ts">
import type { ButtonId, StickId } from "@gamepad/shared";
import { computed } from "vue";
import { tapFeedback } from "../adapters/haptics.js";
import DPad from "../components/DPad.vue";
import FaceLabel from "../components/FaceLabel.vue";
import PadEmblem from "../components/PadEmblem.vue";
import PadButton from "../components/PadButton.vue";
import VirtualStick from "../components/VirtualStick.vue";
import { usesFaceGlyphs } from "../domain/settings.js";
import type { Vector } from "../domain/stick.js";
import { useConnectionStore } from "../stores/connection.js";
import { useSettingsStore } from "../stores/settings.js";

const props = withDefaults(defineProps<{ glyphs?: boolean }>(), { glyphs: false });
const emit = defineEmits<{ settings: [] }>();

const connection = useConnectionStore();
const settingsStore = useSettingsStore();

/** Glyph faces follow the active skin; the prop is kept as an explicit override. */
const glyphs = computed(() => props.glyphs || usesFaceGlyphs(settingsStore.settings.skin));

const resetKey = computed(() => connection.releaseEpoch);
const paired = computed(() => connection.status === "paired");
const statusText = computed(() => {
  if (connection.status === "awaiting") return "Waiting for approval…";
  if (connection.reconnecting) return "Reconnecting…";
  return connection.latencyMs === null ? "– ms" : `${connection.latencyMs} ms`;
});

const emblemLabel = computed(() => {
  if (paired.value) return connection.hostName ? `Connected to ${connection.hostName}` : "Connected";
  if (connection.status === "awaiting") return "Waiting for approval on the PC";
  return "Find PC and connect";
});

/** Centre button: finds the PC again while not paired; inert while paired. */
function onEmblem(): void {
  if (paired.value || connection.status === "awaiting") return;
  void connection.autoConnect();
}

function onButton(id: ButtonId, down: boolean): void {
  if (down && settingsStore.settings.haptics) tapFeedback();
  connection.pressButton(id, down);
}

function onStick(id: StickId, vector: Vector): void {
  connection.moveStick(id, vector.x, vector.y);
}

const faces = ["y", "x", "b", "a"] as const;
</script>

<template>
  <section class="gamepad no-select">
    <div class="side left">
      <div class="shoulders">
        <PadButton class="shoulder trigger" label="L2" :reset-key="resetKey" @change="onButton('l2', $event)" />
        <PadButton class="shoulder bumper" label="L1" :reset-key="resetKey" @change="onButton('l1', $event)" />
      </div>
      <div class="cluster">
        <DPad class="cluster-top" :reset-key="resetKey" @button="onButton" />
        <div class="cluster-bottom stick-wrap">
          <VirtualStick
            label="Left stick"
            :deadzone="settingsStore.settings.stickDeadzone"
            :reset-key="resetKey"
            @move="onStick('L', $event)"
          />
          <PadButton class="small thumb" label="L3" :reset-key="resetKey" @change="onButton('l3', $event)" />
        </div>
      </div>
    </div>

    <div class="center">
      <div class="status">
        <span class="dot" :class="{ ok: paired }" :aria-label="paired ? 'Connected' : 'Not connected'" />
        <span class="latency">{{ statusText }}</span>
      </div>
      <!-- Centre "find PC" button; only some skins show it (others use the connect screen). -->
      <button
        type="button"
        class="emblem"
        :class="{ live: paired }"
        :aria-label="emblemLabel"
        :aria-disabled="paired || connection.status === 'awaiting'"
        @click="onEmblem"
      >
        <PadEmblem />
      </button>
      <div class="menu">
        <PadButton class="small" label="Select" :reset-key="resetKey" @change="onButton('select', $event)" />
        <PadButton class="small" label="Start" :reset-key="resetKey" @change="onButton('start', $event)" />
      </div>
      <div class="tools">
        <button type="button" class="tool" aria-label="Settings" @click="emit('settings')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"
            />
          </svg>
        </button>
        <button type="button" class="tool" aria-label="Disconnect" @click="connection.disconnect()">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0" />
          </svg>
        </button>
      </div>
    </div>

    <div class="side right">
      <div class="shoulders">
        <PadButton class="shoulder bumper" label="R1" :reset-key="resetKey" @change="onButton('r1', $event)" />
        <PadButton class="shoulder trigger" label="R2" :reset-key="resetKey" @change="onButton('r2', $event)" />
      </div>
      <div class="cluster">
        <div class="cluster-top faces">
          <PadButton
            v-for="face in faces"
            :key="face"
            class="face"
            :class="`face-${face}`"
            :label="face.toUpperCase()"
            :reset-key="resetKey"
            @change="onButton(face, $event)"
          >
            <FaceLabel :button="face" :glyphs="glyphs" />
          </PadButton>
        </div>
        <div class="cluster-bottom stick-wrap">
          <VirtualStick
            label="Right stick"
            :deadzone="settingsStore.settings.stickDeadzone"
            :reset-key="resetKey"
            @move="onStick('R', $event)"
          />
          <PadButton class="small thumb" label="R3" :reset-key="resetKey" @change="onButton('r3', $event)" />
        </div>
      </div>
    </div>
  </section>
</template>
