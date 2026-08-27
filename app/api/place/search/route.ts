import type { PlaceSearchHit } from "@/lib/place-capture";

/**
 * Find somewhere to print, by name or by street address.
 *
 * Google's geocoder is asked first when a key is configured: it resolves a
 * house number on a suburban street, which is the search most people actually
 * type, and OpenStreetMap's geocoder frequently cannot. Nominatim stays as
 * the fallback — for deployments with no key, for the queries Google returns
 * nothing for, and for the days Google is unhappy — so search never simply
 * stops working.
 *
 * Both are called from the server rather than the browser: the key is not a
 * public value, and Nominatim asks that callers identify themselves and cache
 * what they get, which is easier from one origin than from every visitor.
 *
 * Data © OpenStreetMap contributors, ODbL, where results come from Nominatim.
 */

export const runtime = "nodejs";

const GOOGLE_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Printable framing: below this a block is a blur, above it a smudge. */
const MIN_RADIUS_M = 150;
const MAX_RADIUS_M = 1000;

type Bounds = { north: number; south: number; east: number; west: number } | null;

/**
 * Turn a result's extent into a radius worth printing.
 *
 * A house is a few tens of metres across and a city is tens of kilometres;
 * neither is a sensible capture on its own, so the span is padded, clamped
 * and rounded to something a person would have typed. An address with no
 * meaningful extent gets a block-sized default rather than a radius of ten
 * metres.
 */
function radiusFor(bounds: Bounds): number {
  if (!bounds) return 300;
  const { north, south, east, west } = bounds;
  if (![north, south, east, west].every(Number.isFinite)) return 300;
  const latSpanM = Math.abs(north - south) * 111_320;
  const lngSpanM = Math.abs(east - west) * 111_320 * Math.cos(((north + south) / 2) * (Math.PI / 180));
  const half = Math.max(latSpanM, lngSpanM) / 2;
  const padded = Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, half * 1.2));
  return Math.round(padded / 50) * 50;
}

function shorten(displayName: string): string {
  return displayName.split(",").slice(0, 3).map((part) => part.trim()).join(", ");
}

type GoogleResult = {
  formatted_address?: string;
  geometry?: {
    location?: { lat?: number; lng?: number };
    viewport?: { northeast?: { lat: number; lng: number }; southwest?: { lat: number; lng: number } };
    bounds?: { northeast?: { lat: number; lng: number }; southwest?: { lat: number; lng: number } };
  };
};

async function searchGoogle(query: string, key: string): Promise<PlaceSearchHit[]> {
  const url = new URL(GOOGLE_GEOCODE);
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);

  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error(`Google geocoder HTTP ${response.status}`);

  const body = (await response.json()) as { status?: string; results?: GoogleResult[]; error_message?: string };
  if (body.status === "ZERO_RESULTS") return [];
  // A blocked key or an exhausted quota is a configuration problem, not an
  // empty result: say so upstream so the fallback runs and the log is honest.
  if (body.status !== "OK") throw new Error(body.error_message ?? `Google geocoder: ${body.status ?? "unknown status"}`);

  return (body.results ?? []).slice(0, 6).flatMap((result) => {
    const location = result.geometry?.location;
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    // `bounds` is the feature's own extent and only exists for things that
    // have one; `viewport` is always present but is a display window, so it
    // is the weaker signal and used second.
    const box = result.geometry?.bounds ?? result.geometry?.viewport;
    const bounds: Bounds = box?.northeast && box.southwest
      ? { north: box.northeast.lat, south: box.southwest.lat, east: box.northeast.lng, west: box.southwest.lng }
      : null;

    return [{
      label: shorten(result.formatted_address ?? query),
      lat,
      lng,
      radiusM: radiusFor(bounds),
    }];
  });
}

async function searchNominatim(query: string): Promise<PlaceSearchHit[]> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    headers: { "User-Agent": "Printa/0.1 (+https://printa.app)", Accept: "application/json" },
    // The same query from many visitors should cost one upstream request.
    next: { revalidate: 86_400 },
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);

  const body = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
    name?: string;
    boundingbox?: string[];
  }>;

  return body.flatMap((hit) => {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const [south, north, west, east] = (hit.boundingbox ?? []).map(Number);
    const bounds: Bounds = [south, north, west, east].every(Number.isFinite) ? { north, south, east, west } : null;
    return [{ label: shorten(hit.display_name ?? hit.name ?? query), lat, lng, radiusM: radiusFor(bounds) }];
  });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  const failures: string[] = [];

  if (key) {
    try {
      const results = await searchGoogle(query, key);
      if (results.length > 0) return Response.json({ results, source: "google" });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Google geocoder failed");
    }
  }

  try {
    const results = await searchNominatim(query);
    return Response.json({ results, source: "openstreetmap" });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Nominatim failed");
    return Response.json({ error: failures.join(" · ") || "Place search is unavailable." }, { status: 502 });
  }
}
