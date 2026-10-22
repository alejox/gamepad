export type MouseButton = "left" | "right" | "middle";

/** Output port: emulates OS-level keyboard and mouse input. */
export interface InputDriver {
  keyDown(key: string): void;
  keyUp(key: string): void;
  moveMouseBy(dx: number, dy: number): void;
  mouseButton(button: MouseButton, down: boolean): void;
}
