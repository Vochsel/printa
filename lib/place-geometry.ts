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
