/**
 * Linux-only smoke test for the real uinput path (koffi → libc → /dev/uinput).
 * Creates the virtual Xbox 360 pad, presses A and moves the left stick, checks
 * that the kernel lists the device, then removes it. Run in CI after
 * `sudo modprobe uinput && sudo chmod 666 /dev/uinput`:
 *
 *   npx tsx --conditions=source scripts/uinput-smoke.ts
 */
import { readFileSync } from "node:fs";
import { createKoffiUinputBinding } from "../src/adapters/linux/koffiUinputBinding.js";
import { UinputGamepadDriver } from "../src/adapters/linux/UinputGamepadDriver.js";
import { X360_IDENTITY } from "../src/adapters/linux/uinputEncoding.js";
import { NEUTRAL_PAD } from "../src/domain/PadState.js";

const DEVICES = "/proc/bus/input/devices";
const listed = () => readFileSync(DEVICES, "utf8").includes(`Name="${X360_IDENTITY.name}"`);

const driver = new UinputGamepadDriver(createKoffiUinputBinding());
try {
  // udev needs a moment to register the new node.
  await new Promise((resolve) => setTimeout(resolve, 500));
  driver.update({ ...NEUTRAL_PAD, buttons: new Set(["a"]), leftStick: { x: 1, y: -0.5 } });
  driver.update(NEUTRAL_PAD);
  if (!listed()) throw new Error(`"${X360_IDENTITY.name}" not found in ${DEVICES}`);
  console.log(`ok: "${X360_IDENTITY.name}" is listed in ${DEVICES}`);
} finally {
  await driver.close();
}

await new Promise((resolve) => setTimeout(resolve, 200));
if (listed()) throw new Error("device still listed after close");
console.log("ok: device removed on close");
