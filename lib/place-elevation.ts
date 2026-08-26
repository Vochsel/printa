import { degreeSpan } from "@/lib/place-geo";
import { createGrid, type SampleGrid } from "@/lib/place-grid";

/**
 * Ground elevation from Terrarium terrain tiles.
 *
 * These are PNGs on AWS Open Data: free, keyless, CORS-enabled, and derived
 * from public SRTM/NED sources. That combination is what lets the whole print
 * pipeline run in the browser — Google's Elevation API is a server-side web
 * service with no CORS headers, so using it would force a backend hop.
 *
 * Height is packed into the colour channels:
 *   metres = (R × 256 + G + B / 256) − 32768
 */

const TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const TILE_SIZE = 256;

/** Zoom giving roughly 4–10m per pixel for the area being printed. */
function zoomFor(radiusM: number): number {
  if (radiusM <= 400) return 15;
  if (radiusM <= 900) return 14;
  if (radiusM <= 2000) return 13;
  return 12;
}

function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

async function loadTile(
  z: number,
  x: number,
  y: number,
): Promise<Uint8ClampedArray | null> {
  const max = 2 ** z;
  if (y < 0 || y >= max) return null;
  const wrappedX = ((x % max) + max) % max;

  try {
    const res = await fetch(`${TILE_URL}/${z}/${wrappedX}/${y}.png`);
    if (!res.ok) return null;

    // The browser has a decoder; Node does not, and falling through to flat
    // ground there would quietly ruin any place whose terrain matters.
    if (typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function") {
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    }

    const { decodePng } = await import("@/lib/place-png");
    const decoded = decodePng(new Uint8Array(await res.arrayBuffer()));
    return decoded && decoded.width === TILE_SIZE ? new Uint8ClampedArray(decoded.rgba) : null;
  } catch {
    return null;
  }
}

/**
 * Sample ground height over the printed area.
 *
 * Returns null when no tile could be read, which the caller treats as flat
 * ground rather than an error — a model with no terrain is still a model.
 */
export async function terrainSampleGrid(opts: {
  lat: number;
  lng: number;
  radiusM: number;
  resolution: number;
}): Promise<SampleGrid | null> {
  const { lat, lng, radiusM, resolution } = opts;
  const z = zoomFor(radiusM);
  const { dLat, dLng } = degreeSpan(lat, radiusM);

  const xMin = Math.floor(lngToTileX(lng - dLng, z));
  const xMax = Math.floor(lngToTileX(lng + dLng, z));
  const yMin = Math.floor(latToTileY(lat + dLat, z));
  const yMax = Math.floor(latToTileY(lat - dLat, z));

  const tiles = new Map<string, Uint8ClampedArray>();
  const wanted: Array<[number, number]> = [];
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) wanted.push([tx, ty]);
  }
  // A print area spans a handful of tiles; fetching them together is fine.
  await Promise.all(
    wanted.map(async ([tx, ty]) => {
      const data = await loadTile(z, tx, ty);
      if (data) tiles.set(`${tx}/${ty}`, data);
    }),
  );
  if (tiles.size === 0) return null;

  const n = Math.max(32, resolution);
  const hf = createGrid(n, radiusM);
  const step = (2 * radiusM) / (n - 1);

  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const east = -radiusM + ix * step;
      const north = -radiusM + iy * step;
      const pLat = lat + (north / radiusM) * dLat;
      const pLng = lng + (east / radiusM) * dLng;

      const fx = lngToTileX(pLng, z);
      const fy = latToTileY(pLat, z);
      const tx = Math.floor(fx);
      const ty = Math.floor(fy);
      const data = tiles.get(`${tx}/${ty}`);
      if (!data) continue;

      const px = Math.min(TILE_SIZE - 1, Math.floor((fx - tx) * TILE_SIZE));
      const py = Math.min(TILE_SIZE - 1, Math.floor((fy - ty) * TILE_SIZE));
      const o = (py * TILE_SIZE + px) * 4;
      hf.heights[iy * n + ix] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
    }
  }

  return hf;
}
