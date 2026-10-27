import type { GamepadProbes } from "../application/selectDriver.js";
import { linuxUinputProbe } from "./linux/linuxUinputProbe.js";
import { windowsViGEmProbe } from "./windows/windowsViGEmProbe.js";

/**
 * Native virtual-pad backends by platform. Each probe loads its native code
 * lazily, so other platforms never touch it.
 */
export const NATIVE_GAMEPAD_PROBES: GamepadProbes = {
  linux: linuxUinputProbe(),
  win32: windowsViGEmProbe(),
};
