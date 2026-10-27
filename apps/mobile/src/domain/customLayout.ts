import type { ButtonId, StickId } from "@gamepad/shared";

/**
 * Custom photo skin layout. Every zone is a box normalized to the displayed
 * image (0..1 on both axes, origin top-left), so it survives any screen size.
 */
export const LAYOUT_VERSION = 1;

/** Smallest zone edge, as a fraction of the image dimension. */
export const MIN_ZONE_SIZE = 0.03;

export type ZoneShape = "rect" | "ellipse" | "circle";

/** D-pad directions share one zone; every other button gets its own. */
export type ZoneButtonId = Exclude<ButtonId, "dpad_up" | "dpad_down" | "dpad_left" | "dpad_right">;

export type ZoneSpec =
  | { id: "dpad"; kind: "dpad"; shape: "rect"; label: string; optional: false }
  | { id: "stickL" | "stickR"; kind: "stick"; stick: StickId; shape: "circle"; label: string; optional: false }
  | { id: "emblem"; kind: "emblem"; shape: "ellipse"; label: string; optional: true }
  | { id: ZoneButtonId; kind: "button"; button: ZoneButtonId; shape: ZoneShape; label: string; optional: boolean };

export type ZoneId = ZoneSpec["id"];

/** Template placement: centre (fractions), width (fraction of image width), height in image-width units. */
interface Placement {
  cx: number;
  cy: number;
  w: number;
  hw: number;
  enabled: boolean;
}

const button = (id: ZoneButtonId, label: string, shape: ZoneShape, optional = false): ZoneSpec => ({
  id,
  kind: "button",
  button: id,
  shape,
  label,
  optional,
});

/** All zones in render order; the order is also the serialization order. */
export const ZONE_SPECS: readonly ZoneSpec[] = [
  { id: "dpad", kind: "dpad", shape: "rect", label: "D-pad", optional: false },
  { id: "stickL", kind: "stick", stick: "L", shape: "circle", label: "L stick", optional: false },
  { id: "stickR", kind: "stick", stick: "R", shape: "circle", label: "R stick", optional: false },
  button("y", "△/Y", "ellipse"),
  button("x", "□/X", "ellipse"),
  button("b", "○/B", "ellipse"),
  button("a", "✕/A", "ellipse"),
  button("l2", "L2", "rect"),
  button("l1", "L1", "rect"),
  button("r2", "R2", "rect"),
  button("r1", "R1", "rect"),
  button("select", "Select", "ellipse"),
  button("start", "Start", "ellipse"),
  button("l3", "L3", "ellipse", true),
  button("r3", "R3", "ellipse", true),
  { id: "emblem", kind: "emblem", shape: "ellipse", label: "Find PC", optional: true },
];

/** A generic dual-stick controller seen from the front, so calibration starts close. */
const TEMPLATE: Record<ZoneId, Placement> = {
  l2: { cx: 0.2, cy: 0.07, w: 0.12, hw: 0.05, enabled: true },
  l1: { cx: 0.2, cy: 0.16, w: 0.14, hw: 0.05, enabled: true },
  r2: { cx: 0.8, cy: 0.07, w: 0.12, hw: 0.05, enabled: true },
  r1: { cx: 0.8, cy: 0.16, w: 0.14, hw: 0.05, enabled: true },
  stickL: { cx: 0.24, cy: 0.42, w: 0.13, hw: 0.13, enabled: true },
  dpad: { cx: 0.36, cy: 0.66, w: 0.13, hw: 0.13, enabled: true },
  stickR: { cx: 0.64, cy: 0.66, w: 0.13, hw: 0.13, enabled: true },
  y: { cx: 0.78, cy: 0.3, w: 0.065, hw: 0.065, enabled: true },
  x: { cx: 0.72, cy: 0.42, w: 0.065, hw: 0.065, enabled: true },
  b: { cx: 0.84, cy: 0.42, w: 0.065, hw: 0.065, enabled: true },
  a: { cx: 0.78, cy: 0.54, w: 0.065, hw: 0.065, enabled: true },
  select: { cx: 0.42, cy: 0.4, w: 0.06, hw: 0.04, enabled: true },
  start: { cx: 0.58, cy: 0.4, w: 0.06, hw: 0.04, enabled: true },
  l3: { cx: 0.24, cy: 0.6, w: 0.06, hw: 0.035, enabled: false },
  r3: { cx: 0.64, cy: 0.84, w: 0.06, hw: 0.035, enabled: false },
  emblem: { cx: 0.5, cy: 0.22, w: 0.08, hw: 0.08, enabled: false },
};

export interface Zone {
  id: ZoneId;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
}

export interface CustomLayout {
  version: typeof LAYOUT_VERSION;
  zones: Zone[];
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

const SPEC_BY_ID = new Map<ZoneId, ZoneSpec>(ZONE_SPECS.map((spec) => [spec.id, spec]));

export function zoneSpec(id: ZoneId): ZoneSpec {
  const spec = SPEC_BY_ID.get(id);
  if (!spec) throw new Error(`Unknown zone ${id}`);
  return spec;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The box an image occupies inside a container with `object-fit: contain`. */
export function containRect(natural: Size, container: Size): Rect {
  if (natural.width <= 0 || natural.height <= 0 || container.width <= 0 || container.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / natural.width, container.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

/** Viewport point to image-normalized coordinates (not clamped). */
export function toNormalized(point: Point, rect: Rect): Point {
  return { x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height };
}

export function zoneToPixels(zone: Zone, rect: Rect): Rect {
  return {
    x: rect.x + zone.x * rect.width,
    y: rect.y + zone.y * rect.height,
    width: zone.w * rect.width,
    height: zone.h * rect.height,
  };
}

/** Scales a size down so its long edge is at most `maxEdge` (never up). */
export function fitWithin(width: number, height: number, maxEdge: number): Size {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Enforces minimum size, keeps the zone inside the image and keeps circular
 * zones circular on screen. `aspect` is image width / height.
 */
export function clampZone(zone: Zone, aspect: number): Zone {
  let w: number;
  let h: number;
  if (zoneSpec(zone.id).shape === "circle") {
    // In pixels w * width must equal h * height, so h = w * aspect.
    const min = Math.max(MIN_ZONE_SIZE, MIN_ZONE_SIZE / aspect);
    const max = Math.min(1, 1 / aspect);
    w = clamp(zone.w, min, max);
    h = Math.min(1, w * aspect);
  } else {
    w = clamp(zone.w, MIN_ZONE_SIZE, 1);
    h = clamp(zone.h, MIN_ZONE_SIZE, 1);
  }
  return { ...zone, w, h, x: clamp(zone.x, 0, 1 - w), y: clamp(zone.y, 0, 1 - h) };
}

export function moveZone(zone: Zone, dx: number, dy: number, aspect: number): Zone {
  return clampZone({ ...zone, x: zone.x + dx, y: zone.y + dy }, aspect);
}

/** Resizes from the bottom-right corner, keeping the top-left anchored. */
export function resizeZone(zone: Zone, dw: number, dh: number, aspect: number): Zone {
  const w = clamp(zone.w + dw, MIN_ZONE_SIZE, 1 - zone.x);
  const h = clamp(zone.h + dh, MIN_ZONE_SIZE, 1 - zone.y);
  return clampZone({ ...zone, w, h }, aspect);
}

function templateZone(spec: ZoneSpec, aspect: number): Zone {
  const place = TEMPLATE[spec.id];
  const h = place.hw * aspect;
  return clampZone(
    { id: spec.id, x: place.cx - place.w / 2, y: place.cy - h / 2, w: place.w, h, enabled: place.enabled },
    aspect,
  );
}

export function defaultLayout(aspect: number): CustomLayout {
  return { version: LAYOUT_VERSION, zones: ZONE_SPECS.map((spec) => templateZone(spec, aspect)) };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Restores a stored layout. Unknown versions are rejected (null); missing or
 * invalid zones come from the template, valid ones are clamped.
 */
export function parseLayout(value: unknown, aspect: number): CustomLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as { version?: unknown; zones?: unknown };
  if (stored.version !== LAYOUT_VERSION || !Array.isArray(stored.zones)) return null;
  const byId = new Map<unknown, Record<string, unknown>>();
  for (const zone of stored.zones as unknown[]) {
    if (typeof zone === "object" && zone !== null) {
      const record = zone as Record<string, unknown>;
      byId.set(record.id, record);
    }
  }
  const zones = ZONE_SPECS.map((spec) => {
    const template = templateZone(spec, aspect);
    const raw = byId.get(spec.id);
    if (!raw || ![raw.x, raw.y, raw.w, raw.h].every(isFiniteNumber)) return template;
    const enabled = !spec.optional || (typeof raw.enabled === "boolean" ? raw.enabled : template.enabled);
    return clampZone(
      { id: spec.id, x: raw.x as number, y: raw.y as number, w: raw.w as number, h: raw.h as number, enabled },
      aspect,
    );
  });
  return { version: LAYOUT_VERSION, zones };
}
