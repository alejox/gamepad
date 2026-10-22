<script setup lang="ts">
import { computed } from "vue";
import { useVirtualStick } from "../composables/useVirtualStick.js";
import type { Vector } from "../domain/stick.js";

const props = defineProps<{ label: string; deadzone: number; resetKey: number }>();
const emit = defineEmits<{ move: [vector: Vector] }>();

const { knob, active, onDown, onMove, onUp } = useVirtualStick((vector) => emit("move", vector), {
  deadzone: () => props.deadzone,
  resetKey: () => props.resetKey,
});

const knobStyle = computed(() => ({ transform: `translate(${knob.value.x}px, ${knob.value.y}px)` }));
</script>

<template>
  <div
    class="stick control"
    :class="{ active }"
    role="slider"
    :aria-label="label"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
  >
    <div class="stick-knob" :style="knobStyle" />
  </div>
</template>
