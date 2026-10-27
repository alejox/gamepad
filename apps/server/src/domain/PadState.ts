import type { ButtonId, StickId } from "@gamepad/shared";

/** Digital buttons of an Xbox 360 style pad (the d-pad is four buttons, as in XUSB). */
export type PadButton =
  | "dpad_up"
  | "dpad_down"
  | "dpad_left"
  | "dpad_right"
  | "a"
  | "b"
  | "x"
  | "y"
  | "left_shoulder"
  | "right_shoulder"
  | "back"
  | "start"
  | "left_thumb"
  | "right_thumb";

export interface StickVector {
  /** [-1, 1], right is positive. */
  readonly x: number;
  /** [-1, 1], up is positive (the protocol sends y-down; the mapper inverts it). */
  readonly y: number;
}

/**
 * OS-agnostic snapshot of a virtual pad. Native encodings (XUSB bitmask,
 * evdev codes, axis ranges) are the adapters' job.
 */
export interface PadState {
  readonly buttons: ReadonlySet<PadButton>;
  readonly leftStick: StickVector;
  readonly rightStick: StickVector;
  /** [0, 1]; the phone's L2/R2 are digital, so only 0 or 1 today. */
  readonly leftTrigger: number;
  readonly rightTrigger: number;
}

export const NEUTRAL_PAD: PadState = Object.freeze({
  buttons: new Set<PadButton>(),
  leftStick: Object.freeze({ x: 0, y: 0 }),
  rightStick: Object.freeze({ x: 0, y: 0 }),
  leftTrigger: 0,
  rightTrigger: 0,
});

/** Positional mapping from protocol buttons to Xbox buttons; l2/r2 are triggers. */
const BUTTON_MAP: Record<Exclude<ButtonId, "l2" | "r2">, PadButton> = {
  dpad_up: "dpad_up",
  dpad_down: "dpad_down",
  dpad_left: "dpad_left",
  dpad_right: "dpad_right",
  a: "a",
  b: "b",
  x: "x",
  y: "y",
  l1: "left_shoulder",
  r1: "right_shoulder",
  select: "back",
  start: "start",
  l3: "left_thumb",
  r3: "right_thumb",
};

/** Clamps to [-1, 1]; non-finite becomes 0 and -0 becomes 0. */
function axis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value)) + 0;
}

/** Applies a button press/release. Returns `state` itself when nothing changes. */
export function applyButton(state: PadState, id: ButtonId, down: boolean): PadState {
  if (id === "l2" || id === "r2") {
    const key = id === "l2" ? "leftTrigger" : "rightTrigger";
    const value = down ? 1 : 0;
    return state[key] === value ? state : { ...state, [key]: value };
  }
  const button = BUTTON_MAP[id];
  if (down === state.buttons.has(button)) return state;
  const buttons = new Set(state.buttons);
  if (down) buttons.add(button);
  else buttons.delete(button);
  return { ...state, buttons };
}

/** Applies a protocol stick vector (y-down) as a pad stick (y-up). */
export function applyStick(state: PadState, id: StickId, x: number, y: number): PadState {
  const key = id === "L" ? "leftStick" : "rightStick";
  const next = { x: axis(x), y: axis(-y) };
  const current = state[key];
  return current.x === next.x && current.y === next.y ? state : { ...state, [key]: next };
}

/** Everything released, sticks centered. */
export function releaseAll(): PadState {
  return NEUTRAL_PAD;
}

export function isNeutralPad(state: PadState): boolean {
  return (
    state.buttons.size === 0 &&
    state.leftStick.x === 0 &&
    state.leftStick.y === 0 &&
    state.rightStick.x === 0 &&
    state.rightStick.y === 0 &&
    state.leftTrigger === 0 &&
    state.rightTrigger === 0
  );
}
