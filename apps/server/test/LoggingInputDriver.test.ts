import { describe, expect, it } from "vitest";
import { LoggingInputDriver } from "../src/adapters/LoggingInputDriver.js";

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
});
