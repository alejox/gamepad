import { describe, expect, it } from "vitest";
import {
  BUTTON_IDS,
  DEFAULT_MAPPING,
  DEVICE_NAME_MAX_LENGTH,
  DISCOVERY_SERVICE,
  MOUSE_SENSITIVITY_RANGE,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
} from "../src/index.js";

const json = (value: unknown): string => JSON.stringify(value);

describe("parseClientMessage", () => {
  it("accepts a hello with pin and mapping", () => {
    const msg = parseClientMessage(
      json({ t: "hello", v: PROTOCOL_VERSION, pin: "123456", mapping: DEFAULT_MAPPING }),
    );
    expect(msg).toEqual({ t: "hello", v: 1, pin: "123456", mapping: DEFAULT_MAPPING });
  });

  it("accepts a hello without mapping", () => {
    expect(parseClientMessage(json({ t: "hello", v: 1, pin: "000000" }))).toEqual({
      t: "hello",
      v: 1,
      pin: "000000",
    });
  });

  it("keeps an unknown protocol version so the server can report it", () => {
    expect(parseClientMessage(json({ t: "hello", v: 99, pin: "123456" }))).toMatchObject({ v: 99 });
  });

  it.each([
    ["non-numeric pin", { t: "hello", v: 1, pin: "12a456" }],
    ["short pin", { t: "hello", v: 1, pin: "123" }],
    ["numeric pin", { t: "hello", v: 1, pin: 123456 }],
    ["fractional version", { t: "hello", v: 1.5, pin: "123456" }],
    ["invalid mapping", { t: "hello", v: 1, pin: "123456", mapping: { buttons: { a: "rm -rf" } } }],
  ])("rejects hello with %s", (_name, payload) => {
    expect(parseClientMessage(json(payload))).toBeNull();
  });

  it("accepts every button id", () => {
    for (const id of BUTTON_IDS) {
      expect(parseClientMessage(json({ t: "btn", id, down: true }))).toEqual({ t: "btn", id, down: true });
    }
  });

  it.each([
    ["unknown button", { t: "btn", id: "turbo", down: true }],
    ["non-boolean down", { t: "btn", id: "a", down: 1 }],
  ])("rejects btn with %s", (_name, payload) => {
    expect(parseClientMessage(json(payload))).toBeNull();
  });

  it("clamps stick values to [-1, 1]", () => {
    expect(parseClientMessage(json({ t: "stick", id: "R", x: 3, y: -7.5 }))).toEqual({
      t: "stick",
      id: "R",
      x: 1,
      y: -1,
    });
  });

  it.each([
    ["unknown stick", { t: "stick", id: "C", x: 0, y: 0 }],
    ["string axis", { t: "stick", id: "L", x: "0.5", y: 0 }],
    ["missing axis", { t: "stick", id: "L", x: 0.5 }],
    ["null axis", { t: "stick", id: "L", x: null, y: 0 }],
  ])("rejects stick with %s", (_name, payload) => {
    expect(parseClientMessage(json(payload))).toBeNull();
  });

  it("accepts mapping and ping messages", () => {
    expect(parseClientMessage(json({ t: "mapping", mapping: DEFAULT_MAPPING }))).toEqual({
      t: "mapping",
      mapping: DEFAULT_MAPPING,
    });
    expect(parseClientMessage(json({ t: "ping", ts: 42 }))).toEqual({ t: "ping", ts: 42 });
  });

  it.each([
    ["malformed json", "{not json"],
    ["json array", "[]"],
    ["json null", "null"],
    ["unknown type", json({ t: "reboot" })],
    ["missing type", json({ id: "a" })],
    ["ping without ts", json({ t: "ping" })],
  ])("rejects %s", (_name, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("accepts welcome, pong and known errors", () => {
    expect(parseServerMessage(json({ t: "welcome" }))).toEqual({ t: "welcome" });
    expect(parseServerMessage(json({ t: "pong", ts: 5 }))).toEqual({ t: "pong", ts: 5 });
    expect(parseServerMessage(json({ t: "error", code: "busy" }))).toEqual({ t: "error", code: "busy" });
  });

  it("rejects unknown error codes and types", () => {
    expect(parseServerMessage(json({ t: "error", code: "nope" }))).toBeNull();
    expect(parseServerMessage(json({ t: "hello" }))).toBeNull();
  });
});

describe("mouseSensitivity (optional)", () => {
  it("is accepted on hello and mapping within range", () => {
    expect(parseClientMessage(json({ t: "hello", v: 1, pin: "123456", mouseSensitivity: 1500 }))).toEqual({
      t: "hello",
      v: 1,
      pin: "123456",
      mouseSensitivity: 1500,
    });
    expect(parseClientMessage(json({ t: "mapping", mapping: DEFAULT_MAPPING, mouseSensitivity: 100 }))).toEqual({
      t: "mapping",
      mapping: DEFAULT_MAPPING,
      mouseSensitivity: 100,
    });
    expect(MOUSE_SENSITIVITY_RANGE).toEqual({ min: 100, max: 5000 });
  });

  it.each([
    ["too low", 99],
    ["too high", 5001],
    ["a string", "1200"],
    ["NaN-like null", null],
  ])("rejects a value that is %s", (_name, value) => {
    expect(parseClientMessage(json({ t: "hello", v: 1, pin: "123456", mouseSensitivity: value }))).toBeNull();
    expect(parseClientMessage(json({ t: "mapping", mapping: DEFAULT_MAPPING, mouseSensitivity: value }))).toBeNull();
  });
});

describe("approval pairing (request without PIN)", () => {
  it("accepts a request with a device name, trimming whitespace", () => {
    expect(parseClientMessage(json({ t: "request", v: PROTOCOL_VERSION, device: "  Pixel 8  " }))).toEqual({
      t: "request",
      v: 1,
      device: "Pixel 8",
    });
  });

  it("accepts optional mapping and mouseSensitivity like hello", () => {
    expect(
      parseClientMessage(json({ t: "request", v: 1, device: "Phone", mapping: DEFAULT_MAPPING, mouseSensitivity: 900 })),
    ).toEqual({ t: "request", v: 1, device: "Phone", mapping: DEFAULT_MAPPING, mouseSensitivity: 900 });
  });

  it("keeps an unknown protocol version so the server can report it", () => {
    expect(parseClientMessage(json({ t: "request", v: 7, device: "Phone" }))).toMatchObject({ v: 7 });
  });

  it.each([
    ["missing device", { t: "request", v: 1 }],
    ["empty device", { t: "request", v: 1, device: "   " }],
    ["numeric device", { t: "request", v: 1, device: 42 }],
    ["too long device", { t: "request", v: 1, device: "x".repeat(DEVICE_NAME_MAX_LENGTH + 1) }],
    ["control characters", { t: "request", v: 1, device: "Phone\nInjected" }],
    ["fractional version", { t: "request", v: 1.5, device: "Phone" }],
    ["invalid mapping", { t: "request", v: 1, device: "Phone", mapping: { buttons: { a: "rm -rf" } } }],
    ["out-of-range sensitivity", { t: "request", v: 1, device: "Phone", mouseSensitivity: 1 }],
  ])("rejects request with %s", (_name, payload) => {
    expect(parseClientMessage(json(payload))).toBeNull();
  });

  it("accepts a device name at the maximum length", () => {
    const device = "x".repeat(DEVICE_NAME_MAX_LENGTH);
    expect(parseClientMessage(json({ t: "request", v: 1, device }))).toMatchObject({ device });
  });

  it("parses the server approval outcomes", () => {
    expect(parseServerMessage(json({ t: "pending" }))).toEqual({ t: "pending" });
    expect(parseServerMessage(json({ t: "denied" }))).toEqual({ t: "denied" });
    expect(parseServerMessage(json({ t: "error", code: "timeout" }))).toEqual({ t: "error", code: "timeout" });
  });

  it("names the discovery service", () => {
    expect(DISCOVERY_SERVICE).toBe("alejox-gamepad");
  });
});
