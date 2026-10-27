import type { ButtonId, StickId } from "@gamepad/shared";
import { NEUTRAL_PAD, type PadState, applyButton, applyStick, releaseAll } from "../domain/PadState.js";
import type { GamepadDriver } from "../ports/GamepadDriver.js";

/** One controller session driving a virtual pad: tracks state, reports only changes. */
export class PadOutput {
  private state: PadState = NEUTRAL_PAD;

  constructor(private readonly driver: GamepadDriver) {}

  button(id: ButtonId, down: boolean): void {
    this.report(applyButton(this.state, id, down));
  }

  stick(id: StickId, x: number, y: number): void {
    this.report(applyStick(this.state, id, x, y));
  }

  /** Always reports neutral, so the OS never keeps a stale pressed state. */
  releaseAll(): void {
    this.state = releaseAll();
    this.driver.update(this.state);
  }

  private report(next: PadState): void {
    if (next === this.state) return;
    this.state = next;
    this.driver.update(next);
  }
}
