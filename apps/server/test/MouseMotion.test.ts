import { describe, expect, it } from "vitest";
import { MouseMotion } from "../src/domain/MouseMotion.js";

const make = () => new MouseMotion({ deadzone: 0.2, sensitivity: 1000, exponent: 2 });

describe("MouseMotion", () => {
  it("is inactive and produces no movement inside the deadzone", () => {
    const motion = make();
    motion.setVector(0.1, -0.1);
    expect(motion.active).toBe(false);
    expect(motion.tick(100)).toEqual({ dx: 0, dy: 0 });
  });

  it("moves at full sensitivity at full deflection", () => {
    const motion = make();
    motion.setVector(1, 0);
    expect(motion.active).toBe(true);
    expect(motion.tick(1000)).toEqual({ dx: 1000, dy: 0 });
  });

  it("applies a squared response curve after the deadzone", () => {
    const motion = make();
    // magnitude 0.6 -> (0.6 - 0.2) / 0.8 = 0.5 -> 0.25 -> 250 px/s
    motion.setVector(0, 0.6);
    expect(motion.tick(1000)).toEqual({ dx: 0, dy: 250 });
  });

  it("accumulates sub-pixel remainders across ticks", () => {
    const motion = make();
    motion.setVector(1, 0);
    // 1000 px/s * 0.4 ms = 0.4 px per tick
    const total = Array.from({ length: 5 }, () => motion.tick(0.4).dx).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
  });

  it("handles negative directions symmetrically", () => {
    const motion = make();
    motion.setVector(-1, 0);
    const total = Array.from({ length: 5 }, () => motion.tick(0.4).dx).reduce((a, b) => a + b, 0);
    expect(total).toBe(-2);
  });

  it("drops the remainder when the stick returns to rest", () => {
    const motion = make();
    motion.setVector(1, 0);
    motion.tick(0.9);
    motion.setVector(0, 0);
    motion.setVector(1, 0);
    expect(motion.tick(0.2)).toEqual({ dx: 0, dy: 0 });
  });

  it("clamps vectors longer than 1", () => {
    const motion = make();
    motion.setVector(1, 1);
    const { dx, dy } = motion.tick(1000);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(1001);
  });

  it("updates sensitivity at runtime", () => {
    const motion = make();
    motion.setSensitivity(500);
    motion.setVector(1, 0);
    expect(motion.tick(1000)).toEqual({ dx: 500, dy: 0 });
  });
});
