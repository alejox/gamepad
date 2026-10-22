import { describe, expect, it } from "vitest";
import { dispatchKeyActions } from "../src/application/dispatchKeyActions.js";
import { FakeInputDriver } from "./FakeInputDriver.js";

describe("dispatchKeyActions", () => {
  it("routes keyboard keys and mouse virtual keys to the right driver calls", () => {
    const driver = new FakeInputDriver();
    dispatchKeyActions(driver, [
      { key: "space", down: true },
      { key: "mouse_left", down: true },
      { key: "mouse_right", down: false },
      { key: "space", down: false },
    ]);
    expect(driver.calls).toEqual([
      "keyDown space",
      "mouseButton left down",
      "mouseButton right up",
      "keyUp space",
    ]);
  });
});
