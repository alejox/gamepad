import type { GamepadProbes } from "../application/selectDriver.js";
import { linuxUinputProbe } from "./linux/linuxUinputProbe.js";

/**
 * Native virtual-pad backends by platform. Each probe loads its native code
 * lazily, so other platforms never touch it. Windows (ViGEmBus) comes next.
 */
export const NATIVE_GAMEPAD_PROBES: GamepadProbes = {
  linux: linuxUinputProbe(),
};
