import { DEFAULT_MAPPING, type KeyMapping, parseMapping } from "@gamepad/shared";

export interface Settings {
  mapping: KeyMapping;
}

export interface ServerAddress {
  host: string;
  port: number;
}

export const DEFAULT_PORT = 7531;

export function cloneMapping(mapping: KeyMapping): KeyMapping {
  return { buttons: { ...mapping.buttons }, leftStick: { ...mapping.leftStick } };
}

export function defaultSettings(): Settings {
  return { mapping: cloneMapping(DEFAULT_MAPPING) };
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
  return settings;
}

export function parseStoredServer(raw: string | null): ServerAddress {
  const stored = parseJson(raw);
  const host = typeof stored?.host === "string" ? stored.host : "";
  const port = Number.isInteger(stored?.port) ? (stored?.port as number) : DEFAULT_PORT;
  return { host, port: port >= 1 && port <= 65535 ? port : DEFAULT_PORT };
}
