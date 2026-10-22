import type { InputDriver, MouseButton } from "../src/ports/InputDriver.js";

/** Records every driver call as a readable string. */
export class FakeInputDriver implements InputDriver {
  readonly calls: string[] = [];
  readonly moves: [number, number][] = [];
  mouseX = 0;
  mouseY = 0;

  keyDown(key: string): void {
    this.calls.push(`keyDown ${key}`);
  }

  keyUp(key: string): void {
    this.calls.push(`keyUp ${key}`);
  }

  moveMouseBy(dx: number, dy: number): void {
    this.moves.push([dx, dy]);
    this.mouseX += dx;
    this.mouseY += dy;
  }

  mouseButton(button: MouseButton, down: boolean): void {
    this.calls.push(`mouseButton ${button} ${down ? "down" : "up"}`);
  }
}
