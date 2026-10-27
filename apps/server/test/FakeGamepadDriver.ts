import type { PadState } from "../src/domain/PadState.js";
import type { GamepadDriver } from "../src/ports/GamepadDriver.js";

/** Records every pad report the server sends. */
export class FakeGamepadDriver implements GamepadDriver {
  readonly name = "fake pad";
  readonly updates: PadState[] = [];
  closed = false;

  update(state: PadState): void {
    this.updates.push(state);
  }

  close(): void {
    this.closed = true;
  }

  last(): PadState | undefined {
    return this.updates.at(-1);
  }
}
