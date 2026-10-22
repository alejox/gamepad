import { describe, expect, it } from "vitest";
import { stickToDirections } from "../src/domain/stickToDirections.js";

const dirs = (x: number, y: number, deadzone = 0.3) => [...stickToDirections(x, y, deadzone)].sort();

describe("stickToDirections", () => {
  it("returns nothing inside the deadzone", () => {
    expect(dirs(0, 0)).toEqual([]);
    expect(dirs(0.2, -0.2)).toEqual([]);
  });

  it("maps cardinal directions (y down is positive)", () => {
    expect(dirs(0, -1)).toEqual(["up"]);
    expect(dirs(0, 1)).toEqual(["down"]);
    expect(dirs(-1, 0)).toEqual(["left"]);
    expect(dirs(1, 0)).toEqual(["right"]);
  });

  it("maps diagonals to two directions", () => {
    expect(dirs(0.7, -0.7)).toEqual(["right", "up"]);
    expect(dirs(-0.7, 0.7)).toEqual(["down", "left"]);
  });

  it("keeps a mostly-horizontal push cardinal (22.5 degree sectors)", () => {
    // ~15 degrees above horizontal stays "right" only.
    expect(dirs(0.97, -0.26)).toEqual(["right"]);
    // ~30 degrees above horizontal becomes a diagonal.
    expect(dirs(0.87, -0.5)).toEqual(["right", "up"]);
  });

  it("uses the vector magnitude, not per-axis thresholds, for the deadzone", () => {
    expect(dirs(0.25, 0.25, 0.3)).toEqual(["down", "right"]);
  });
});
