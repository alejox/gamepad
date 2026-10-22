import { DEFAULT_MAPPING, type KeyMapping, MOUSE_SENSITIVITY_RANGE, parseMapping } from "@gamepad/shared";

export const SKINS = [
  { id: "neon", name: "Neon", description: "Carbon body, glossy black buttons, blue glow" },
  { id: "retro8", name: "Retro 8-bit", description: "Light grey body, black d-pad, red round buttons" },
  { id: "retro16", name: "Retro 16-bit", description: "Rounded grey body, four colored face buttons" },
  { id: "green", name: "Green", description: "Dark green body, translucent buttons, colored letters" },
  { id: "geo", name: "Geometric", description: "Matte black with geometric face glyphs" },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];

export interface Settings {
  skin: SkinId;
  haptics: boolean;
  /** Client-side stick deadzone; smaller vectors are sent as zero. */
  stickDeadzone: number;
  /** Cursor speed in px/s at full right-stick deflection (sent to the server). */
  mouseSensitivity: number;
  mapping: KeyMapping;
}

export interface ServerAddress {
  host: string;
  port: number;
}

export const DEFAULT_PORT = 7531;
export const DEADZONE_RANGE = { min: 0, max: 0.5 } as const;

export function cloneMapping(mapping: KeyMapping): KeyMapping {
  return { buttons: { ...mapping.buttons }, leftStick: { ...mapping.leftStick } };
}

export function defaultSettings(): Settings {
  return {
    skin: "neon",
    haptics: true,
    stickDeadzone: 0.08,
    mouseSensitivity: 1200,
    mapping: cloneMapping(DEFAULT_MAPPING),
  };
}

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const inRange = (value: unknown, range: { min: number; max: number }): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max;

/** Restores persisted settings; each invalid or missing field falls back to its default. */
export function parseStoredSettings(raw: string | null): Settings {
  const stored = parseJson(raw);
  const settings = defaultSettings();
  if (!stored) return settings;
  if (isSkinId(stored.skin)) settings.skin = stored.skin;
  if (typeof stored.haptics === "boolean") settings.haptics = stored.haptics;
  if (inRange(stored.stickDeadzone, DEADZONE_RANGE)) settings.stickDeadzone = stored.stickDeadzone;
  if (inRange(stored.mouseSensitivity, MOUSE_SENSITIVITY_RANGE)) settings.mouseSensitivity = stored.mouseSensitivity;
  const mapping = parseMapping(stored.mapping);
  if (mapping) settings.mapping = mapping;
  return settings;
}

export function parseStoredServer(raw: string | null): ServerAddress {
  const stored = parseJson(raw);
  const host = typeof stored?.host === "string" ? stored.host : "";
  const port = stored?.port;
  return {
    host,
    port: Number.isInteger(port) && (port as number) >= 1 && (port as number) <= 65535 ? (port as number) : DEFAULT_PORT,
  };
}
