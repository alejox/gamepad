import { type SpawnOptions, spawn } from "node:child_process";

export interface BrowserOpenPolicy {
  packaged: boolean;
  open: boolean;
  platform: NodeJS.Platform;
}

export function shouldOpenBrowser({ packaged, open, platform }: BrowserOpenPolicy): boolean {
  return packaged && open && platform === "win32";
}

interface SpawnedBrowser {
  unref(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
}

type BrowserSpawn = (command: string, args: string[], options: SpawnOptions) => SpawnedBrowser;

export function createBrowserOpener(spawnProcess: BrowserSpawn = spawn): (url: string) => void {
  return (url) => {
    if (url.includes('"')) throw new Error(`Refusing to open an unsafe URL: ${url}`);
    const child = spawnProcess("cmd.exe", ["/d", "/s", "/c", `"start "" "${url}""`], {
      windowsVerbatimArguments: true,
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (error) => console.warn(`Could not open the host page: ${error.message}`));
    child.unref();
  };
}
