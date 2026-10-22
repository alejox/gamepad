import { onBeforeUnmount, ref, watch } from "vue";
import { type Vector, knobOffset, normalizeStick } from "../domain/stick.js";
import { capturePointer, elementCenter } from "./pointer.js";

/** Full deflection is reached at this fraction of the base radius. */
export const STICK_TRAVEL = 0.6;

const ZERO: Vector = { x: 0, y: 0 };

/**
 * Fixed-base virtual stick. Sends at most one vector per animation frame and
 * exactly one zero vector on release.
 */
export function useVirtualStick(
  onMove: (vector: Vector) => void,
  options: { deadzone: () => number; resetKey: () => number },
) {
  const knob = ref<Vector>(ZERO);
  const active = ref(false);
  let pointerId: number | null = null;
  let center = { x: 0, y: 0, radius: 1 };
  let pending: Vector | null = null;
  let frame = 0;
  let lastSent: Vector = ZERO;

  function flush(): void {
    frame = 0;
    if (!pending || pointerId === null) return;
    if (pending.x !== lastSent.x || pending.y !== lastSent.y) {
      lastSent = pending;
      onMove(pending);
    }
    pending = null;
  }

  function track(event: PointerEvent): void {
    const radius = center.radius * STICK_TRAVEL;
    const dx = event.clientX - center.x;
    const dy = event.clientY - center.y;
    knob.value = knobOffset(dx, dy, radius);
    pending = normalizeStick(dx, dy, radius, options.deadzone());
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function clear(): void {
    pointerId = null;
    active.value = false;
    knob.value = ZERO;
    pending = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function release(): void {
    clear();
    lastSent = ZERO;
    onMove(ZERO);
  }

  function onDown(event: PointerEvent): void {
    if (pointerId !== null) return;
    capturePointer(event);
    pointerId = event.pointerId;
    active.value = true;
    center = elementCenter(event.currentTarget as Element);
    track(event);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId === pointerId) track(event);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId === pointerId) release();
  }

  watch(options.resetKey, () => {
    clear();
    lastSent = ZERO;
  });

  onBeforeUnmount(() => {
    if (pointerId !== null) release();
  });

  return { knob, active, onDown, onMove: onPointerMove, onUp };
}
