import { randomInt } from "node:crypto";

export const DEFAULT_PORT = 7531;
/** Cursor speed in pixels per second at full right-stick deflection. */
export const DEFAULT_SENSITIVITY = 1200;

export interface ServerConfig {
  port: number;
  pin: string;
  dryRun: boolean;
  sensitivity: number;
}

const KNOWN_FLAGS = new Set(["--dry-run"]);

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`GAMEPAD_PORT must be an integer between 1 and 65535, got "${value}"`);
  }
  return port;
}

function parsePin(value: string | undefined): string {
  if (value === undefined) return String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (!/^\d{6}$/.test(value)) throw new Error("GAMEPAD_PIN must be exactly 6 digits");
  return value;
}

function parseSensitivity(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SENSITIVITY;
  const sensitivity = Number(value);
  if (!Number.isFinite(sensitivity) || sensitivity <= 0) {
    throw new Error(`GAMEPAD_SENSITIVITY must be a positive number, got "${value}"`);
  }
  return sensitivity;
}

export function parseConfig(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ServerConfig {
  const unknown = argv.filter((arg) => !KNOWN_FLAGS.has(arg));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);

  return {
    port: parsePort(env.GAMEPAD_PORT),
    pin: parsePin(env.GAMEPAD_PIN),
    dryRun: argv.includes("--dry-run"),
    sensitivity: parseSensitivity(env.GAMEPAD_SENSITIVITY),
  };
}
