import { describe, expect, it, vi } from "vitest";
import { createBrowserOpener, shouldOpenBrowser } from "../src/adapters/browserOpener.js";

describe("shouldOpenBrowser", () => {
  it.each(["win32", "darwin"] as const)("opens for the packaged %s host", (platform) => {
    expect(shouldOpenBrowser({ packaged: true, open: true, platform })).toBe(true);
  });

  it.each([
    ["Windows dev run (not packaged)", { packaged: false, open: true, platform: "win32" }],
    ["macOS dev run (not packaged)", { packaged: false, open: true, platform: "darwin" }],
    ["Windows --no-open", { packaged: true, open: false, platform: "win32" }],
    ["macOS --no-open", { packaged: true, open: false, platform: "darwin" }],
    ["another platform", { packaged: true, open: true, platform: "linux" }],
  ] as const)("does not open for %s", (_label, options) => {
    expect(shouldOpenBrowser(options)).toBe(false);
  });
});

describe("createBrowserOpener", () => {
  it("runs `start` through cmd with verbatim, quoted arguments and detaches", () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref, on: vi.fn() }));
    createBrowserOpener(spawn, "win32")("http://localhost:7531/");

    expect(spawn).toHaveBeenCalledWith("cmd.exe", ["/d", "/s", "/c", '"start "" "http://localhost:7531/""'], {
      windowsVerbatimArguments: true,
      detached: true,
      stdio: "ignore",
    });
    expect(unref).toHaveBeenCalled();
  });

  it("uses /usr/bin/open with a detached argument on macOS", () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref, on: vi.fn() }));
    createBrowserOpener(spawn, "darwin")("http://localhost:7531/");

    expect(spawn).toHaveBeenCalledWith("/usr/bin/open", ["http://localhost:7531/"], {
      detached: true,
      stdio: "ignore",
    });
    expect(unref).toHaveBeenCalled();
  });

  it("refuses URLs that could break out of the quoted Windows command", () => {
    const spawn = vi.fn();
    expect(() => createBrowserOpener(spawn, "win32")('http://localhost/" & calc')).toThrow(/Refusing/);
    expect(spawn).not.toHaveBeenCalled();
  });
});
