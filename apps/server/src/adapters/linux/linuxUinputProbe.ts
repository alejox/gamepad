import { existsSync } from "node:fs";
import type { GamepadProbe } from "../../ports/GamepadDriver.js";
import { UinputSyscallError, type UinputBinding } from "./UinputBinding.js";
import { UINPUT_PATH, UinputGamepadDriver } from "./UinputGamepadDriver.js";

export interface LinuxUinputProbeDeps {
  exists: (path: string) => boolean;
  /** Loaded lazily so non-Linux hosts never import koffi. */
  loadBinding: () => Promise<UinputBinding>;
}

const defaultDeps: LinuxUinputProbeDeps = {
  exists: existsSync,
  loadBinding: async () => (await import("./koffiUinputBinding.js")).createKoffiUinputBinding(),
};

const PERMISSION_HINT =
  "no permission on /dev/uinput: add the udev rule and join the input group (see docs/linux-gamepad.md)";

/** Brings up the uinput Xbox 360 pad, or explains why it cannot. */
export function linuxUinputProbe(deps: LinuxUinputProbeDeps = defaultDeps): GamepadProbe {
  return async () => {
    if (!deps.exists(UINPUT_PATH)) {
      return { ok: false, reason: "uinput module not loaded (sudo modprobe uinput)" };
    }
    let binding: UinputBinding;
    try {
      binding = await deps.loadBinding();
    } catch (error) {
      return { ok: false, reason: `cannot load libc binding: ${error instanceof Error ? error.message : String(error)}` };
    }
    try {
      return { ok: true, driver: new UinputGamepadDriver(binding) };
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      if (cause instanceof UinputSyscallError && (cause.code === "EACCES" || cause.code === "EPERM")) {
        return { ok: false, reason: PERMISSION_HINT };
      }
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  };
}
