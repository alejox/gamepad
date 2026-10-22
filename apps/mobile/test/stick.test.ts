import { describe, expect, it } from "vitest";
import { knobOffset, normalizeStick } from "../src/domain/stick.js";

describe("normalizeStick", () => {
  it("scales the finger offset by the radius (y down is positive)", () => {
    expect(normalizeStick(50, -25, 100)).toEqual({ x: 0.5, y: -0.25 });
  });

  it("clamps the vector to the unit circle, keeping its direction", () => {
    const v = normalizeStick(300, 400, 100);
    expect(v).toEqual({ x: 0.6, y: 0.8 });
  });

  it("returns an exact zero inside the deadzone", () => {
    expect(normalizeStick(5, 5, 100, 0.1)).toEqual({ x: 0, y: 0 });
    expect(normalizeStick(20, 0, 100, 0.1)).toEqual({ x: 0.2, y: 0 });
  });

  it("rounds to three decimals to keep frames small", () => {
    expect(normalizeStick(33.3333, 0, 100)).toEqual({ x: 0.333, y: 0 });
  });

  it("never returns negative zero", () => {
    expect(Object.is(normalizeStick(-0.0001, 0, 100).x, -0)).toBe(false);
  });
});

describe("knobOffset", () => {
  it("follows the finger inside the base", () => {
    expect(knobOffset(30, -40, 100)).toEqual({ x: 30, y: -40 });
  });

  it("is clamped to the radius outside the base", () => {
    expect(knobOffset(0, 250, 100)).toEqual({ x: 0, y: 100 });
  });
});
