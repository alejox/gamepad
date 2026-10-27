import { describe, expect, it } from "vitest";
import { win32 } from "node:path";
import { ViGEmDllNotFoundError, findViGEmDll, vigemDllCandidates } from "../src/adapters/windows/vigemDllPath.js";

const base = { serverRoot: "C:\\app\\apps\\server", execPath: "C:\\Program Files\\gamepad\\gamepad.exe", arch: "x64" };

describe("vigemDllCandidates", () => {
  it("uses only GAMEPAD_VIGEM_DLL when it is set", () => {
    expect(vigemDllCandidates({ ...base, env: { GAMEPAD_VIGEM_DLL: "D:\\dll\\ViGEmClient.dll" } })).toEqual([
      "D:\\dll\\ViGEmClient.dll",
    ]);
  });

  it("looks in the server package, then next to the executable", () => {
    expect(vigemDllCandidates({ ...base, env: {} })).toEqual([
      win32.join("C:\\app\\apps\\server", "native", "win32-x64", "ViGEmClient.dll"),
      win32.join("C:\\Program Files\\gamepad", "ViGEmClient.dll"),
    ]);
  });

  it("ignores an empty GAMEPAD_VIGEM_DLL and follows the arch", () => {
    expect(vigemDllCandidates({ ...base, arch: "arm64", env: { GAMEPAD_VIGEM_DLL: "" } })[0]).toContain("win32-arm64");
  });
});

describe("findViGEmDll", () => {
  it("returns the first existing candidate", () => {
    expect(findViGEmDll(["a", "b", "c"], (p) => p !== "a")).toBe("b");
  });

  it("throws ViGEmDllNotFoundError listing every place it looked", () => {
    let thrown: unknown;
    try {
      findViGEmDll(["a", "b"], () => false);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ViGEmDllNotFoundError);
    expect((thrown as ViGEmDllNotFoundError).searched).toEqual(["a", "b"]);
  });
});
