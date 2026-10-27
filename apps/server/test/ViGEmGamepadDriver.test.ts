import { describe, expect, it } from "vitest";
import { ViGEmGamepadDriver } from "../src/adapters/windows/ViGEmGamepadDriver.js";
import { VIGEM_ERROR, ViGEmError } from "../src/adapters/windows/ViGEmBinding.js";
import { NEUTRAL_XUSB_REPORT, XUSB_BUTTON } from "../src/adapters/windows/xusbEncoding.js";
import { NEUTRAL_PAD, type PadState } from "../src/domain/PadState.js";
import { FakeViGEmBinding } from "./FakeViGEmBinding.js";

const pressed: PadState = { ...NEUTRAL_PAD, buttons: new Set(["a"]) };

describe("ViGEmGamepadDriver", () => {
  it("allocates, connects, and plugs in an X360 target in order", () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);

    expect(driver.name).toBe("Virtual Xbox 360 (ViGEmBus)");
    expect(binding.calls).toEqual([
      { op: "alloc" },
      { op: "connect", client: binding.client },
      { op: "targetX360Alloc" },
      { op: "targetAdd", client: binding.client, target: binding.target },
    ]);
  });

  it("sends a report only when it changes", () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);

    driver.update(NEUTRAL_PAD);
    driver.update(pressed);
    driver.update({ ...pressed, buttons: new Set(["a"]) });
    driver.update({ ...pressed, leftStick: { x: 0, y: 1 } });

    expect(binding.reports()).toEqual([
      { ...NEUTRAL_XUSB_REPORT, wButtons: XUSB_BUTTON.A },
      { ...NEUTRAL_XUSB_REPORT, wButtons: XUSB_BUTTON.A, sThumbLY: 32767 },
    ]);
  });

  it("reports a failed update and retries the same report next time", () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);

    binding.errors.set("targetX360Update", VIGEM_ERROR.TARGET_NOT_PLUGGED_IN);
    expect(() => driver.update(pressed)).toThrow(/vigem_target_x360_update failed: .*not plugged in/);

    binding.errors.delete("targetX360Update");
    driver.update(pressed);
    expect(binding.reports()).toHaveLength(2);
  });

  it("close releases everything, unplugs and frees in reverse order, once", async () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);
    driver.update(pressed);
    binding.calls.length = 0;

    await driver.close();
    await driver.close();

    expect(binding.ops()).toEqual(["targetX360Update", "targetRemove", "targetFree", "disconnect", "free"]);
    expect(binding.reports()).toEqual([NEUTRAL_XUSB_REPORT]);
  });

  it("skips the neutral report on close when already neutral", async () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);
    binding.calls.length = 0;
    await driver.close();
    expect(binding.ops()).toEqual(["targetRemove", "targetFree", "disconnect", "free"]);
  });

  it("ignores updates after close", async () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);
    await driver.close();
    binding.calls.length = 0;
    driver.update(pressed);
    expect(binding.calls).toEqual([]);
  });

  it("still frees everything when removal fails during close", async () => {
    const binding = new FakeViGEmBinding();
    const driver = new ViGEmGamepadDriver(binding);
    driver.update(pressed);
    binding.errors.set("targetX360Update", VIGEM_ERROR.BUS_ACCESS_FAILED);
    binding.errors.set("targetRemove", VIGEM_ERROR.REMOVAL_FAILED);
    binding.calls.length = 0;

    await expect(driver.close()).rejects.toThrow(/vigem_target_remove failed/);
    expect(binding.ops()).toEqual(["targetX360Update", "targetRemove", "targetFree", "disconnect", "free"]);
  });

  it("fails at vigem_alloc without touching anything else", () => {
    const binding = new FakeViGEmBinding();
    binding.nullHandles.add("alloc");
    expect(() => new ViGEmGamepadDriver(binding)).toThrow("ViGEm setup failed at vigem_alloc: out of memory");
    expect(binding.ops()).toEqual(["alloc"]);
  });

  it("frees the client when connect fails and keeps the ViGEm error as cause", () => {
    const binding = new FakeViGEmBinding();
    binding.errors.set("connect", VIGEM_ERROR.BUS_NOT_FOUND);
    let thrown: unknown;
    try {
      new ViGEmGamepadDriver(binding);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/^ViGEm setup failed at vigem_connect: .*bus not found/i);
    const cause = (thrown as Error).cause;
    expect(cause).toBeInstanceOf(ViGEmError);
    expect((cause as ViGEmError).code).toBe(VIGEM_ERROR.BUS_NOT_FOUND);
    expect(binding.ops()).toEqual(["alloc", "connect", "free"]);
  });

  it("disconnects and frees when the target cannot be allocated", () => {
    const binding = new FakeViGEmBinding();
    binding.nullHandles.add("targetX360Alloc");
    expect(() => new ViGEmGamepadDriver(binding)).toThrow("ViGEm setup failed at vigem_target_x360_alloc: out of memory");
    expect(binding.ops()).toEqual(["alloc", "connect", "targetX360Alloc", "disconnect", "free"]);
  });

  it("frees the target, disconnects and frees when plugging in fails", () => {
    const binding = new FakeViGEmBinding();
    binding.errors.set("targetAdd", VIGEM_ERROR.NO_FREE_SLOT);
    expect(() => new ViGEmGamepadDriver(binding)).toThrow(/^ViGEm setup failed at vigem_target_add: .*free slot/);
    expect(binding.ops()).toEqual(["alloc", "connect", "targetX360Alloc", "targetAdd", "targetFree", "disconnect", "free"]);
  });
});
