import type { InputDriver, MouseButton } from "../ports/InputDriver.js";

type Robot = typeof import("@jitsi/robotjs");

/** Emulates OS keyboard/mouse input through @jitsi/robotjs. */
export class RobotInputDriver implements InputDriver {
  private constructor(private readonly robot: Robot) {}

  /** Loads the native module lazily so dry runs and tests never need it. */
  static async create(): Promise<RobotInputDriver> {
    const module = await import("@jitsi/robotjs");
    const robot = (module as { default?: Robot }).default ?? module;
    robot.setKeyboardDelay(0);
    robot.setMouseDelay(0);
    return new RobotInputDriver(robot);
  }

  keyDown(key: string): void {
    this.robot.keyToggle(key, "down");
  }

  keyUp(key: string): void {
    this.robot.keyToggle(key, "up");
  }

  moveMouseBy(dx: number, dy: number): void {
    const { x, y } = this.robot.getMousePos();
    this.robot.moveMouse(x + dx, y + dy);
  }

  mouseButton(button: MouseButton, down: boolean): void {
    this.robot.mouseToggle(down ? "down" : "up", button);
  }
}
