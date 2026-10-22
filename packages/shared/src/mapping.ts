import { type ButtonId, isButtonId } from "./buttons.js";
import { hasOwn, isRecord } from "./guards.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const DIGITS = "0123456789".split("");
const FUNCTION_KEYS = Array.from({ length: 12 }, (_, i) => `f${i + 1}`);

export const MOUSE_KEY_NAMES = ["mouse_left", "mouse_right", "mouse_middle"] as const;

export type MouseKeyName = (typeof MOUSE_KEY_NAMES)[number];

/**
 * Allow-list of key names a mapping may reference. Keyboard names follow
 * robotjs naming; `mouse_*` are virtual keys routed to mouse buttons.
 * The server only ever emits keys from this list.
 */
export const KEY_NAMES: readonly string[] = [
  ...LETTERS,
  ...DIGITS,
  ...FUNCTION_KEYS,
  "space",
  "enter",
  "tab",
  "escape",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  "shift",
  "right_shift",
  "control",
  "alt",
  "command",
  ...MOUSE_KEY_NAMES,
];

/** A key name from {@link KEY_NAMES}; kept as a string for wire compatibility. */
export type KeyName = string;

const keyNameSet: ReadonlySet<string> = new Set(KEY_NAMES);

export function isKeyName(value: unknown): value is KeyName {
  return typeof value === "string" && keyNameSet.has(value);
}

export function isMouseKeyName(value: string): value is MouseKeyName {
  return (MOUSE_KEY_NAMES as readonly string[]).includes(value);
}

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export interface KeyMapping {
  /** Unmapped buttons are ignored by the server. */
  buttons: Partial<Record<ButtonId, KeyName>>;
  leftStick: Record<Direction, KeyName>;
}

export const DEFAULT_MAPPING: KeyMapping = {
  buttons: {
    dpad_up: "up",
    dpad_down: "down",
    dpad_left: "left",
    dpad_right: "right",
    a: "space",
    b: "e",
    x: "r",
    y: "f",
    l1: "q",
    r1: "tab",
    l2: "mouse_right",
    r2: "mouse_left",
    start: "enter",
    select: "escape",
    l3: "shift",
    r3: "c",
  },
  leftStick: { up: "w", left: "a", down: "s", right: "d" },
};

/** Validates an untrusted mapping and returns a fresh copy, or null. */
export function parseMapping(value: unknown): KeyMapping | null {
  if (!isRecord(value) || !isRecord(value.buttons) || !isRecord(value.leftStick)) {
    return null;
  }

  const buttons: Partial<Record<ButtonId, KeyName>> = {};
  for (const [id, key] of Object.entries(value.buttons)) {
    if (!isButtonId(id) || !isKeyName(key)) return null;
    buttons[id] = key;
  }

  const stick = value.leftStick;
  const leftStick = {} as Record<Direction, KeyName>;
  for (const direction of DIRECTIONS) {
    const key = hasOwn(stick, direction) ? stick[direction] : undefined;
    if (!isKeyName(key)) return null;
    leftStick[direction] = key;
  }

  return { buttons, leftStick };
}
