import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GamepadProbe } from "../../ports/GamepadDriver.js";
import { VIGEM_ERROR, ViGEmError, type ViGEmBinding } from "./ViGEmBinding.js";
import { ViGEmGamepadDriver } from "./ViGEmGamepadDriver.js";
import { VIGEM_DLL_ENV, ViGEmDllNotFoundError, findViGEmDll, vigemDllCandidates } from "./vigemDllPath.js";

export interface WindowsViGEmProbeDeps {
  /** Finds and loads ViGEmClient.dll lazily, so non-Windows hosts never touch it. */
  loadBinding: () => Promise<ViGEmBinding>;
}

/** apps/server, from src/adapters/windows (or dist/adapters/windows). */
const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const defaultDeps: WindowsViGEmProbeDeps = {
  loadBinding: async () => {
    const candidates = vigemDllCandidates({
      env: process.env,
      serverRoot: SERVER_ROOT,
      execPath: process.execPath,
      arch: process.arch,
    });
    const path = findViGEmDll(candidates, existsSync);
    return (await import("./koffiViGEmBinding.js")).createKoffiViGEmBinding(path);
  },
};

export const VIGEM_BUS_NOT_FOUND_REASON =
  "ViGEmBus driver not installed (install ViGEmBus 1.22.0: https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0)";

const dllNotFoundReason = (error: ViGEmDllNotFoundError): string =>
  `${error.message}. Download the ViGEmClient-win32-x64 artifact from the windows-vigem workflow ` +
  `into apps/server/native/win32-x64/ or set ${VIGEM_DLL_ENV} (see docs/windows-gamepad.md)`;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Plugs in the ViGEmBus Xbox 360 pad, or explains why it cannot. */
export function windowsViGEmProbe(deps: WindowsViGEmProbeDeps = defaultDeps): GamepadProbe {
  return async () => {
    let binding: ViGEmBinding;
    try {
      binding = await deps.loadBinding();
    } catch (error) {
      if (error instanceof ViGEmDllNotFoundError) return { ok: false, reason: dllNotFoundReason(error) };
      return { ok: false, reason: `cannot load ViGEmClient.dll: ${message(error)}` };
    }
    try {
      return { ok: true, driver: new ViGEmGamepadDriver(binding) };
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      if (cause instanceof ViGEmError && cause.code === VIGEM_ERROR.BUS_NOT_FOUND) {
        return { ok: false, reason: VIGEM_BUS_NOT_FOUND_REASON };
      }
      return { ok: false, reason: message(error) };
    }
  };
}
