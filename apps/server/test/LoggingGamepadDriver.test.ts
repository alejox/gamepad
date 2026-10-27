import { afterEach, describe, expect, it, vi } from "vitest";
import { LoggingGamepadDriver } from "../src/adapters/LoggingGamepadDriver.js";
import { NEUTRAL_PAD, applyButton, applyStick } from "../src/domain/PadState.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("LoggingGamepadDriver", () => {
  it("logs button and trigger changes as compact diffs", () => {
    const lines: string[] = [];
    const driver = new LoggingGamepadDriver((line) => lines.push(line));
    const a = applyButton(NEUTRAL_PAD, "a", true);
    driver.update(a);
    driver.update(a); // no change, no line
    const aLt = applyButton(a, "l2", true);
    driver.update(aLt);
    driver.update(applyButton(aLt, "a", false));
    expect(lines).toEqual(["[dry-run] pad +a", "[dry-run] pad LT=1", "[dry-run] pad -a"]);
  });

  it("throttles stick changes to at most one line per window and flushes the last value", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const driver = new LoggingGamepadDriver((line) => lines.push(line), 250);
    for (let i = 1; i <= 120; i++) {
      driver.update(applyStick(NEUTRAL_PAD, "L", i / 120, 0));
      vi.advanceTimersByTime(1000 / 120);
    }
    vi.advanceTimersByTime(250);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines[0]).toMatch(/^\[dry-run\] pad L=\(0\.[01],0\.0\)$/);
    expect(lines.at(-1)).toBe("[dry-run] pad L=(1.0,0.0)");
  });

  it("does not log sub-0.1 stick jitter", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const driver = new LoggingGamepadDriver((line) => lines.push(line), 250);
    driver.update(applyStick(NEUTRAL_PAD, "R", 0.5, 0));
    vi.advanceTimersByTime(300);
    driver.update(applyStick(NEUTRAL_PAD, "R", 0.52, 0.01));
    vi.advanceTimersByTime(300);
    expect(lines).toEqual(["[dry-run] pad R=(0.5,0.0)"]);
  });

  it("flushes a pending stick line on close", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const driver = new LoggingGamepadDriver((line) => lines.push(line), 250);
    driver.update(applyStick(NEUTRAL_PAD, "L", 1, 0));
    driver.update(NEUTRAL_PAD);
    driver.close();
    expect(lines).toEqual(["[dry-run] pad L=(1.0,0.0)", "[dry-run] pad L=(0.0,0.0)"]);
  });
});
