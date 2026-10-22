import { describe, expect, it } from "vitest";
import { diffButtons, dpadButtons } from "../src/domain/dpad.js";

const R = 100;

describe("dpadButtons", () => {
  it("returns nothing inside the centre deadzone", () => {
    expect(dpadButtons(0, 0, R)).toEqual([]);
    expect(dpadButtons(10, -10, R)).toEqual([]);
  });

  it.each([
    ["up", 0, -80, ["dpad_up"]],
    ["down", 0, 80, ["dpad_down"]],
    ["left", -80, 0, ["dpad_left"]],
    ["right", 80, 0, ["dpad_right"]],
    ["up-right", 60, -60, ["dpad_up", "dpad_right"]],
    ["up-left", -60, -60, ["dpad_up", "dpad_left"]],
    ["down-right", 60, 60, ["dpad_down", "dpad_right"]],
    ["down-left", -60, 60, ["dpad_down", "dpad_left"]],
  ])("maps %s", (_name, dx, dy, expected) => {
    expect(dpadButtons(dx, dy, R)).toEqual(expected);
  });

  it("keeps a cardinal direction until the diagonal sector (22.5 degrees)", () => {
    // ~20 degrees above the right axis is still "right".
    expect(dpadButtons(80, -29, R)).toEqual(["dpad_right"]);
    // ~25 degrees switches to the diagonal.
    expect(dpadButtons(80, -38, R)).toEqual(["dpad_up", "dpad_right"]);
  });

  it("still tracks a finger that slid outside the pad", () => {
    expect(dpadButtons(-300, 0, R)).toEqual(["dpad_left"]);
  });
});

describe("diffButtons", () => {
  it("reports only state changes", () => {
    expect(diffButtons(["dpad_up"], ["dpad_up", "dpad_right"])).toEqual({ pressed: ["dpad_right"], released: [] });
    expect(diffButtons(["dpad_up", "dpad_right"], ["dpad_right"])).toEqual({ pressed: [], released: ["dpad_up"] });
    expect(diffButtons(["dpad_left"], ["dpad_left"])).toEqual({ pressed: [], released: [] });
  });
});
