import { BUTTON_IDS, type ButtonId } from "@gamepad/shared";
import { describe, expect, it } from "vitest";
import { NEUTRAL_PAD, type PadButton, applyButton, applyStick, isNeutralPad, releaseAll } from "../src/domain/PadState.js";

describe("PadState mapper", () => {
  it("starts neutral", () => {
    expect(NEUTRAL_PAD).toEqual({
      buttons: new Set(),
      leftStick: { x: 0, y: 0 },
      rightStick: { x: 0, y: 0 },
      leftTrigger: 0,
      rightTrigger: 0,
    });
    expect(isNeutralPad(NEUTRAL_PAD)).toBe(true);
  });

  it.each<[ButtonId, PadButton]>([
    ["dpad_up", "dpad_up"],
    ["dpad_down", "dpad_down"],
    ["dpad_left", "dpad_left"],
    ["dpad_right", "dpad_right"],
    ["a", "a"],
    ["b", "b"],
    ["x", "x"],
    ["y", "y"],
    ["l1", "left_shoulder"],
    ["r1", "right_shoulder"],
    ["start", "start"],
    ["select", "back"],
    ["l3", "left_thumb"],
    ["r3", "right_thumb"],
  ])("maps %s to the Xbox %s button", (id, pad) => {
    const pressed = applyButton(NEUTRAL_PAD, id, true);
    expect([...pressed.buttons]).toEqual([pad]);
    expect(applyButton(pressed, id, false).buttons.size).toBe(0);
  });

  it("maps l2/r2 to fully pressed or released digital triggers", () => {
    const both = applyButton(applyButton(NEUTRAL_PAD, "l2", true), "r2", true);
    expect(both).toMatchObject({ leftTrigger: 1, rightTrigger: 1 });
    expect(both.buttons.size).toBe(0);
    expect(applyButton(both, "l2", false)).toMatchObject({ leftTrigger: 0, rightTrigger: 1 });
  });

  it("covers every protocol button", () => {
    for (const id of BUTTON_IDS) {
      expect(isNeutralPad(applyButton(NEUTRAL_PAD, id, true))).toBe(false);
    }
  });

  it("keeps state immutable and returns the same object when nothing changes", () => {
    const pressed = applyButton(NEUTRAL_PAD, "a", true);
    expect(NEUTRAL_PAD.buttons.size).toBe(0);
    expect(applyButton(pressed, "a", true)).toBe(pressed);
    expect(applyButton(NEUTRAL_PAD, "l2", false)).toBe(NEUTRAL_PAD);
    expect(applyStick(NEUTRAL_PAD, "L", 0, 0)).toBe(NEUTRAL_PAD);
  });

  it("inverts Y so up is positive (protocol is y-down)", () => {
    const up = applyStick(NEUTRAL_PAD, "L", 0.5, -1);
    expect(up.leftStick).toEqual({ x: 0.5, y: 1 });
    const down = applyStick(NEUTRAL_PAD, "R", -0.25, 0.75);
    expect(down.rightStick).toEqual({ x: -0.25, y: -0.75 });
    expect(down.leftStick).toEqual({ x: 0, y: 0 });
  });

  it("never produces negative zero", () => {
    const state = applyStick(applyStick(NEUTRAL_PAD, "L", 1, 1), "L", -0, 0);
    expect(Object.is(state.leftStick.x, 0)).toBe(true);
    expect(Object.is(state.leftStick.y, 0)).toBe(true);
  });

  it("clamps out-of-range and non-finite stick values", () => {
    const state = applyStick(NEUTRAL_PAD, "L", 3, -Number.POSITIVE_INFINITY);
    expect(state.leftStick).toEqual({ x: 1, y: 0 });
    expect(applyStick(NEUTRAL_PAD, "R", Number.NaN, 2).rightStick).toEqual({ x: 0, y: -1 });
  });

  it("releaseAll returns the neutral state", () => {
    let state = applyButton(NEUTRAL_PAD, "a", true);
    state = applyButton(state, "r2", true);
    state = applyStick(state, "R", 1, 1);
    expect(isNeutralPad(state)).toBe(false);
    expect(releaseAll()).toEqual(NEUTRAL_PAD);
    expect(isNeutralPad(releaseAll())).toBe(true);
  });
});
