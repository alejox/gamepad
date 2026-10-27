import { DEFAULT_MAPPING } from "@gamepad/shared";
import { describe, expect, it } from "vitest";
import {
  SKINS,
  defaultSettings,
  parseStoredServer,
  parseStoredSettings,
  usesFaceGlyphs,
} from "../src/domain/settings.js";

describe("parseStoredSettings", () => {
  it("returns defaults for missing or corrupt data", () => {
    expect(parseStoredSettings(null)).toEqual(defaultSettings());
    expect(parseStoredSettings("{oops")).toEqual(defaultSettings());
    expect(defaultSettings()).toMatchObject({
      skin: "pro",
      haptics: true,
      mouseSensitivity: 1200,
      mapping: DEFAULT_MAPPING,
    });
  });

  it("restores valid fields", () => {
    const stored = {
      skin: "geo",
      haptics: false,
      stickDeadzone: 0.2,
      mouseSensitivity: 2500,
      mapping: { buttons: { a: "j" }, leftStick: { up: "i", down: "k", left: "j", right: "l" } },
    };
    expect(parseStoredSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it("drops invalid fields individually", () => {
    const restored = parseStoredSettings(
      JSON.stringify({ skin: "brand-x", haptics: "yes", stickDeadzone: 2, mouseSensitivity: 99999, mapping: 1 }),
    );
    expect(restored).toEqual(defaultSettings());
  });

  it("offers eight skins with pro first", () => {
    expect(SKINS.map((skin) => skin.id)).toEqual(["pro", "neon", "retro8", "retro16", "green", "geo", "shapes", "midnight"]);
  });

  it("restores the shapes skin", () => {
    expect(parseStoredSettings(JSON.stringify({ skin: "shapes" })).skin).toBe("shapes");
  });

  it("restores the midnight skin", () => {
    expect(parseStoredSettings(JSON.stringify({ skin: "midnight" })).skin).toBe("midnight");
  });

  it("draws face glyphs only for the glyph skins", () => {
    expect(SKINS.filter((skin) => usesFaceGlyphs(skin.id)).map((skin) => skin.id)).toEqual(["geo", "shapes", "midnight"]);
  });
});

describe("parseStoredServer", () => {
  it("restores host and port, defaulting the port", () => {
    expect(parseStoredServer(JSON.stringify({ host: "10.0.0.5", port: 9000 }))).toEqual({ host: "10.0.0.5", port: 9000 });
    expect(parseStoredServer(null)).toEqual({ host: "", port: 7531 });
    expect(parseStoredServer(JSON.stringify({ host: "x", port: 70000 }))).toEqual({ host: "x", port: 7531 });
  });
});
