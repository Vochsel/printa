import { LocalFrame } from "@/lib/place-geo";
import { createGrid, type SampleGrid } from "@/lib/place-grid";

/**
 * Reads surface geometry out of Google's Photorealistic 3D Tiles.
 *
 * The tileset is an implicit quadtree of glTF payloads. Descending it by hand
 * (rather than through deck.gl) keeps this deterministic: the same address and
 * radius always produce the same tiles, independent of what happens to be on
 * screen or how far the camera has loaded.
 *
 * Note on terms: Google's Maps Platform terms restrict extracting tile content
 * and creating derivative works from it. Printing a model of the mesh is very
 * likely such a use. Check your licence before doing anything but experiment.
 */

const TILE_HOST = "https://tile.googleapis.com";
const ROOT = "/v1/3dtiles/root.json";

type TileNode = {
  boundingVolume?: { box?: number[]; region?: number[]; sphere?: number[] };
  geometricError?: number;
  children?: TileNode[];
  content?: { uri?: string; url?: string };
};

type TilesetDoc = { root?: TileNode };

export type TileProgress = (stage: string, done: number, total: number) => void;

/** Half-extent, in metres, that a tile's bounding box spans. */
function boxNear(box: number[], p: [number, number, number], slack: number): boolean {
  const c = [box[0], box[1], box[2]];
  const axes = [box.slice(3, 6), box.slice(6, 9), box.slice(9, 12)];
  const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  return axes.every((a) => {
    const len2 = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    if (len2 === 0) return true;
    const len = Math.sqrt(len2);
    const t = (d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) / len2;
    return Math.abs(t) <= 1 + slack / len;
  });
}

function regionNear(
  region: number[],
  lat: number,
  lng: number,
  slack: number,
): boolean {
  const [w, s, e, n] = region;
  const dLat = slack / 6_378_137;
  const dLng = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return lo >= w - dLng && lo <= e + dLng && la >= s - dLat && la <= n + dLat;
}

class TileFetcher {
  private session: string | null = null;

  constructor(private readonly apiKey: string) {}

  url(uri: string): string {
    const absolute = uri.startsWith("http") ? uri : TILE_HOST + uri;
    const u = new URL(absolute);
    u.searchParams.set("key", this.apiKey);
    if (this.session && !u.searchParams.get("session")) {
      u.searchParams.set("session", this.session);
    }
    return u.toString();
  }

  /** Google hands out a session token on the first response; reuse it. */
  noteSession(uri: string): void {
    const m = /[?&]session=([^&]+)/.exec(uri);
    if (m) this.session = decodeURIComponent(m[1]);
  }

  async json(uri: string): Promise<TilesetDoc> {
    const res = await fetch(this.url(uri));
    if (!res.ok) throw new Error(`Tileset request failed: HTTP ${res.status}`);
    return res.json();
  }

  /**
   * Fetch one tile, retrying transient failures.
   *
   * Tile requests fail intermittently — a dropped connection, a DNS blip, an
   * occasional 5xx — and a handful of quiet failures used to leave holes that
   * the hole filler flattened into blank ground, so the model simply came out
   * empty with nothing reported. Retrying covers the blips; whatever still
   * fails is counted and surfaced.
   */
  async binary(uri: string, attempts = 3): Promise<ArrayBuffer> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      }
      try {
        const res = await fetch(this.url(uri));
        if (res.ok) return await res.arrayBuffer();
        // A stale session is not retryable as-is; get a fresh one first.
        if (res.status === 401 || res.status === 403) await this.refreshSession();
        // Client errors other than auth will not improve on a retry.
        else if (res.status >= 400 && res.status < 500) {
          throw new Error(`HTTP ${res.status}`);
        }
        lastError = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Tile request failed");
  }

  /** Re-read the root tileset to pick up a new session token. */
  async refreshSession(): Promise<void> {
    try {
      const root = await this.json(ROOT);
      const uri = root.root?.content?.uri ?? root.root?.children?.[0]?.content?.uri;
      if (uri) this.noteSession(uri);
    } catch {
      // Nothing more to try; the caller will report the tile as failed.
    }
  }
}

/**
 * Walk the tileset and collect the glTF leaves covering a disc.
 *
 * `targetError` is the tileset's own geometric error in metres: roughly the
 * size of the smallest feature a tile resolves. Around 2–4m gives recognisable
 * buildings without pulling far more triangles than a print can show.
 */
async function collectTileUris(
  fetcher: TileFetcher,
  lat: number,
  lng: number,
  radiusM: number,
  targetError: number,
  maxTiles: number,
): Promise<string[]> {
  const centre = ecef(lat, lng, 40);
  const found: string[] = [];
  let subtilesetFetches = 0;

  const hits = (node: TileNode): boolean => {
    const bv = node.boundingVolume ?? {};
    if (bv.box) return boxNear(bv.box, centre, radiusM);
    if (bv.region) return regionNear(bv.region, lat, lng, radiusM);
    return true;
  };

  const walk = async (node: TileNode, depth: number): Promise<void> => {
    if (depth > 32 || found.length >= maxTiles) return;

    const uri = node.content?.uri ?? node.content?.url;
    if (uri) fetcher.noteSession(uri);

    // Sub-tilesets must be followed regardless of their error, because the
    // error that matters lives inside them.
    if (uri && /\.json(\?|$)/i.test(uri)) {
      if (subtilesetFetches > 400) return;
      subtilesetFetches++;
      const sub = await fetcher.json(uri);
      if (sub.root) await walk(sub.root, depth + 1);
      return;
    }

    const error = node.geometricError ?? 0;
    const children = (node.children ?? []).filter(hits);

    if (error > targetError && children.length > 0) {
      // Sibling branches are independent, and each may fetch its own
      // sub-tileset, so descending them together turns a long serial chain of
      // round trips into a handful of parallel ones.
      await Promise.all(children.map((child) => walk(child, depth + 1)));
      return;
    }

    if (uri && /\.(glb|b3dm)(\?|$)/i.test(uri)) {
      found.push(uri);
      return;
    }
    await Promise.all(children.map((child) => walk(child, depth + 1)));
  };

  const root = await fetcher.json(ROOT);
  if (root.root) await walk(root.root, 0);
  return found;
}

function ecef(latDeg: number, lngDeg: number, h: number): [number, number, number] {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [
    (n + h) * Math.cos(lat) * Math.cos(lng),
    (n + h) * Math.cos(lat) * Math.sin(lng),
    (n * (1 - e2) + h) * Math.sin(lat),
  ];
}

/** Minimal glTF reader: just enough to pull triangle positions out. */
function readPositions(glb: ArrayBuffer): Array<{
  positions: Float32Array;
  indices: Uint32Array | null;
  matrix: number[] | null;
}> {
  const view = new DataView(glb);
  if (view.getUint32(0, true) !== 0x46546c67) return []; // 'glTF'

  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Uint8Array | null = null;

  while (offset + 8 <= glb.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, start, length)));
    } else if (type === 0x004e4942) {
      bin = new Uint8Array(glb, start, length);
    }
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) return [];

  type Accessor = {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  };
  const accessors = (json.accessors ?? []) as Accessor[];
  const views = (json.bufferViews ?? []) as Array<{ byteOffset?: number; byteLength?: number }>;
  const meshes = (json.meshes ?? []) as Array<{
    primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }>;
  }>;
  const nodes = (json.nodes ?? []) as Array<{ matrix?: number[]; mesh?: number }>;

  const matrixForMesh = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.mesh !== undefined && node.matrix) matrixForMesh.set(node.mesh, node.matrix);
  }

  const readAccessor = (index: number): Float32Array | Uint32Array | null => {
    const acc = accessors[index];
    if (!acc) return null;
    const bv = acc.bufferView === undefined ? undefined : views[acc.bufferView];
    if (!bv) return null;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const components = acc.type === "VEC3" ? 3 : acc.type === "VEC2" ? 2 : 1;
    const count = acc.count * components;

    switch (acc.componentType) {
      case 5126:
        return new Float32Array(bin.buffer.slice(bin.byteOffset + base, bin.byteOffset + base + count * 4));
      case 5125:
        return new Uint32Array(bin.buffer.slice(bin.byteOffset + base, bin.byteOffset + base + count * 4));
      case 5123: {
        const u16 = new Uint16Array(bin.buffer.slice(bin.byteOffset + base, bin.byteOffset + base + count * 2));
        return Uint32Array.from(u16);
      }
      case 5121: {
        const u8 = new Uint8Array(bin.buffer.slice(bin.byteOffset + base, bin.byteOffset + base + count));
        return Uint32Array.from(u8);
      }
      default:
        return null;
    }
  };

  const out: Array<{ positions: Float32Array; indices: Uint32Array | null; matrix: number[] | null }> = [];

  meshes.forEach((mesh, meshIndex) => {
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue; // triangles only
      const posIndex = prim.attributes?.POSITION;
      if (posIndex === undefined) continue;

      const acc = accessors[posIndex];
      if (!acc) continue;
      const bv = acc.bufferView === undefined ? undefined : views[acc.bufferView];
      if (!bv) continue;
      const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const positions = new Float32Array(
        bin.buffer.slice(bin.byteOffset + base, bin.byteOffset + base + acc.count * 12),
      );

      const indices =
        prim.indices !== undefined ? (readAccessor(prim.indices) as Uint32Array | null) : null;

      out.push({ positions, indices, matrix: matrixForMesh.get(meshIndex) ?? null });
    }
  });

  return out;
}

/**
 * Mesh coordinates to ECEF metres.
 *
 * Two steps, and missing the second one silently puts the model on the far
 * side of the planet. First the node's own column-major matrix, then the
 * Y-up to Z-up rotation: glTF is defined Y-up, while 3D Tiles works in a Z-up
 * earth-fixed frame, so the spec calls for a +90° rotation about X between
 * them — (x, y, z) becomes (x, -z, y).
 */
function transform(m: number[] | null, x: number, y: number, z: number): [number, number, number] {
  let px = x;
  let py = y;
  let pz = z;
  if (m) {
    px = m[0] * x + m[4] * y + m[8] * z + m[12];
    py = m[1] * x + m[5] * y + m[9] * z + m[13];
    pz = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return [px, -pz, py];
}

/**
 * Build a heightfield of the highest surface over each grid cell.
 *
 * Rasterising to a heightfield, rather than printing the mesh as it comes, is
 * what makes the result printable at all. Photogrammetry is full of holes,
 * loose fragments and doubled surfaces; taking the topmost surface over a grid
 * discards all of that and yields something a slicer can close.
 */
export async function googleTilesSampleGrid(opts: {
  apiKey: string;
  lat: number;
  lng: number;
  radiusM: number;
  resolution: number;
  detail: number;
  maxTiles?: number;
  onProgress?: TileProgress;
}): Promise<{
  heightfield: SampleGrid;
  tilesUsed: number;
  triangles: number;
  failed: number;
}> {
  const { apiKey, lat, lng, radiusM, resolution, detail, onProgress } = opts;
  const maxTiles = opts.maxTiles ?? 1100;

  const fetcher = new TileFetcher(apiKey);
  onProgress?.("Finding tiles", 0, 1);
  const uris = await collectTileUris(fetcher, lat, lng, radiusM, detail, maxTiles);
  if (uris.length === 0) {
    throw new Error("No 3D tiles cover this location");
  }

  const frame = new LocalFrame(lat, lng, 0);
  const n = Math.max(32, resolution);
  const hf = createGrid(n, radiusM);
  const cell = (2 * radiusM) / (n - 1);

  let triangles = 0;
  let done = 0;
  let failed = 0;

  // Tile fetching is network-bound, so run a wide pool. Browsers cap
  // per-host connections anyway, which keeps this from being antisocial.
  const queue = [...uris];
  const workers = Array.from({ length: 24 }, async () => {
    for (;;) {
      const uri = queue.shift();
      if (!uri) return;
      try {
        const glb = await fetcher.binary(uri);
        for (const prim of readPositions(glb)) {
          triangles += rasterise(prim, frame, hf, radiusM, cell, n);
        }
      } catch {
        // One bad tile should not sink the model, but they are counted so a
        // widespread failure is reported rather than silently flattened.
        failed++;
      }
      done++;
      onProgress?.("Reading tiles", done, uris.length);
    }
  });
  await Promise.all(workers);

  if (failed > uris.length * 0.4) {
    throw new Error(
      `Could not load ${failed} of ${uris.length} map tiles. Check the network and try again.`,
    );
  }

  return { heightfield: hf, tilesUsed: uris.length - failed, triangles, failed };
}

/** Splat one primitive's triangles into the heightfield, keeping the max Z. */
function rasterise(
  prim: { positions: Float32Array; indices: Uint32Array | null; matrix: number[] | null },
  frame: LocalFrame,
  hf: SampleGrid,
  radiusM: number,
  cell: number,
  n: number,
): number {
  const { positions, indices, matrix } = prim;
  const count = indices ? indices.length : positions.length / 3;
  let used = 0;

  const local = (vi: number): [number, number, number] => {
    const i = vi * 3;
    const [ex, ey, ez] = transform(matrix, positions[i], positions[i + 1], positions[i + 2]);
    return frame.fromEcef(ex, ey, ez);
  };

  for (let t = 0; t + 2 < count; t += 3) {
    const ia = indices ? indices[t] : t;
    const ib = indices ? indices[t + 1] : t + 1;
    const ic = indices ? indices[t + 2] : t + 2;

    const a = local(ia);
    const b = local(ib);
    const c = local(ic);

    const minX = Math.min(a[0], b[0], c[0]);
    const maxX = Math.max(a[0], b[0], c[0]);
    const minY = Math.min(a[1], b[1], c[1]);
    const maxY = Math.max(a[1], b[1], c[1]);
    if (maxX < -radiusM || minX > radiusM || maxY < -radiusM || minY > radiusM) continue;

    used++;

    const ix0 = Math.max(0, Math.floor((minX + radiusM) / cell));
    const ix1 = Math.min(n - 1, Math.ceil((maxX + radiusM) / cell));
    const iy0 = Math.max(0, Math.floor((minY + radiusM) / cell));
    const iy1 = Math.min(n - 1, Math.ceil((maxY + radiusM) / cell));

    for (let iy = iy0; iy <= iy1; iy++) {
      const py = -radiusM + iy * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = -radiusM + ix * cell;
        const z = heightAt(a, b, c, px, py);
        if (z === null) continue;
        const k = iy * n + ix;
        const prev = hf.heights[k];
        if (Number.isNaN(prev) || z > prev) hf.heights[k] = z;
      }
    }
  }
  return used;
}

/** Barycentric height of a triangle at (px, py), or null if outside it. */
function heightAt(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  px: number,
  py: number,
): number | null {
  const v0x = b[0] - a[0], v0y = b[1] - a[1];
  const v1x = c[0] - a[0], v1y = c[1] - a[1];
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-12) return null;

  const v2x = px - a[0], v2y = py - a[1];
  const u = (v2x * v1y - v1x * v2y) / den;
  const v = (v0x * v2y - v2x * v0y) / den;
  if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return null;

  return a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]);
}
