import { describe, expect, it } from "vitest";
import { UinputGamepadDriver } from "../src/adapters/linux/UinputGamepadDriver.js";
import {
  ABS,
  BTN,
  EV,
  INPUT_EVENT_SIZE,
  UI_ABS_SETUP,
  UI_DEV_CREATE,
  UI_DEV_DESTROY,
  UI_DEV_SETUP,
  UI_SET_ABSBIT,
  UI_SET_EVBIT,
  UI_SET_KEYBIT,
} from "../src/adapters/linux/uinputEncoding.js";
import { NEUTRAL_PAD, type PadState } from "../src/domain/PadState.js";
import { FakeUinputBinding, syscallError } from "./FakeUinputBinding.js";

const KEYS = [
  BTN.SOUTH, BTN.EAST, BTN.NORTH, BTN.WEST, BTN.TL, BTN.TR,
  BTN.SELECT, BTN.START, BTN.MODE, BTN.THUMBL, BTN.THUMBR,
];
const AXES = [ABS.X, ABS.Y, ABS.Z, ABS.RX, ABS.RY, ABS.RZ, ABS.HAT0X, ABS.HAT0Y];

/** Decodes a write into [type, code, value] triples. */
function events(buf: Buffer): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let at = 0; at < buf.length; at += INPUT_EVENT_SIZE) {
    out.push([buf.readUInt16LE(at + 16), buf.readUInt16LE(at + 18), buf.readInt32LE(at + 20)]);
  }
  return out;
}

describe("UinputGamepadDriver", () => {
  it("opens /dev/uinput and creates an Xbox 360 device in the uinput order", () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);

    expect(driver.name).toBe("Virtual Xbox 360 (uinput)");
    expect(binding.calls[0]).toEqual({ op: "open", path: "/dev/uinput" });
    const ioctls = binding.ioctls();
    const requests = ioctls.map((c) => c.request);
    expect(requests).toEqual([
      UI_SET_EVBIT, UI_SET_EVBIT,
      ...KEYS.map(() => UI_SET_KEYBIT),
      ...AXES.map(() => UI_SET_ABSBIT),
      ...AXES.map(() => UI_ABS_SETUP),
      UI_DEV_SETUP,
      UI_DEV_CREATE,
    ]);
    expect(ioctls.slice(0, 2).map((c) => c.arg)).toEqual([EV.KEY, EV.ABS]);
    expect(ioctls.slice(2, 2 + KEYS.length).map((c) => c.arg)).toEqual(KEYS);
    expect(ioctls.slice(2 + KEYS.length, 2 + KEYS.length + AXES.length).map((c) => c.arg)).toEqual(AXES);

    const absSetups = ioctls.filter((c) => c.request === UI_ABS_SETUP).map((c) => c.arg as Buffer);
    const range = (code: number) => {
      const buf = absSetups.find((b) => b.readUInt16LE(0) === code)!;
      return [buf.readInt32LE(8), buf.readInt32LE(12), buf.readInt32LE(16), buf.readInt32LE(20)];
    };
    expect(range(ABS.X)).toEqual([-32768, 32767, 16, 128]);
    expect(range(ABS.RY)).toEqual([-32768, 32767, 16, 128]);
    expect(range(ABS.Z)).toEqual([0, 255, 0, 0]);
    expect(range(ABS.HAT0Y)).toEqual([-1, 1, 0, 0]);

    const setup = ioctls.find((c) => c.request === UI_DEV_SETUP)!.arg as Buffer;
    expect(setup.readUInt16LE(2)).toBe(0x045e);
    expect(setup.readUInt16LE(4)).toBe(0x028e);
    expect(binding.writes()).toEqual([]);
  });

  it("writes only the changes since the last update", () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);
    const pressed: PadState = { ...NEUTRAL_PAD, buttons: new Set(["a"]) };

    driver.update(pressed);
    driver.update(pressed);
    driver.update({ ...pressed, leftStick: { x: 1, y: 0 } });

    const writes = binding.writes().map(events);
    expect(writes).toEqual([
      [[EV.KEY, BTN.SOUTH, 1], [EV.SYN, 0, 0]],
      [[EV.ABS, ABS.X, 32767], [EV.SYN, 0, 0]],
    ]);
    expect(binding.calls.filter((c) => c.op === "write").every((c) => c.op === "write" && c.fd === binding.fd)).toBe(true);
  });

  it("close releases everything, destroys the device and closes the fd once", async () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);
    driver.update({ ...NEUTRAL_PAD, buttons: new Set(["start"]) });
    binding.calls.length = 0;

    await driver.close();
    await driver.close();

    expect(binding.calls.map((c) => c.op)).toEqual(["write", "ioctl", "close"]);
    expect(events(binding.writes()[0]!)).toEqual([[EV.KEY, BTN.START, 0], [EV.SYN, 0, 0]]);
    expect(binding.ioctls()[0]!.request).toBe(UI_DEV_DESTROY);
  });

  it("ignores updates after close", async () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);
    await driver.close();
    binding.calls.length = 0;
    driver.update({ ...NEUTRAL_PAD, buttons: new Set(["a"]) });
    expect(binding.calls).toEqual([]);
  });

  it("explains a failed open", () => {
    const binding = new FakeUinputBinding();
    binding.failOn = (c) => (c.op === "open" ? syscallError("open", "EACCES", "Permission denied") : undefined);
    expect(() => new UinputGamepadDriver(binding)).toThrow(
      "cannot open /dev/uinput: Permission denied (EACCES)",
    );
  });

  it("names the failing setup step and closes the fd", () => {
    const binding = new FakeUinputBinding();
    binding.failOn = (c) =>
      c.op === "ioctl" && c.request === UI_DEV_CREATE ? syscallError("ioctl", "EINVAL", "Invalid argument") : undefined;
    expect(() => new UinputGamepadDriver(binding)).toThrow(
      "uinput device setup failed at UI_DEV_CREATE: Invalid argument (EINVAL)",
    );
    expect(binding.calls.at(-1)).toEqual({ op: "close", fd: binding.fd });
  });

  it("reports a failed write and retries the same diff on the next update", () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);
    const pressed: PadState = { ...NEUTRAL_PAD, buttons: new Set(["b"]) };

    binding.failOn = (c) => (c.op === "write" ? syscallError("write", "EAGAIN", "Resource temporarily unavailable") : undefined);
    expect(() => driver.update(pressed)).toThrow("uinput write failed: Resource temporarily unavailable (EAGAIN)");

    binding.failOn = undefined;
    driver.update(pressed);
    expect(events(binding.writes().at(-1)!)).toEqual([[EV.KEY, BTN.EAST, 1], [EV.SYN, 0, 0]]);
  });

  it("treats a short write as a failure", () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);
    binding.shortWrite = 24;
    expect(() => driver.update({ ...NEUTRAL_PAD, buttons: new Set(["x"]) })).toThrow(/short write: 24 of 48 bytes/);
  });

  it("still closes the fd when destroy fails during close", async () => {
    const binding = new FakeUinputBinding();
    const driver = new UinputGamepadDriver(binding);
    binding.failOn = (c) => (c.op === "ioctl" ? syscallError("ioctl", "ENODEV", "No such device") : undefined);
    await expect(driver.close()).rejects.toThrow("uinput UI_DEV_DESTROY failed: No such device (ENODEV)");
    expect(binding.calls.at(-1)).toEqual({ op: "close", fd: binding.fd });
  });
});
