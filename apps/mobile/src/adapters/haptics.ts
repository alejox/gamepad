import { Capacitor } from "@capacitor/core";

/** Short, light tap feedback. Native haptics, or navigator.vibrate on the web. */
export function tapFeedback(): void {
  if (Capacitor.isNativePlatform()) {
    void import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
      .catch(() => {});
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
}
