import { describe, expect, it } from "vitest";
import { BUTTON_IDS, DEFAULT_MAPPING, KEY_NAMES, isKeyName, parseMapping } from "../src/index.js";

describe("DEFAULT_MAPPING", () => {
  it("maps every button to an allowed key", () => {
    for (const id of BUTTON_IDS) {
      const key = DEFAULT_MAPPING.buttons[id];
      expect(key, id).toBeDefined();
      expect(isKeyName(key), id).toBe(true);
    }
  });

  it("uses WASD for the left stick", () => {
    expect(DEFAULT_MAPPING.leftStick).toEqual({ up: "w", left: "a", down: "s", right: "d" });
  });

  it("is a valid mapping", () => {
    expect(parseMapping(DEFAULT_MAPPING)).toEqual(DEFAULT_MAPPING);
  });
});

describe("parseMapping", () => {
  it("accepts a partial button mapping", () => {
    const mapping = { buttons: { a: "space", r2: "mouse_left" }, leftStick: DEFAULT_MAPPING.leftStick };
    expect(parseMapping(mapping)).toEqual(mapping);
  });

  it("does not return the caller's object (no aliasing)", () => {
    const parsed = parseMapping(DEFAULT_MAPPING);
    expect(parsed).not.toBe(DEFAULT_MAPPING);
    expect(parsed?.buttons).not.toBe(DEFAULT_MAPPING.buttons);
  });

  it.each([
    ["unknown key name", { buttons: { a: "printscreen; rm" }, leftStick: DEFAULT_MAPPING.leftStick }],
    ["unknown button id", { buttons: { turbo: "a" }, leftStick: DEFAULT_MAPPING.leftStick }],
    ["missing leftStick", { buttons: {} }],
    ["incomplete leftStick", { buttons: {}, leftStick: { up: "w", down: "s", left: "a" } }],
    ["non-string key", { buttons: { a: 1 }, leftStick: DEFAULT_MAPPING.leftStick }],
    ["inherited key name", { buttons: { a: "toString" }, leftStick: DEFAULT_MAPPING.leftStick }],
    ["array", []],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(parseMapping(value)).toBeNull();
  });

  it("exposes mouse virtual keys in the allow-list", () => {
    expect(KEY_NAMES).toEqual(expect.arrayContaining(["mouse_left", "mouse_right", "mouse_middle"]));
  });
});
