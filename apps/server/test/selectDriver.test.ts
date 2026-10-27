import { describe, expect, it } from "vitest";
import {
  type DriverRequest,
  type GamepadProbes,
  selectDriver,
} from "../src/application/selectDriver.js";
import type { PadState } from "../src/domain/PadState.js";
import type { GamepadDriver } from "../src/ports/GamepadDriver.js";

const fakePad = (name: string): GamepadDriver => ({
  name,
  update: (_state: PadState) => {},
  close: () => {},
});

const okProbe = (name = "native pad") => async () => ({ ok: true as const, driver: fakePad(name) });
const failProbe = (reason = "bus not installed") => async () => ({ ok: false as const, reason });

async function select(platform: NodeJS.Platform, requested: DriverRequest, probes: GamepadProbes, dryRun = false) {
  return selectDriver({ platform, requested, dryRun, probes, dryRunGamepad: () => fakePad("dry-run pad") });
}

describe("selectDriver", () => {
  it.each<NodeJS.Platform>(["win32", "linux", "darwin"])("keyboard is always keyboard on %s", async (platform) => {
    expect(await select(platform, "keyboard", { win32: okProbe(), linux: okProbe() })).toEqual({ kind: "keyboard" });
  });

  describe.each<NodeJS.Platform>(["win32", "linux"])("on %s", (platform) => {
    it("auto uses the native pad when the probe succeeds", async () => {
      const result = await select(platform, "auto", { [platform]: okProbe("vpad") });
      expect(result).toMatchObject({ kind: "gamepad", driver: { name: "vpad" } });
    });

    it("gamepad uses the native pad when the probe succeeds", async () => {
      const result = await select(platform, "gamepad", { [platform]: okProbe("vpad") });
      expect(result).toMatchObject({ kind: "gamepad", driver: { name: "vpad" } });
    });

    it("auto falls back to keyboard with a notice when the probe fails", async () => {
      expect(await select(platform, "auto", { [platform]: failProbe("bus missing") })).toEqual({
        kind: "keyboard",
        notice: "virtual gamepad unavailable: bus missing; using keyboard/mouse",
      });
    });

    it("auto falls back to keyboard with a notice when no probe is registered", async () => {
      const result = await select(platform, "auto", {});
      expect(result).toMatchObject({ kind: "keyboard" });
      expect(result.kind === "keyboard" && result.notice).toMatch(/^virtual gamepad unavailable: .+; using keyboard\/mouse$/);
    });

    it("auto treats a throwing probe as unavailable", async () => {
      const result = await select(platform, "auto", {
        [platform]: async () => {
          throw new Error("dlopen failed");
        },
      });
      expect(result).toEqual({
        kind: "keyboard",
        notice: "virtual gamepad unavailable: dlopen failed; using keyboard/mouse",
      });
    });

    it("gamepad fails with a clear error when unavailable", async () => {
      expect(await select(platform, "gamepad", { [platform]: failProbe("bus missing") })).toEqual({
        kind: "error",
        message: "virtual gamepad requested but unavailable: bus missing",
      });
      expect(await select(platform, "gamepad", {})).toMatchObject({ kind: "error" });
    });
  });

  describe("on darwin", () => {
    it("auto uses keyboard silently, even with a probe registered", async () => {
      expect(await select("darwin", "auto", { darwin: okProbe() })).toEqual({ kind: "keyboard" });
    });

    it("gamepad falls back to keyboard with a DriverKit notice", async () => {
      const result = await select("darwin", "gamepad", { darwin: okProbe() });
      expect(result).toMatchObject({ kind: "keyboard" });
      expect(result.kind === "keyboard" && result.notice).toMatch(/DriverKit/);
    });
  });

  it("falls back on unknown platforms like a missing probe", async () => {
    expect(await select("freebsd", "auto", {})).toMatchObject({ kind: "keyboard" });
    expect(await select("freebsd", "gamepad", {})).toMatchObject({ kind: "error" });
  });

  describe("dry run", () => {
    it.each<NodeJS.Platform>(["win32", "linux", "darwin"])(
      "gamepad logs pad state without probing on %s",
      async (platform) => {
        let probed = false;
        const probe = async () => {
          probed = true;
          return { ok: true as const, driver: fakePad("native") };
        };
        const result = await select(platform, "gamepad", { [platform]: probe }, true);
        expect(result).toMatchObject({ kind: "gamepad", driver: { name: "dry-run pad" } });
        expect(probed).toBe(false);
      },
    );

    it.each<DriverRequest>(["auto", "keyboard"])("%s keeps the keyboard/mouse dry run without probing", async (requested) => {
      let probed = false;
      const probe = async () => {
        probed = true;
        return { ok: true as const, driver: fakePad("native") };
      };
      expect(await select("win32", requested, { win32: probe }, true)).toEqual({ kind: "keyboard" });
      expect(probed).toBe(false);
    });
  });
});
