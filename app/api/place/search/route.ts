import type { PlaceSearchHit } from "@/lib/place-capture";

/**
 * Find somewhere to print, by name.
 *
 * Nominatim covers the whole planet, needs no key, and asks in return that
 * callers identify themselves and cache what they get — both of which are
 * easier from one server than from every visitor's browser, which is also why
 * the editor does not call it directly.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

export const runtime = "nodejs";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Printable framing: below this a block is a blur, above it a smudge. */
const MIN_RADIUS_M = 150;
const MAX_RADIUS_M = 1000;

/**
 * Turn a result's bounding box into a radius worth printing.
 *
 * A landmark's box is a few tens of metres and a city's is tens of
 * kilometres; neither is a sensible capture on its own, so the span is padded,
 * clamped and rounded to something a person would have typed.
 */
function radiusFor(box: string[] | undefined): number {
  const [south, north, west, east] = (box ?? []).map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return 300;
  const latSpanM = Math.abs(north - south) * 111_320;
  const lngSpanM = Math.abs(east - west) * 111_320 * Math.cos(((north + south) / 2) * (Math.PI / 180));
  const half = Math.max(latSpanM, lngSpanM) / 2;
  const padded = Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, half * 1.2));
  return Math.round(padded / 50) * 50;
}

function shorten(displayName: string): string {
  return displayName.split(",").slice(0, 3).map((part) => part.trim()).join(", ");
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");

  try {
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

    const results: PlaceSearchHit[] = body
      .map((hit) => ({
        label: shorten(hit.display_name ?? hit.name ?? query),
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        radiusM: radiusFor(hit.boundingbox),
      }))
      .filter((hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lng));

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Place search is unavailable." },
      { status: 502 },
    );
  }
}
