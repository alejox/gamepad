import { describe, expect, it } from "vitest";
import { linuxUinputProbe } from "../src/adapters/linux/linuxUinputProbe.js";
import { NATIVE_GAMEPAD_PROBES } from "../src/adapters/gamepadProbes.js";
import { FakeUinputBinding, syscallError } from "./FakeUinputBinding.js";

describe("linuxUinputProbe", () => {
  it("is registered for linux only", () => {
    expect(typeof NATIVE_GAMEPAD_PROBES.linux).toBe("function");
    expect(NATIVE_GAMEPAD_PROBES.darwin).toBeUndefined();
  });

  it("asks to load the module when /dev/uinput is missing, without loading the binding", async () => {
    let loaded = false;
    const probe = linuxUinputProbe({
      exists: () => false,
      loadBinding: async () => {
        loaded = true;
        return new FakeUinputBinding();
      },
    });
    expect(await probe()).toEqual({ ok: false, reason: "uinput module not loaded (sudo modprobe uinput)" });
    expect(loaded).toBe(false);
  });

  it("points to the udev rule when access is denied", async () => {
    const binding = new FakeUinputBinding();
    binding.failOn = (c) => (c.op === "open" ? syscallError("open", "EACCES", "Permission denied") : undefined);
    const result = await linuxUinputProbe({ exists: () => true, loadBinding: async () => binding })();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/no permission on \/dev\/uinput/);
    expect(!result.ok && result.reason).toMatch(/docs\/linux-gamepad\.md/);
  });

  it("reports other setup failures verbatim", async () => {
    const binding = new FakeUinputBinding();
    binding.failOn = (c) => (c.op === "ioctl" ? syscallError("ioctl", "EINVAL", "Invalid argument") : undefined);
    const result = await linuxUinputProbe({ exists: () => true, loadBinding: async () => binding })();
    expect(result).toEqual({ ok: false, reason: "uinput device setup failed at UI_SET_EVBIT: Invalid argument (EINVAL)" });
  });

  it("reports a binding that cannot load", async () => {
    const result = await linuxUinputProbe({
      exists: () => true,
      loadBinding: async () => {
        throw new Error("Cannot find module 'koffi'");
      },
    })();
    expect(result).toEqual({ ok: false, reason: "cannot load libc binding: Cannot find module 'koffi'" });
  });

  it("returns the virtual Xbox 360 driver when the device is created", async () => {
    const result = await linuxUinputProbe({ exists: () => true, loadBinding: async () => new FakeUinputBinding() })();
    expect(result).toMatchObject({ ok: true, driver: { name: "Virtual Xbox 360 (uinput)" } });
  });
});
