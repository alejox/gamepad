import type { GamepadDriver, GamepadProbe } from "../ports/GamepadDriver.js";

export const DRIVER_REQUESTS = ["auto", "gamepad", "keyboard"] as const;

/** Which output the user asked for: `--driver=` or `GAMEPAD_DRIVER`. */
export type DriverRequest = (typeof DRIVER_REQUESTS)[number];

/** Native virtual-pad probes keyed by `process.platform`. */
export type GamepadProbes = Partial<Record<NodeJS.Platform, GamepadProbe>>;

export type DriverSelection =
  | { kind: "gamepad"; driver: GamepadDriver }
  | { kind: "keyboard"; notice?: string }
  | { kind: "error"; message: string };

export interface SelectDriverOptions {
  platform: NodeJS.Platform;
  requested: DriverRequest;
  dryRun: boolean;
  probes: GamepadProbes;
  /** Logging pad used for `--dry-run` with `gamepad`; never touches the OS. */
  dryRunGamepad: () => GamepadDriver;
}

const MACOS_NOTICE =
  "virtual gamepad unavailable: macOS needs a DriverKit entitlement for virtual HID devices; using keyboard/mouse";

/**
 * Picks the output driver. `auto` prefers a native virtual pad and falls back
 * to keyboard/mouse; `gamepad` insists on one; `keyboard` never probes.
 * Dry run never probes: `gamepad` logs pad state, anything else logs keys.
 */
export async function selectDriver(options: SelectDriverOptions): Promise<DriverSelection> {
  const { platform, requested, dryRun, probes } = options;
  if (requested === "keyboard") return { kind: "keyboard" };
  if (dryRun) return requested === "gamepad" ? { kind: "gamepad", driver: options.dryRunGamepad() } : { kind: "keyboard" };
  if (platform === "darwin") return requested === "gamepad" ? { kind: "keyboard", notice: MACOS_NOTICE } : { kind: "keyboard" };

  const result = await probe(probes[platform], platform);
  if (result.ok) return { kind: "gamepad", driver: result.driver };
  if (requested === "gamepad") {
    return { kind: "error", message: `virtual gamepad requested but unavailable: ${result.reason}` };
  }
  return { kind: "keyboard", notice: `virtual gamepad unavailable: ${result.reason}; using keyboard/mouse` };
}

async function probe(
  run: GamepadProbe | undefined,
  platform: NodeJS.Platform,
): Promise<{ ok: true; driver: GamepadDriver } | { ok: false; reason: string }> {
  if (!run) return { ok: false, reason: `no virtual gamepad backend for ${platform} yet` };
  try {
    return await run();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
