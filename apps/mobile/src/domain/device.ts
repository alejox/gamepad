import { DEVICE_NAME_MAX_LENGTH } from "@gamepad/shared";

const FALLBACK = "Phone";
// C0/C1 control characters.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
// "Android 14; Pixel 7 Build/..." or "Android 14; SM-S918B)" or "...; wv)".
const ANDROID_MODEL = /Android [\d.]+;\s*([^;)]+?)\s*(?:Build\/|;|\))/;

function clamp(name: string): string {
  const clean = name.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  return clean.slice(0, DEVICE_NAME_MAX_LENGTH).trim() || FALLBACK;
}

/** Short friendly device name shown on the PC when asking for approval. */
export function deviceName(userAgent: string): string {
  if (/iPad/.test(userAgent)) return "iPad";
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (!/Android/.test(userAgent)) return FALLBACK;
  const model = ANDROID_MODEL.exec(userAgent)?.[1]?.trim() ?? "";
  // Chrome's reduced user agent replaces the model with "K".
  if (model.length <= 1 || model === "wv") return "Android phone";
  return clamp(model);
}
