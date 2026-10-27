import { describe, expect, it } from "vitest";
import { NATIVE_GAMEPAD_PROBES } from "../src/adapters/gamepadProbes.js";
import { ViGEmDllNotFoundError } from "../src/adapters/windows/vigemDllPath.js";
import { VIGEM_BUS_NOT_FOUND_REASON, windowsViGEmProbe } from "../src/adapters/windows/windowsViGEmProbe.js";
import { VIGEM_ERROR } from "../src/adapters/windows/ViGEmBinding.js";
import { FakeViGEmBinding } from "./FakeViGEmBinding.js";

describe("windowsViGEmProbe", () => {
  it("is registered for win32 next to linux", () => {
    expect(typeof NATIVE_GAMEPAD_PROBES.win32).toBe("function");
    expect(typeof NATIVE_GAMEPAD_PROBES.linux).toBe("function");
  });

  it("explains where to put the DLL when it is missing", async () => {
    const probe = windowsViGEmProbe({
      loadBinding: async () => {
        throw new ViGEmDllNotFoundError(["C:\\a\\ViGEmClient.dll", "C:\\b\\ViGEmClient.dll"]);
      },
    });
    const result = await probe();
    expect(result.ok).toBe(false);
    const reason = !result.ok ? result.reason : "";
    expect(reason).toMatch(/^ViGEmClient\.dll not found/);
    expect(reason).toContain("C:\\a\\ViGEmClient.dll");
    expect(reason).toContain("GAMEPAD_VIGEM_DLL");
    expect(reason).toContain("ViGEmClient-win32-x64");
    expect(reason).toContain("docs/windows-gamepad.md");
  });

  it("reports a DLL that fails to load", async () => {
    const result = await windowsViGEmProbe({
      loadBinding: async () => {
        throw new Error("Failed to load shared library: bad image");
      },
    })();
    expect(result).toEqual({ ok: false, reason: "cannot load ViGEmClient.dll: Failed to load shared library: bad image" });
  });

  it("asks to install ViGEmBus when the bus is not found", async () => {
    const binding = new FakeViGEmBinding();
    binding.errors.set("connect", VIGEM_ERROR.BUS_NOT_FOUND);
    const result = await windowsViGEmProbe({ loadBinding: async () => binding })();
    expect(result).toEqual({ ok: false, reason: VIGEM_BUS_NOT_FOUND_REASON });
    expect(VIGEM_BUS_NOT_FOUND_REASON).toBe(
      "ViGEmBus driver not installed (install ViGEmBus 1.22.0: https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0)",
    );
  });

  it("reports other ViGEm errors readably", async () => {
    const binding = new FakeViGEmBinding();
    binding.errors.set("targetAdd", VIGEM_ERROR.BUS_VERSION_MISMATCH);
    const result = await windowsViGEmProbe({ loadBinding: async () => binding })();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/^ViGEm setup failed at vigem_target_add: .*version/i);
    expect(!result.ok && result.reason).toContain("0xE0000008");
  });

  it("returns the virtual Xbox 360 driver when the target is plugged in", async () => {
    const result = await windowsViGEmProbe({ loadBinding: async () => new FakeViGEmBinding() })();
    expect(result).toMatchObject({ ok: true, driver: { name: "Virtual Xbox 360 (ViGEmBus)" } });
  });
});
