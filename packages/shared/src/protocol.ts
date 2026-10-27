import { type ButtonId, type StickId, isButtonId, isStickId } from "./buttons.js";
import { clamp, isFiniteNumber, isRecord, type UnknownRecord } from "./guards.js";
import { type KeyMapping, parseMapping } from "./mapping.js";

export const PROTOCOL_VERSION = 1;

const PIN_PATTERN = /^\d{6}$/;

/** Service id answered by the host's public `GET /discover` endpoint. */
export const DISCOVERY_SERVICE = "alejox-gamepad";

/** Maximum length of the device name sent with an approval request. */
export const DEVICE_NAME_MAX_LENGTH = 40;

// C0/C1 control characters (includes newlines and tabs).
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Public `GET /discover` response. Never carries the PIN. */
export interface DiscoveryInfo {
  service: typeof DISCOVERY_SERVICE;
  protocol: number;
  /** Host computer name, for display on the phone. */
  name: string;
  port: number;
}

/** Allowed cursor speed (pixels per second at full right-stick deflection). */
export const MOUSE_SENSITIVITY_RANGE = { min: 100, max: 5000 } as const;

export interface HelloMessage {
  t: "hello";
  v: number;
  pin: string;
  mapping?: KeyMapping;
  /** Optional per-session cursor speed; the server default applies when absent. */
  mouseSensitivity?: number;
}

/**
 * Asks the host user to approve this device instead of sending a PIN.
 * The server answers `pending`, then `welcome` (approved), `denied`, or an
 * error (`busy`, `timeout`, `version`).
 */
export interface RequestMessage {
  t: "request";
  v: number;
  /** Human-readable device name shown on the host; trimmed, 1..DEVICE_NAME_MAX_LENGTH chars. */
  device: string;
  mapping?: KeyMapping;
  mouseSensitivity?: number;
}

export interface ButtonMessage {
  t: "btn";
  id: ButtonId;
  down: boolean;
}

export interface StickMessage {
  t: "stick";
  id: StickId;
  /** Right is positive. Clamped to [-1, 1]. */
  x: number;
  /** Down is positive (screen coordinates). Clamped to [-1, 1]. */
  y: number;
}

export interface MappingMessage {
  t: "mapping";
  mapping: KeyMapping;
  /** Optional; when absent the session keeps its current sensitivity. */
  mouseSensitivity?: number;
}

export interface PingMessage {
  t: "ping";
  ts: number;
}

export type ClientMessage =
  | HelloMessage
  | RequestMessage
  | ButtonMessage | StickMessage | MappingMessage | PingMessage;

export const ERROR_CODES = [
  "bad_pin",
  "version",
  "busy",
  "timeout",
  "bad_message",
  "not_paired",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ServerMessage =
  | { t: "welcome" }
  /** Approval request received; waiting for the host user. */
  | { t: "pending" }
  /** The host user rejected the approval request; the socket closes next. */
  | { t: "denied" }
  | { t: "error"; code: ErrorCode }
  | { t: "pong"; ts: number };

function parseJsonRecord(raw: string): UnknownRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** undefined = field absent, null = present but invalid. */
function parseSensitivity(msg: UnknownRecord): number | undefined | null {
  if (msg.mouseSensitivity === undefined) return undefined;
  const value = msg.mouseSensitivity;
  return isFiniteNumber(value) && value >= MOUSE_SENSITIVITY_RANGE.min && value <= MOUSE_SENSITIVITY_RANGE.max
    ? value
    : null;
}

/** Copies the optional session settings shared by hello and request. False when invalid. */
function parseSessionSettings(
  msg: UnknownRecord,
  target: { mapping?: KeyMapping; mouseSensitivity?: number },
): boolean {
  if (msg.mapping !== undefined) {
    const mapping = parseMapping(msg.mapping);
    if (!mapping) return false;
    target.mapping = mapping;
  }
  const sensitivity = parseSensitivity(msg);
  if (sensitivity === null) return false;
  if (sensitivity !== undefined) target.mouseSensitivity = sensitivity;
  return true;
}

function parseHello(msg: UnknownRecord): HelloMessage | null {
  if (!Number.isInteger(msg.v) || typeof msg.pin !== "string" || !PIN_PATTERN.test(msg.pin)) {
    return null;
  }
  const hello: HelloMessage = { t: "hello", v: msg.v as number, pin: msg.pin };
  return parseSessionSettings(msg, hello) ? hello : null;
}

function parseDeviceName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const device = value.trim();
  if (device.length === 0 || device.length > DEVICE_NAME_MAX_LENGTH || CONTROL_CHARS.test(device)) return null;
  return device;
}

function parseRequest(msg: UnknownRecord): RequestMessage | null {
  const device = parseDeviceName(msg.device);
  if (!Number.isInteger(msg.v) || device === null) return null;
  const request: RequestMessage = { t: "request", v: msg.v as number, device };
  return parseSessionSettings(msg, request) ? request : null;
}

/** Parses and validates an untrusted client frame. Returns null when invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  const msg = parseJsonRecord(raw);
  if (!msg) return null;

  switch (msg.t) {
    case "hello":
      return parseHello(msg);
    case "request":
      return parseRequest(msg);
    case "btn":
      return isButtonId(msg.id) && typeof msg.down === "boolean"
        ? { t: "btn", id: msg.id, down: msg.down }
        : null;
    case "stick":
      return isStickId(msg.id) && isFiniteNumber(msg.x) && isFiniteNumber(msg.y)
        ? { t: "stick", id: msg.id, x: clamp(msg.x, -1, 1), y: clamp(msg.y, -1, 1) }
        : null;
    case "mapping": {
      const mapping = parseMapping(msg.mapping);
      const sensitivity = parseSensitivity(msg);
      if (!mapping || sensitivity === null) return null;
      return sensitivity === undefined ? { t: "mapping", mapping } : { t: "mapping", mapping, mouseSensitivity: sensitivity };
    }
    case "ping":
      return isFiniteNumber(msg.ts) ? { t: "ping", ts: msg.ts } : null;
    default:
      return null;
  }
}

/** Parses and validates a server frame (used by clients). */
export function parseServerMessage(raw: string): ServerMessage | null {
  const msg = parseJsonRecord(raw);
  if (!msg) return null;

  switch (msg.t) {
    case "welcome":
    case "pending":
    case "denied":
      return { t: msg.t };
    case "pong":
      return isFiniteNumber(msg.ts) ? { t: "pong", ts: msg.ts } : null;
    case "error":
      return (ERROR_CODES as readonly unknown[]).includes(msg.code)
        ? { t: "error", code: msg.code as ErrorCode }
        : null;
    default:
      return null;
  }
}

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
