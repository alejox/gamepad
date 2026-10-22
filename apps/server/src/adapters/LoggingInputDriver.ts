import type { InputDriver, MouseButton } from "../ports/InputDriver.js";

/**
 * Dry-run driver: prints actions instead of emulating input.
 *
 * Mouse moves arrive at ~120 Hz, so they are throttled: the first move of a
 * burst is logged at once, later ones are summed and logged once per window.
 */
export class LoggingInputDriver implements InputDriver {
  private pendingX = 0;
  private pendingY = 0;
  private pendingCount = 0;
  private window: NodeJS.Timeout | undefined;

  constructor(
    private readonly write: (line: string) => void = (line) => console.log(line),
    private readonly mouseWindowMs = 250,
  ) {}

  keyDown(key: string): void {
    this.write(`[dry-run] key down ${key}`);
  }

  keyUp(key: string): void {
    this.write(`[dry-run] key up ${key}`);
  }

  moveMouseBy(dx: number, dy: number): void {
    this.pendingX += dx;
    this.pendingY += dy;
    this.pendingCount++;
    if (this.window) return;
    this.flushMouse();
    this.openWindow();
  }

  mouseButton(button: MouseButton, down: boolean): void {
    this.write(`[dry-run] mouse ${button} ${down ? "down" : "up"}`);
  }

  private openWindow(): void {
    this.window = setTimeout(() => {
      this.window = undefined;
      if (this.pendingCount === 0) return;
      this.flushMouse();
      this.openWindow();
    }, this.mouseWindowMs);
    this.window.unref?.();
  }

  private flushMouse(): void {
    const count = this.pendingCount;
    const suffix = count > 1 ? ` (${count} moves)` : "";
    this.write(`[dry-run] mouse move ${this.pendingX},${this.pendingY}${suffix}`);
    this.pendingX = 0;
    this.pendingY = 0;
    this.pendingCount = 0;
  }
}
