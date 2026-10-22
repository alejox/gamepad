export interface MouseMotionOptions {
  /** Right stick deadzone as a vector magnitude in [0, 1). */
  deadzone: number;
  /** Cursor speed in pixels per second at full deflection. */
  sensitivity: number;
  /** Response curve exponent; 2 gives fine control near the centre. */
  exponent: number;
}

export interface MouseDelta {
  dx: number;
  dy: number;
}

// Guards against float drift such as 0.4 * 5 summing to 1.9999999.
const EPSILON = 1e-9;

/** Converts a right-stick vector into integer per-tick cursor deltas. */
export class MouseMotion {
  private readonly deadzone: number;
  private readonly exponent: number;
  private sensitivity: number;
  private vx = 0;
  private vy = 0;
  private remainderX = 0;
  private remainderY = 0;

  constructor(options: MouseMotionOptions) {
    this.deadzone = options.deadzone;
    this.sensitivity = options.sensitivity;
    this.exponent = options.exponent;
  }

  get active(): boolean {
    return this.vx !== 0 || this.vy !== 0;
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  /** Sets the stick vector; velocity is stored in pixels per second. */
  setVector(x: number, y: number): void {
    const magnitude = Math.min(1, Math.hypot(x, y));
    if (magnitude < this.deadzone || magnitude === 0) {
      this.vx = 0;
      this.vy = 0;
      this.remainderX = 0;
      this.remainderY = 0;
      return;
    }
    const scaled = (magnitude - this.deadzone) / (1 - this.deadzone);
    const speed = scaled ** this.exponent * this.sensitivity;
    const length = Math.hypot(x, y);
    this.vx = (x / length) * speed;
    this.vy = (y / length) * speed;
  }

  tick(elapsedMs: number): MouseDelta {
    if (!this.active) return { dx: 0, dy: 0 };
    const totalX = this.remainderX + (this.vx * elapsedMs) / 1000;
    const totalY = this.remainderY + (this.vy * elapsedMs) / 1000;
    const dx = Math.trunc(totalX + Math.sign(totalX) * EPSILON);
    const dy = Math.trunc(totalY + Math.sign(totalY) * EPSILON);
    this.remainderX = totalX - dx;
    this.remainderY = totalY - dy;
    // Normalise -0 so callers and tests see plain zeros.
    return { dx: dx + 0, dy: dy + 0 };
  }
}
