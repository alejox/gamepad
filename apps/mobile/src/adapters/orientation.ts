import { Capacitor } from "@capacitor/core";

/** Locks the app to landscape on native platforms; no-op on the web. */
export async function lockLandscape(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "landscape" });
  } catch {
    // The manifest already requests sensorLandscape; ignore plugin failures.
  }
}
