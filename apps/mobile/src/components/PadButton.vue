<script setup lang="ts">
import { usePointerButton } from "../composables/usePointerButton.js";

const props = defineProps<{ label?: string; resetKey: number }>();
const emit = defineEmits<{ change: [down: boolean] }>();

const { pressed, onDown, onUp } = usePointerButton(
  (down) => emit("change", down),
  () => props.resetKey,
);
</script>

<template>
  <div
    class="pad-button control"
    :class="{ pressed }"
    role="button"
    :aria-label="label"
    :aria-pressed="pressed"
    @pointerdown="onDown"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
  >
    <slot>{{ label }}</slot>
  </div>
</template>
