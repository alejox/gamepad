import type { PadState } from "../domain/PadState.js";

/**
 * Output port: a virtual Xbox 360 style pad (ViGEmBus on Windows, uinput on
 * Linux). Each update is a full report; adapters encode it natively.
 */
export interface GamepadDriver {
  /** Human-readable name for the banner and host status page. */
  readonly name: string;
  update(state: PadState): void;
  /** Removes the virtual device. */
  close(): Promise<void> | void;
}

/** Result of trying to bring up a native virtual pad. */
export type GamepadProbeResult = { ok: true; driver: GamepadDriver } | { ok: false; reason: string };

export type GamepadProbe = () => Promise<GamepadProbeResult>;
