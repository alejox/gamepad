<script setup lang="ts">
import { computed, ref } from "vue";
import { useContainRect, zoneBoxStyle } from "../composables/useContainRect.js";
import {
  LAYOUT_VERSION,
  type Zone,
  type ZoneId,
  ZONE_SPECS,
  defaultLayout,
  moveZone,
  resizeZone,
  zoneSpec,
} from "../domain/customLayout.js";
import { useSettingsStore } from "../stores/settings.js";

/** Fullscreen editor: drag zones over the photo to match the real controls. */
const emit = defineEmits<{ close: [] }>();
const store = useSettingsStore();

const photo = computed(() => store.settings.customPhoto);
const aspect = computed(() => (photo.value ? photo.value.width / photo.value.height : 1));
const zones = ref<Zone[]>(photo.value ? photo.value.layout.zones.map((zone) => ({ ...zone })) : []);
const selected = ref<ZoneId | null>(null);

const root = ref<HTMLElement | null>(null);
const { rect, style: imageBox } = useContainRect(root, () => ({
  width: photo.value?.width ?? 0,
  height: photo.value?.height ?? 0,
}));

const optionalSpecs = ZONE_SPECS.filter((spec) => spec.optional);

interface Drag {
  pointerId: number;
  mode: "move" | "resize";
  index: number;
  startX: number;
  startY: number;
  start: Zone;
}
let drag: Drag | null = null;

function begin(event: PointerEvent, index: number, mode: Drag["mode"]): void {
  if (drag) return;
  event.preventDefault();
  event.stopPropagation();
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  const start = zones.value[index]!;
  selected.value = start.id;
  drag = { pointerId: event.pointerId, mode, index, startX: event.clientX, startY: event.clientY, start };
}

function track(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId || rect.value.width === 0) return;
  const dx = (event.clientX - drag.startX) / rect.value.width;
  const dy = (event.clientY - drag.startY) / rect.value.height;
  zones.value[drag.index] =
    drag.mode === "move" ? moveZone(drag.start, dx, dy, aspect.value) : resizeZone(drag.start, dx, dy, aspect.value);
}

function end(event: PointerEvent): void {
  if (drag && event.pointerId === drag.pointerId) drag = null;
}

function toggle(id: ZoneId): void {
  const zone = zones.value.find((candidate) => candidate.id === id);
  if (!zone) return;
  zone.enabled = !zone.enabled;
  if (zone.enabled) selected.value = id;
}

function isEnabled(id: ZoneId): boolean {
  return zones.value.some((zone) => zone.id === id && zone.enabled);
}

function resetTemplate(): void {
  zones.value = defaultLayout(aspect.value).zones;
  selected.value = null;
}

function done(): void {
  store.saveLayout({ version: LAYOUT_VERSION, zones: zones.value });
  emit("close");
}
</script>

<template>
  <section ref="root" class="calibration no-select" @pointerdown="selected = null">
    <div v-if="photo && store.photoUrl" class="cal-image" :style="imageBox">
      <img class="cal-photo" :src="store.photoUrl" alt="" draggable="false" />
      <template v-for="(zone, index) in zones" :key="zone.id">
        <div
          v-if="zone.enabled"
          class="cal-zone"
          :class="[`shape-${zoneSpec(zone.id).shape}`, { selected: selected === zone.id }]"
          :style="zoneBoxStyle(zone)"
          @pointerdown="begin($event, index, 'move')"
          @pointermove="track"
          @pointerup="end"
          @pointercancel="end"
          @lostpointercapture="end"
        >
          <span class="cal-label">{{ zoneSpec(zone.id).label }}</span>
          <span
            class="cal-handle"
            aria-label="Resize"
            @pointerdown="begin($event, index, 'resize')"
            @pointermove="track"
            @pointerup="end"
            @pointercancel="end"
            @lostpointercapture="end"
          />
        </div>
      </template>
    </div>
    <p v-else class="cal-empty">Choose a photo in Settings first.</p>

    <div class="cal-toolbar" @pointerdown.stop>
      <button
        v-for="spec in optionalSpecs"
        :key="spec.id"
        type="button"
        class="chip"
        :class="{ on: isEnabled(spec.id) }"
        :aria-pressed="isEnabled(spec.id)"
        @click="toggle(spec.id)"
      >
        {{ spec.label }}
      </button>
      <button type="button" @click="resetTemplate">Reset to template</button>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="button" class="primary" :disabled="!photo" @click="done">Done</button>
    </div>
  </section>
</template>

<style scoped>
.calibration {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #000;
  touch-action: none;
  color: #fff;
}
.cal-image {
  position: absolute;
}
.cal-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}
.cal-zone {
  position: absolute;
  display: grid;
  place-items: center;
  border: 2px dashed rgba(120, 200, 255, 0.9);
  background: rgba(60, 160, 255, 0.18);
  touch-action: none;
  cursor: move;
}
.cal-zone.selected {
  border-style: solid;
  border-color: #ffd23f;
  background: rgba(255, 210, 63, 0.2);
  z-index: 1;
}
.shape-rect {
  border-radius: 10%;
}
.shape-ellipse,
.shape-circle {
  border-radius: 50%;
}
.cal-label {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  pointer-events: none;
}
.cal-handle {
  position: absolute;
  right: -11px;
  bottom: -11px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffd23f;
  border: 2px solid #000;
  touch-action: none;
  cursor: nwse-resize;
}
.cal-zone:not(.selected) .cal-handle {
  opacity: 0.55;
}
.cal-toolbar {
  position: absolute;
  top: max(6px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 5px;
  border-radius: 12px;
  background: rgba(16, 19, 27, 0.85);
  z-index: 2;
  max-width: calc(100% - 24px);
}
.cal-toolbar button {
  font: inherit;
  font-size: 12px;
  color: #e8ecf4;
  background: #1c2130;
  border: 1px solid #2f3648;
  border-radius: 8px;
  padding: 5px 10px;
}
.cal-toolbar .chip.on {
  border-color: #3fb8ff;
  color: #3fb8ff;
}
.cal-toolbar .primary {
  background: #3fb8ff;
  color: #04121f;
  border: 0;
  font-weight: 600;
}
.cal-empty {
  display: grid;
  place-items: center;
  height: 100%;
  margin: 0;
}
</style>
