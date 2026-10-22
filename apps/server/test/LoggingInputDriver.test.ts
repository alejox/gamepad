import { afterEach, describe, expect, it, vi } from "vitest";
import { LoggingInputDriver } from "../src/adapters/LoggingInputDriver.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("LoggingInputDriver", () => {
  it("logs every action instead of touching the OS", () => {
    const lines: string[] = [];
    const driver = new LoggingInputDriver((line) => lines.push(line));
    driver.keyDown("space");
    driver.keyUp("space");
    driver.mouseButton("left", true);
    driver.moveMouseBy(3, -2);
    expect(lines).toEqual(["[dry-run] key down space", "[dry-run] key up space", "[dry-run] mouse left down", "[dry-run] mouse move 3,-2"]);
  });

  it("aggregates mouse moves into at most one line per window", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const driver = new LoggingInputDriver((line) => lines.push(line), 250);

    // 120 Hz ticks for one second.
    for (let i = 0; i < 120; i++) {
      driver.moveMouseBy(2, -1);
      vi.advanceTimersByTime(1000 / 120);
    }
    vi.advanceTimersByTime(250);

    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[0]).toBe("[dry-run] mouse move 2,-1");
    const total = lines
      .map((line) => /move (-?\d+),(-?\d+)/.exec(line))
      .reduce((sum, match) => ({ x: sum.x + Number(match?.[1]), y: sum.y + Number(match?.[2]) }), { x: 0, y: 0 });
    expect(total).toEqual({ x: 240, y: -120 });
  });
});
