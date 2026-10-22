import { type MouseKeyName, isMouseKeyName } from "@gamepad/shared";
import type { KeyAction } from "../domain/ControllerState.js";
import type { InputDriver, MouseButton } from "../ports/InputDriver.js";

const MOUSE_BUTTONS: Record<MouseKeyName, MouseButton> = {
  mouse_left: "left",
  mouse_right: "right",
  mouse_middle: "middle",
};

/** Sends key actions to the driver, routing `mouse_*` virtual keys to mouse buttons. */
export function dispatchKeyActions(driver: InputDriver, actions: readonly KeyAction[]): void {
  for (const { key, down } of actions) {
    if (isMouseKeyName(key)) {
      driver.mouseButton(MOUSE_BUTTONS[key], down);
    } else if (down) {
      driver.keyDown(key);
    } else {
      driver.keyUp(key);
    }
  }
}
