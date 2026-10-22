import type { ButtonId } from "@gamepad/shared";
import { ref, watch } from "vue";
import { diffButtons, dpadButtons } from "../domain/dpad.js";
import { capturePointer, elementCenter } from "./pointer.js";

/** One-zone D-pad: sliding the thumb switches directions without lifting. */
export function useDpad(onButton: (id: ButtonId, down: boolean) => void, resetKey: () => number) {
  const active = ref<ButtonId[]>([]);
  let pointerId: number | null = null;
  let center = { x: 0, y: 0, radius: 1 };

  function apply(next: ButtonId[]): void {
    const { pressed, released } = diffButtons(active.value, next);
    if (pressed.length === 0 && released.length === 0) return;
    for (const id of released) onButton(id, false);
    for (const id of pressed) onButton(id, true);
    active.value = next;
  }

  function track(event: PointerEvent): void {
    apply(dpadButtons(event.clientX - center.x, event.clientY - center.y, center.radius));
  }

  function onDown(event: PointerEvent): void {
    if (pointerId !== null) return;
    capturePointer(event);
    pointerId = event.pointerId;
    center = elementCenter(event.currentTarget as Element);
    track(event);
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId === pointerId) track(event);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    apply([]);
  }

  watch(resetKey, () => {
    pointerId = null;
    active.value = [];
  });

  return { active, onDown, onMove, onUp };
}
