/**
 * Windows-only smoke test for the real ViGEm path (koffi → ViGEmClient.dll).
 * Loads the DLL (resolving every function the driver uses), allocates a
 * client and connects. A CI runner has no ViGEmBus kernel driver, so the
 * expected result there is VIGEM_ERROR_BUS_NOT_FOUND. With the bus installed
 * it also plugs in an Xbox 360 target, sends reports and unplugs it.
 *
 *   npx tsx --conditions=source scripts/vigem-smoke.ts
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createKoffiViGEmBinding } from "../src/adapters/windows/koffiViGEmBinding.js";
import { VIGEM_ERROR, describeViGEmError } from "../src/adapters/windows/ViGEmBinding.js";
import { ViGEmGamepadDriver } from "../src/adapters/windows/ViGEmGamepadDriver.js";
import { findViGEmDll, vigemDllCandidates } from "../src/adapters/windows/vigemDllPath.js";
import { NEUTRAL_PAD } from "../src/domain/PadState.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dll = findViGEmDll(
  vigemDllCandidates({ env: process.env, serverRoot, execPath: process.execPath, arch: process.arch }),
  existsSync,
);
const binding = createKoffiViGEmBinding(dll);
console.log(`ok: loaded ${dll}`);

const client = binding.alloc();
if (!client) throw new Error("vigem_alloc returned NULL");
const code = binding.connect(client);
console.log(`vigem_connect → ${describeViGEmError(code)}`);
if (code === VIGEM_ERROR.NONE) binding.disconnect(client);
binding.free(client);

if (code === VIGEM_ERROR.BUS_NOT_FOUND) {
  console.log("ok: ViGEmBus is not installed here, and the DLL reported it cleanly");
} else if (code === VIGEM_ERROR.NONE) {
  const driver = new ViGEmGamepadDriver(binding);
  try {
    driver.update({ ...NEUTRAL_PAD, buttons: new Set(["a"]), leftStick: { x: 1, y: -0.5 }, rightTrigger: 1 });
    driver.update(NEUTRAL_PAD);
    console.log("ok: Xbox 360 target plugged in and updated");
  } finally {
    await driver.close();
  }
  console.log("ok: target removed");
} else {
  throw new Error(`unexpected vigem_connect result: ${describeViGEmError(code)}`);
}
