import type { SourceSpec } from "@/lib/model-spec";
import { LocalFrame } from "@/lib/place-geo";
import { despeckle, fillGaps, type SampleGrid } from "@/lib/place-grid";
import { terrainSampleGrid } from "@/lib/place-elevation";
import { fetchBuildings } from "@/lib/place-osm";
import { googleTilesSampleGrid } from "@/lib/place-tiles";

/**
 * Capture a real place and bake it into a document.
 *
 * Everything the geometry needs is packed here, once, so the document can be
 * rebuilt without the network. The coordinates stay alongside the baked data,
 * which is what lets a place be recaptured later at a different radius or
 * detail without having to find the address again.
 */

export type PlaceSource = Extract<SourceSpec, { type: "place" }>;
export type CaptureKind = "surface" | "buildings";
export type Progress = (stage: string, done: number, total: number) => void;

/**
 * Grid used for the baked surface.
 *
 * Sized so a typical few-hundred-metre capture lands near two metres per
 * sample — fine enough to keep a tower's footprint square rather than
 * rounding it into a spike, and still only a hundred kilobytes packed.
 */
const BAKE_GRID = 224;

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

/** Pack the surface into base64 uint16 spanning its own height range. */
function packSurface(grid: SampleGrid) {
  let minM = Infinity;
  let maxM = -Infinity;
  for (const value of grid.heights) {
    if (value < minM) minM = value;
    if (value > maxM) maxM = value;
  }
  if (!Number.isFinite(minM)) {
    minM = 0;
    maxM = 0;
  }
  const span = maxM - minM || 1;

  const bytes = new Uint8Array(grid.heights.length * 2);
  for (let i = 0; i < grid.heights.length; i += 1) {
    const level = Math.round(((grid.heights[i] - minM) / span) * 65535);
    const clamped = Math.min(65535, Math.max(0, level));
    bytes[i * 2] = clamped & 0xff;
    bytes[i * 2 + 1] = clamped >> 8;
  }
  return { grid: grid.size, minM, maxM, heights: encodeBase64(bytes) };
}

/**
 * Pack building outlines.
 *
 * Decimetres in an int16 hold a three-kilometre radius, which is well past
 * any radius that prints legibly, and quantising there keeps a dense city
 * block to a few tens of kilobytes rather than a megabyte of JSON numbers.
 */
function packFootprints(
  buildings: Array<{ ring: number[]; heightM: number }>,
  frame: LocalFrame,
  radiusM: number,
) {
  const chunks: number[] = [];
  let count = 0;

  for (const building of buildings) {
    const points: Array<[number, number]> = [];
    for (let i = 0; i + 1 < building.ring.length; i += 2) {
      points.push(frame.fromLngLat(building.ring[i], building.ring[i + 1]));
    }
    // Overpass and the core API both close the way; a repeated point adds a
    // zero-length edge and nothing else.
    if (
      points.length > 1 &&
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1]
    ) {
      points.pop();
    }
    if (points.length < 3 || points.length > 512) continue;
    // Reach past the edge so boundary buildings can still be clipped.
    if (points.every(([x, y]) => Math.hypot(x, y) > radiusM * 1.6)) continue;

    chunks.push(points.length);
    for (const [x, y] of points) {
      chunks.push(Math.max(-32768, Math.min(32767, Math.round(x * 10))));
      chunks.push(Math.max(-32768, Math.min(32767, Math.round(y * 10))));
    }
    chunks.push(Math.max(0, Math.min(65535, Math.round(building.heightM * 10))));
    count += 1;
  }

  const bytes = new Uint8Array(chunks.length * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  let cursor = 0;
  while (cursor < chunks.length) {
    const points = chunks[cursor];
    view.setInt16(offset, points, true);
    offset += 2;
    cursor += 1;
    for (let i = 0; i < points * 2; i += 1) {
      view.setInt16(offset, chunks[cursor], true);
      offset += 2;
      cursor += 1;
    }
    view.setUint16(offset, chunks[cursor], true);
    offset += 2;
    cursor += 1;
  }

  return { count, data: encodeBase64(bytes.subarray(0, offset)) };
}

/**
 * How fine a tile to ask for.
 *
 * Tied to the baked grid's own ground sample distance, so a larger area does
 * not demand a tile count that takes minutes to fetch for detail the model
 * could never show.
 */
export function tileDetailFor(radiusM: number): number {
  return Math.max(1.5, Math.min(12, ((2 * radiusM) / BAKE_GRID) * 1.5));
}

export type BakeOptions = {
  lat: number;
  lng: number;
  radiusM: number;
  capture: CaptureKind;
  label?: string;
  /** Required for the photogrammetric surface; unused when mapping buildings. */
  apiKey?: string;
  onProgress?: Progress;
};

export type BakeResult = {
  surface: NonNullable<PlaceSource["surface"]>;
  footprints?: NonNullable<PlaceSource["footprints"]>;
  note: string;
};

export async function bakePlace(options: BakeOptions): Promise<BakeResult> {
  const { lat, lng, radiusM, capture, apiKey, onProgress } = options;

  if (capture === "surface") {
    if (!apiKey) throw new Error("A Google Maps key is required to capture a surface.");
    const result = await googleTilesSampleGrid({
      apiKey,
      lat,
      lng,
      radiusM,
      resolution: BAKE_GRID,
      detail: tileDetailFor(radiusM),
      onProgress,
    });
    fillGaps(result.heightfield);
    despeckle(result.heightfield);
    return {
      surface: packSurface(result.heightfield),
      note: `${result.tilesUsed} tiles · ${result.triangles.toLocaleString()} source triangles`,
    };
  }

  onProgress?.("Reading OpenStreetMap", 0, 1);
  const [buildings, ground] = await Promise.all([
    fetchBuildings(lat, lng, radiusM),
    terrainSampleGrid({ lat, lng, radiusM, resolution: BAKE_GRID }),
  ]);

  const grid = ground ?? emptyGrid(radiusM);
  fillGaps(grid);

  const frame = new LocalFrame(lat, lng, 0);
  return {
    surface: packSurface(grid),
    footprints: packFootprints(buildings, frame, radiusM),
    note: `${buildings.length} buildings · OpenStreetMap${ground ? "" : " · flat ground"}`,
  };
}

function emptyGrid(radiusM: number): SampleGrid {
  const heights = new Float32Array(BAKE_GRID * BAKE_GRID);
  return { size: BAKE_GRID, radiusM, heights };
}
