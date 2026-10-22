import type { ButtonId, Direction, KeyMapping, KeyName } from "@gamepad/shared";
import { stickToDirections } from "./stickToDirections.js";

export interface KeyAction {
  key: KeyName;
  down: boolean;
}

export interface ControllerStateOptions {
  /** Left stick deadzone as a vector magnitude in [0, 1). */
  deadzone: number;
}

/**
 * Tracks which inputs are active and turns changes into key down/up diffs.
 *
 * Keys are reference-counted: when several inputs map to the same key, the
 * key is pressed by the first one and released only by the last one.
 */
export class ControllerState {
  private mapping: KeyMapping;
  private readonly deadzone: number;
  private readonly pressed = new Set<ButtonId>();
  private directions: ReadonlySet<Direction> = new Set();
  private held = new Map<KeyName, number>();

  constructor(mapping: KeyMapping, options: ControllerStateOptions) {
    this.mapping = mapping;
    this.deadzone = options.deadzone;
  }

  setButton(id: ButtonId, down: boolean): KeyAction[] {
    if (down === this.pressed.has(id)) return [];
    if (down) this.pressed.add(id);
    else this.pressed.delete(id);
    return this.reconcile();
  }

  setLeftStick(x: number, y: number): KeyAction[] {
    this.directions = stickToDirections(x, y, this.deadzone);
    return this.reconcile();
  }

  setMapping(mapping: KeyMapping): KeyAction[] {
    this.mapping = mapping;
    return this.reconcile();
  }

  releaseAll(): KeyAction[] {
    this.pressed.clear();
    this.directions = new Set();
    return this.reconcile();
  }

  heldKeys(): KeyName[] {
    return [...this.held.keys()];
  }

  private reconcile(): KeyAction[] {
    const next = new Map<KeyName, number>();
    const hold = (key: KeyName | undefined): void => {
      if (key !== undefined) next.set(key, (next.get(key) ?? 0) + 1);
    };
    for (const id of this.pressed) hold(this.mapping.buttons[id]);
    for (const direction of this.directions) hold(this.mapping.leftStick[direction]);

    const actions: KeyAction[] = [];
    for (const key of this.held.keys()) {
      if (!next.has(key)) actions.push({ key, down: false });
    }
    for (const key of next.keys()) {
      if (!this.held.has(key)) actions.push({ key, down: true });
    }
    this.held = next;
    return actions;
  }
}
