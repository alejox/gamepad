<script setup lang="ts">
import { computed, ref } from "vue";
import DPad from "../components/DPad.vue";
import PadButton from "../components/PadButton.vue";
import VirtualStick from "../components/VirtualStick.vue";
import { useContainRect, zoneBoxStyle } from "../composables/useContainRect.js";
import { usePadSession } from "../composables/usePadSession.js";
import { type CustomPhoto } from "../domain/settings.js";
import { zoneSpec } from "../domain/customLayout.js";

/** Play mode for the custom photo skin: the photo is the pad, zones are invisible hit areas. */
const props = defineProps<{ photo: CustomPhoto; photoUrl: string }>();
const emit = defineEmits<{ settings: [] }>();

const { resetKey, paired, awaiting, deadzone, statusText, emblemLabel, onEmblem, onButton, onStick, disconnect } =
  usePadSession();

const root = ref<HTMLElement | null>(null);
const { style: imageBox } = useContainRect(root, () => ({ width: props.photo.width, height: props.photo.height }));

const controls = computed(() =>
  props.photo.layout.zones
    .filter((zone) => zone.enabled)
    .map((zone) => ({ zone, spec: zoneSpec(zone.id), style: zoneBoxStyle(zone) })),
);

const hasEmblemZone = computed(() => controls.value.some(({ spec }) => spec.kind === "emblem"));
</script>

<template>
  <section ref="root" class="custom-pad no-select">
    <div class="custom-image" :style="imageBox">
      <img class="custom-photo" :src="photoUrl" alt="" draggable="false" />
      <template v-for="{ zone, spec, style } in controls" :key="zone.id">
        <DPad v-if="spec.kind === 'dpad'" class="zone" :style="style" :reset-key="resetKey" @button="onButton" />
        <VirtualStick
          v-else-if="spec.kind === 'stick'"
          class="zone"
          :style="style"
          :label="spec.label"
          :deadzone="deadzone"
          :reset-key="resetKey"
          @move="onStick(spec.stick, $event)"
        />
        <button
          v-else-if="spec.kind === 'emblem'"
          type="button"
          class="zone emblem-zone"
          :class="`shape-${spec.shape}`"
          :style="style"
          :aria-label="emblemLabel"
          :aria-disabled="paired || awaiting"
          @click="onEmblem"
        />
        <PadButton
          v-else
          class="zone"
          :class="`shape-${spec.shape}`"
          :style="style"
          :label="spec.label"
          :reset-key="resetKey"
          @change="onButton(spec.button, $event)"
        />
      </template>
    </div>

    <div class="custom-overlay">
      <span class="dot" :class="{ ok: paired }" :aria-label="paired ? 'Connected' : 'Not connected'" />
      <span class="latency">{{ statusText }}</span>
      <button
        v-if="!hasEmblemZone && !paired"
        type="button"
        class="overlay-button"
        :aria-label="emblemLabel"
        :disabled="awaiting"
        @click="onEmblem"
      >
        Find PC
      </button>
      <button type="button" class="overlay-button" aria-label="Settings" @click="emit('settings')">⚙</button>
      <button type="button" class="overlay-button" aria-label="Disconnect" @click="disconnect">⏻</button>
    </div>
  </section>
</template>

<style>
/* Not scoped: the hit zones are the shared control components, styled from outside. */
.custom-pad {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #000;
  touch-action: none;
}
.custom-image {
  position: absolute;
}
.custom-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}
.custom-pad .zone {
  position: absolute;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: transparent;
  font-size: 0;
  transform: none;
  filter: none;
  transition: box-shadow 80ms ease-out, background-color 80ms ease-out;
}
.custom-pad .shape-rect {
  border-radius: 14%;
}
.custom-pad .shape-ellipse,
.custom-pad .stick.zone {
  border-radius: 50%;
}
/* Press feedback: a soft glow where the finger is. */
.custom-pad .zone.pressed,
.custom-pad .stick.zone.active,
.custom-pad .dpad-arm.pressed {
  transform: none;
  filter: none;
  background: rgba(255, 255, 255, 0.14);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.45), 0 0 18px 6px rgba(110, 190, 255, 0.45);
}
.custom-pad .dpad-arm,
.custom-pad .dpad-hub {
  background: transparent;
  border: 0;
  color: transparent;
  border-radius: 30%;
}
.custom-pad .stick-knob {
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.55);
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.custom-pad .stick.active .stick-knob {
  opacity: 1;
  filter: none;
}
.custom-overlay {
  position: absolute;
  top: max(6px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #e8ecf4;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  z-index: 2;
}
.custom-overlay .dot {
  width: 8px;
  height: 8px;
}
.overlay-button {
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.12);
  border: 0;
  border-radius: 999px;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
}
</style>
