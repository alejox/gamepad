/** Captures a pointer on the element that received it; tolerant of browsers without capture. */
export function capturePointer(event: PointerEvent): void {
  event.preventDefault();
  const target = event.currentTarget as Element | null;
  try {
    target?.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured.
  }
}

export interface Point {
  x: number;
  y: number;
}

export function elementCenter(element: Element): Point & { radius: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width / 2 };
}
