export interface Vector {
  x: number;
  y: number;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000 + 0;

/** Clamps an offset to a circle of the given radius. */
export function knobOffset(dx: number, dy: number, radius: number): Vector {
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) return { x: dx, y: dy };
  const scale = radius / distance;
  return { x: dx * scale, y: dy * scale };
}

/**
 * Converts a finger offset from the stick centre into a protocol vector in
 * [-1, 1] (right and down positive), clamped to the unit circle.
 */
export function normalizeStick(dx: number, dy: number, radius: number, deadzone = 0): Vector {
  const clamped = knobOffset(dx, dy, radius);
  const x = clamped.x / radius;
  const y = clamped.y / radius;
  if (Math.hypot(x, y) < deadzone) return { x: 0, y: 0 };
  return { x: round3(x), y: round3(y) };
}
