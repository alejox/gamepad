import { ref, watch } from "vue";
import { capturePointer } from "./pointer.js";

/**
 * Multitouch-safe press tracking: the button stays down while at least one
 * captured pointer is on it. Emits only state changes.
 */
export function usePointerButton(onChange: (down: boolean) => void, resetKey: () => number) {
  const pointers = new Set<number>();
  const pressed = ref(false);

  function sync(): void {
    const next = pointers.size > 0;
    if (next === pressed.value) return;
    pressed.value = next;
    onChange(next);
  }

  function onDown(event: PointerEvent): void {
    capturePointer(event);
    pointers.add(event.pointerId);
    sync();
  }

  function onUp(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    sync();
  }

  // A forced release already notified the server; just reset visuals.
  watch(resetKey, () => {
    pointers.clear();
    pressed.value = false;
  });

  return { pressed, onDown, onUp };
}
