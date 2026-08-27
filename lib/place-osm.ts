import { degreeSpan } from "@/lib/place-geo";

/**
 * Buildings and streets from OpenStreetMap, fetched in the browser.
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

export type Road = {
  /** Flat [lng, lat, lng, lat, …] centreline. */
  line: number[];
  widthM: number;
};

export type OsmFeatures = { buildings: Building[]; roads: Road[] };

/**
 * How wide a street is when nobody has said.
 *
 * Carriageway plus footpaths, because at 1:5,000 a street reads as the gap
 * between the buildings, not as the asphalt alone. Classes below these — 
 * service roads, alleys, footpaths, cycle tracks — are left out: a dense
 * block has hundreds of them and they turn the model into hatching.
 */
const ROAD_WIDTH_M: Record<string, number> = {
  motorway: 24,
  motorway_link: 12,
  trunk: 20,
  trunk_link: 11,
  primary: 16,
  primary_link: 10,
  secondary: 14,
  secondary_link: 9,
  tertiary: 12,
  tertiary_link: 8,
  residential: 10,
  unclassified: 9,
  living_street: 8,
  pedestrian: 8,
};

const METRES_PER_LANE = 3.2;

function widthOf(tags: Record<string, string>): number | null {
  const highway = tags.highway;
  const base = ROAD_WIDTH_M[highway];
  if (base === undefined) return null;
  // A square mapped as a pedestrian area is a polygon, not a centreline;
  // ribboning it would draw a stripe across the middle of the square.
  if (tags.area === "yes") return null;
  // Tunnels are under the ground the model prints, so a ribbon for one would
  // be a street running through a hill.
  if (tags.tunnel && tags.tunnel !== "no") return null;
  if (Number(tags.layer) < 0) return null;

  const explicit = parseMetres(tags.width) ?? parseMetres(tags["carriageway:width"]);
  if (explicit && explicit > 0) return Math.min(60, explicit + 4);

  const lanes = Number(tags.lanes);
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(60, lanes * METRES_PER_LANE + 4);
  return base;
}

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

/** Buildings and streets within `radiusM` of a point. */
export async function fetchOsmFeatures(
  lat: number,
  lng: number,
  radiusM: number,
  signal?: AbortSignal,
): Promise<OsmFeatures> {
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
): Promise<OsmFeatures> {
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
  const roads: Road[] = [];
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
    if (el.type !== "way" || !el.tags) continue;

    if (el.tags.highway) {
      const widthM = widthOf(el.tags);
      // Unlike a footprint, a street that runs off the edge of the bbox is
      // still worth drawing: the nodes it does have are a real length of
      // road, so it is split into the runs that survived rather than dropped.
      if (widthM !== null) {
        for (const line of lineRuns(el.nodes ?? [], nodes)) roads.push({ line, widthM });
      }
      continue;
    }

    if (!el.tags.building || el.tags.building === "roof") continue;
    if (claimed.has(el.id)) continue;
    const ring = ringOf(el);
    if (ring) out.push({ ring, heightM: heightOf(el.tags) });
  }
  return { buildings: out, roads };
}

/** Split a way into the contiguous runs whose nodes the response carried. */
function lineRuns(refs: number[], nodes: Map<number, [number, number]>): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (const ref of refs) {
    const point = nodes.get(ref);
    if (!point) {
      if (current.length >= 4) runs.push(current);
      current = [];
      continue;
    }
    current.push(point[0], point[1]);
  }
  if (current.length >= 4) runs.push(current);
  return runs;
}

async function fromOverpass(
  lat: number,
  lng: number,
  reach: number,
  signal?: AbortSignal,
): Promise<OsmFeatures> {
  const highways = Object.keys(ROAD_WIDTH_M).join("|");
  const query =
    `[out:json][timeout:45];` +
    `(way["building"](around:${Math.round(reach)},${lat},${lng});` +
    `relation["building"]["type"="multipolygon"](around:${Math.round(reach)},${lat},${lng});` +
    `way["highway"~"^(${highways})$"](around:${Math.round(reach)},${lat},${lng}););` +
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
  const roads: Road[] = [];
  for (const el of body.elements ?? []) {
    const geometry = el.geometry;
    const tags = el.tags ?? {};

    if (tags.highway) {
      const widthM = widthOf(tags);
      if (widthM === null || !geometry || geometry.length < 2) continue;
      const line: number[] = [];
      for (const p of geometry) line.push(p.lon, p.lat);
      roads.push({ line, widthM });
      continue;
    }

    if (!geometry || geometry.length < 4) continue;
    if (tags.building === "roof") continue;

    const ring: number[] = [];
    for (const p of geometry) ring.push(p.lon, p.lat);
    out.push({ ring, heightM: heightOf(tags) });
  }
  return { buildings: out, roads };
}
