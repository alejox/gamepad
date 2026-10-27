import type { GamepadProbes } from "../application/selectDriver.js";

/**
 * Native virtual-pad backends by platform. Empty for now: the uinput (Linux)
 * and ViGEmBus (Windows) adapters register their probes here.
 */
export const NATIVE_GAMEPAD_PROBES: GamepadProbes = {};
