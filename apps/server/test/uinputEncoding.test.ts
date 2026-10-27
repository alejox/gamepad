import { describe, expect, it } from "vitest";
import {
  ABS,
  BTN,
  EV,
  INPUT_EVENT_SIZE,
  SYN_REPORT,
  UINPUT_ABS_SETUP_SIZE,
  UINPUT_SETUP_SIZE,
  UI_ABS_SETUP,
  UI_DEV_CREATE,
  UI_DEV_DESTROY,
  UI_DEV_SETUP,
  UI_SET_ABSBIT,
  UI_SET_EVBIT,
  UI_SET_KEYBIT,
  X360_IDENTITY,
  _IO,
  _IOW,
  diffPadEvents,
  encodeAbsSetup,
  encodeInputEvent,
  encodeInputEvents,
  encodeUinputSetup,
  padToEvdev,
  stickToEvdev,
  triggerToEvdev,
} from "../src/adapters/linux/uinputEncoding.js";
import { NEUTRAL_PAD, type PadButton, type PadState } from "../src/domain/PadState.js";

const pad = (patch: Partial<PadState> & { pressed?: PadButton[] } = {}): PadState => {
  const { pressed = [], ...rest } = patch;
  return { ...NEUTRAL_PAD, buttons: new Set(pressed), ...rest };
};

describe("ioctl numbers (asm-generic layout, linux/uinput.h)", () => {
  it("builds _IO and _IOW", () => {
    expect(_IO(0x55, 1)).toBe(0x5501);
    expect(_IOW(0x55, 100, 4)).toBe(0x40045564);
  });

  it("matches the kernel header values", () => {
    expect(UI_DEV_CREATE).toBe(0x5501);
    expect(UI_DEV_DESTROY).toBe(0x5502);
    expect(UI_SET_EVBIT).toBe(0x40045564);
    expect(UI_SET_KEYBIT).toBe(0x40045565);
    expect(UI_SET_ABSBIT).toBe(0x40045567);
    expect(UI_DEV_SETUP).toBe(0x405c5503);
    expect(UI_ABS_SETUP).toBe(0x401c5504);
  });
});

describe("evdev codes", () => {
  it("uses the input-event-codes.h values", () => {
    expect(EV).toEqual({ SYN: 0, KEY: 1, ABS: 3 });
    expect(SYN_REPORT).toBe(0);
    expect(BTN).toMatchObject({ SOUTH: 0x130, EAST: 0x131, NORTH: 0x133, WEST: 0x134, TL: 0x136, TR: 0x137 });
    expect(BTN).toMatchObject({ SELECT: 0x13a, START: 0x13b, MODE: 0x13c, THUMBL: 0x13d, THUMBR: 0x13e });
    expect(ABS).toEqual({ X: 0, Y: 1, Z: 2, RX: 3, RY: 4, RZ: 5, HAT0X: 0x10, HAT0Y: 0x11 });
  });
});

describe("struct uinput_setup", () => {
  const buf = encodeUinputSetup(X360_IDENTITY);

  it("is 92 bytes", () => {
    expect(UINPUT_SETUP_SIZE).toBe(92);
    expect(buf.length).toBe(92);
  });

  it("encodes input_id as four little-endian u16", () => {
    expect(buf.readUInt16LE(0)).toBe(0x03);
    expect(buf.readUInt16LE(2)).toBe(0x045e);
    expect(buf.readUInt16LE(4)).toBe(0x028e);
    expect(buf.readUInt16LE(6)).toBe(0x0110);
  });

  it("encodes a NUL-terminated name at offset 8 and ff_effects_max at 88", () => {
    const name = "Microsoft X-Box 360 pad";
    expect(buf.subarray(8, 8 + name.length).toString("latin1")).toBe(name);
    expect(buf[8 + name.length]).toBe(0);
    expect(buf.readUInt32LE(88)).toBe(0);
  });

  it("truncates long names to 79 bytes plus NUL", () => {
    const long = encodeUinputSetup({ ...X360_IDENTITY, name: "x".repeat(200) });
    expect(long.length).toBe(92);
    expect(long[8 + 78]).toBe(0x78);
    expect(long[8 + 79]).toBe(0);
  });
});

describe("struct uinput_abs_setup", () => {
  it("is 28 bytes with the code at 0 and input_absinfo at 4", () => {
    const buf = encodeAbsSetup(ABS.Y, { minimum: -32768, maximum: 32767, fuzz: 16, flat: 128 });
    expect(UINPUT_ABS_SETUP_SIZE).toBe(28);
    expect(buf.length).toBe(28);
    expect(buf.readUInt16LE(0)).toBe(ABS.Y);
    expect(buf.readUInt16LE(2)).toBe(0);
    expect(buf.readInt32LE(4)).toBe(0); // value
    expect(buf.readInt32LE(8)).toBe(-32768);
    expect(buf.readInt32LE(12)).toBe(32767);
    expect(buf.readInt32LE(16)).toBe(16);
    expect(buf.readInt32LE(20)).toBe(128);
    expect(buf.readInt32LE(24)).toBe(0); // resolution
  });
});

describe("struct input_event (64-bit)", () => {
  it("is 24 bytes: zero timeval, then type, code and signed value", () => {
    const buf = encodeInputEvent({ type: EV.ABS, code: ABS.HAT0X, value: -1 });
    expect(INPUT_EVENT_SIZE).toBe(24);
    expect(buf.length).toBe(24);
    expect(buf.subarray(0, 16).every((b) => b === 0)).toBe(true);
    expect(buf.readUInt16LE(16)).toBe(EV.ABS);
    expect(buf.readUInt16LE(18)).toBe(ABS.HAT0X);
    expect(buf.readInt32LE(20)).toBe(-1);
  });

  it("concatenates several events", () => {
    const buf = encodeInputEvents([
      { type: EV.KEY, code: BTN.SOUTH, value: 1 },
      { type: EV.SYN, code: SYN_REPORT, value: 0 },
    ]);
    expect(buf.length).toBe(48);
    expect(buf.readUInt16LE(24 + 16)).toBe(EV.SYN);
  });
});

describe("PadState → evdev values", () => {
  it("scales sticks to the full signed 16-bit range", () => {
    expect(stickToEvdev(0)).toBe(0);
    expect(stickToEvdev(1)).toBe(32767);
    expect(stickToEvdev(-1)).toBe(-32768);
    expect(stickToEvdev(0.5)).toBe(16384);
    expect(Object.is(stickToEvdev(-0), 0)).toBe(true);
  });

  it("scales triggers to 0..255", () => {
    expect(triggerToEvdev(0)).toBe(0);
    expect(triggerToEvdev(1)).toBe(255);
    expect(triggerToEvdev(0.5)).toBe(128);
  });

  it("inverts stick Y: PadState up is evdev negative", () => {
    const values = padToEvdev(pad({ leftStick: { x: 0.5, y: 1 }, rightStick: { x: -1, y: -1 } }));
    expect(values.abs.get(ABS.X)).toBe(16384);
    expect(values.abs.get(ABS.Y)).toBe(-32768);
    expect(values.abs.get(ABS.RX)).toBe(-32768);
    expect(values.abs.get(ABS.RY)).toBe(32767);
  });

  it("maps triggers to ABS_Z / ABS_RZ", () => {
    const values = padToEvdev(pad({ leftTrigger: 1, rightTrigger: 0 }));
    expect(values.abs.get(ABS.Z)).toBe(255);
    expect(values.abs.get(ABS.RZ)).toBe(0);
  });

  it("maps face, shoulder, menu and thumb buttons", () => {
    const values = padToEvdev(
      pad({ pressed: ["a", "b", "x", "y", "left_shoulder", "right_shoulder", "back", "start", "left_thumb", "right_thumb"] }),
    );
    for (const code of [BTN.SOUTH, BTN.EAST, BTN.WEST, BTN.NORTH, BTN.TL, BTN.TR, BTN.SELECT, BTN.START, BTN.THUMBL, BTN.THUMBR]) {
      expect(values.keys.get(code)).toBe(1);
    }
    expect(values.keys.get(BTN.MODE)).toBe(0);
  });

  it("maps the d-pad to the hat axes", () => {
    const upLeft = padToEvdev(pad({ pressed: ["dpad_left", "dpad_up"] }));
    expect(upLeft.abs.get(ABS.HAT0X)).toBe(-1);
    expect(upLeft.abs.get(ABS.HAT0Y)).toBe(-1);
    const downRight = padToEvdev(pad({ pressed: ["dpad_right", "dpad_down"] }));
    expect(downRight.abs.get(ABS.HAT0X)).toBe(1);
    expect(downRight.abs.get(ABS.HAT0Y)).toBe(1);
  });

  it("centers a hat axis when opposite directions are both pressed", () => {
    const values = padToEvdev(pad({ pressed: ["dpad_left", "dpad_right", "dpad_up", "dpad_down"] }));
    expect(values.abs.get(ABS.HAT0X)).toBe(0);
    expect(values.abs.get(ABS.HAT0Y)).toBe(0);
  });
});

describe("diffPadEvents", () => {
  it("returns nothing when nothing changed", () => {
    expect(diffPadEvents(NEUTRAL_PAD, pad())).toEqual([]);
  });

  it("emits only changed keys and axes, then SYN_REPORT", () => {
    const prev = pad({ pressed: ["a"], leftStick: { x: 0.5, y: 0 } });
    const next = pad({ pressed: ["a", "b"], leftStick: { x: 0.5, y: 1 } });
    expect(diffPadEvents(prev, next)).toEqual([
      { type: EV.KEY, code: BTN.EAST, value: 1 },
      { type: EV.ABS, code: ABS.Y, value: -32768 },
      { type: EV.SYN, code: SYN_REPORT, value: 0 },
    ]);
  });

  it("releases keys and recenters axes", () => {
    const prev = pad({ pressed: ["start", "dpad_up"], rightTrigger: 1 });
    expect(diffPadEvents(prev, NEUTRAL_PAD)).toEqual([
      { type: EV.KEY, code: BTN.START, value: 0 },
      { type: EV.ABS, code: ABS.RZ, value: 0 },
      { type: EV.ABS, code: ABS.HAT0Y, value: 0 },
      { type: EV.SYN, code: SYN_REPORT, value: 0 },
    ]);
  });

  it("ignores a d-pad change that does not move the hat", () => {
    const prev = pad({ pressed: ["dpad_left", "dpad_right"] });
    expect(diffPadEvents(NEUTRAL_PAD, prev)).toEqual([]);
  });
});
