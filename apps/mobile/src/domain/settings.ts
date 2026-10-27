import { DEFAULT_MAPPING, type KeyMapping, MOUSE_SENSITIVITY_RANGE, parseMapping } from "@gamepad/shared";
import { type CustomLayout, defaultLayout, parseLayout } from "./customLayout.js";

export const SKINS = [
  { id: "pro", name: "Pro", description: "Matte dotted black body, blue neon edge, colored face letters" },
  { id: "neon", name: "Neon", description: "Carbon body, glossy black buttons, blue glow" },
  { id: "retro8", name: "Retro 8-bit", description: "Light grey body, black d-pad, red round buttons" },
  { id: "retro16", name: "Retro 16-bit", description: "Rounded grey body, four colored face buttons" },
  { id: "green", name: "Green", description: "Dark green body, translucent buttons, colored letters" },
  { id: "geo", name: "Geometric", description: "Matte black with geometric face glyphs" },
  { id: "shapes", name: "Shapes", description: "White two-tone body, touch panel, colored shape buttons" },
  { id: "midnight", name: "Midnight", description: "Matte midnight black, blue-lit touch panel, grey shape buttons" },
] as const;

/** The user's own controller photo; it lives only on the device and is not in SKINS. */
export const CUSTOM_SKIN = "custom";
export const DEFAULT_SKIN = "pro";

export type SkinId = (typeof SKINS)[number]["id"] | typeof CUSTOM_SKIN;

/** Metadata for the on-device photo (the image itself is stored separately). */
export interface CustomPhoto {
  /** Key of the image blob in on-device storage. */
  imageKey: string;
  /** Stored (downscaled) image size in px. */
  width: number;
  height: number;
  layout: CustomLayout;
}

/** Skins whose face buttons show shape glyphs instead of letters. */
const GLYPH_SKINS: ReadonlySet<SkinId> = new Set<SkinId>(["geo", "shapes", "midnight"]);

export function usesFaceGlyphs(skin: SkinId): boolean {
  return GLYPH_SKINS.has(skin);
}

export interface Settings {
  skin: SkinId;
  haptics: boolean;
  /** Client-side stick deadzone; smaller vectors are sent as zero. */
  stickDeadzone: number;
  /** Cursor speed in px/s at full right-stick deflection (sent to the server). */
  mouseSensitivity: number;
  mapping: KeyMapping;
  customPhoto: CustomPhoto | null;
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
    skin: DEFAULT_SKIN,
    haptics: true,
    stickDeadzone: 0.08,
    mouseSensitivity: 1200,
    mapping: cloneMapping(DEFAULT_MAPPING),
    customPhoto: null,
  };
}

export function isSkinId(value: unknown): value is SkinId {
  return value === CUSTOM_SKIN || SKINS.some((skin) => skin.id === value);
}

const IMAGE_KEY = /^[\w-]{1,64}$/;
const MAX_IMAGE_EDGE = 10_000;

const isImageEdge = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_IMAGE_EDGE;

export function parseCustomPhoto(value: unknown): CustomPhoto | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Record<string, unknown>;
  if (typeof stored.imageKey !== "string" || !IMAGE_KEY.test(stored.imageKey)) return null;
  if (!isImageEdge(stored.width) || !isImageEdge(stored.height)) return null;
  const aspect = stored.width / stored.height;
  return {
    imageKey: stored.imageKey,
    width: stored.width,
    height: stored.height,
    layout: parseLayout(stored.layout, aspect) ?? defaultLayout(aspect),
  };
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
  settings.customPhoto = parseCustomPhoto(stored.customPhoto);
  // The custom skin needs a photo; without one it would render nothing.
  if (settings.skin === CUSTOM_SKIN && !settings.customPhoto) settings.skin = DEFAULT_SKIN;
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
