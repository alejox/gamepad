export const BUTTON_IDS = [
  "dpad_up",
  "dpad_down",
  "dpad_left",
  "dpad_right",
  "a",
  "b",
  "x",
  "y",
  "l1",
  "r1",
  "l2",
  "r2",
  "start",
  "select",
  "l3",
  "r3",
] as const;

export type ButtonId = (typeof BUTTON_IDS)[number];

export const STICK_IDS = ["L", "R"] as const;

export type StickId = (typeof STICK_IDS)[number];

const buttonIdSet: ReadonlySet<string> = new Set(BUTTON_IDS);

export function isButtonId(value: unknown): value is ButtonId {
  return typeof value === "string" && buttonIdSet.has(value);
}

export function isStickId(value: unknown): value is StickId {
  return value === "L" || value === "R";
}
