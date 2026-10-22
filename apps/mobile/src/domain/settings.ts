import { DEFAULT_MAPPING, type KeyMapping, parseMapping } from "@gamepad/shared";

export interface Settings {
  mapping: KeyMapping;
  haptics: boolean;
  /** Client-side stick deadzone; smaller vectors are sent as zero. */
  stickDeadzone: number;
}

export const DEADZONE_RANGE = { min: 0, max: 0.5 } as const;

export interface ServerAddress {
  host: string;
  port: number;
}

export const DEFAULT_PORT = 7531;

export function cloneMapping(mapping: KeyMapping): KeyMapping {
  return { buttons: { ...mapping.buttons }, leftStick: { ...mapping.leftStick } };
}

export function defaultSettings(): Settings {
  return { mapping: cloneMapping(DEFAULT_MAPPING), haptics: true, stickDeadzone: 0.08 };
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

/** Restores persisted settings; invalid or missing fields fall back to defaults. */
export function parseStoredSettings(raw: string | null): Settings {
  const stored = parseJson(raw);
  const settings = defaultSettings();
  if (!stored) return settings;
  const mapping = parseMapping(stored.mapping);
  if (mapping) settings.mapping = mapping;
  if (typeof stored.haptics === "boolean") settings.haptics = stored.haptics;
  const deadzone = stored.stickDeadzone;
  if (typeof deadzone === "number" && deadzone >= DEADZONE_RANGE.min && deadzone <= DEADZONE_RANGE.max) {
    settings.stickDeadzone = deadzone;
  }
  return settings;
}

export function parseStoredServer(raw: string | null): ServerAddress {
  const stored = parseJson(raw);
  const host = typeof stored?.host === "string" ? stored.host : "";
  const port = Number.isInteger(stored?.port) ? (stored?.port as number) : DEFAULT_PORT;
  return { host, port: port >= 1 && port <= 65535 ? port : DEFAULT_PORT };
}
