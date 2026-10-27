import { describe, expect, it } from "vitest";
import { DEFAULT_PORT, parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("uses defaults and generates a 6-digit PIN", () => {
    const config = parseConfig([], {});
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.pin).toMatch(/^\d{6}$/);
    expect(config.dryRun).toBe(false);
    expect(config.sensitivity).toBeGreaterThan(0);
    expect(config.driver).toBe("auto");
  });

  it.each(["auto", "gamepad", "keyboard"] as const)("reads --driver=%s", (driver) => {
    expect(parseConfig([`--driver=${driver}`], {}).driver).toBe(driver);
  });

  it("reads GAMEPAD_DRIVER and lets the flag win", () => {
    expect(parseConfig([], { GAMEPAD_DRIVER: "keyboard" }).driver).toBe("keyboard");
    expect(parseConfig(["--driver=gamepad", "--dry-run"], { GAMEPAD_DRIVER: "keyboard" })).toMatchObject({
      driver: "gamepad",
      dryRun: true,
    });
  });

  it.each([[["--driver=xinput"], {}], [[], { GAMEPAD_DRIVER: "joystick" }], [["--driver="], {}]])(
    "rejects an unknown driver (%j %j)",
    (argv, env) => {
      expect(() => parseConfig(argv, env)).toThrow(/auto, gamepad or keyboard/);
    },
  );

  it("reads port, PIN and sensitivity from the environment", () => {
    const config = parseConfig([], { GAMEPAD_PORT: "9000", GAMEPAD_PIN: "012345", GAMEPAD_SENSITIVITY: "800" });
    expect(config).toMatchObject({ port: 9000, pin: "012345", sensitivity: 800 });
  });

  it("enables dry run with --dry-run", () => {
    expect(parseConfig(["--dry-run"], {}).dryRun).toBe(true);
  });

  it.each([
    ["non-numeric port", { GAMEPAD_PORT: "abc" }],
    ["out-of-range port", { GAMEPAD_PORT: "70000" }],
    ["short PIN", { GAMEPAD_PIN: "123" }],
    ["non-positive sensitivity", { GAMEPAD_SENSITIVITY: "0" }],
  ])("rejects %s", (_name, env) => {
    expect(() => parseConfig([], env)).toThrow();
  });

  it("rejects unknown flags", () => {
    expect(() => parseConfig(["--nope"], {})).toThrow(/--nope/);
  });
});
