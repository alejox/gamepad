<script setup lang="ts">
import type { ButtonId } from "@gamepad/shared";
import { useDpad } from "../composables/useDpad.js";

const props = defineProps<{ resetKey: number }>();
const emit = defineEmits<{ button: [id: ButtonId, down: boolean] }>();

const { active, onDown, onMove, onUp } = useDpad(
  (id, down) => emit("button", id, down),
  () => props.resetKey,
);

const arms = [
  { id: "dpad_up", glyph: "▲" },
  { id: "dpad_left", glyph: "◀" },
  { id: "dpad_right", glyph: "▶" },
  { id: "dpad_down", glyph: "▼" },
] as const;
</script>

<template>
  <div
    class="dpad control"
    role="group"
    aria-label="Directional pad"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
  >
    <div v-for="arm in arms" :key="arm.id" class="dpad-arm" :class="[arm.id, { pressed: active.includes(arm.id) }]">
      <span>{{ arm.glyph }}</span>
    </div>
    <div class="dpad-hub" />
  </div>
</template>
