import { type SpawnOptions, spawn } from "node:child_process";

export interface BrowserOpenPolicy {
  packaged: boolean;
  open: boolean;
  platform: NodeJS.Platform;
}

export function shouldOpenBrowser({ packaged, open, platform }: BrowserOpenPolicy): boolean {
  // The packaged macOS host shows a native menu bar status item instead; the
  // browser opens only for the packaged Windows host.
  return packaged && open && platform === "win32";
}

interface SpawnedBrowser {
  unref(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
}

type BrowserSpawn = (command: string, args: string[], options: SpawnOptions) => SpawnedBrowser;

export function createBrowserOpener(
  spawnProcess: BrowserSpawn = spawn,
  platform: NodeJS.Platform = process.platform,
): (url: string) => void {
  return (url) => {
    if (url.includes('"') && platform !== "darwin") throw new Error(`Refusing to open an unsafe URL: ${url}`);
    const child = platform === "darwin"
      ? spawnProcess("/usr/bin/open", [url], { detached: true, stdio: "ignore" })
      : spawnProcess("cmd.exe", ["/d", "/s", "/c", `"start "" "${url}""`], {
          windowsVerbatimArguments: true,
          detached: true,
          stdio: "ignore",
        });
    child.on("error", (error) => console.warn(`Could not open the host page: ${error.message}`));
    child.unref();
  };
}
