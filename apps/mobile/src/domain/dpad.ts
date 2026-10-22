import type { ButtonId } from "@gamepad/shared";

/** Fraction of the radius around the centre that presses nothing. */
const CENTER_DEADZONE = 0.25;

const SECTORS: readonly (readonly ButtonId[])[] = [
  ["dpad_right"],
  ["dpad_up", "dpad_right"],
  ["dpad_up"],
  ["dpad_up", "dpad_left"],
  ["dpad_left"],
  ["dpad_down", "dpad_left"],
  ["dpad_down"],
  ["dpad_down", "dpad_right"],
];

/**
 * 8-way D-pad: maps a pointer offset from the pad centre (y down positive)
 * to the pressed direction buttons, using eight 45-degree sectors.
 */
export function dpadButtons(dx: number, dy: number, radius: number): ButtonId[] {
  if (Math.hypot(dx, dy) < radius * CENTER_DEADZONE) return [];
  const angle = Math.atan2(-dy, dx);
  const sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  return [...(SECTORS[sector] ?? [])];
}

export interface ButtonDiff {
  pressed: ButtonId[];
  released: ButtonId[];
}

export function diffButtons(previous: readonly ButtonId[], next: readonly ButtonId[]): ButtonDiff {
  return {
    pressed: next.filter((id) => !previous.includes(id)),
    released: previous.filter((id) => !next.includes(id)),
  };
}
