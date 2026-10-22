import { describe, expect, it } from "vitest";
import {
  BUTTON_IDS,
  DEFAULT_MAPPING,
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
