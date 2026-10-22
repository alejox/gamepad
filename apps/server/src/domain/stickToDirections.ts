import type { Direction } from "@gamepad/shared";

const SECTOR_DIRECTIONS: readonly (readonly Direction[])[] = [
  ["right"],
  ["up", "right"],
  ["up"],
  ["up", "left"],
  ["left"],
  ["down", "left"],
  ["down"],
  ["down", "right"],
];

/**
 * Converts a stick vector (y down is positive) into 8-way digital directions.
 *
 * Angle-based: the circle is split into eight 45-degree sectors centred on the
 * cardinal and diagonal directions, so a diagonal triggers only between 22.5
 * and 67.5 degrees. The deadzone is applied to the vector magnitude, which
 * avoids the "square" feel of per-axis thresholds.
 */
export function stickToDirections(x: number, y: number, deadzone: number): ReadonlySet<Direction> {
  if (Math.hypot(x, y) < deadzone) return new Set();
  const angle = Math.atan2(-y, x);
  const sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  return new Set(SECTOR_DIRECTIONS[sector]);
}
