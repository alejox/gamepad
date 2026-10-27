import { type Ref, computed, onBeforeUnmount, onMounted, ref } from "vue";
import { type Rect, type Size, containRect } from "../domain/customLayout.js";

/** Tracks where an image of `natural` size sits inside `container` (object-fit: contain). */
export function useContainRect(container: Ref<HTMLElement | null>, natural: () => Size) {
  const box = ref<Size>({ width: 0, height: 0 });
  let observer: ResizeObserver | null = null;

  function measure(): void {
    const element = container.value;
    if (element) box.value = { width: element.clientWidth, height: element.clientHeight };
  }

  onMounted(() => {
    measure();
    if (container.value && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(container.value);
    }
  });
  onBeforeUnmount(() => observer?.disconnect());

  const rect = computed<Rect>(() => containRect(natural(), box.value));
  const style = computed(() => ({
    left: `${rect.value.x}px`,
    top: `${rect.value.y}px`,
    width: `${rect.value.width}px`,
    height: `${rect.value.height}px`,
  }));

  return { rect, style };
}

/** Absolute placement of a normalized zone inside the image box, in percent. */
export function zoneBoxStyle(zone: { x: number; y: number; w: number; h: number }): Record<string, string> {
  return {
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`,
  };
}
