import { win32 } from "node:path";

export const VIGEM_DLL_NAME = "ViGEmClient.dll";
export const VIGEM_DLL_ENV = "GAMEPAD_VIGEM_DLL";

export interface ViGEmDllLookup {
  env: Readonly<Record<string, string | undefined>>;
  /** The @gamepad/server package directory. */
  serverRoot: string;
  /** `process.execPath`; a packaged .exe ships the DLL next to itself. */
  execPath: string;
  /** `process.arch` (x64, arm64, ...). */
  arch: string;
}

/**
 * Where to look for ViGEmClient.dll, in order. GAMEPAD_VIGEM_DLL, when set,
 * is the only candidate so a wrong override is reported instead of ignored.
 */
export function vigemDllCandidates({ env, serverRoot, execPath, arch }: ViGEmDllLookup): string[] {
  const override = env[VIGEM_DLL_ENV];
  if (override) return [override];
  return [
    win32.join(serverRoot, "native", `win32-${arch}`, VIGEM_DLL_NAME),
    win32.join(win32.dirname(execPath), VIGEM_DLL_NAME),
  ];
}

export class ViGEmDllNotFoundError extends Error {
  constructor(readonly searched: readonly string[]) {
    super(`${VIGEM_DLL_NAME} not found (looked in: ${searched.join(", ")})`);
    this.name = "ViGEmDllNotFoundError";
  }
}

export function findViGEmDll(candidates: readonly string[], exists: (path: string) => boolean): string {
  const found = candidates.find(exists);
  if (found === undefined) throw new ViGEmDllNotFoundError(candidates);
  return found;
}
