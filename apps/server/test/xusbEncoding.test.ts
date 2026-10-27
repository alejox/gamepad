import { describe, expect, it } from "vitest";
import {
  NEUTRAL_XUSB_REPORT,
  XUSB_BUTTON,
  XUSB_REPORT_SIZE,
  encodeXusbReport,
  padToXusb,
  stickToXusb,
  triggerToXusb,
  xusbReportsEqual,
  type XusbReport,
} from "../src/adapters/windows/xusbEncoding.js";
import { NEUTRAL_PAD, type PadButton, type PadState } from "../src/domain/PadState.js";

const press = (...buttons: PadButton[]): PadState => ({ ...NEUTRAL_PAD, buttons: new Set(buttons) });

describe("XUSB_BUTTON", () => {
  it("matches ViGEmClient Common.h / XINPUT_GAMEPAD wButtons", () => {
    expect(XUSB_BUTTON).toEqual({
      DPAD_UP: 0x0001,
      DPAD_DOWN: 0x0002,
      DPAD_LEFT: 0x0004,
      DPAD_RIGHT: 0x0008,
      START: 0x0010,
      BACK: 0x0020,
      LEFT_THUMB: 0x0040,
      RIGHT_THUMB: 0x0080,
      LEFT_SHOULDER: 0x0100,
      RIGHT_SHOULDER: 0x0200,
      GUIDE: 0x0400,
      A: 0x1000,
      B: 0x2000,
      X: 0x4000,
      Y: 0x8000,
    });
  });
});

describe("padToXusb", () => {
  it("is all zero for the neutral pad", () => {
    expect(padToXusb(NEUTRAL_PAD)).toEqual(NEUTRAL_XUSB_REPORT);
    expect(NEUTRAL_XUSB_REPORT).toEqual({
      wButtons: 0, bLeftTrigger: 0, bRightTrigger: 0, sThumbLX: 0, sThumbLY: 0, sThumbRX: 0, sThumbRY: 0,
    });
  });

  it.each<[PadButton, number]>([
    ["dpad_up", 0x0001],
    ["dpad_down", 0x0002],
    ["dpad_left", 0x0004],
    ["dpad_right", 0x0008],
    ["start", 0x0010],
    ["back", 0x0020],
    ["left_thumb", 0x0040],
    ["right_thumb", 0x0080],
    ["left_shoulder", 0x0100],
    ["right_shoulder", 0x0200],
    ["a", 0x1000],
    ["b", 0x2000],
    ["x", 0x4000],
    ["y", 0x8000],
  ])("maps %s to bit 0x%s", (button, bit) => {
    expect(padToXusb(press(button)).wButtons).toBe(bit);
  });

  it("ORs every pressed button and never sets GUIDE", () => {
    const all: PadButton[] = [
      "dpad_up", "dpad_down", "dpad_left", "dpad_right", "start", "back", "left_thumb", "right_thumb",
      "left_shoulder", "right_shoulder", "a", "b", "x", "y",
    ];
    // 0x0800 is unused in XUSB_BUTTON.
    expect(padToXusb(press(...all)).wButtons).toBe(0xffff & ~XUSB_BUTTON.GUIDE & ~0x0800);
  });

  it("keeps sticks y-up (XInput convention), without inversion", () => {
    const report = padToXusb({ ...NEUTRAL_PAD, leftStick: { x: 1, y: 1 }, rightStick: { x: -1, y: -1 } });
    expect(report).toMatchObject({ sThumbLX: 32767, sThumbLY: 32767, sThumbRX: -32768, sThumbRY: -32768 });
  });

  it("maps triggers to 0..255", () => {
    expect(padToXusb({ ...NEUTRAL_PAD, leftTrigger: 1, rightTrigger: 0.5 })).toMatchObject({
      bLeftTrigger: 255,
      bRightTrigger: 128,
    });
  });
});

describe("stickToXusb / triggerToXusb", () => {
  it("scales asymmetrically to the full SHORT range", () => {
    expect(stickToXusb(1)).toBe(32767);
    expect(stickToXusb(-1)).toBe(-32768);
    expect(stickToXusb(0.5)).toBe(16384);
    expect(stickToXusb(-0.5)).toBe(-16384);
    expect(Object.is(stickToXusb(-0), 0)).toBe(true);
  });

  it("clamps out-of-range and non-finite input", () => {
    expect(stickToXusb(2)).toBe(32767);
    expect(stickToXusb(-2)).toBe(-32768);
    expect(stickToXusb(Number.NaN)).toBe(0);
    expect(triggerToXusb(2)).toBe(255);
    expect(triggerToXusb(-1)).toBe(0);
    expect(triggerToXusb(Number.NaN)).toBe(0);
  });
});

describe("encodeXusbReport", () => {
  it("writes the 12-byte little-endian XUSB_REPORT layout", () => {
    const report: XusbReport = {
      wButtons: 0x9001,
      bLeftTrigger: 0xab,
      bRightTrigger: 0xcd,
      sThumbLX: -32768,
      sThumbLY: 32767,
      sThumbRX: -2,
      sThumbRY: 0x1234,
    };
    const buf = encodeXusbReport(report);
    expect(XUSB_REPORT_SIZE).toBe(12);
    expect(buf.length).toBe(12);
    expect(buf.readUInt16LE(0)).toBe(0x9001);
    expect(buf.readUInt8(2)).toBe(0xab);
    expect(buf.readUInt8(3)).toBe(0xcd);
    expect(buf.readInt16LE(4)).toBe(-32768);
    expect(buf.readInt16LE(6)).toBe(32767);
    expect(buf.readInt16LE(8)).toBe(-2);
    expect(buf.readInt16LE(10)).toBe(0x1234);
    expect([...buf]).toEqual([0x01, 0x90, 0xab, 0xcd, 0x00, 0x80, 0xff, 0x7f, 0xfe, 0xff, 0x34, 0x12]);
  });
});

describe("xusbReportsEqual", () => {
  it("compares every field", () => {
    const base = padToXusb(press("a"));
    expect(xusbReportsEqual(base, { ...base })).toBe(true);
    for (const key of Object.keys(base) as Array<keyof XusbReport>) {
      expect(xusbReportsEqual(base, { ...base, [key]: base[key] + 1 })).toBe(false);
    }
  });
});
