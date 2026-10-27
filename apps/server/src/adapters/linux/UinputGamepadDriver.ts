import { NEUTRAL_PAD, type PadState } from "../../domain/PadState.js";
import type { GamepadDriver } from "../../ports/GamepadDriver.js";
import type { UinputBinding } from "./UinputBinding.js";
import {
  EV,
  IOCTL_NAMES,
  UI_ABS_SETUP,
  UI_DEV_CREATE,
  UI_DEV_DESTROY,
  UI_DEV_SETUP,
  UI_SET_ABSBIT,
  UI_SET_EVBIT,
  UI_SET_KEYBIT,
  X360_AXES,
  X360_IDENTITY,
  X360_KEYS,
  diffPadEvents,
  encodeAbsSetup,
  encodeInputEvents,
  encodeUinputSetup,
} from "./uinputEncoding.js";

export const UINPUT_PATH = "/dev/uinput";
export const UINPUT_DRIVER_NAME = "Virtual Xbox 360 (uinput)";

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A virtual Xbox 360 pad on /dev/uinput. The device is created in the
 * constructor; `update` writes only the evdev events that changed.
 */
export class UinputGamepadDriver implements GamepadDriver {
  readonly name = UINPUT_DRIVER_NAME;
  private readonly fd: number;
  private last: PadState = NEUTRAL_PAD;
  private closed = false;

  constructor(
    private readonly binding: UinputBinding,
    path: string = UINPUT_PATH,
  ) {
    try {
      this.fd = binding.open(path);
    } catch (error) {
      throw Object.assign(new Error(`cannot open ${path}: ${reason(error)}`), { cause: error });
    }
    try {
      this.createDevice();
    } catch (error) {
      binding.close(this.fd);
      throw error;
    }
  }

  update(state: PadState): void {
    if (this.closed) return;
    this.write(state);
    this.last = state;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      // Release first so nothing stays held; destroy even if that write fails.
      try {
        this.write(NEUTRAL_PAD);
      } finally {
        this.ioctl(UI_DEV_DESTROY, 0, "uinput UI_DEV_DESTROY failed");
      }
    } finally {
      this.binding.close(this.fd);
    }
  }

  /** Order matters: capabilities, then axis ranges, then identity, then create. */
  private createDevice(): void {
    const step = (request: number, arg: number | Buffer) =>
      this.ioctl(request, arg, `uinput device setup failed at ${IOCTL_NAMES.get(request)}`);
    step(UI_SET_EVBIT, EV.KEY);
    step(UI_SET_EVBIT, EV.ABS);
    for (const key of X360_KEYS) step(UI_SET_KEYBIT, key);
    for (const [axis] of X360_AXES) step(UI_SET_ABSBIT, axis);
    for (const [axis, range] of X360_AXES) step(UI_ABS_SETUP, encodeAbsSetup(axis, range));
    step(UI_DEV_SETUP, encodeUinputSetup(X360_IDENTITY));
    step(UI_DEV_CREATE, 0);
  }

  private ioctl(request: number, arg: number | Buffer, context: string): void {
    try {
      this.binding.ioctl(this.fd, request, arg);
    } catch (error) {
      throw Object.assign(new Error(`${context}: ${reason(error)}`), { cause: error });
    }
  }

  private write(next: PadState): void {
    const events = diffPadEvents(this.last, next);
    if (events.length === 0) return;
    const data = encodeInputEvents(events);
    let written: number;
    try {
      written = this.binding.write(this.fd, data);
    } catch (error) {
      throw Object.assign(new Error(`uinput write failed: ${reason(error)}`), { cause: error });
    }
    if (written !== data.length) {
      throw new Error(`uinput write failed: short write: ${written} of ${data.length} bytes`);
    }
  }
}
