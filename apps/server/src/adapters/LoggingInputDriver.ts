import type { InputDriver, MouseButton } from "../ports/InputDriver.js";

/** Dry-run driver: prints actions instead of emulating input. */
export class LoggingInputDriver implements InputDriver {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}

  keyDown(key: string): void {
    this.write(`[dry-run] key down ${key}`);
  }

  keyUp(key: string): void {
    this.write(`[dry-run] key up ${key}`);
  }

  moveMouseBy(dx: number, dy: number): void {
    this.write(`[dry-run] mouse move ${dx},${dy}`);
  }

  mouseButton(button: MouseButton, down: boolean): void {
    this.write(`[dry-run] mouse ${button} ${down ? "down" : "up"}`);
  }
}
