import { describe, expect, it } from "vitest";
import {
  LAYOUT_VERSION,
  MIN_ZONE_SIZE,
  ZONE_SPECS,
  type Zone,
  clampZone,
  containRect,
  defaultLayout,
  fitWithin,
  moveZone,
  parseLayout,
  resizeZone,
  toNormalized,
  zoneSpec,
  zoneToPixels,
} from "../src/domain/customLayout.js";

const ASPECTS = [1, 4 / 3, 16 / 9, 2.4, 0.75];

function expectInside(zone: Zone): void {
  expect(zone.w).toBeGreaterThanOrEqual(MIN_ZONE_SIZE - 1e-9);
  expect(zone.h).toBeGreaterThanOrEqual(MIN_ZONE_SIZE - 1e-9);
  expect(zone.x).toBeGreaterThanOrEqual(0);
  expect(zone.y).toBeGreaterThanOrEqual(0);
  expect(zone.x + zone.w).toBeLessThanOrEqual(1 + 1e-9);
  expect(zone.y + zone.h).toBeLessThanOrEqual(1 + 1e-9);
}

describe("containRect", () => {
  it("letterboxes a wide image vertically", () => {
    expect(containRect({ width: 2000, height: 1000 }, { width: 800, height: 800 })).toEqual({
      x: 0,
      y: 200,
      width: 800,
      height: 400,
    });
  });

  it("pillarboxes a tall image horizontally", () => {
    expect(containRect({ width: 1000, height: 1000 }, { width: 900, height: 400 })).toEqual({
      x: 250,
      y: 0,
      width: 400,
      height: 400,
    });
  });

  it("returns an empty rect for degenerate sizes", () => {
    expect(containRect({ width: 0, height: 100 }, { width: 900, height: 400 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("coordinate mapping", () => {
  const rect = { x: 100, y: 50, width: 400, height: 200 };

  it("maps viewport points to normalized image coordinates", () => {
    expect(toNormalized({ x: 300, y: 150 }, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(toNormalized({ x: 100, y: 50 }, rect)).toEqual({ x: 0, y: 0 });
  });

  it("maps a zone back to viewport pixels", () => {
    expect(zoneToPixels({ id: "a", x: 0.25, y: 0.5, w: 0.5, h: 0.25, enabled: true }, rect)).toEqual({
      x: 200,
      y: 150,
      width: 200,
      height: 50,
    });
  });

  it("round-trips a point", () => {
    const zone = zoneToPixels({ id: "a", x: 0.3, y: 0.7, w: 0.1, h: 0.1, enabled: true }, rect);
    expect(toNormalized({ x: zone.x, y: zone.y }, rect)).toEqual({ x: expect.closeTo(0.3), y: expect.closeTo(0.7) });
  });
});

describe("fitWithin", () => {
  it("downscales the long edge and keeps small images", () => {
    expect(fitWithin(4096, 3072, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1000, 3000, 2048)).toEqual({ width: 683, height: 2048 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe("defaultLayout", () => {
  it.each(ASPECTS)("is a valid template for aspect %f", (aspect) => {
    const layout = defaultLayout(aspect);
    expect(layout.version).toBe(LAYOUT_VERSION);
    expect(layout.zones.map((zone) => zone.id)).toEqual(ZONE_SPECS.map((spec) => spec.id));
    for (const zone of layout.zones) {
      expectInside(zone);
      if (zoneSpec(zone.id).shape === "circle") expect(zone.h).toBeCloseTo(zone.w * aspect);
    }
  });

  it("covers every gamepad control and keeps optional ones off", () => {
    const enabled = defaultLayout(16 / 9)
      .zones.filter((zone) => zone.enabled)
      .map((zone) => zone.id)
      .sort();
    expect(enabled).toEqual(
      ["a", "b", "x", "y", "dpad", "l1", "l2", "r1", "r2", "select", "start", "stickL", "stickR"].sort(),
    );
    expect(ZONE_SPECS.filter((spec) => spec.optional).map((spec) => spec.id)).toEqual(["l3", "r3", "emblem"]);
  });
});

describe("clampZone", () => {
  it("enforces minimum size and keeps zones inside the image", () => {
    const zone = clampZone({ id: "a", x: 0.99, y: -0.5, w: 0.001, h: 3, enabled: true }, 16 / 9);
    expect(zone.w).toBe(MIN_ZONE_SIZE);
    expect(zone.h).toBe(1);
    expect(zone.x).toBeCloseTo(1 - MIN_ZONE_SIZE);
    expect(zone.y).toBe(0);
  });

  it("keeps stick zones circular in pixels", () => {
    const zone = clampZone({ id: "stickL", x: 0.1, y: 0.1, w: 0.2, h: 0.9, enabled: true }, 2);
    expect(zone.h).toBeCloseTo(0.4);
    const huge = clampZone({ id: "stickL", x: 0, y: 0, w: 0.9, h: 0.9, enabled: true }, 2);
    expect(huge.h).toBe(1);
    expect(huge.w).toBeCloseTo(0.5);
    const tall = clampZone({ id: "stickR", x: 0, y: 0, w: 1, h: 1, enabled: true }, 0.5);
    expect(tall.w).toBe(1);
    expect(tall.h).toBeCloseTo(0.5);
  });

  it("moves and resizes within bounds", () => {
    const start: Zone = { id: "a", x: 0.4, y: 0.4, w: 0.1, h: 0.1, enabled: true };
    expect(moveZone(start, 0.1, -0.1, 1)).toMatchObject({ x: 0.5, y: expect.closeTo(0.3) });
    expect(moveZone(start, 2, 2, 1)).toMatchObject({ x: 0.9, y: 0.9 });
    expect(resizeZone(start, 0.1, -1, 1)).toMatchObject({ w: expect.closeTo(0.2), h: MIN_ZONE_SIZE });
  });
});

describe("parseLayout", () => {
  it("round-trips through JSON", () => {
    const layout = defaultLayout(16 / 9);
    layout.zones[0] = { ...layout.zones[0]!, x: 0.12, y: 0.34 };
    expect(parseLayout(JSON.parse(JSON.stringify(layout)), 16 / 9)).toEqual(layout);
  });

  it("rejects unknown versions and non-objects", () => {
    const layout = defaultLayout(1);
    expect(parseLayout({ ...layout, version: 99 }, 1)).toBeNull();
    expect(parseLayout({ zones: layout.zones }, 1)).toBeNull();
    expect(parseLayout("nope", 1)).toBeNull();
    expect(parseLayout(null, 1)).toBeNull();
  });

  it("fills missing or invalid zones from the template and clamps the rest", () => {
    const template = defaultLayout(1);
    const parsed = parseLayout(
      {
        version: LAYOUT_VERSION,
        zones: [
          { id: "a", x: 5, y: 0.5, w: 0.1, h: 0.1, enabled: true },
          { id: "b", x: "x", y: 0.5, w: 0.1, h: 0.1 },
          { id: "bogus", x: 0, y: 0, w: 0.1, h: 0.1 },
        ],
      },
      1,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.zones.map((zone) => zone.id)).toEqual(ZONE_SPECS.map((spec) => spec.id));
    expect(parsed!.zones.find((zone) => zone.id === "a")).toEqual({ id: "a", x: 0.9, y: 0.5, w: 0.1, h: 0.1, enabled: true });
    expect(parsed!.zones.find((zone) => zone.id === "b")).toEqual(template.zones.find((zone) => zone.id === "b"));
  });
});
