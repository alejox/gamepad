import { type ButtonId, type StickId, isButtonId, isStickId } from "./buttons.js";
import { clamp, isFiniteNumber, isRecord, type UnknownRecord } from "./guards.js";
import { type KeyMapping, parseMapping } from "./mapping.js";

export const PROTOCOL_VERSION = 1;

const PIN_PATTERN = /^\d{6}$/;

export interface HelloMessage {
  t: "hello";
  v: number;
  pin: string;
  mapping?: KeyMapping;
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
}

export interface PingMessage {
  t: "ping";
  ts: number;
}

export type ClientMessage = HelloMessage | ButtonMessage | StickMessage | MappingMessage | PingMessage;

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

function parseHello(msg: UnknownRecord): HelloMessage | null {
  if (!Number.isInteger(msg.v) || typeof msg.pin !== "string" || !PIN_PATTERN.test(msg.pin)) {
    return null;
  }
  const hello: HelloMessage = { t: "hello", v: msg.v as number, pin: msg.pin };
  if (msg.mapping !== undefined) {
    const mapping = parseMapping(msg.mapping);
    if (!mapping) return null;
    hello.mapping = mapping;
  }
  return hello;
}

/** Parses and validates an untrusted client frame. Returns null when invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  const msg = parseJsonRecord(raw);
  if (!msg) return null;

  switch (msg.t) {
    case "hello":
      return parseHello(msg);
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
      return mapping ? { t: "mapping", mapping } : null;
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
      return { t: "welcome" };
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
