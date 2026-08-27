import { BufferAttribute, BufferGeometry } from "three";
import type { SourceSpec } from "@/lib/model-spec";

/**
 * Geometry for a baked place.
 *
 * The document carries a quantised ground surface and, for the mapped
 * variant, building outlines. Both were captured when the place was created,
 * so this builds without touching the network and always produces the same
 * mesh for the same document.
 *
 * Every piece is returned as its own closed solid — the ground, the rim, and
 * each building. The model pipeline unions parts through manifold, so a
 * building overlapping the ground becomes one clean watertight body rather
 * than two shells left for a slicer to reconcile.
 */

export type PlaceSource = Extract<SourceSpec, { type: "place" }>;

/** Smallest wall a consumer printer renders reliably, in document units. */
const MIN_FEATURE = 0.9;

/**
 * Tallest a block may stand relative to its own width. Masts and spires are
 * mapped as buildings and can be a hundred metres over a two-metre footprint;
 * at model scale that is a needle that snaps off the plate.
 */
const MAX_ASPECT = 14;

type Grid = { size: number; heights: Float32Array; radiusM: number };

function decodeBase64(input: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(input, "base64"));
}

/** Expand the packed uint16 surface back to metres. */
function decodeSurface(source: PlaceSource): Grid | null {
  const surface = source.surface;
  if (!surface) return null;
  const bytes = decodeBase64(surface.heights);
  const expected = surface.grid * surface.grid * 2;
  if (bytes.length < expected) return null;

  const span = surface.maxM - surface.minM;
  const heights = new Float32Array(surface.grid * surface.grid);
  for (let i = 0; i < heights.length; i += 1) {
    const raw = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    heights[i] = surface.minM + (raw / 65535) * span;
  }
  return { size: surface.grid, heights, radiusM: source.radiusM };
}

/** Bilinear sample of the ground, in metres, at local metres (x, y). */
function sampleGround(grid: Grid, x: number, y: number): number {
  const { size, heights, radiusM } = grid;
  const fx = ((x + radiusM) / (2 * radiusM)) * (size - 1);
  const fy = ((y + radiusM) / (2 * radiusM)) * (size - 1);
  const x0 = Math.min(size - 1, Math.max(0, Math.floor(fx)));
  const y0 = Math.min(size - 1, Math.max(0, Math.floor(fy)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0));
  const ty = Math.min(1, Math.max(0, fy - y0));
  return (
    heights[y0 * size + x0] * (1 - tx) * (1 - ty) +
    heights[y0 * size + x1] * tx * (1 - ty) +
    heights[y1 * size + x0] * (1 - tx) * ty +
    heights[y1 * size + x1] * tx * ty
  );
}

/** Box blur, to take the speckle out of a photogrammetric surface. */
function smoothGrid(grid: Grid, strength: number): void {
  if (strength <= 0) return;
  const { size, heights } = grid;
  const radius = Math.max(1, Math.round(strength));
  const out = Float32Array.from(heights);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const jx = x + dx;
          const jy = y + dy;
          if (jx < 0 || jy < 0 || jx >= size || jy >= size) continue;
          sum += heights[jy * size + jx];
          n += 1;
        }
      }
      out[y * size + x] = sum / n;
    }
  }
  heights.set(out);
}

class SolidBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];

  vertex(x: number, y: number, z: number): number {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  finish(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

/**
 * The ground, as one closed solid.
 *
 * The surface is generated so its outer ring is exactly the model's outline —
 * a polar mesh for a circle, the grid's own edge for a square — and the skirt
 * walls are built from those same vertices. Sharing them is what keeps the
 * seam free of T-junctions, the usual reason a slicer calls a model open.
 */
function buildGround(
  source: PlaceSource,
  grid: Grid | null,
  groundSize: number,
  scale: number,
  zScale: number,
  baseM: number,
): BufferGeometry {
  const radiusM = source.radiusM;
  const half = groundSize / 2;
  const builder = new SolidBuilder();

  const heightAt = (x: number, y: number) =>
    source.plinth + (grid ? (sampleGround(grid, x, y) - baseM) * zScale : 0);

  const ring: number[] = [];

  if (source.shape === "circle") {
    const rings = Math.max(6, Math.round(source.resolution / 2));
    const sectors = Math.max(24, Math.round(source.resolution * 1.5));
    const scaleXY = half / radiusM;

    const centre = builder.vertex(0, 0, heightAt(0, 0));
    let previous: number[] = [];
    for (let r = 1; r <= rings; r += 1) {
      const radius = (r / rings) * radiusM;
      const current: number[] = [];
      for (let s = 0; s < sectors; s += 1) {
        const angle = (s / sectors) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        current.push(builder.vertex(x * scaleXY, y * scaleXY, heightAt(x, y)));
      }
      if (r === 1) {
        for (let s = 0; s < sectors; s += 1) {
          builder.triangle(centre, current[s], current[(s + 1) % sectors]);
        }
      } else {
        for (let s = 0; s < sectors; s += 1) {
          const n = (s + 1) % sectors;
          builder.quad(previous[s], current[s], current[n], previous[n]);
        }
      }
      previous = current;
    }
    ring.push(...previous);
  } else {
    const n = Math.max(8, source.resolution);
    const step = (2 * radiusM) / n;
    const at = (i: number) => -radiusM + i * step;
    const scaleXY = half / radiusM;

    const rows: number[][] = [];
    for (let iy = 0; iy <= n; iy += 1) {
      const row: number[] = [];
      for (let ix = 0; ix <= n; ix += 1) {
        const x = at(ix);
        const y = at(iy);
        row.push(builder.vertex(x * scaleXY, y * scaleXY, heightAt(x, y)));
      }
      rows.push(row);
    }
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        builder.quad(rows[iy][ix], rows[iy][ix + 1], rows[iy + 1][ix + 1], rows[iy + 1][ix]);
      }
    }
    // Walk the perimeter counter-clockwise, reusing the grid's own vertices.
    for (let ix = 0; ix < n; ix += 1) ring.push(rows[0][ix]);
    for (let iy = 0; iy < n; iy += 1) ring.push(rows[iy][n]);
    for (let ix = n; ix > 0; ix -= 1) ring.push(rows[n][ix]);
    for (let iy = n; iy > 0; iy -= 1) ring.push(rows[iy][0]);
  }

  // Skirt down to the bed, then cap the underside.
  const positions = builder.finish().getAttribute("position");
  const skirt: number[] = [];
  for (const index of ring) {
    skirt.push(builder.vertex(positions.getX(index), positions.getY(index), 0));
  }
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    builder.quad(ring[i], skirt[i], skirt[j], ring[j]);
  }
  const floor = builder.vertex(0, 0, 0);
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    builder.triangle(floor, skirt[j], skirt[i]);
  }

  const geometry = builder.finish();
  geometry.userData.footprint = [groundSize, groundSize];
  return geometry;
}

/** Outline of the model, counter-clockwise, in document units. */
function outline(shape: "circle" | "square", radius: number, segments: number) {
  const points: Array<[number, number]> = [];
  if (shape === "square") {
    const perSide = Math.max(1, Math.round(segments / 4));
    const step = (2 * radius) / perSide;
    for (let i = 0; i < perSide; i += 1) points.push([-radius + i * step, -radius]);
    for (let i = 0; i < perSide; i += 1) points.push([radius, -radius + i * step]);
    for (let i = 0; i < perSide; i += 1) points.push([radius - i * step, radius]);
    for (let i = 0; i < perSide; i += 1) points.push([-radius, radius - i * step]);
    return points;
  }
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

/** The raised rim, as its own closed prism around the ground. */
function buildFrame(source: PlaceSource): BufferGeometry {
  const outerR = source.size / 2;
  const innerR = Math.max(0.5, outerR - source.frame);
  const segments = source.shape === "circle" ? 192 : 4;
  const outer = outline(source.shape, outerR, segments);
  const inner = outline(source.shape, innerR, segments);

  const builder = new SolidBuilder();
  const top = source.frameHeight;
  const ot: number[] = [];
  const ob: number[] = [];
  const it: number[] = [];
  const ib: number[] = [];
  for (let i = 0; i < outer.length; i += 1) {
    ot.push(builder.vertex(outer[i][0], outer[i][1], top));
    ob.push(builder.vertex(outer[i][0], outer[i][1], 0));
    it.push(builder.vertex(inner[i][0], inner[i][1], top));
    ib.push(builder.vertex(inner[i][0], inner[i][1], 0));
  }
  for (let i = 0; i < outer.length; i += 1) {
    const j = (i + 1) % outer.length;
    builder.quad(ob[i], ob[j], ot[j], ot[i]);
    builder.quad(it[i], it[j], ib[j], ib[i]);
    builder.quad(ot[i], ot[j], it[j], it[i]);
    builder.quad(ib[i], ib[j], ob[j], ob[i]);
  }
  return builder.finish();
}

type Footprint = { ring: Array<[number, number]>; heightM: number };

/** Unpack the buildings captured with this place. */
function decodeFootprints(source: PlaceSource): Footprint[] {
  const packed = source.footprints;
  if (!packed) return [];
  const bytes = decodeBase64(packed.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const out: Footprint[] = [];
  let offset = 0;
  while (offset + 2 <= bytes.length && out.length < packed.count) {
    const points = view.getInt16(offset, true);
    offset += 2;
    if (points < 3 || offset + points * 4 + 2 > bytes.length) break;

    const ring: Array<[number, number]> = [];
    for (let i = 0; i < points; i += 1) {
      // Decimetres from the centre, which holds a 3km radius inside an int16.
      ring.push([view.getInt16(offset, true) / 10, view.getInt16(offset + 2, true) / 10]);
      offset += 4;
    }
    const heightM = view.getUint16(offset, true) / 10;
    offset += 2;
    out.push({ ring, heightM });
  }
  return out;
}

type Street = { line: Array<[number, number]>; widthM: number };

/** Street centrelines, packed the same way as the footprints. */
function decodeRoads(source: PlaceSource): Street[] {
  const packed = source.roads;
  if (!packed) return [];
  const bytes = decodeBase64(packed.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const out: Street[] = [];
  let offset = 0;
  while (offset + 2 <= bytes.length && out.length < packed.count) {
    const points = view.getInt16(offset, true);
    offset += 2;
    if (points < 2 || offset + points * 4 + 2 > bytes.length) break;

    const line: Array<[number, number]> = [];
    for (let i = 0; i < points; i += 1) {
      line.push([view.getInt16(offset, true) / 10, view.getInt16(offset + 2, true) / 10]);
      offset += 4;
    }
    const widthM = view.getUint16(offset, true) / 10;
    offset += 2;
    out.push({ line, widthM });
  }
  return out;
}

/**
 * Split a centreline into the runs that lie inside the model's outline.
 *
 * A polyline cannot be clipped the way a ring is: a street leaving and
 * re-entering the boundary is two streets, and joining the two ends would
 * draw a chord across the model.
 */
function clipLineToBoundary(
  line: Array<[number, number]>,
  radius: number,
  shape: "circle" | "square",
): Array<Array<[number, number]>> {
  const inside = ([x, y]: [number, number]) =>
    shape === "circle" ? Math.hypot(x, y) <= radius : Math.abs(x) <= radius && Math.abs(y) <= radius;

  // Where the segment a→b crosses the boundary, to a tenth of a metre.
  const crossing = (a: [number, number], b: [number, number]): [number, number] => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      const point: [number, number] = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid];
      if (inside(point)) low = mid;
      else high = mid;
    }
    return [a[0] + (b[0] - a[0]) * low, a[1] + (b[1] - a[1]) * low];
  };

  const runs: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  for (let i = 0; i < line.length; i += 1) {
    const point = line[i];
    const previous = line[i - 1];
    if (inside(point)) {
      if (previous && !inside(previous)) current.push(crossing(point, previous));
      current.push(point);
    } else if (previous && inside(previous)) {
      current.push(crossing(previous, point));
      if (current.length >= 2) runs.push(current);
      current = [];
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

/**
 * Drop the points a street does not need.
 *
 * A mapped way carries a node wherever anything else touches it — a driveway,
 * a crossing, a change of surface — and at 1:5,000 those bends are far below
 * a nozzle's reach. Every one of them is four more vertices for manifold to
 * union, which is the single most expensive thing a mapped place does, so
 * Douglas-Peucker takes them out before the ribbon is built.
 */
function simplifyLine(line: Array<[number, number]>, toleranceM: number): Array<[number, number]> {
  if (line.length <= 2) return line;

  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = line[start];
    const [bx, by] = line[end];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    let worst = -1;
    let worstDistance = toleranceM;
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = line[i];
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(ax + dx * t - px, ay + dy * t - py);
      if (distance > worstDistance) {
        worstDistance = distance;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([start, worst], [worst, end]);
    }
  }

  return line.filter((_, index) => keep[index] === 1);
}

/** Length of a polyline, for dropping runs too short to see. */
function lineLength(line: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return total;
}

/**
 * A street, as one closed solid following the ground.
 *
 * The ribbon is built from the centreline offset either side by half its
 * width, with the top set to the ground under each point plus the relief and
 * the bottom sunk beneath it — so the union with the ground leaves a raised
 * strip that reads as a street on a hillside as well as on the flat.
 *
 * Corners are mitred with a limit: without one, a hairpin in a mapped way
 * throws its offset vertex hundreds of metres out and the ribbon becomes a
 * spike across the model.
 */
const MITRE_LIMIT = 2.4;

function buildStreet(
  line: Array<[number, number]>,
  halfWidth: number,
  topAt: (x: number, y: number) => number,
  sink: number,
): BufferGeometry | null {
  if (line.length < 2 || halfWidth <= 0) return null;

  const normals: Array<[number, number]> = [];
  for (let i = 0; i < line.length; i += 1) {
    const previous = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return null;
    normals.push([-dy / length, dx / length]);
  }

  const builder = new SolidBuilder();
  const left: number[] = [];
  const right: number[] = [];
  const leftLow: number[] = [];
  const rightLow: number[] = [];

  for (let i = 0; i < line.length; i += 1) {
    const [x, y] = line[i];
    const [nx, ny] = normals[i];
    // The outer corner of a bend needs a longer offset to stay square to both
    // segments; the limit keeps a hairpin from launching one.
    const previous = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const ax = x - previous[0];
    const ay = y - previous[1];
    const bx = next[0] - x;
    const by = next[1] - y;
    const aLength = Math.hypot(ax, ay) || 1;
    const bLength = Math.hypot(bx, by) || 1;
    const cosHalf = Math.sqrt(Math.max(0.05, (1 + (ax * bx + ay * by) / (aLength * bLength)) / 2));
    const offset = halfWidth * Math.min(MITRE_LIMIT, 1 / cosHalf);

    const top = topAt(x, y);
    const bottom = Math.max(0, top - sink);
    left.push(builder.vertex(x + nx * offset, y + ny * offset, top));
    right.push(builder.vertex(x - nx * offset, y - ny * offset, top));
    leftLow.push(builder.vertex(x + nx * offset, y + ny * offset, bottom));
    rightLow.push(builder.vertex(x - nx * offset, y - ny * offset, bottom));
  }

  for (let i = 0; i < line.length - 1; i += 1) {
    builder.quad(left[i], right[i], right[i + 1], left[i + 1]);
    builder.quad(leftLow[i], leftLow[i + 1], rightLow[i + 1], rightLow[i]);
    builder.quad(left[i + 1], leftLow[i + 1], leftLow[i], left[i]);
    builder.quad(right[i], rightLow[i], rightLow[i + 1], right[i + 1]);
  }
  const last = line.length - 1;
  builder.quad(left[0], leftLow[0], rightLow[0], right[0]);
  builder.quad(right[last], rightLow[last], leftLow[last], left[last]);

  return builder.finish();
}

/** Twice the signed area; negative means the ring runs clockwise. */
function signedArea(ring: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

/**
 * Approximate width of an outline.
 *
 * Twice the area over the perimeter, which converges on the short side of a
 * long thin shape and the inscribed diameter of a compact one — the right
 * measure either way for asking whether a nozzle can render it.
 */
function outlineWidth(ring: Array<[number, number]>): number {
  let area = 0;
  let perimeter = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  if (perimeter <= 0) return 0;
  return Math.abs(area) / perimeter;
}

/** Fan-triangulate a convex-enough outline; concave ones fall back to a fan. */
function extrudeOutline(
  ring: Array<[number, number]>,
  bottom: number,
  top: number,
): BufferGeometry | null {
  if (ring.length < 3 || top <= bottom) return null;
  // Ways are mapped both ways round, and a clockwise ring extrudes with every
  // normal pointing inwards — a hollow shell rather than a solid.
  const wound = signedArea(ring) < 0 ? [...ring].reverse() : ring;

  const builder = new SolidBuilder();
  const topIds = wound.map(([x, y]) => builder.vertex(x, y, top));
  const bottomIds = wound.map(([x, y]) => builder.vertex(x, y, bottom));

  let cx = 0;
  let cy = 0;
  for (const [x, y] of wound) {
    cx += x / wound.length;
    cy += y / wound.length;
  }
  const topCentre = builder.vertex(cx, cy, top);
  const bottomCentre = builder.vertex(cx, cy, bottom);

  for (let i = 0; i < wound.length; i += 1) {
    const j = (i + 1) % wound.length;
    builder.triangle(topCentre, topIds[i], topIds[j]);
    builder.triangle(bottomCentre, bottomIds[j], bottomIds[i]);
    builder.quad(bottomIds[i], bottomIds[j], topIds[j], topIds[i]);
  }
  return builder.finish();
}

/** Clip an outline to the model's boundary. Both boundaries are convex. */
function clipToBoundary(
  ring: Array<[number, number]>,
  radius: number,
  shape: "circle" | "square",
): Array<[number, number]> {
  const inside = ([x, y]: [number, number]) =>
    shape === "circle" ? x * x + y * y <= radius * radius : Math.abs(x) <= radius && Math.abs(y) <= radius;
  if (ring.every(inside)) return ring;

  const edges: Array<[number, number, number]> =
    shape === "square"
      ? [[1, 0, radius], [-1, 0, radius], [0, 1, radius], [0, -1, radius]]
      : Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          return [Math.cos(a), Math.sin(a), radius] as [number, number, number];
        });

  let output = ring;
  for (const [nx, ny, d] of edges) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentIn = current[0] * nx + current[1] * ny <= d;
      const previousIn = previous[0] * nx + previous[1] * ny <= d;
      const cross = (): [number, number] => {
        const da = previous[0] * nx + previous[1] * ny - d;
        const db = current[0] * nx + current[1] * ny - d;
        const t = da / (da - db);
        return [previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t];
      };
      if (currentIn) {
        if (!previousIn) output.push(cross());
        output.push(current);
      } else if (previousIn) {
        output.push(cross());
      }
    }
  }
  return output;
}

export function createPlaceGeometryParts(source: PlaceSource): BufferGeometry[] {
  const grid = decodeSurface(source);
  if (grid) smoothGrid(grid, source.smoothing);

  // The rim sits outside the ground, so the ground shrinks by its thickness
  // and the finished model stays exactly the size that was asked for.
  const groundSize = source.frame > 0 ? Math.max(10, source.size - 2 * source.frame) : source.size;
  const scale = groundSize / (2 * source.radiusM);
  const zScale = scale * source.exaggeration;

  let baseM = 0;
  if (grid) {
    baseM = Infinity;
    for (const value of grid.heights) if (value < baseM) baseM = value;
    if (!Number.isFinite(baseM)) baseM = 0;
  }

  const parts = [buildGround(source, grid, groundSize, scale, zScale, baseM)];
  if (source.frame > 0) parts.push(buildFrame(source));

  if (source.capture === "buildings") {
    const boundary = source.radiusM;

    // Streets before buildings: a ribbon is the ground's own surface raised a
    // little, and anything standing on it should be unioned on top rather
    // than have a strip run through its lobby.
    if (source.roadRelief > 0) {
      const relief = Math.max(MIN_FEATURE / 2, source.roadRelief);
      for (const street of decodeRoads(source)) {
        const halfWidth = (street.widthM / 2) * scale;
        if (halfWidth < MIN_FEATURE / 2) continue;

        for (const run of clipLineToBoundary(street.line, boundary, source.shape)) {
          // A metre and a half is a tenth of a millimetre at the scale these
          // print at: invisible, and a third of the union's work.
          const simplified = simplifyLine(run, 1.5);
          const scaled = simplified.map(([x, y]) => [x * scale, y * scale] as [number, number]);
          // A stub shorter than a nozzle's width prints as a pimple.
          if (lineLength(scaled) < MIN_FEATURE) continue;
          const topAt = (x: number, y: number) => {
            const ground = grid ? sampleGround(grid, x / scale, y / scale) : 0;
            return source.plinth + (ground - baseM) * zScale + relief;
          };
          // Sink far enough to meet the ground under a ribbon that spans a
          // slope, and never below the bed.
          const ribbon = buildStreet(scaled, halfWidth, topAt, relief + 2);
          if (ribbon) parts.push(ribbon);
        }
      }
    }

    for (const footprint of decodeFootprints(source)) {
      const clipped = clipToBoundary(footprint.ring, boundary, source.shape);
      if (clipped.length < 3) continue;

      const scaled = clipped.map(([x, y]) => [x * scale, y * scale] as [number, number]);
      const width = outlineWidth(scaled);
      if (width < MIN_FEATURE / 2) continue;

      // Reference the roof to the highest ground under the outline so a block
      // never sinks into a rise, and the floor to the lowest so it always
      // reaches down — taking one for both leaves sloped sites hanging.
      let high = -Infinity;
      let low = Infinity;
      for (const [x, y] of clipped) {
        const g = grid ? sampleGround(grid, x, y) : 0;
        if (g > high) high = g;
        if (g < low) low = g;
      }
      if (!Number.isFinite(high) || !Number.isFinite(low)) continue;

      const highZ = source.plinth + (high - baseM) * zScale;
      const lowZ = source.plinth + (low - baseM) * zScale;
      const wanted = Math.max(footprint.heightM, 2) * zScale;
      const top = highZ + Math.min(wanted, width * MAX_ASPECT);
      const bottom = Math.max(0, lowZ - 2);

      const block = extrudeOutline(scaled, bottom, top);
      if (block) parts.push(block);
    }
  }

  return parts;
}
