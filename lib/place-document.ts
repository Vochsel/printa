import type { ModelDocumentInput } from "@/lib/model-spec";
import { BAKED_PLACES } from "@/lib/place-library.generated";
import { PLACES, type PlaceEntry } from "@/lib/place-library";

/**
 * Documents for the shipped places.
 *
 * A place is an ordinary model document — the same schema the editor, the MCP
 * tools and `/api/model/stl` already speak — so a landing page, a home-page
 * card and an editor session are all the same thing rendered differently.
 */

type Baked = {
  surface?: { grid: number; minM: number; maxM: number; heights: string };
  footprints?: { count: number; data: string };
  roads?: { count: number; data: string };
};

const printDefaults = {
  buildVolume: [256, 256, 256] as [number, number, number],
  autoCenter: true,
  placeOnBed: true,
};

export type PlaceOverrides = {
  size?: number;
  plinth?: number;
  frame?: number;
  frameHeight?: number;
  exaggeration?: number;
  resolution?: number;
  roadRelief?: number;
};

export function placeDocument(
  place: PlaceEntry,
  overrides: PlaceOverrides = {},
): ModelDocumentInput {
  const baked = (BAKED_PLACES as Record<string, Baked>)[place.slug] ?? {};

  return {
    version: "1.0",
    name: place.name,
    description: place.blurb,
    units: "mm",
    root: {
      kind: "shape",
      id: "place",
      source: {
        type: "place",
        label: place.name,
        lat: place.lat,
        lng: place.lng,
        radiusM: place.radiusM,
        shape: place.shape,
        capture: place.capture,
        size: overrides.size ?? 120,
        plinth: overrides.plinth ?? 4,
        frame: overrides.frame ?? 3,
        frameHeight: overrides.frameHeight ?? 6,
        // True to life. A dense city already has enough vertical range at
        // 1:5,000 — lifting it further turns three-hundred-metre towers into
        // spikes taller than the model is wide, which reads as a graph rather
        // than a place. Somewhere flat can raise this per document.
        exaggeration: overrides.exaggeration ?? place.exaggeration ?? 1,
        resolution: overrides.resolution ?? 180,
        // Streets stand a little proud of the ground, which is what makes a
        // mapped capture read as a city rather than as scattered blocks.
        roadRelief: overrides.roadRelief ?? 0.8,
        // No blur on a captured surface: it rounds the very edges that make a
        // building read as a building at this scale.
        smoothing: 0,
        ...(baked.surface ? { surface: baked.surface } : {}),
        ...(baked.footprints ? { footprints: baked.footprints } : {}),
        ...(baked.roads ? { roads: baked.roads } : {}),
      },
      modifiers: [],
      material: "pla-matte",
    },
    print: printDefaults,
    display: {
      floor: true,
      grid: true,
      dimensions: { visible: true, width: true, height: true, offset: 9, precision: 1 },
    },
    metadata: { family: "place", place: place.slug, capture: place.capture },
  } satisfies ModelDocumentInput;
}

/** Every shipped place as a ready document, keyed by slug. */
export const PLACE_DOCUMENTS: Record<string, ModelDocumentInput> = Object.fromEntries(
  PLACES.map((place) => [place.slug, placeDocument(place)]),
);
