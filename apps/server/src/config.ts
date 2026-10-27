import { randomInt } from "node:crypto";
import { DRIVER_REQUESTS, type DriverRequest } from "./application/selectDriver.js";

export const DEFAULT_PORT = 7531;
/** Cursor speed in pixels per second at full right-stick deflection. */
export const DEFAULT_SENSITIVITY = 1200;

export interface ServerConfig {
  port: number;
  pin: string;
  dryRun: boolean;
  sensitivity: number;
  driver: DriverRequest;
  open: boolean;
}

const KNOWN_FLAGS = new Set(["--dry-run", "--no-open"]);
const DRIVER_FLAG = "--driver=";

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

function parseDriver(value: string | undefined): DriverRequest {
  if (value === undefined) return "auto";
  if ((DRIVER_REQUESTS as readonly string[]).includes(value)) return value as DriverRequest;
  throw new Error(`Driver must be auto, gamepad or keyboard, got "${value}"`);
}

export function parseConfig(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ServerConfig {
  const unknown = argv.filter((arg) => !KNOWN_FLAGS.has(arg) && !arg.startsWith(DRIVER_FLAG));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);

  return {
    port: parsePort(env.GAMEPAD_PORT),
    pin: parsePin(env.GAMEPAD_PIN),
    dryRun: argv.includes("--dry-run"),
    open: !argv.includes("--no-open"),
    sensitivity: parseSensitivity(env.GAMEPAD_SENSITIVITY),
    // The flag wins over the environment; the last flag wins over earlier ones.
    driver: parseDriver(
      argv.findLast((arg) => arg.startsWith(DRIVER_FLAG))?.slice(DRIVER_FLAG.length) ?? env.GAMEPAD_DRIVER,
    ),
  };
}
