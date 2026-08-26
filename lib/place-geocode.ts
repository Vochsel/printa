/**
 * Address lookup against NSW Spatial Services, from the browser.
 *
 * The state's own address register is CORS-enabled and needs no key, so the
 * print page can resolve an address without a backend of any kind. The
 * matching strategy mirrors the server-side geocoder used by the map.
 */

const ADDRESS_POINTS =
  "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Geocoded_Addressing_Theme/FeatureServer/1/query";
const SUBURBS =
  "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Administrative_Boundaries_Theme/FeatureServer/2/query";

const STREET_TYPES: Record<string, string> = {
  ST: "STREET", RD: "ROAD", AVE: "AVENUE", AV: "AVENUE", DR: "DRIVE",
  DRV: "DRIVE", CT: "COURT", CRT: "COURT", PL: "PLACE", LN: "LANE",
  CR: "CRESCENT", CRES: "CRESCENT", CCT: "CIRCUIT", CL: "CLOSE",
  PDE: "PARADE", TCE: "TERRACE", HWY: "HIGHWAY", BVD: "BOULEVARD",
  BLVD: "BOULEVARD", ESP: "ESPLANADE", GR: "GROVE", GRV: "GROVE",
  SQ: "SQUARE", WY: "WAY", PKWY: "PARKWAY", CIR: "CIRCLE", ALY: "ALLEY",
  MWY: "MOTORWAY", FWY: "FREEWAY", RDG: "RIDGE", TRL: "TRAIL",
};

export type PrintPlace = {
  formatted: string;
  lat: number;
  lng: number;
  suburb?: string;
};

type Feature = {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown };
};

function normalise(input: string): { street: string; postcode?: string } {
  let text = input.toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const pc = /\b(2\d{3})\b\s*$/.exec(text);
  const postcode = pc?.[1];
  if (postcode) text = text.slice(0, pc.index).trim();
  text = text
    .replace(/\b(NSW|NEW SOUTH WALES|AUSTRALIA)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").map((w) => STREET_TYPES[w] ?? w);
  return { street: words.join(" "), postcode };
}

async function arcgis(
  base: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<Feature[]> {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`NSW Spatial HTTP ${res.status}`);
  const body = (await res.json()) as { features?: Feature[] };
  return body.features ?? [];
}

function flatten(coords: unknown, out: number[][] = []): number[][] {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    out.push(coords as number[]);
    return out;
  }
  if (Array.isArray(coords)) for (const c of coords) flatten(c, out);
  return out;
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bNsw\b/g, "NSW");
}

export async function geocodeNSWClient(
  input: string,
  signal?: AbortSignal,
): Promise<PrintPlace> {
  const { street, postcode } = normalise(input);
  if (!street) throw new Error("Enter an address or suburb");

  const withoutUnit = street.replace(/^\d+\s*\/\s*/, "");
  const hasNumber = /^\d/.test(withoutUnit);

  if (hasNumber) {
    const hits = await arcgis(
      ADDRESS_POINTS,
      {
        where: `address LIKE '${withoutUnit.replace(/'/g, "''")}%'`,
        outFields: "address",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
        resultRecordCount: "1",
      },
      signal,
    );
    const hit = hits[0];
    const coords = hit?.geometry?.coordinates as number[] | undefined;
    if (hit && coords && coords.length >= 2) {
      const address = String(hit.properties?.address ?? withoutUnit);
      return {
        formatted: titleCase(address) + (postcode ? ` NSW ${postcode}` : " NSW"),
        lng: coords[0],
        lat: coords[1],
        suburb: suburbFrom(address),
      };
    }
  }

  // Fall back to a suburb centroid: the longest trailing name that matches.
  const words = street.split(" ");
  for (const take of [3, 2, 1]) {
    if (words.length < take) continue;
    const candidate = words.slice(-take).join(" ");
    if (/^\d/.test(candidate)) continue;

    const hits = await arcgis(
      SUBURBS,
      {
        where: `suburbname = '${candidate.replace(/'/g, "''")}'`,
        outFields: "suburbname,postcode",
        returnGeometry: "true",
        maxAllowableOffset: "0.005",
        outSR: "4326",
        f: "geojson",
        resultRecordCount: "1",
      },
      signal,
    );
    const hit = hits[0];
    if (!hit?.geometry?.coordinates) continue;

    const pts = flatten(hit.geometry.coordinates);
    if (pts.length === 0) continue;
    const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const name = String(hit.properties?.suburbname ?? candidate);
    const pc = postcode ?? (hit.properties?.postcode ? String(hit.properties.postcode) : undefined);

    return {
      formatted: `${titleCase(name)} NSW${pc ? ` ${pc}` : ""}`,
      lat,
      lng,
      suburb: name,
    };
  }

  // The register holds gazetted addresses and suburb names only, so
  // landmarks and everyday names for places miss entirely — "Kings Cross" is
  // officially Potts Point, and has no entry at all. Nominatim knows both.
  const viaNominatim = await geocodeNominatim(input, signal);
  if (viaNominatim) return viaNominatim;

  throw new Error(`No NSW match for "${input}"`);
}

/**
 * OpenStreetMap's geocoder, used for anything the NSW register does not hold.
 *
 * Results are restricted to Australia and biased to NSW; anything landing
 * outside the state is rejected rather than quietly relocating the model.
 */
async function geocodeNominatim(
  input: string,
  signal?: AbortSignal,
): Promise<PrintPlace | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${input}, New South Wales, Australia`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "au");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) return null;

    const body = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    }>;
    const hit = body[0];
    if (!hit) return null;

    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -37.6 || lat > -28.1 || lng < 140.9 || lng > 153.7) return null;

    const addr = hit.address ?? {};
    const suburb = addr.suburb ?? addr.neighbourhood ?? addr.city_district ?? addr.town;
    const short = (hit.display_name ?? hit.name ?? input)
      .split(",")
      .slice(0, 3)
      .join(",")
      .trim();

    return {
      formatted: short,
      lat,
      lng,
      suburb: suburb ? suburb.toUpperCase() : undefined,
    };
  } catch {
    return null;
  }
}

function suburbFrom(address: string): string | undefined {
  const words = address.split(" ");
  const typeIndex = words.findIndex(
    (w, i) => i > 0 && Object.values(STREET_TYPES).includes(w),
  );
  if (typeIndex === -1 || typeIndex === words.length - 1) return undefined;
  return words.slice(typeIndex + 1).join(" ");
}
