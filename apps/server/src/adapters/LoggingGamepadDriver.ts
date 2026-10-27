import type { PadState, StickVector } from "../domain/PadState.js";
import { NEUTRAL_PAD } from "../domain/PadState.js";
import type { GamepadDriver } from "../ports/GamepadDriver.js";

/**
 * Dry-run pad: logs compact state diffs instead of creating a device.
 *
 * Buttons and triggers are logged as they change. Sticks arrive at ~60-120 Hz,
 * so they are rounded to 0.1 and logged at most once per window, with the
 * latest value flushed when the window ends.
 */
export class LoggingGamepadDriver implements GamepadDriver {
  readonly name = "Virtual Xbox 360 pad (dry run)";
  private last: PadState = NEUTRAL_PAD;
  private loggedSticks = { L: stickText(NEUTRAL_PAD.leftStick), R: stickText(NEUTRAL_PAD.rightStick) };
  private window: NodeJS.Timeout | undefined;

  constructor(
    private readonly write: (line: string) => void = (line) => console.log(line),
    private readonly stickWindowMs = 250,
  ) {}

  update(state: PadState): void {
    const diff = buttonDiff(this.last, state);
    this.last = state;
    if (diff.length > 0) this.write(`[dry-run] pad ${diff.join(" ")}`);
    if (this.window) return;
    if (this.flushSticks()) this.openWindow();
  }

  close(): void {
    if (this.window) clearTimeout(this.window);
    this.window = undefined;
    this.flushSticks();
  }

  private openWindow(): void {
    this.window = setTimeout(() => {
      this.window = undefined;
      if (this.flushSticks()) this.openWindow();
    }, this.stickWindowMs);
    this.window.unref?.();
  }

  /** Logs sticks whose rounded value changed; true when a line was written. */
  private flushSticks(): boolean {
    const next = { L: stickText(this.last.leftStick), R: stickText(this.last.rightStick) };
    const parts = (["L", "R"] as const)
      .filter((id) => next[id] !== this.loggedSticks[id])
      .map((id) => `${id}=${next[id]}`);
    this.loggedSticks = next;
    if (parts.length === 0) return false;
    this.write(`[dry-run] pad ${parts.join(" ")}`);
    return true;
  }
}

function buttonDiff(previous: PadState, next: PadState): string[] {
  const parts: string[] = [];
  for (const button of next.buttons) if (!previous.buttons.has(button)) parts.push(`+${button}`);
  for (const button of previous.buttons) if (!next.buttons.has(button)) parts.push(`-${button}`);
  if (previous.leftTrigger !== next.leftTrigger) parts.push(`LT=${round(next.leftTrigger)}`);
  if (previous.rightTrigger !== next.rightTrigger) parts.push(`RT=${round(next.rightTrigger)}`);
  return parts;
}

function round(value: number): string {
  const rounded = Math.round(value * 10) / 10 + 0;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function stickText({ x, y }: StickVector): string {
  const fixed = (value: number): string => (Math.round(value * 10) / 10 + 0).toFixed(1);
  return `(${fixed(x)},${fixed(y)})`;
}
