import type { PadButton, PadState } from "../../domain/PadState.js";

/*
 * Pure encoders for the Linux uinput ABI (linux/uinput.h, linux/input.h,
 * linux/input-event-codes.h). Little-endian, 64-bit layouts as on x86_64 and
 * aarch64. No I/O here, so everything is unit-tested on any OS.
 */

// --- ioctl numbers (asm-generic/ioctl.h: nr 8 bits, type 8, size 14, dir 2) ---

const IOC_NONE = 0;
const IOC_WRITE = 1;

export function _IOC(dir: number, type: number, nr: number, size: number): number {
  return ((dir << 30) | (size << 16) | (type << 8) | nr) >>> 0;
}

export const _IO = (type: number, nr: number): number => _IOC(IOC_NONE, type, nr, 0);
export const _IOW = (type: number, nr: number, size: number): number => _IOC(IOC_WRITE, type, nr, size);

const UINPUT_IOCTL_BASE = 0x55; // 'U'

export const UINPUT_SETUP_SIZE = 92;
export const UINPUT_ABS_SETUP_SIZE = 28;
export const INPUT_EVENT_SIZE = 24;

export const UI_DEV_CREATE = _IO(UINPUT_IOCTL_BASE, 1);
export const UI_DEV_DESTROY = _IO(UINPUT_IOCTL_BASE, 2);
export const UI_DEV_SETUP = _IOW(UINPUT_IOCTL_BASE, 3, UINPUT_SETUP_SIZE);
export const UI_ABS_SETUP = _IOW(UINPUT_IOCTL_BASE, 4, UINPUT_ABS_SETUP_SIZE);
export const UI_SET_EVBIT = _IOW(UINPUT_IOCTL_BASE, 100, 4);
export const UI_SET_KEYBIT = _IOW(UINPUT_IOCTL_BASE, 101, 4);
export const UI_SET_ABSBIT = _IOW(UINPUT_IOCTL_BASE, 103, 4);

/** Request number → name, for error messages. */
export const IOCTL_NAMES: ReadonlyMap<number, string> = new Map([
  [UI_DEV_CREATE, "UI_DEV_CREATE"],
  [UI_DEV_DESTROY, "UI_DEV_DESTROY"],
  [UI_DEV_SETUP, "UI_DEV_SETUP"],
  [UI_ABS_SETUP, "UI_ABS_SETUP"],
  [UI_SET_EVBIT, "UI_SET_EVBIT"],
  [UI_SET_KEYBIT, "UI_SET_KEYBIT"],
  [UI_SET_ABSBIT, "UI_SET_ABSBIT"],
]);

// --- event codes ---

export const EV = { SYN: 0, KEY: 1, ABS: 3 } as const;
export const SYN_REPORT = 0;

export const BTN = {
  SOUTH: 0x130,
  EAST: 0x131,
  NORTH: 0x133,
  WEST: 0x134,
  TL: 0x136,
  TR: 0x137,
  SELECT: 0x13a,
  START: 0x13b,
  MODE: 0x13c,
  THUMBL: 0x13d,
  THUMBR: 0x13e,
} as const;

export const ABS = { X: 0, Y: 1, Z: 2, RX: 3, RY: 4, RZ: 5, HAT0X: 0x10, HAT0Y: 0x11 } as const;

/** Keys the device declares, in declaration order (BTN_MODE is declared but never sent). */
export const X360_KEYS: readonly number[] = [
  BTN.SOUTH, BTN.EAST, BTN.NORTH, BTN.WEST, BTN.TL, BTN.TR,
  BTN.SELECT, BTN.START, BTN.MODE, BTN.THUMBL, BTN.THUMBR,
];

export interface AbsRange {
  minimum: number;
  maximum: number;
  fuzz?: number;
  flat?: number;
}

const STICK: AbsRange = { minimum: -32768, maximum: 32767, fuzz: 16, flat: 128 };
const TRIGGER: AbsRange = { minimum: 0, maximum: 255 };
const HAT: AbsRange = { minimum: -1, maximum: 1 };

/** Axes the device declares with their ranges, in declaration order. */
export const X360_AXES: ReadonlyArray<readonly [number, AbsRange]> = [
  [ABS.X, STICK],
  [ABS.Y, STICK],
  [ABS.Z, TRIGGER],
  [ABS.RX, STICK],
  [ABS.RY, STICK],
  [ABS.RZ, TRIGGER],
  [ABS.HAT0X, HAT],
  [ABS.HAT0Y, HAT],
];

export interface DeviceIdentity {
  bustype: number;
  vendor: number;
  product: number;
  version: number;
  name: string;
}

/** Wired Xbox 360 pad: SDL and Steam apply their built-in mapping to this id. */
export const X360_IDENTITY: DeviceIdentity = {
  bustype: 0x03, // BUS_USB
  vendor: 0x045e,
  product: 0x028e,
  version: 0x0110,
  name: "Microsoft X-Box 360 pad",
};

// --- structs ---

const UINPUT_MAX_NAME_SIZE = 80;

/** struct uinput_setup { struct input_id id; char name[80]; __u32 ff_effects_max; } */
export function encodeUinputSetup(identity: DeviceIdentity, ffEffectsMax = 0): Buffer {
  const buf = Buffer.alloc(UINPUT_SETUP_SIZE);
  buf.writeUInt16LE(identity.bustype, 0);
  buf.writeUInt16LE(identity.vendor, 2);
  buf.writeUInt16LE(identity.product, 4);
  buf.writeUInt16LE(identity.version, 6);
  const name = Buffer.from(identity.name, "latin1").subarray(0, UINPUT_MAX_NAME_SIZE - 1);
  name.copy(buf, 8);
  buf.writeUInt32LE(ffEffectsMax, 88);
  return buf;
}

/** struct uinput_abs_setup { __u16 code; (pad) struct input_absinfo absinfo; } */
export function encodeAbsSetup(code: number, range: AbsRange): Buffer {
  const buf = Buffer.alloc(UINPUT_ABS_SETUP_SIZE);
  buf.writeUInt16LE(code, 0);
  buf.writeInt32LE(0, 4); // value
  buf.writeInt32LE(range.minimum, 8);
  buf.writeInt32LE(range.maximum, 12);
  buf.writeInt32LE(range.fuzz ?? 0, 16);
  buf.writeInt32LE(range.flat ?? 0, 20);
  buf.writeInt32LE(0, 24); // resolution
  return buf;
}

export interface InputEvent {
  type: number;
  code: number;
  value: number;
}

/** struct input_event with a zero timeval (the kernel timestamps uinput events). */
export function encodeInputEvent(event: InputEvent): Buffer {
  const buf = Buffer.alloc(INPUT_EVENT_SIZE);
  buf.writeUInt16LE(event.type, 16);
  buf.writeUInt16LE(event.code, 18);
  buf.writeInt32LE(event.value, 20);
  return buf;
}

export function encodeInputEvents(events: readonly InputEvent[]): Buffer {
  return Buffer.concat(events.map(encodeInputEvent));
}

// --- PadState → evdev ---

const KEY_FOR_BUTTON: ReadonlyArray<readonly [PadButton, number]> = [
  ["a", BTN.SOUTH],
  ["b", BTN.EAST],
  ["x", BTN.WEST],
  ["y", BTN.NORTH],
  ["left_shoulder", BTN.TL],
  ["right_shoulder", BTN.TR],
  ["back", BTN.SELECT],
  ["start", BTN.START],
  ["left_thumb", BTN.THUMBL],
  ["right_thumb", BTN.THUMBR],
];

/** [-1, 1] → [-32768, 32767]; the sign is preserved and -0 becomes 0. */
export function stickToEvdev(value: number): number {
  const scaled = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  return scaled + 0;
}

/** [0, 1] → [0, 255]. */
export function triggerToEvdev(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

/** -1 for `negative` alone, +1 for `positive` alone, 0 for neither or both. */
function hat(state: PadState, negative: PadButton, positive: PadButton): number {
  return (state.buttons.has(positive) ? 1 : 0) - (state.buttons.has(negative) ? 1 : 0);
}

export interface EvdevValues {
  keys: Map<number, number>;
  abs: Map<number, number>;
}

/**
 * Absolute evdev values for a pad. PadState sticks are y-up; evdev ABS_Y and
 * ABS_RY grow downward, so Y is inverted. The d-pad becomes the hat axes, as
 * the xpad driver reports it.
 */
export function padToEvdev(state: PadState): EvdevValues {
  const keys = new Map<number, number>([[BTN.MODE, 0]]);
  for (const [button, code] of KEY_FOR_BUTTON) keys.set(code, state.buttons.has(button) ? 1 : 0);
  const abs = new Map<number, number>([
    [ABS.X, stickToEvdev(state.leftStick.x)],
    [ABS.Y, stickToEvdev(-state.leftStick.y)],
    [ABS.Z, triggerToEvdev(state.leftTrigger)],
    [ABS.RX, stickToEvdev(state.rightStick.x)],
    [ABS.RY, stickToEvdev(-state.rightStick.y)],
    [ABS.RZ, triggerToEvdev(state.rightTrigger)],
    [ABS.HAT0X, hat(state, "dpad_left", "dpad_right")],
    [ABS.HAT0Y, hat(state, "dpad_up", "dpad_down")],
  ]);
  return { keys, abs };
}

/** Minimal events turning `prev` into `next`, ending in SYN_REPORT; empty when equal. */
export function diffPadEvents(prev: PadState, next: PadState): InputEvent[] {
  const before = padToEvdev(prev);
  const after = padToEvdev(next);
  const events: InputEvent[] = [];
  for (const [code, value] of after.keys) {
    if (before.keys.get(code) !== value) events.push({ type: EV.KEY, code, value });
  }
  for (const [code, value] of after.abs) {
    if (before.abs.get(code) !== value) events.push({ type: EV.ABS, code, value });
  }
  if (events.length > 0) events.push({ type: EV.SYN, code: SYN_REPORT, value: 0 });
  return events;
}
