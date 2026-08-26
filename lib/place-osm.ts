import { degreeSpan } from "@/lib/place-geo";

/**
 * Building footprints from OpenStreetMap, fetched in the browser.
 *
 * The core OSM API is tried first: it is CORS-enabled, returns a whole bbox in
 * one call, and — unlike the volunteer Overpass mirrors — is not prone to
 * rate-limiting or falling over. Overpass is kept as a fallback for areas
 * large enough that the core API refuses the request.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

const OSM_API = "https://api.openstreetmap.org/api/0.6/map.json";
const OVERPASS = "https://overpass-api.de/api/interpreter";

/**
 * Identify the caller when the runtime allows it.
 *
 * Both services rate-limit anonymous traffic hard — the OSM API answers 429
 * and Overpass 406 to a request with no User-Agent, which is what Node sends
 * by default. Browsers set their own and forbid overriding it, so this only
 * applies off the browser.
 */
function agentHeaders(): Record<string, string> {
  if (typeof window !== "undefined") return {};
  return { "User-Agent": "Printa/0.1 (+https://printa.app)" };
}

const METRES_PER_LEVEL = 3.2;
const DEFAULT_HEIGHT_M = 7;

export type Building = {
  /** Flat [lng, lat, lng, lat, …] outline. */
  ring: number[];
  heightM: number;
};

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role: string }>;
};

function parseMetres(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^\s*(-?[\d.]+)\s*(m|meter|metre|ft|feet|')?/i.exec(raw);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  return unit === "ft" || unit === "feet" || unit === "'" ? value * 0.3048 : value;
}

function heightOf(tags: Record<string, string>): number {
  const explicit = parseMetres(tags.height) ?? parseMetres(tags["building:height"]);
  if (explicit && explicit > 0) return explicit;
  const levels = Number(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) return levels * METRES_PER_LEVEL;
  return DEFAULT_HEIGHT_M;
}

/** Buildings within `radiusM` of a point. */
export async function fetchBuildings(
  lat: number,
  lng: number,
  radiusM: number,
  signal?: AbortSignal,
): Promise<Building[]> {
  // Reach past the model edge so buildings on the boundary can be clipped
  // rather than disappearing.
  const reach = radiusM * 1.45;

  try {
    return await fromOsmApi(lat, lng, reach, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    return await fromOverpass(lat, lng, reach, signal);
  }
}

async function fromOsmApi(
  lat: number,
  lng: number,
  reach: number,
  signal?: AbortSignal,
): Promise<Building[]> {
  const { dLat, dLng } = degreeSpan(lat, reach);
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat]
    .map((v) => v.toFixed(6))
    .join(",");

  const res = await fetch(`${OSM_API}?bbox=${bbox}`, { signal, headers: agentHeaders() });
  if (!res.ok) throw new Error(`OSM API HTTP ${res.status}`);

  const body = (await res.json()) as { elements?: OsmElement[] };
  const elements = body.elements ?? [];

  // The core API returns nodes and ways separately, so ways have to be
  // reassembled from node references.
  const nodes = new Map<number, [number, number]>();
  for (const el of elements) {
    if (el.type === "node" && el.lon !== undefined && el.lat !== undefined) {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  const ways = new Map<number, OsmElement>();
  for (const el of elements) if (el.type === "way") ways.set(el.id, el);

  /** Resolve a way's node references into a flat coordinate ring. */
  const ringOf = (way: OsmElement | undefined): number[] | null => {
    if (!way) return null;
    const refs = way.nodes ?? [];
    if (refs.length < 4) return null;
    const ring: number[] = [];
    for (const ref of refs) {
      const p = nodes.get(ref);
      // A way running off the edge of the bbox loses nodes; drawing it anyway
      // would punch a notch through the footprint.
      if (!p) return null;
      ring.push(p[0], p[1]);
    }
    return ring.length >= 8 ? ring : null;
  };

  const out: Building[] = [];
  const claimed = new Set<number>();

  // Multipolygon relations first, so their member ways are not also emitted
  // on their own. Large buildings — malls, terminals, stadiums — are mapped
  // this way, and skipping them leaves visible holes in the model.
  for (const el of elements) {
    if (el.type !== "relation") continue;
    const tags = el.tags ?? {};
    if (!tags.building || tags.type !== "multipolygon") continue;

    const height = heightOf(tags);
    for (const member of el.members ?? []) {
      if (member.type !== "way" || member.role === "inner") continue;
      const ring = ringOf(ways.get(member.ref));
      claimed.add(member.ref);
      if (ring) out.push({ ring, heightM: height });
    }
  }

  for (const el of elements) {
    if (el.type !== "way" || !el.tags?.building) continue;
    if (el.tags.building === "roof") continue;
    if (claimed.has(el.id)) continue;
    const ring = ringOf(el);
    if (ring) out.push({ ring, heightM: heightOf(el.tags) });
  }
  return out;
}

async function fromOverpass(
  lat: number,
  lng: number,
  reach: number,
  signal?: AbortSignal,
): Promise<Building[]> {
  const query =
    `[out:json][timeout:45];` +
    `(way["building"](around:${Math.round(reach)},${lat},${lng});` +
    `relation["building"]["type"="multipolygon"](around:${Math.round(reach)},${lat},${lng}););` +
    `out geom tags;`;

  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...agentHeaders() },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  const body = (await res.json()) as { elements?: OsmElement[] };
  const out: Building[] = [];
  for (const el of body.elements ?? []) {
    const geometry = el.geometry;
    if (!geometry || geometry.length < 4) continue;
    const tags = el.tags ?? {};
    if (tags.building === "roof") continue;

    const ring: number[] = [];
    for (const p of geometry) ring.push(p.lon, p.lat);
    out.push({ ring, heightM: heightOf(tags) });
  }
  return out;
}
