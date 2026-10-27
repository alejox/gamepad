import { describe, expect, it, vi } from "vitest";
import { createBrowserOpener, shouldOpenBrowser } from "../src/adapters/browserOpener.js";

describe("shouldOpenBrowser", () => {
  it("opens only for the packaged Windows exe", () => {
    expect(shouldOpenBrowser({ packaged: true, open: true, platform: "win32" })).toBe(true);
  });

  it.each([
    ["dev run (not packaged)", { packaged: false, open: true, platform: "win32" }],
    ["--no-open", { packaged: true, open: false, platform: "win32" }],
    ["non-Windows", { packaged: true, open: true, platform: "darwin" }],
  ] as const)("does not open for %s", (_label, options) => {
    expect(shouldOpenBrowser(options)).toBe(false);
  });
});

describe("createBrowserOpener", () => {
  it("runs `start` through cmd with verbatim, quoted arguments and detaches", () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref, on: vi.fn() }));
    createBrowserOpener(spawn)("http://localhost:7531/");

    expect(spawn).toHaveBeenCalledWith("cmd.exe", ["/d", "/s", "/c", '"start "" "http://localhost:7531/""'], {
      windowsVerbatimArguments: true,
      detached: true,
      stdio: "ignore",
    });
    expect(unref).toHaveBeenCalled();
  });

  it("refuses URLs that could break out of the quoted command", () => {
    const spawn = vi.fn();
    expect(() => createBrowserOpener(spawn)('http://localhost/" & calc')).toThrow(/Refusing/);
    expect(spawn).not.toHaveBeenCalled();
  });
});
