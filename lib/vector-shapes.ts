import type { CurveCommandSpec, VectorContourSpec } from "@/lib/model-spec";

/*
 * Shared geometry for imported artwork. Everything here is pure and runs on both
 * the server (parsing, meshing) and the client (the import preview), so it must
 * never reach for Node or DOM APIs.
 *
 * Contours are closed outlines expressed with the same curve commands the model
 * spec uses. Importers normalize into this space once — Y up, document units —
 * so nothing downstream has to remember whether a file was SVG or PDF.
 */

export type Point = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type ImportedShape = {
  id: string;
  label: string;
  kind: string;
  contours: VectorContourSpec[];
  fillRule: "nonzero" | "evenodd";
  /** Stroked-only artwork has no fill; extruding it fills the outline solid. */
  strokeOnly: boolean;
  bounds: Bounds;
  /** Absolute area of the outer contours, used to sort and to drop specks. */
  area: number;
  commands: number;
  /** Preselected in the import dialog — real artwork, not a background plate. */
  recommended: boolean;
};

export type ImportedDocument = {
  kind: "svg" | "pdf";
  name: string;
  /** Natural artwork size in millimetres, from the viewBox/MediaBox. */
  widthMm: number;
  heightMm: number;
  bounds: Bounds;
  pageCount: number;
  page: number;
  shapes: ImportedShape[];
  warnings: string[];
};

const CURVE_SAMPLES = 16;

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function growBounds(bounds: Bounds, x: number, y: number) {
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
  return bounds;
}

export function mergeBounds(list: Bounds[]): Bounds {
  const bounds = emptyBounds();
  for (const item of list) {
    if (!isFiniteBounds(item)) continue;
    growBounds(bounds, item.minX, item.minY);
    growBounds(bounds, item.maxX, item.maxY);
  }
  return bounds;
}

export function isFiniteBounds(bounds: Bounds) {
  return Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY)
    && bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY;
}

export function boundsSize(bounds: Bounds) {
  return { width: Math.max(0, bounds.maxX - bounds.minX), height: Math.max(0, bounds.maxY - bounds.minY) };
}

function quadraticPoint(from: Point, control: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function cubicPoint(from: Point, first: Point, second: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * first.x + c * second.x + d * to.x,
    y: a * from.y + b * first.y + c * second.y + d * to.y,
  };
}

/** Dense polyline for a contour — used for bounds, area, and containment. */
export function flattenContour(contour: VectorContourSpec, samples = CURVE_SAMPLES): Point[] {
  const points: Point[] = [];
  let cursor: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  const push = (point: Point) => {
    const last = points.at(-1);
    if (!last || Math.abs(last.x - point.x) > 1e-9 || Math.abs(last.y - point.y) > 1e-9) points.push(point);
  };
  for (const command of contour) {
    if (command.op === "move") {
      cursor = { x: command.to[0], y: command.to[1] };
      start = cursor;
      push(cursor);
    } else if (command.op === "line") {
      cursor = { x: command.to[0], y: command.to[1] };
      push(cursor);
    } else if (command.op === "quadratic") {
      const control = { x: command.control[0], y: command.control[1] };
      const to = { x: command.to[0], y: command.to[1] };
      for (let step = 1; step <= samples; step += 1) push(quadraticPoint(cursor, control, to, step / samples));
      cursor = to;
    } else if (command.op === "bezier") {
      const first = { x: command.control1[0], y: command.control1[1] };
      const second = { x: command.control2[0], y: command.control2[1] };
      const to = { x: command.to[0], y: command.to[1] };
      for (let step = 1; step <= samples; step += 1) push(cubicPoint(cursor, first, second, to, step / samples));
      cursor = to;
    } else {
      push(start);
      cursor = start;
    }
  }
  return points;
}

export function contourBounds(contour: VectorContourSpec): Bounds {
  const bounds = emptyBounds();
  for (const point of flattenContour(contour)) growBounds(bounds, point.x, point.y);
  return bounds;
}

/** Positive for counter-clockwise contours in a Y-up space. */
export function signedArea(points: Point[]) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return total / 2;
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const straddles = (a.y > point.y) !== (b.y > point.y);
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function representativePoint(points: Point[]): Point {
  // The centroid can fall outside a concave outline, so probe vertex midpoints
  // until one lands inside — that keeps nesting tests honest for crescents.
  const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  if (pointInPolygon(centroid, points)) return centroid;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const candidate = { x: (current.x + next.x) / 2 + 1e-6, y: (current.y + next.y) / 2 + 1e-6 };
    if (pointInPolygon(candidate, points)) return candidate;
  }
  return centroid;
}

export type NestedContour = { contour: VectorContourSpec; points: Point[]; holes: Array<{ contour: VectorContourSpec; points: Point[] }> };

/*
 * Decide which contours are solid and which cut holes. Nesting depth drives it:
 * a contour inside an odd number of others is a hole. Under the nonzero rule a
 * nested contour wound the same way as its parent stays solid — which is how a
 * logo with a same-direction inner shape is meant to fill.
 */
export function nestContours(contours: VectorContourSpec[], fillRule: "nonzero" | "evenodd" = "nonzero"): NestedContour[] {
  const entries = contours
    .map((contour) => {
      const points = flattenContour(contour);
      return { contour, points, area: signedArea(points) };
    })
    .filter((entry) => entry.points.length >= 3 && Math.abs(entry.area) > 1e-9)
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  const parents = entries.map((entry, index) => {
    const probe = representativePoint(entry.points);
    // Larger contours sort first, so the nearest enclosing parent is the last
    // earlier entry that contains this one.
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if (pointInPolygon(probe, entries[candidate].points)) return candidate;
    }
    return -1;
  });

  const isHole = entries.map(() => false);
  for (let index = 0; index < entries.length; index += 1) {
    const parent = parents[index];
    if (parent < 0) continue;
    if (isHole[parent]) continue;
    const sameWinding = Math.sign(entries[index].area) === Math.sign(entries[parent].area);
    isHole[index] = fillRule === "evenodd" ? true : !sameWinding;
  }

  const nested: NestedContour[] = entries.map((entry) => ({ contour: entry.contour, points: entry.points, holes: [] }));
  const output: NestedContour[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const parent = parents[index];
    if (isHole[index] && parent >= 0) nested[parent].holes.push({ contour: entries[index].contour, points: entries[index].points });
    else output.push(nested[index]);
  }
  return output;
}

/** SVG path data for a contour, for previews and debugging. */
export function contourToSvgPath(contour: VectorContourSpec, precision = 3) {
  const round = (value: number) => Number(value.toFixed(precision));
  const parts: string[] = [];
  for (const command of contour) {
    if (command.op === "move") parts.push(`M${round(command.to[0])} ${round(command.to[1])}`);
    else if (command.op === "line") parts.push(`L${round(command.to[0])} ${round(command.to[1])}`);
    else if (command.op === "quadratic") parts.push(`Q${round(command.control[0])} ${round(command.control[1])} ${round(command.to[0])} ${round(command.to[1])}`);
    else if (command.op === "bezier") parts.push(`C${round(command.control1[0])} ${round(command.control1[1])} ${round(command.control2[0])} ${round(command.control2[1])} ${round(command.to[0])} ${round(command.to[1])}`);
    else parts.push("Z");
  }
  return parts.join(" ");
}

export function shapeToSvgPath(shape: Pick<ImportedShape, "contours">, precision = 3) {
  return shape.contours.map((contour) => contourToSvgPath(contour, precision)).join(" ");
}

export function transformContour(contour: VectorContourSpec, scale: number, offsetX: number, offsetY: number): VectorContourSpec {
  const at = (point: readonly [number, number]): [number, number] => [point[0] * scale + offsetX, point[1] * scale + offsetY];
  return contour.map((command): CurveCommandSpec => {
    if (command.op === "move") return { op: "move", to: at(command.to) };
    if (command.op === "line") return { op: "line", to: at(command.to) };
    if (command.op === "quadratic") return { op: "quadratic", control: at(command.control), to: at(command.to) };
    if (command.op === "bezier") return { op: "bezier", control1: at(command.control1), control2: at(command.control2), to: at(command.to) };
    return { op: "close" };
  });
}

export function roundContour(contour: VectorContourSpec, precision: number): VectorContourSpec {
  const round = (value: number) => Number(value.toFixed(precision));
  const at = (point: readonly [number, number]): [number, number] => [round(point[0]), round(point[1])];
  return contour.map((command): CurveCommandSpec => {
    if (command.op === "move") return { op: "move", to: at(command.to) };
    if (command.op === "line") return { op: "line", to: at(command.to) };
    if (command.op === "quadratic") return { op: "quadratic", control: at(command.control), to: at(command.to) };
    if (command.op === "bezier") return { op: "bezier", control1: at(command.control1), control2: at(command.control2), to: at(command.to) };
    return { op: "close" };
  });
}

/*
 * Ramer–Douglas–Peucker over the straight-line runs of a contour. Curve commands
 * are left untouched — they are already compact and carry the shape's smoothness
 * — so this only collapses the long polyline runs that plotters and traced art
 * produce, which is where imported files actually get heavy.
 */
export function simplifyContour(contour: VectorContourSpec, tolerance: number): VectorContourSpec {
  if (tolerance <= 0 || contour.length < 4) return contour;
  const output: VectorContourSpec = [];
  let run: Array<{ command: CurveCommandSpec; point: Point }> = [];
  let anchor: Point | null = null;

  const flushRun = () => {
    if (run.length < 3 || !anchor) {
      run.forEach((item) => output.push(item.command));
      run = [];
      return;
    }
    const points = [anchor, ...run.map((item) => item.point)];
    const keep = douglasPeucker(points, tolerance);
    // `keep` includes the anchor at index 0, which is already emitted.
    for (let index = 1; index < keep.length; index += 1) {
      output.push({ op: "line", to: [keep[index].x, keep[index].y] });
    }
    run = [];
  };

  for (const command of contour) {
    if (command.op === "line") {
      run.push({ command, point: { x: command.to[0], y: command.to[1] } });
      continue;
    }
    flushRun();
    output.push(command);
    if (command.op === "move") anchor = { x: command.to[0], y: command.to[1] };
    else if (command.op === "quadratic" || command.op === "bezier") anchor = { x: command.to[0], y: command.to[1] };
  }
  flushRun();
  return output;
}

function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lengthSq = dx * dx + dy * dy;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    let distance: number;
    if (lengthSq < 1e-12) {
      distance = Math.hypot(point.x - first.x, point.y - first.y);
    } else {
      const t = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSq));
      distance = Math.hypot(point.x - (first.x + t * dx), point.y - (first.y + t * dy));
    }
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }
  if (maxDistance <= tolerance) return [first, last];
  const head = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
  const tail = douglasPeucker(points.slice(maxIndex), tolerance);
  return [...head.slice(0, -1), ...tail];
}
