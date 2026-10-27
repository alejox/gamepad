import type { PadButton, PadState } from "../../domain/PadState.js";

/*
 * Pure encoders for the ViGEmBus Xbox 360 (XUSB) report. Layout and flags
 * come from ViGEmClient include/ViGEm/Common.h (_XUSB_REPORT, _XUSB_BUTTON,
 * nefarius/ViGEmClient@b66d02d), which mirrors Microsoft's XINPUT_GAMEPAD
 * (https://learn.microsoft.com/windows/win32/api/xinput/ns-xinput-xinput_gamepad).
 * No I/O here, so everything is unit-tested on any OS.
 */

/** XUSB_BUTTON / XINPUT_GAMEPAD wButtons bits. */
export const XUSB_BUTTON = {
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
} as const;

/**
 * typedef struct _XUSB_REPORT { USHORT wButtons; BYTE bLeftTrigger;
 * BYTE bRightTrigger; SHORT sThumbLX, sThumbLY, sThumbRX, sThumbRY; }
 */
export interface XusbReport {
  wButtons: number;
  bLeftTrigger: number;
  bRightTrigger: number;
  sThumbLX: number;
  sThumbLY: number;
  sThumbRX: number;
  sThumbRY: number;
}

export const XUSB_REPORT_SIZE = 12;

export const NEUTRAL_XUSB_REPORT: Readonly<XusbReport> = Object.freeze({
  wButtons: 0,
  bLeftTrigger: 0,
  bRightTrigger: 0,
  sThumbLX: 0,
  sThumbLY: 0,
  sThumbRX: 0,
  sThumbRY: 0,
});

const BIT_FOR_BUTTON: ReadonlyArray<readonly [PadButton, number]> = [
  ["dpad_up", XUSB_BUTTON.DPAD_UP],
  ["dpad_down", XUSB_BUTTON.DPAD_DOWN],
  ["dpad_left", XUSB_BUTTON.DPAD_LEFT],
  ["dpad_right", XUSB_BUTTON.DPAD_RIGHT],
  ["start", XUSB_BUTTON.START],
  ["back", XUSB_BUTTON.BACK],
  ["left_thumb", XUSB_BUTTON.LEFT_THUMB],
  ["right_thumb", XUSB_BUTTON.RIGHT_THUMB],
  ["left_shoulder", XUSB_BUTTON.LEFT_SHOULDER],
  ["right_shoulder", XUSB_BUTTON.RIGHT_SHOULDER],
  ["a", XUSB_BUTTON.A],
  ["b", XUSB_BUTTON.B],
  ["x", XUSB_BUTTON.X],
  ["y", XUSB_BUTTON.Y],
];

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;

/** [-1, 1] → [-32768, 32767]; asymmetric so both extremes are reachable, -0 becomes 0. */
export function stickToXusb(value: number): number {
  const v = clamp(value, -1, 1);
  return (v < 0 ? Math.round(v * 32768) : Math.round(v * 32767)) + 0;
}

/** [0, 1] → [0, 255]. */
export function triggerToXusb(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

/**
 * XInput report for a pad. XInput sticks are y-up like PadState, so there is
 * no inversion (unlike evdev). GUIDE is never set: the phone has no guide button.
 */
export function padToXusb(state: PadState): XusbReport {
  let wButtons = 0;
  for (const [button, bit] of BIT_FOR_BUTTON) if (state.buttons.has(button)) wButtons |= bit;
  return {
    wButtons,
    bLeftTrigger: triggerToXusb(state.leftTrigger),
    bRightTrigger: triggerToXusb(state.rightTrigger),
    sThumbLX: stickToXusb(state.leftStick.x),
    sThumbLY: stickToXusb(state.leftStick.y),
    sThumbRX: stickToXusb(state.rightStick.x),
    sThumbRY: stickToXusb(state.rightStick.y),
  };
}

/** The 12-byte little-endian C layout (USHORT, BYTE, BYTE, 4 × SHORT; no padding). */
export function encodeXusbReport(report: XusbReport): Buffer {
  const buf = Buffer.alloc(XUSB_REPORT_SIZE);
  buf.writeUInt16LE(report.wButtons, 0);
  buf.writeUInt8(report.bLeftTrigger, 2);
  buf.writeUInt8(report.bRightTrigger, 3);
  buf.writeInt16LE(report.sThumbLX, 4);
  buf.writeInt16LE(report.sThumbLY, 6);
  buf.writeInt16LE(report.sThumbRX, 8);
  buf.writeInt16LE(report.sThumbRY, 10);
  return buf;
}

export function xusbReportsEqual(a: XusbReport, b: XusbReport): boolean {
  return (
    a.wButtons === b.wButtons &&
    a.bLeftTrigger === b.bLeftTrigger &&
    a.bRightTrigger === b.bRightTrigger &&
    a.sThumbLX === b.sThumbLX &&
    a.sThumbLY === b.sThumbLY &&
    a.sThumbRX === b.sThumbRX &&
    a.sThumbRY === b.sThumbRY
  );
}
