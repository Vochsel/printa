/**
 * The places shipped with Printa.
 *
 * Each one is a landing page, a home-page example, and a starting document.
 * Keeping the roster in a single list means adding a city is one entry plus a
 * bake, rather than edits scattered across routes, demos and copy.
 */

export type CaptureKind = "surface" | "buildings";

export type PlaceEntry = {
  slug: string;
  /** Height multiplier, for places too flat to read at true scale. */
  exaggeration?: number;
  name: string;
  /** Where it is, for page titles and search. */
  region: string;
  lat: number;
  lng: number;
  radiusM: number;
  capture: CaptureKind;
  shape: "circle" | "square";
  /** One line for cards and meta descriptions. */
  blurb: string;
  /** A paragraph for the landing page. */
  about: string;
};

export const PLACES: PlaceEntry[] = [
  {
    slug: "sydney-cbd",
    name: "Sydney CBD",
    region: "New South Wales, Australia",
    lat: -33.8688,
    lng: 151.2093,
    radiusM: 300,
    capture: "surface",
    shape: "circle",
    blurb: "The towers around Martin Place, captured as a photogrammetric skyline.",
    about:
      "Six hundred metres of the Sydney central business district, taken from photogrammetry rather than mapped outlines — so the model keeps the roofline of every tower, the trees in the parks and the sweep of the harbour edge, at about 1:5,000.",
  },
  {
    slug: "sydney-opera-house",
    name: "Sydney Opera House",
    region: "Bennelong Point, New South Wales",
    lat: -33.8568,
    lng: 151.2153,
    radiusM: 250,
    capture: "surface",
    shape: "circle",
    blurb: "Bennelong Point and the shells, in printable relief.",
    about:
      "The shells at Bennelong Point with the harbour on three sides. A photogrammetric capture handles the sails far better than a footprint ever could — they are curved surfaces, not extruded outlines.",
  },
  {
    slug: "manhattan-midtown",
    name: "Midtown Manhattan",
    region: "New York, United States",
    lat: 40.7549,
    lng: -73.984,
    radiusM: 400,
    capture: "buildings",
    shape: "square",
    blurb: "The Midtown grid as clean extruded blocks.",
    about:
      "Eight hundred metres square around Times Square, built from mapped building outlines. The mapped capture suits a dense grid: every block comes out with crisp vertical walls and a flat roof, which reads more clearly at small scale than photogrammetry does.",
  },
  {
    slug: "bondi-beach",
    exaggeration: 2.2,
    name: "Bondi Beach",
    region: "New South Wales, Australia",
    lat: -33.8915,
    lng: 151.2767,
    radiusM: 400,
    capture: "surface",
    shape: "circle",
    blurb: "The bay, the headlands and the streets behind them.",
    about:
      "Bondi in relief: the curve of the bay, the cliffs at either end, and the ground rising steeply into the streets behind. A place where the terrain matters as much as the buildings.",
  },
  {
    slug: "london-city",
    name: "The City of London",
    region: "London, United Kingdom",
    lat: 51.5138,
    lng: -0.0896,
    radiusM: 350,
    capture: "buildings",
    shape: "circle",
    blurb: "The Square Mile, from mapped footprints.",
    about:
      "The Square Mile around St Paul's, extruded from OpenStreetMap outlines. Medieval street patterns and modern towers in the same model, with the ground sampled from open terrain data underneath.",
  },
  {
    slug: "san-francisco-downtown",
    name: "Downtown San Francisco",
    region: "California, United States",
    lat: 37.7909,
    lng: -122.4017,
    radiusM: 400,
    capture: "buildings",
    shape: "square",
    blurb: "Financial District blocks over real hills.",
    about:
      "The Financial District, where the mapped outlines sit on ground that genuinely moves — San Francisco's hills come through in the plinth, and buildings step up the slope rather than sitting on a flat plate.",
  },
];

export function getPlace(slug: string | null | undefined): PlaceEntry | null {
  if (!slug) return null;
  return PLACES.find((place) => place.slug === slug) ?? null;
}

/** Roughly what the printed model represents, as a 1:N ratio. */
export function placeScale(place: PlaceEntry, sizeMm = 120): number {
  return Math.round((place.radiusM * 2 * 1000) / sizeMm);
}
