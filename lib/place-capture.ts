import type { ModelDocumentInput, SourceSpec } from "@/lib/model-spec";

/**
 * Capturing a place from the browser.
 *
 * The bake itself runs on the server: a photogrammetric surface needs the
 * Google Maps key, which is not a public value, and the mapped variant is
 * kinder to OpenStreetMap coming from one identified origin than from every
 * visitor's browser. Progress streams back as NDJSON because a wide capture
 * is a thousand tile fetches, and a silent minute reads as a hung editor.
 */

export type PlaceSource = Extract<SourceSpec, { type: "place" }>;
export type PlaceCaptureKind = PlaceSource["capture"];

export type PlaceCaptureRequest = {
  lat: number;
  lng: number;
  radiusM: number;
  capture: PlaceCaptureKind;
  label?: string;
};

export type PlaceCaptureResult = {
  surface: NonNullable<PlaceSource["surface"]>;
  footprints?: NonNullable<PlaceSource["footprints"]>;
  roads?: NonNullable<PlaceSource["roads"]>;
  /** One line describing what was captured, for the editor to show. */
  note: string;
};

export type PlaceCaptureEvent =
  | { type: "progress"; stage: string; done: number; total: number }
  | ({ type: "result" } & PlaceCaptureResult)
  | { type: "error"; message: string };

export type PlaceSearchHit = {
  label: string;
  lat: number;
  lng: number;
  /** A radius that frames the result at a printable scale. */
  radiusM: number;
};

/** How wide a capture may be, per kind. Beyond this a print shows no detail. */
export const MAX_CAPTURE_RADIUS_M: Record<PlaceCaptureKind, number> = {
  surface: 1200,
  buildings: 4000,
};

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSearchHit[]> {
  const response = await fetch(`/api/place/search?q=${encodeURIComponent(query)}`, { signal });
  const body = (await response.json()) as { results?: PlaceSearchHit[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Place search failed.");
  return body.results ?? [];
}

export async function capturePlace(
  request: PlaceCaptureRequest,
  options: { onProgress?: (stage: string, done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<PlaceCaptureResult> {
  const response = await fetch("/api/place/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  // Validation and a missing key are refused before the stream opens.
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not capture this place.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: PlaceCaptureResult | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const event = JSON.parse(line) as PlaceCaptureEvent;
      if (event.type === "progress") options.onProgress?.(event.stage, event.done, event.total);
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "result") result = { surface: event.surface, footprints: event.footprints, roads: event.roads, note: event.note };
    }
    if (done) break;
  }

  // A stream that ends without a result means the connection dropped
  // mid-capture; reporting that beats leaving the document half-baked.
  if (!result) throw new Error("The capture ended before any data arrived.");
  return result;
}

/** Roughly how much room the captured data takes in the document, in bytes. */
export function captureBytes(source: Pick<PlaceSource, "surface" | "footprints" | "roads">): number {
  const base64 = (source.surface?.heights.length ?? 0) + (source.footprints?.data.length ?? 0) + (source.roads?.data.length ?? 0);
  return Math.round(base64 * 0.75);
}

/** Whether the document holds everything its capture kind needs to build. */
export function hasCapture(source: Pick<PlaceSource, "capture" | "surface" | "footprints">): boolean {
  if (!source.surface) return false;
  return source.capture === "buildings" ? Boolean(source.footprints) : true;
}

/**
 * A blank place for the editor.
 *
 * Everything except the capture: real coordinates, so the frame and plinth
 * build the moment the layer is added, and the ground arrives when someone
 * presses Capture. Mapped buildings are the default because they need no key,
 * so a fresh deployment can make a place straight away.
 *
 * This lives beside the capture client rather than with the shipped places so
 * the editor never pulls their baked ground into the browser.
 */
export function newPlaceSource(): PlaceSource {
  return {
    type: "place",
    label: "Sydney CBD",
    lat: -33.8688,
    lng: 151.2093,
    radiusM: 300,
    shape: "circle",
    capture: "buildings",
    size: 120,
    plinth: 4,
    frame: 3,
    frameHeight: 6,
    exaggeration: 1,
    resolution: 180,
    // A street reads at a millimetre of relief and prints in three layers at
    // 0.2 mm; deeper starts to look like a canyon at 1:5,000.
    roadRelief: 0.8,
    // A captured surface is blurred at its own peril: smoothing rounds off the
    // very edges that make a building read as a building at 1:5,000.
    smoothing: 0,
    bake: 0,
  };
}

/**
 * A captured place, as a finished document.
 *
 * One builder for every path that captures: the editor's panel patches the
 * source it already has, but the landing page, the assistant and anything
 * else that starts from nothing all want the same document around the same
 * baked data — and want it built in one place, so a default that changes
 * changes everywhere.
 */
export function placeCaptureDocument(options: {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  capture: PlaceCaptureKind;
  shape?: "circle" | "square";
  baked: Pick<PlaceCaptureResult, "surface" | "footprints" | "roads">;
}): ModelDocumentInput {
  const { name, lat, lng, radiusM, capture, shape = "circle", baked } = options;
  const document = newPlaceDocument() as ModelDocumentInput & { root: { source: PlaceSource } };
  return {
    ...document,
    name,
    description: `${name}, captured from the map and closed into a printable solid.`,
    root: {
      ...document.root,
      source: {
        ...newPlaceSource(),
        label: name,
        lat,
        lng,
        radiusM,
        capture,
        shape,
        surface: baked.surface,
        ...(baked.footprints ? { footprints: baked.footprints } : {}),
        ...(baked.roads ? { roads: baked.roads } : {}),
      },
    },
    metadata: { family: "place", capture },
  } as ModelDocumentInput;
}

export function newPlaceDocument(): ModelDocumentInput {
  return {
    version: "1.0",
    name: "New place",
    description: "A real place, captured from maps and printed as a solid.",
    units: "mm",
    root: { kind: "shape", id: "place", source: newPlaceSource(), modifiers: [], material: "pla-matte" },
    print: { buildVolume: [256, 256, 256], autoCenter: true, placeOnBed: true },
    display: {
      floor: true,
      grid: true,
      dimensions: { visible: true, width: true, height: true, offset: 9, precision: 1 },
    },
    metadata: { family: "place" },
  } satisfies ModelDocumentInput;
}
