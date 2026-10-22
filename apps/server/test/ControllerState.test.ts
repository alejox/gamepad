import { DEFAULT_MAPPING, type KeyMapping } from "@gamepad/shared";
import { describe, expect, it } from "vitest";
import { ControllerState } from "../src/domain/ControllerState.js";

const make = (mapping: KeyMapping = DEFAULT_MAPPING) => new ControllerState(mapping, { deadzone: 0.3 });

describe("ControllerState", () => {
  it("emits key down and up for a mapped button", () => {
    const state = make();
    expect(state.setButton("a", true)).toEqual([{ key: "space", down: true }]);
    expect(state.setButton("a", false)).toEqual([{ key: "space", down: false }]);
  });

  it("ignores repeated presses and releases of the same button", () => {
    const state = make();
    state.setButton("a", true);
    expect(state.setButton("a", true)).toEqual([]);
    state.setButton("a", false);
    expect(state.setButton("a", false)).toEqual([]);
  });

  it("ignores unmapped buttons", () => {
    const state = make({ buttons: {}, leftStick: DEFAULT_MAPPING.leftStick });
    expect(state.setButton("a", true)).toEqual([]);
  });

  it("reference-counts keys shared by several sources", () => {
    const state = make({ buttons: { a: "space", b: "space" }, leftStick: DEFAULT_MAPPING.leftStick });
    expect(state.setButton("a", true)).toEqual([{ key: "space", down: true }]);
    expect(state.setButton("b", true)).toEqual([]);
    expect(state.setButton("a", false)).toEqual([]);
    expect(state.setButton("b", false)).toEqual([{ key: "space", down: false }]);
  });

  it("shares keys between a button and a stick direction", () => {
    const state = make({ buttons: { dpad_up: "w" }, leftStick: DEFAULT_MAPPING.leftStick });
    state.setButton("dpad_up", true);
    expect(state.setLeftStick(0, -1)).toEqual([]);
    expect(state.setButton("dpad_up", false)).toEqual([]);
    expect(state.setLeftStick(0, 0)).toEqual([{ key: "w", down: false }]);
  });

  it("diffs left stick direction changes", () => {
    const state = make();
    expect(state.setLeftStick(0, -1)).toEqual([{ key: "w", down: true }]);
    expect(state.setLeftStick(0.7, -0.7)).toEqual([{ key: "d", down: true }]);
    expect(state.setLeftStick(1, 0)).toEqual([{ key: "w", down: false }]);
    expect(state.setLeftStick(0.1, 0)).toEqual([{ key: "d", down: false }]);
  });

  it("releases every held key on releaseAll and forgets state", () => {
    const state = make();
    state.setButton("a", true);
    state.setButton("r2", true);
    state.setLeftStick(0, 1);
    expect(state.releaseAll()).toEqual(
      expect.arrayContaining([
        { key: "space", down: false },
        { key: "mouse_left", down: false },
        { key: "s", down: false },
      ]),
    );
    expect(state.heldKeys()).toEqual([]);
    expect(state.releaseAll()).toEqual([]);
    // A release after releaseAll must not emit a second key up.
    expect(state.setButton("a", false)).toEqual([]);
  });

  it("re-targets held sources when the mapping changes", () => {
    const state = make();
    state.setButton("a", true);
    state.setButton("l3", true);
    const actions = state.setMapping({
      buttons: { ...DEFAULT_MAPPING.buttons, a: "j" },
      leftStick: DEFAULT_MAPPING.leftStick,
    });
    // Releases come before presses; unchanged keys are left alone.
    expect(actions).toEqual([
      { key: "space", down: false },
      { key: "j", down: true },
    ]);
    expect(state.setButton("a", false)).toEqual([{ key: "j", down: false }]);
  });
});
