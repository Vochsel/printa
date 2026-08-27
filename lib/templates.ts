import type { ModelDocumentInput, ModelNode, ModifierSpec, SourceSpec } from "@/lib/model-spec";

/**
 * The template catalogue.
 *
 * A template is an ordinary model document with a name, a category and a
 * paragraph explaining what it is for — so it is a gallery card, a landing
 * page, a `?demo=` id and an editor session at once, exactly like a place.
 * Nothing here is a special case in the compiler: every template is built by
 * the same pipeline that serves the editor and the MCP tools.
 *
 * They are written through the small builders below rather than as literal
 * documents, because a hundred hand-typed specs is a hundred chances to get a
 * wall thickness or a bevel wrong, and the builders carry printable defaults.
 */

export type TemplateCategory =
  | "vessels"
  | "lighting"
  | "signage"
  | "desk"
  | "jewellery"
  | "structural"
  | "organic"
  | "tabletop"
  | "kitchen"
  | "garden";

export type Template = {
  slug: string;
  name: string;
  /** One line for cards, search results and meta descriptions. */
  tagline: string;
  /** A paragraph for the template's own page. */
  about: string;
  category: TemplateCategory;
  tags: string[];
  document: ModelDocumentInput;
};

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, { name: string; blurb: string }> = {
  vessels: {
    name: "Vases & vessels",
    blurb: "Revolved profiles — vases, bowls, cups and carafes — shelled to a printable wall and closed at the base.",
  },
  lighting: {
    name: "Lighting",
    blurb: "Shades, diffusers and holders whose walls are thin enough to glow and thick enough to print without supports.",
  },
  signage: {
    name: "Signs & lettering",
    blurb: "Extruded type from any Google Font: door signs, house numbers, plaques, tags and cake toppers.",
  },
  desk: {
    name: "Desk & organisation",
    blurb: "Trays, stands, cups and clips for the things that end up loose on a desk.",
  },
  jewellery: {
    name: "Jewellery & small goods",
    blurb: "Rings, pendants, beads and charms at the scale where layer height starts to show.",
  },
  structural: {
    name: "Structural & test parts",
    blurb: "Lattices, brackets, spacers and calibration parts — the pieces that hold other pieces up.",
  },
  organic: {
    name: "Organic & sculptural",
    blurb: "Branching growth, cloth, ripples and poured fluid: forms that would be miserable to model by hand.",
  },
  tabletop: {
    name: "Tabletop & toys",
    blurb: "Pawns, bases, towers, tops and stacking pieces for the table.",
  },
  kitchen: {
    name: "Kitchen & dining",
    blurb: "Coasters, trivets, egg cups and napkin rings — small pieces that live on a table.",
  },
  garden: {
    name: "Garden & plants",
    blurb: "Planters, markers, trays and stakes, sized for real pots and real seedlings.",
  },
};

type Material = "pla-orange" | "pla-matte" | "pla-silk" | "petg" | "resin";
type Point = [number, number];

const printDefaults = {
  buildVolume: [256, 256, 256] as [number, number, number],
  autoCenter: true,
  placeOnBed: true,
};

const display = {
  floor: true,
  grid: true,
  dimensions: { visible: true, width: true, height: true, offset: 9, precision: 1 as const },
};

/** A revolved shell: the profile is [radius, height] from the base upward. */
function revolve(profile: Point[], extra: Partial<Record<string, unknown>> = {}): SourceSpec {
  return {
    type: "revolve",
    profile,
    segments: 160,
    profileSegments: 96,
    radiusOffset: 0,
    wall: 2.2,
    bottomCap: true,
    bottomThickness: 3,
    topCap: false,
    topThickness: 2.4,
    interpolation: "catmull-rom",
    axis: "z",
    ...extra,
  } as SourceSpec;
}

function primitive(shape: "box" | "cylinder" | "cone" | "sphere" | "torus", extra: Partial<Record<string, unknown>> = {}): SourceSpec {
  return { type: "primitive", shape, segments: 72, ...extra } as SourceSpec;
}

function text(content: string, extra: Partial<Record<string, unknown>> = {}): SourceSpec {
  return {
    type: "text",
    text: content,
    font: "Space Grotesk",
    size: 24,
    depth: 5,
    bevel: 0.5,
    bevelSegments: 3,
    curveSegments: 12,
    extrudeSegments: 1,
    bevelSide: "both",
    smoothNormals: true,
    textCase: "original",
    weight: "bold",
    italic: false,
    underline: false,
    ...extra,
  } as SourceSpec;
}

/** A closed outline from a point ring, for extrusion. */
function outline(points: Point[]) {
  return [
    { op: "move" as const, to: points[0] },
    ...points.slice(1).map((to) => ({ op: "line" as const, to })),
    { op: "close" as const },
  ];
}

function extrude(points: Point[], depth: number, extra: Partial<Record<string, unknown>> = {}, holes: Point[][] = []): SourceSpec {
  return {
    type: "extrude",
    path: { commands: outline(points), holes: holes.map(outline) },
    depth,
    bevel: 0.6,
    bevelSegments: 3,
    curveSegments: 12,
    direction: [0, 0, 1],
    ...extra,
  } as SourceSpec;
}

/** A regular polygon, flat-to-flat on the X axis when `rotationDeg` is 0. */
function polygon(sides: number, radius: number, rotationDeg = 0): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2 + (rotationDeg * Math.PI) / 180;
    return [Number((Math.cos(angle) * radius).toFixed(3)), Number((Math.sin(angle) * radius).toFixed(3))] as Point;
  });
}

function star(points: number, outer: number, inner: number): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    return [Number((Math.cos(angle) * radius).toFixed(3)), Number((Math.sin(angle) * radius).toFixed(3))] as Point;
  });
}

/** A rectangle with chamfered corners — close enough to a fillet at print scale. */
function roundedRect(width: number, height: number, corner: number): Point[] {
  const x = width / 2;
  const y = height / 2;
  const c = Math.min(corner, x - 0.1, y - 0.1);
  return [
    [-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c],
    [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c],
  ];
}

function circlePoints(radius: number, segments = 48): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return [Number((Math.cos(angle) * radius).toFixed(3)), Number((Math.sin(angle) * radius).toFixed(3))] as Point;
  });
}

function shape(id: string, source: SourceSpec, modifiers: ModifierSpec[] = [], material: Material = "pla-matte", transform?: Record<string, unknown>): ModelNode {
  return { kind: "shape", id, source, modifiers, material, ...(transform ? { transform } : {}) } as ModelNode;
}

function assembly(id: string, children: ModelNode[], modifiers: ModifierSpec[] = []): ModelNode {
  return { kind: "assembly", id, operation: "merge", children, modifiers } as ModelNode;
}

function repeat(id: string, count: number, child: ModelNode, step: Record<string, unknown>, modifiers: ModifierSpec[] = []): ModelNode {
  return { kind: "repeat", id, count, child, step, modifiers } as ModelNode;
}

type Entry = {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  category: TemplateCategory;
  tags: string[];
  root: ModelNode;
  /** Interior struts, for a shelled part that would otherwise flex. */
  struts?: { pattern: "cross" | "diamond" | "radial"; spacing?: number; diameter?: number };
};

function template(entry: Entry): Template {
  const { slug, name, tagline, about, category, tags, root, struts } = entry;
  return {
    slug,
    name,
    tagline,
    about,
    category,
    tags,
    document: {
      version: "1.0",
      name,
      description: tagline,
      units: "mm",
      root,
      print: struts
        ? {
            ...printDefaults,
            interiorStruts: {
              enabled: true,
              pattern: struts.pattern,
              spacing: struts.spacing ?? 18,
              diameter: struts.diameter ?? 1.8,
              boundaryInset: 3,
              wallOverlap: 0.8,
              radialSegments: 10,
            },
          }
        : printDefaults,
      display,
      metadata: { family: "template", template: slug, category },
    } satisfies ModelDocumentInput,
  };
}

export const TEMPLATES: Template[] = [
  // ── Vases & vessels ───────────────────────────────────────────────────────
  template({
    slug: "tapered-carafe",
    name: "Tapered carafe",
    tagline: "A tall water carafe with a soft shoulder and a returning lip.",
    about:
      "A single revolved profile shelled to 2.2 mm, which prints in one continuous perimeter with no supports and no infill. The shoulder falls inside 45° the whole way, so the overhang never needs help.",
    category: "vessels",
    tags: ["revolve", "vase", "watertight", "support-free"],
    root: shape("carafe", revolve([[26, 0], [30, 20], [33, 60], [24, 110], [20, 140], [23, 155]]), [], "pla-matte"),
  }),
  template({
    slug: "ribbed-bud-vase",
    name: "Ribbed bud vase",
    tagline: "Twenty-four fine vertical ribs on a small single-stem vase.",
    about:
      "Ribs at this pitch catch the light without adding print time: each one is a 1.4 mm displacement of the same revolved wall, so the slicer still sees a single closed perimeter.",
    category: "vessels",
    tags: ["revolve", "ribbed", "bud vase", "gift"],
    root: shape("bud", revolve([[18, 0], [24, 18], [28, 46], [22, 78], [17, 100], [20, 112]]), [
      { type: "radialWave", amplitude: 1.4, count: 24, phaseDeg: 0, axialTurns: 0 },
    ], "pla-silk"),
  }),
  template({
    slug: "wide-serving-bowl",
    name: "Wide serving bowl",
    tagline: "A shallow bowl with a thick base and a rolled edge.",
    about:
      "The base is 4 mm solid so the bowl sits without rocking, and the wall opens to 148 mm across — wide enough for fruit, still inside every common build plate.",
    category: "vessels",
    tags: ["revolve", "bowl", "kitchen", "wide"],
    root: shape("bowl", revolve([[30, 0], [52, 14], [68, 34], [74, 48]], { wall: 2.6, bottomThickness: 4 }), [], "pla-orange"),
  }),
  template({
    slug: "pedestal-fruit-bowl",
    name: "Pedestal fruit bowl",
    tagline: "A raised bowl on a waisted stem, turned from one profile.",
    about:
      "Stem and bowl are the same revolve, so there is no join to delaminate. The waist narrows to 20 mm, which is where the wall thickness doubles up and gives the piece its strength.",
    category: "vessels",
    tags: ["revolve", "bowl", "pedestal", "centrepiece"],
    root: shape("pedestal", revolve([[26, 0], [14, 10], [10, 30], [30, 48], [62, 72], [68, 86]], { wall: 2.6, bottomThickness: 4 }), [], "pla-matte"),
  }),
  template({
    slug: "everyday-tumbler",
    name: "Everyday tumbler",
    tagline: "A straight-sided cup with a 2.4 mm wall and a flat base.",
    about:
      "The simplest useful vessel there is: near-vertical walls, a solid base and no overhang at all. Print it in PETG if it is going to hold anything warm.",
    category: "vessels",
    tags: ["revolve", "cup", "tumbler", "beginner"],
    root: shape("tumbler", revolve([[30, 0], [31, 20], [32, 60], [33, 92]], { wall: 2.4, bottomThickness: 3.4 }), [], "petg"),
  }),
  template({
    slug: "pinch-pot",
    name: "Pinch pot",
    tagline: "A small hand-thrown shape with an inward-curling rim.",
    about:
      "Modelled on a thumb-pressed clay pot: the belly bulges past the mouth, which a lathe would struggle with and a revolved profile handles without comment.",
    category: "vessels",
    tags: ["revolve", "pot", "small", "ceramic"],
    root: shape("pinch", revolve([[18, 0], [26, 14], [30, 30], [22, 44], [20, 52]], { wall: 2.4 }), [], "pla-matte"),
  }),
  template({
    slug: "amphora-vase",
    name: "Amphora vase",
    tagline: "A classical shouldered jar with a flared neck.",
    about:
      "The profile follows a Greek storage jar: a narrow foot, a full belly at a third of the height and a neck that flares back out at the lip. 166 mm tall, printed upright.",
    category: "vessels",
    tags: ["revolve", "classical", "vase", "tall"],
    root: shape("amphora", revolve([[16, 0], [34, 26], [46, 64], [36, 110], [18, 140], [26, 158], [24, 166]]), [], "resin"),
  }),
  template({
    slug: "helix-twist-vase",
    name: "Helix twist vase",
    tagline: "Eight ribs carried around the vase by a 240° twist.",
    about:
      "The ribs are radial displacement and the spiral is a twist applied after them, so the ribs stay the same depth all the way up instead of thinning as they wind.",
    category: "vessels",
    tags: ["revolve", "twist", "spiral", "vase"],
    root: shape("helix", revolve([[24, 0], [30, 24], [33, 70], [29, 118], [24, 150]]), [
      { type: "radialWave", amplitude: 3.4, count: 8, phaseDeg: 0, axialTurns: 0 },
      { type: "twist", angleDeg: 240, start: 0, end: 1 },
    ], "pla-silk"),
  }),
  template({
    slug: "hourglass-vase",
    name: "Hourglass vase",
    tagline: "A pinched waist between two flares, in one continuous wall.",
    about:
      "A waist this tight is the one place a vase can lose strength, so the wall is 2.6 mm and the narrowest radius stays at 16 mm — enough section to survive being picked up full.",
    category: "vessels",
    tags: ["revolve", "vase", "sculptural"],
    root: shape("hourglass", revolve([[34, 0], [22, 40], [16, 72], [26, 110], [38, 148]], { wall: 2.6 }), [], "pla-orange"),
  }),
  template({
    slug: "fluted-column-vase",
    name: "Fluted column vase",
    tagline: "Twelve deep flutes running the full height of a straight vase.",
    about:
      "Flutes deep enough to read across a room — 4 mm — on a near-cylindrical body, which keeps every one of them printable without a support anywhere.",
    category: "vessels",
    tags: ["revolve", "fluted", "column", "architectural"],
    root: shape("fluted", revolve([[28, 0], [30, 18], [30, 100], [28, 140], [30, 150]]), [
      { type: "radialWave", amplitude: 4, count: 12, phaseDeg: 0, axialTurns: 0 },
    ], "pla-matte"),
  }),
  template({
    slug: "stepped-terrace-vase",
    name: "Stepped terrace vase",
    tagline: "Ten stacked terraces, each inset from the one below.",
    about:
      "Built by the contour step modifier rather than by drawing ten cylinders: each layer insets 1.4 mm and lifts 14 mm, so the whole stack stays one solid the slicer can walk in a single perimeter.",
    category: "vessels",
    tags: ["revolve", "stepped", "contour", "modern"],
    root: shape("terrace", revolve([[34, 0], [34, 6]], { wall: 2.6, profileSegments: 24 }), [
      { type: "step", levels: 10, axis: "z", distance: 14, inset: 1.4, twistDeg: 0 },
    ], "pla-matte"),
  }),
  template({
    slug: "wave-rim-vase",
    name: "Wave rim vase",
    tagline: "Four horizontal waves rippling up a cylindrical vessel.",
    about:
      "Axial waves make horizontal ripples, which is the one surface texture that hides layer lines instead of competing with them. Prints beautifully in a matte filament.",
    category: "vessels",
    tags: ["revolve", "ripple", "texture", "vase"],
    root: shape("wave", revolve([[28, 0], [30, 30], [30, 90], [27, 130]]), [
      { type: "axialWave", amplitude: 2.4, cycles: 4, phaseDeg: 0 },
    ], "pla-silk"),
  }),
  template({
    slug: "espresso-cup",
    name: "Espresso cup",
    tagline: "A 60 ml conical cup with a thick, stable base.",
    about:
      "Sized to a real single shot. Print it in PETG or a food-safe resin and seal it — plain PLA is fine for display but not for a hot drink.",
    category: "vessels",
    tags: ["revolve", "cup", "coffee", "small"],
    root: shape("espresso", revolve([[22, 0], [26, 18], [30, 46], [32, 58]], { wall: 2.4, bottomThickness: 4 }), [], "petg"),
  }),
  template({
    slug: "double-bulb-vase",
    name: "Double bulb vase",
    tagline: "Two stacked bulbs with a narrow pinch between them.",
    about:
      "Each bulb is a separate swell in the same profile, which reads as two shapes but prints as one wall — no seam where the two would otherwise meet.",
    category: "vessels",
    tags: ["revolve", "vase", "sculptural", "gourd"],
    root: shape("bulbs", revolve([[20, 0], [34, 22], [24, 44], [38, 74], [22, 104], [24, 116]]), [], "resin"),
  }),
  template({
    slug: "spiral-carafe",
    name: "Spiral carafe",
    tagline: "A carafe wrapped in a slow 260° spiral of soft flutes.",
    about:
      "Sixteen shallow flutes twisted almost three quarters of a turn. The twist is gentle enough that the spiral never overhangs its own wall, so the whole thing prints support-free.",
    category: "vessels",
    tags: ["revolve", "twist", "carafe", "spiral"],
    root: shape("spiral", revolve([[26, 0], [31, 26], [33, 74], [26, 122], [22, 150]]), [
      { type: "radialWave", amplitude: 2, count: 16, phaseDeg: 0, axialTurns: 0 },
      { type: "twist", angleDeg: 260, start: 0, end: 1 },
    ], "pla-silk"),
  }),
  template({
    slug: "hex-facet-vase",
    name: "Hex facet vase",
    tagline: "Six flat faces cut into a turned vase.",
    about:
      "A six-count radial wave at 5 mm reads as facets rather than ribs — the crisp, low-poly look, from a profile that is still perfectly round underneath.",
    category: "vessels",
    tags: ["revolve", "faceted", "geometric", "vase"],
    root: shape("facet", revolve([[26, 0], [32, 30], [34, 84], [27, 132]]), [
      { type: "radialWave", amplitude: 5, count: 6, phaseDeg: 0, axialTurns: 0 },
    ], "pla-orange"),
  }),

  // ── Lighting ──────────────────────────────────────────────────────────────
  template({
    slug: "contour-lampshade",
    name: "Contour lampshade",
    tagline: "Eight stacked contours over a wide conical shade.",
    about:
      "A 1.6 mm wall is thin enough for a warm LED to glow through and thick enough to stay rigid at 150 mm across. Sized for a standard E27 shade ring.",
    category: "lighting",
    tags: ["revolve", "lamp", "shade", "contour"],
    root: shape("shade", revolve([[36, 0], [42, 10]], { wall: 1.6, profileSegments: 24 }), [
      { type: "step", levels: 8, axis: "z", distance: 15, inset: -3.2, twistDeg: 3 },
    ], "pla-matte"),
  }),
  template({
    slug: "voronoi-pendant-shade",
    name: "Voronoi pendant shade",
    tagline: "A cell-wall shade that casts a scattered, organic pattern.",
    about:
      "The wire mode of the voronoi modifier replaces the surface with the boundaries between cells, so what prints is the cell network itself and the light comes through the gaps.",
    category: "lighting",
    tags: ["voronoi", "pendant", "lamp", "organic"],
    root: shape("cells", revolve([[30, 0], [46, 34], [52, 68], [44, 96]], { wall: 3, profileSegments: 64 }), [
      { type: "voronoi", amplitude: 2.2, scale: 20, seed: 4, mode: "wire", contrast: 1.6 },
    ], "pla-matte"),
  }),
  template({
    slug: "dome-pendant",
    name: "Dome pendant",
    tagline: "A plain hemispherical pendant shade with a rolled rim.",
    about:
      "The quiet one: a clean half-dome whose only detail is a thickened lip. Everything about it is designed to disappear behind the light it holds.",
    category: "lighting",
    tags: ["revolve", "pendant", "minimal", "lamp"],
    root: shape("dome", revolve([[8, 0], [30, 6], [50, 26], [58, 52], [60, 62]], { wall: 1.8 }), [], "pla-matte"),
  }),
  template({
    slug: "lattice-sconce",
    name: "Lattice sconce",
    tagline: "A wall sconce built from a seeded strut lattice.",
    about:
      "A cellular lattice makes a light fitting that is mostly air: 2.2 mm struts on an 18 mm cell, which is rigid in every direction and uses barely any filament.",
    category: "lighting",
    tags: ["cellular", "lattice", "sconce", "wall"],
    root: shape("sconce", { type: "cellular", width: 90, depth: 40, height: 130, cellSize: 18, strutDiameter: 2.4, jitter: 0.55, neighbors: 3, seed: 12, radialSegments: 8 } as SourceSpec, [], "pla-matte"),
  }),
  template({
    slug: "tealight-holder",
    name: "Tealight holder",
    tagline: "A cupped holder sized to a standard 39 mm tealight.",
    about:
      "The inner well is 40 mm across and 14 mm deep, which takes an aluminium tealight cup with a little clearance. Cell texture on the outside breaks the light up as it rises.",
    category: "lighting",
    tags: ["candle", "tealight", "voronoi", "holder"],
    root: shape("tealight", revolve([[24, 0], [26, 10], [27, 24], [25, 32]], { wall: 3, bottomThickness: 4 }), [
      { type: "voronoi", amplitude: 1.1, scale: 12, seed: 9, mode: "cells", contrast: 1.4 },
    ], "pla-orange"),
  }),
  template({
    slug: "candle-chimney",
    name: "Candle chimney",
    tagline: "A tall fluted sleeve that stands a candle inside a draught.",
    about:
      "Twenty flutes on a straight tube. Because the wall never leans, the chimney prints as one perimeter from base to rim with nothing bridging anywhere.",
    category: "lighting",
    tags: ["candle", "fluted", "revolve", "chimney"],
    root: shape("chimney", revolve([[32, 0], [33, 12], [33, 120], [32, 132]], { wall: 2, bottomCap: false }), [
      { type: "radialWave", amplitude: 2.2, count: 20, phaseDeg: 0, axialTurns: 0 },
    ], "pla-matte"),
  }),
  template({
    slug: "diffuser-cone",
    name: "Diffuser cone",
    tagline: "A thin conical diffuser for a downward-facing bulb.",
    about:
      "1.4 mm of white PLA diffuses a bare LED into something you can look at. The cone angle stays under 45° from vertical so it needs no support at any point.",
    category: "lighting",
    tags: ["revolve", "diffuser", "cone", "lamp"],
    root: shape("diffuser", revolve([[14, 0], [22, 20], [40, 62], [56, 104]], { wall: 1.4, bottomCap: false }), [], "pla-matte"),
  }),
  template({
    slug: "ring-stack-lamp",
    name: "Ring stack lamp",
    tagline: "Twelve tori stacked and rotated into a slotted column.",
    about:
      "A repeat node stacks the same ring twelve times, turning each one 14° as it goes. Light escapes through the gaps between rings rather than through the material.",
    category: "lighting",
    tags: ["repeat", "rings", "lamp", "column"],
    root: repeat("stack", 12, shape("ring", primitive("torus", { radius: 34, tube: 5 }), [], "pla-silk"), { translate: [0, 0, 11], rotate: [0, 0, 14], scale: 0.98 }),
  }),
  template({
    slug: "mood-column",
    name: "Mood column",
    tagline: "A softly roughened cylinder that glows from within.",
    about:
      "Noise displacement at a 9 mm feature size gives a surface like handmade paper. It hides layer lines completely, which matters when a light source is sitting behind them.",
    category: "lighting",
    tags: ["noise", "column", "texture", "lamp"],
    root: shape("column", revolve([[30, 0], [31, 20], [31, 130], [30, 150]], { wall: 1.8, bottomCap: false }), [
      { type: "noise", amplitude: 0.9, scale: 9, seed: 6 },
    ], "pla-matte"),
  }),
  template({
    slug: "pleated-shade",
    name: "Pleated shade",
    tagline: "Thirty sharp pleats, like a folded paper lantern.",
    about:
      "A high-count radial wave at low amplitude turns the wall into a concertina. The pleats stiffen a 1.5 mm shell enough that it holds its shape at 160 mm across.",
    category: "lighting",
    tags: ["pleated", "shade", "paper", "lamp"],
    root: shape("pleats", revolve([[32, 0], [44, 30], [56, 66], [62, 92]], { wall: 1.5, bottomCap: false }), [
      { type: "radialWave", amplitude: 2.6, count: 30, phaseDeg: 0, axialTurns: 0 },
    ], "pla-matte"),
  }),

  // ── Signs & lettering ─────────────────────────────────────────────────────
  template({
    slug: "door-name-sign",
    name: "Door name sign",
    tagline: "Raised lettering on a rounded plate, ready to glue to a door.",
    about:
      "The plate and the letters are one merged solid, so the sign prints face-down in a single piece and the letters are never a separate part to align.",
    category: "signage",
    tags: ["text", "sign", "door", "plaque"],
    root: assembly("sign", [
      shape("plate", extrude(roundedRect(120, 42, 8), 4), [], "pla-matte"),
      shape("letters", text("Studio", { height: 18, depth: 3 }), [], "pla-orange", { translate: [0, 0, 4] }),
    ]),
  }),
  template({
    slug: "house-number",
    name: "House number",
    tagline: "Three large digits with a mounting backplate.",
    about:
      "Digits at 60 mm read from the street. The backplate is 5 mm so it can take a countersunk screw at each end without the head standing proud of the face.",
    category: "signage",
    tags: ["text", "number", "outdoor", "house"],
    root: assembly("number", [
      shape("back", extrude(roundedRect(150, 84, 10), 5), [], "pla-matte"),
      shape("digits", text("42", { height: 56, depth: 4, font: "Archivo Black" }), [], "pla-orange", { translate: [0, 0, 5] }),
    ]),
  }),
  template({
    slug: "shelf-letters",
    name: "Shelf letters",
    tagline: "Free-standing letters with a deep base, for a shelf or mantel.",
    about:
      "Extruded 18 mm deep so they stand on their own without a stand. Any of the 1,900-odd Google Fonts can be swapped in from the editor.",
    category: "signage",
    tags: ["text", "letters", "shelf", "decor"],
    root: shape("letters", text("HOME", { height: 60, depth: 18, textCase: "uppercase", bevel: 1 }), [], "pla-silk"),
  }),
  template({
    slug: "desk-nameplate",
    name: "Desk nameplate",
    tagline: "A wedge-profile nameplate that tilts the text toward the reader.",
    about:
      "The wedge is an extruded triangle and the text sits on its face at 12°, which is the angle at which a nameplate reads from a standing visitor rather than from the ceiling.",
    category: "signage",
    tags: ["text", "nameplate", "desk", "office"],
    root: assembly("nameplate", [
      shape("wedge", extrude([[-80, 0], [80, 0], [80, 26], [-80, 26]], 40), [], "pla-matte", { rotate: [70, 0, 0] }),
      shape("name", text("Ada Lovelace", { height: 12, depth: 3, weight: "bold" }), [], "pla-orange", { translate: [0, -8, 26], rotate: [20, 0, 0] }),
    ]),
  }),
  template({
    slug: "luggage-tag",
    name: "Luggage tag",
    tagline: "A tag with a strap slot and your name cut into the face.",
    about:
      "The slot is a hole in the outline rather than a separate cut, so the tag prints flat as one closed solid with no bridging over the opening.",
    category: "signage",
    tags: ["text", "tag", "travel", "keychain"],
    root: assembly("tag", [
      shape("body", extrude(roundedRect(88, 40, 6), 3.5, {}, [roundedRect(14, 5, 2).map(([x, y]) => [x - 32, y] as Point)]), [], "petg"),
      shape("name", text("A. Turing", { height: 11, depth: 1.6 }), [], "pla-orange", { translate: [6, 0, 3.5] }),
    ]),
  }),
  template({
    slug: "cake-topper",
    name: "Cake topper",
    tagline: "Curved lettering on two spikes, sized for a 20 cm cake.",
    about:
      "The bend modifier curves the whole word by 26°, which is what makes a topper sit over a domed cake instead of hovering above it at the ends.",
    category: "signage",
    tags: ["text", "cake", "party", "topper"],
    root: assembly("topper", [
      shape("word", text("Happy", { height: 26, depth: 3, font: "Pacifico" }), [
        { type: "bend", angleDeg: 26, directionDeg: 0 },
      ], "pla-silk", { translate: [0, 0, 34] }),
      shape("legs", primitive("box", { width: 3, depth: 3, height: 36 }), [], "pla-silk", { translate: [-24, 0, 18] }),
      shape("legs-right", primitive("box", { width: 3, depth: 3, height: 36 }), [], "pla-silk", { translate: [24, 0, 18] }),
    ]),
  }),
  template({
    slug: "wall-word-art",
    name: "Wall word art",
    tagline: "A thin script word for hanging flat against a wall.",
    about:
      "6 mm deep, which is enough to cast a shadow line under a downlight and light enough to hang on a single strip of adhesive.",
    category: "signage",
    tags: ["text", "script", "wall", "decor"],
    root: shape("word", text("breathe", { height: 44, depth: 6, font: "Dancing Script", weight: "regular", bevel: 0.4 }), [], "pla-matte"),
  }),
  template({
    slug: "monogram-coaster",
    name: "Monogram coaster",
    tagline: "A single initial recessed into a round coaster.",
    about:
      "The letter sits proud of a 4 mm disc, so a glass rests on the letter rather than on the disc — which is exactly what stops it sticking when it is wet.",
    category: "signage",
    tags: ["text", "monogram", "coaster", "gift"],
    root: assembly("monogram", [
      shape("disc", extrude(circlePoints(45), 4), [], "pla-matte"),
      shape("initial", text("M", { height: 30, depth: 2, font: "Playfair Display" }), [], "resin", { translate: [0, 0, 4] }),
    ]),
  }),
  template({
    slug: "bookmark-tag",
    name: "Bookmark tag",
    tagline: "A slim flexible bookmark with a punched hole.",
    about:
      "Printed in PETG at 1.2 mm it flexes with the page instead of creasing it. Any word up to about twelve characters fits the length.",
    category: "signage",
    tags: ["text", "bookmark", "thin", "petg"],
    root: assembly("bookmark", [
      shape("strip", extrude(roundedRect(140, 26, 8), 1.2, { bevel: 0.2 }, [circlePoints(3, 16).map(([x, y]) => [x - 60, y] as Point)]), [], "petg"),
      shape("word", text("Read", { height: 12, depth: 1 }), [], "pla-orange", { translate: [10, 0, 1.2] }),
    ]),
  }),
  template({
    slug: "plant-label",
    name: "Plant label",
    tagline: "A stake with the plant name raised on its face.",
    about:
      "The stake tapers to a point so it goes into soil without splitting, and the label face is angled up 15° so it reads from standing height.",
    category: "signage",
    tags: ["text", "garden", "label", "stake"],
    root: assembly("label", [
      shape("stake", extrude([[-9, 0], [9, 0], [0, -70]], 3), [], "petg"),
      shape("face", extrude(roundedRect(64, 26, 4), 3), [], "petg", { translate: [0, 22, 0] }),
      shape("name", text("Basil", { height: 11, depth: 1.4 }), [], "pla-orange", { translate: [0, 22, 3] }),
    ]),
  }),
  template({
    slug: "gift-message-card",
    name: "Gift message card",
    tagline: "A card-sized plaque with a short message and a border.",
    about:
      "A raised border keeps the message from being smudged by a thumb, and the whole thing prints flat in under an hour.",
    category: "signage",
    tags: ["text", "gift", "card", "plaque"],
    root: assembly("card", [
      shape("card-body", extrude(roundedRect(90, 58, 5), 3), [], "pla-matte"),
      shape("border", extrude(roundedRect(84, 52, 4), 1.2, {}, [roundedRect(78, 46, 3)]), [], "pla-matte", { translate: [0, 0, 3] }),
      shape("message", text("Thank you", { height: 10, depth: 1.4 }), [], "pla-orange", { translate: [0, 0, 3] }),
    ]),
  }),
  template({
    slug: "shop-open-sign",
    name: "Shop open sign",
    tagline: "A hanging sign with cut-through letters and two cord holes.",
    about:
      "Letters are merged proud of the plate rather than cut through it, which keeps the sign readable from both sides when it swings.",
    category: "signage",
    tags: ["text", "shop", "hanging", "sign"],
    root: assembly("open-sign", [
      shape("board", extrude(roundedRect(140, 60, 10), 4, {}, [
        circlePoints(3.5, 16).map(([x, y]) => [x - 55, y + 22] as Point),
        circlePoints(3.5, 16).map(([x, y]) => [x + 55, y + 22] as Point),
      ]), [], "pla-matte"),
      shape("word", text("OPEN", { height: 26, depth: 3, textCase: "uppercase", font: "Archivo Black" }), [], "pla-orange", { translate: [0, -6, 4] }),
    ]),
  }),

  // ── Desk & organisation ───────────────────────────────────────────────────
  template({
    slug: "pen-cup",
    name: "Pen cup",
    tagline: "A straight cup with a weighted base, sized for a fistful of pens.",
    about:
      "80 mm tall and 72 mm across: deep enough that a pen cannot tip it and wide enough for scissors. The base is 5 mm solid, which is most of the ballast it needs.",
    category: "desk",
    tags: ["revolve", "cup", "pens", "office"],
    root: shape("pen-cup", revolve([[36, 0], [36, 12], [35, 70], [36, 80]], { wall: 2.4, bottomThickness: 5 }), [], "pla-matte"),
  }),
  template({
    slug: "hex-pen-tray",
    name: "Hex pen tray",
    tagline: "A shallow six-sided tray for pens, clips and keys.",
    about:
      "A hexagon tessellates, so two or three of these sit together on a desk with no wasted space between them.",
    category: "desk",
    tags: ["extrude", "tray", "hexagon", "desk"],
    root: shape("tray", extrude(polygon(6, 62), 22, {}, [polygon(6, 58)]), [], "pla-matte"),
  }),
  template({
    slug: "phone-stand",
    name: "Phone stand",
    tagline: "A wedge stand with a lip and a charging cable channel.",
    about:
      "The face leans at 62°, which holds a phone upright for video calls without it sliding. The channel behind the lip clears a plugged-in cable.",
    category: "desk",
    tags: ["extrude", "phone", "stand", "desk"],
    root: shape("stand", extrude([[-40, 0], [40, 0], [40, 8], [10, 8], [-14, 58], [-26, 58], [-40, 16]], 70), [], "petg", { rotate: [90, 0, 0] }),
  }),
  template({
    slug: "cable-clip",
    name: "Cable clip",
    tagline: "A C-clip that holds two cables against a desk edge.",
    about:
      "Printed in PETG the arms flex enough to snap over a 6 mm cable and hold it. Four of them fit on a plate in ten minutes.",
    category: "desk",
    tags: ["extrude", "cable", "clip", "petg"],
    root: shape("clip", extrude([[-14, 0], [14, 0], [14, 20], [8, 20], [8, 6], [-8, 6], [-8, 20], [-14, 20]], 16), [], "petg"),
  }),
  template({
    slug: "headphone-hook",
    name: "Headphone hook",
    tagline: "An under-desk hook with a wide saddle for a headband.",
    about:
      "The saddle is 34 mm wide so a padded headband rests on it without being pressed into a groove — the thing that eventually cracks the padding.",
    category: "desk",
    tags: ["extrude", "hook", "headphones", "desk"],
    root: shape("hook", extrude([[-10, 0], [10, 0], [10, 56], [46, 56], [46, 40], [58, 40], [58, 68], [-10, 68]], 34), [], "petg", { rotate: [90, 0, 0] }),
  }),
  template({
    slug: "card-holder",
    name: "Business card holder",
    tagline: "An angled block that presents a stack of cards.",
    about:
      "The slot is 20 mm deep and 92 mm wide, which takes a standard 85 × 55 mm card with clearance, and the front is cut away so the top card can be lifted with a thumb.",
    category: "desk",
    tags: ["extrude", "cards", "office", "holder"],
    root: shape("holder", extrude([[-46, 0], [46, 0], [46, 34], [34, 34], [34, 10], [-34, 10], [-34, 34], [-46, 34]], 62), [], "pla-matte"),
  }),
  template({
    slug: "desk-tidy-tray",
    name: "Desk tidy tray",
    tagline: "A three-compartment tray with rounded internal corners.",
    about:
      "Three wells in one printed piece, with 3 mm dividers. The corners are chamfered so a fingertip can get under whatever is in the bottom.",
    category: "desk",
    tags: ["extrude", "tray", "organiser", "desk"],
    root: assembly("tidy", [
      shape("outer", extrude(roundedRect(180, 90, 8), 26, {}, [roundedRect(174, 84, 6)]), [], "pla-matte"),
      shape("divider-left", primitive("box", { width: 3, depth: 84, height: 22 }), [], "pla-matte", { translate: [-30, 0, 11] }),
      shape("divider-right", primitive("box", { width: 3, depth: 84, height: 22 }), [], "pla-matte", { translate: [30, 0, 11] }),
      shape("floor-plate", extrude(roundedRect(180, 90, 8), 3), [], "pla-matte"),
    ]),
  }),
  template({
    slug: "monitor-riser-block",
    name: "Monitor riser block",
    tagline: "A stackable hollow block that lifts a monitor foot 40 mm.",
    about:
      "Hollow with a diamond strut lattice inside, so it takes the weight of a monitor at a fraction of the filament a solid block would need. Print two and stack them for 80 mm.",
    category: "desk",
    tags: ["structural", "riser", "monitor", "struts"],
    root: shape("riser", extrude(roundedRect(104, 104, 8), 40, {}, [roundedRect(98, 98, 7)]), [], "pla-matte"),
    struts: { pattern: "diamond", spacing: 16, diameter: 2.4 },
  }),
  template({
    slug: "paperweight-pebble",
    name: "Paperweight pebble",
    tagline: "A roughened ellipsoid meant to be printed solid and heavy.",
    about:
      "Slice it at 100% infill and it comes out around 300 g — enough to hold a stack of paper in a breeze. The noise surface hides every layer line.",
    category: "desk",
    tags: ["primitive", "noise", "paperweight", "solid"],
    root: shape("pebble", primitive("sphere", { width: 84, depth: 60, height: 46 }), [
      { type: "noise", amplitude: 1.6, scale: 16, seed: 3 },
    ], "pla-matte"),
  }),
  template({
    slug: "sticky-note-holder",
    name: "Sticky note holder",
    tagline: "A weighted base with a 76 mm well for a sticky note pad.",
    about:
      "The well is a hair over 76 mm square, and the front wall is cut down to 6 mm so the top sheet can be peeled off in one motion.",
    category: "desk",
    tags: ["extrude", "sticky notes", "office", "holder"],
    root: assembly("notes", [
      shape("well", extrude(roundedRect(84, 84, 5), 18, {}, [roundedRect(77.5, 77.5, 4)]), [], "pla-orange"),
      shape("base-plate", extrude(roundedRect(84, 84, 5), 3), [], "pla-orange"),
    ]),
  }),
  template({
    slug: "pencil-topper",
    name: "Pencil topper",
    tagline: "A faceted cap that presses onto a standard hex pencil.",
    about:
      "The bore is a 7.6 mm hexagon, which is a press fit on a standard pencil once the printed part has a layer or two of tolerance.",
    category: "desk",
    tags: ["extrude", "pencil", "small", "fun"],
    root: shape("topper", extrude(polygon(6, 11), 24, { bevel: 1.2 }, [polygon(6, 3.8)]), [], "pla-silk"),
  }),
  template({
    slug: "cable-grommet",
    name: "Cable grommet",
    tagline: "A two-part grommet ring for a 60 mm desk hole.",
    about:
      "A flanged ring that drops into a standard 60 mm cable hole and tidies the edge. The flange is 4 mm so it sits flush against the desk surface.",
    category: "desk",
    tags: ["revolve", "grommet", "cable", "desk"],
    root: shape("grommet", revolve([[34, 0], [34, 4], [29, 4], [29, 22]], { wall: 2.6, bottomCap: false, profileSegments: 40 }), [], "pla-matte"),
  }),

  // ── Jewellery & small goods ───────────────────────────────────────────────
  template({
    slug: "twisted-bangle",
    name: "Twisted bangle",
    tagline: "A wide bangle with eight ribs carried through a half turn.",
    about:
      "65 mm inside diameter, which fits most wrists. Printed flat on the bed the ribs need no support, and a silk filament makes the twist obvious from across a room.",
    category: "jewellery",
    tags: ["revolve", "bangle", "twist", "wearable"],
    root: shape("bangle", revolve([[36, 0], [38, 6], [38, 16], [36, 22]], { wall: 3, bottomCap: false, profileSegments: 40 }), [
      { type: "radialWave", amplitude: 1.6, count: 8, phaseDeg: 0, axialTurns: 0 },
      { type: "twist", angleDeg: 180, start: 0, end: 1 },
    ], "pla-silk"),
  }),
  template({
    slug: "voronoi-pendant",
    name: "Voronoi pendant",
    tagline: "A cell-textured disc pendant with a bail hole.",
    about:
      "The cell pattern is seeded, so the same seed always prints the same pendant — and changing the seed by one gives a piece nobody else has.",
    category: "jewellery",
    tags: ["voronoi", "pendant", "necklace", "seeded"],
    root: shape("pendant", extrude(circlePoints(21), 4, { bevel: 0.8 }, [circlePoints(2.2, 16).map(([x, y]) => [x, y + 17] as Point)]), [
      { type: "voronoi", amplitude: 0.9, scale: 7, seed: 21, mode: "cells", contrast: 1.6 },
    ], "resin"),
  }),
  template({
    slug: "hoop-earrings",
    name: "Hoop earrings",
    tagline: "A pair of light 30 mm hoops with a 2 mm section.",
    about:
      "Thin enough to be worn all day at about a gram each. Print them flat and cut the sprue at the top for the wire.",
    category: "jewellery",
    tags: ["primitive", "torus", "earrings", "pair"],
    root: assembly("hoops", [
      shape("hoop-left", primitive("torus", { radius: 15, tube: 1.1, segments: 96 }), [], "pla-silk", { translate: [-20, 0, 0] }),
      shape("hoop-right", primitive("torus", { radius: 15, tube: 1.1, segments: 96 }), [], "pla-silk", { translate: [20, 0, 0] }),
    ]),
  }),
  template({
    slug: "coral-knot-pendant",
    name: "Coral knot pendant",
    tagline: "A tiny branching growth, grown rather than modelled.",
    about:
      "The organic source grows a deterministic trunk into branches, then unifies the whole thing into one smooth printable surface. Every seed is a different pendant.",
    category: "jewellery",
    tags: ["organic", "pendant", "branching", "seeded"],
    root: shape("knot", { type: "organic", width: 26, depth: 26, height: 34, trunkDiameter: 4.4, levels: 3, branching: 2, angleDeg: 38, twistDeg: 137.5, taper: 0.7, seed: 5, radialSegments: 9, surfaceResolution: 56, smoothness: 0.8 } as SourceSpec, [], "resin"),
  }),
  template({
    slug: "charm-cube",
    name: "Charm cube",
    tagline: "A bevelled cube charm with a threading hole.",
    about:
      "12 mm on a side with a 2.4 mm bore through the middle, so it threads onto a cord. Good practice for tuning small-part tolerances.",
    category: "jewellery",
    tags: ["extrude", "charm", "cube", "small"],
    root: shape("charm", extrude(roundedRect(12, 12, 2.4), 12, { bevel: 0.8 }, [circlePoints(1.2, 16)]), [], "pla-orange"),
  }),
  template({
    slug: "bead-set",
    name: "Bead set",
    tagline: "Eight faceted beads in a row, ready to cut apart.",
    about:
      "A repeat node lays out the same bead eight times with a small rotation between them, so one print gives a whole strand.",
    category: "jewellery",
    tags: ["repeat", "beads", "strand", "set"],
    root: repeat("beads", 8, shape("bead", extrude(polygon(6, 6), 8, { bevel: 0.9 }, [circlePoints(1.4, 12)]), [], "pla-silk"), { translate: [15, 0, 0], rotate: [0, 0, 22], scale: 1 }),
  }),
  template({
    slug: "signet-blank",
    name: "Signet blank",
    tagline: "A ring with a flat oval face to carve or emboss.",
    about:
      "19 mm inside diameter with a 14 × 11 mm face. Add text or a monogram in the editor and it merges into the ring as one solid.",
    category: "jewellery",
    tags: ["revolve", "ring", "signet", "blank"],
    root: assembly("signet", [
      shape("band", revolve([[9.5, 0], [11.4, 0], [11.4, 7], [9.5, 7]], { wall: 1.9, bottomCap: false, profileSegments: 24, segments: 96 }), [], "resin"),
      shape("face", primitive("cylinder", { width: 14, depth: 11, height: 3 }), [], "resin", { translate: [0, 0, 3.5], rotate: [90, 0, 0] }),
    ]),
  }),
  template({
    slug: "cuff-bracelet",
    name: "Cuff bracelet",
    tagline: "An open cuff with a rippled surface, printed on its side.",
    about:
      "The gap lets it flex onto a wrist without a clasp. Axial waves run around the cuff, which stiffens it against being crushed flat.",
    category: "jewellery",
    tags: ["revolve", "cuff", "bracelet", "flexible"],
    root: shape("cuff", revolve([[30, 0], [31, 4], [31, 26], [30, 30]], { wall: 2.4, bottomCap: false, segments: 120, profileSegments: 36 }), [
      { type: "axialWave", amplitude: 1.1, cycles: 3, phaseDeg: 0 },
    ], "petg"),
  }),
  template({
    slug: "star-brooch",
    name: "Star brooch",
    tagline: "A six-point star with a bevelled face and a pin channel.",
    about:
      "The bevel catches light along every edge, which is what makes a flat printed part look cut rather than extruded.",
    category: "jewellery",
    tags: ["extrude", "star", "brooch", "bevel"],
    root: shape("brooch", extrude(star(6, 24, 11), 4, { bevel: 1.2, bevelSegments: 4 }), [], "pla-silk"),
  }),
  template({
    slug: "stacking-rings",
    name: "Stacking rings",
    tagline: "Three thin bands that sit together on one finger.",
    about:
      "Each band is 2 mm wide, so all three together read as one wide ring but move independently. Sized 18.2 mm inside — a US 8.",
    category: "jewellery",
    tags: ["repeat", "rings", "stacking", "set"],
    root: repeat("stack", 3, shape("band", revolve([[9.1, 0], [10.6, 0], [10.6, 2], [9.1, 2]], { wall: 1.5, bottomCap: false, profileSegments: 16, segments: 96 }), [], "pla-silk"), { translate: [24, 0, 0], rotate: [0, 0, 0], scale: 1 }),
  }),

  // ── Structural & test parts ───────────────────────────────────────────────
  template({
    slug: "lattice-cube",
    name: "Lattice cube",
    tagline: "A 70 mm seeded strut lattice — light, rigid, no infill needed.",
    about:
      "A stratified cell network connects nearest sites into struts, which is stiffer per gram than any infill pattern a slicer can generate because the struts run in three dimensions.",
    category: "structural",
    tags: ["cellular", "lattice", "lightweight", "engineering"],
    root: shape("lattice", { type: "cellular", width: 70, depth: 70, height: 70, cellSize: 17, strutDiameter: 2.4, jitter: 0.6, neighbors: 3, seed: 1, radialSegments: 8 } as SourceSpec, [], "pla-orange"),
  }),
  template({
    slug: "lattice-column",
    name: "Lattice column",
    tagline: "A tall lattice post for load tests and display stands.",
    about:
      "Same lattice, stretched to 180 mm. It is the fastest way to see whether your printer's cooling can keep up with small cross-sections at height.",
    category: "structural",
    tags: ["cellular", "column", "test", "tall"],
    root: shape("column", { type: "cellular", width: 46, depth: 46, height: 180, cellSize: 15, strutDiameter: 2.6, jitter: 0.5, neighbors: 3, seed: 7, radialSegments: 8 } as SourceSpec, [], "pla-matte"),
  }),
  template({
    slug: "corner-bracket",
    name: "Corner bracket",
    tagline: "A right-angle bracket with three screw holes per leg.",
    about:
      "5 mm thick with a gusset in the corner, which is where a printed bracket fails first because the layers run across the load.",
    category: "structural",
    tags: ["extrude", "bracket", "hardware", "functional"],
    root: shape("bracket", extrude([[0, 0], [60, 0], [60, 8], [8, 8], [8, 60], [0, 60]], 40), [], "petg"),
  }),
  template({
    slug: "spacer-set",
    name: "Spacer set",
    tagline: "Six stacking washers from 2 mm to 12 mm.",
    about:
      "A repeat with a scale step, so each washer is slightly thicker than the last. Print once and keep the set in a drawer.",
    category: "structural",
    tags: ["repeat", "spacer", "washer", "set"],
    root: repeat("spacers", 6, shape("washer", extrude(circlePoints(14), 2, { bevel: 0.3 }, [circlePoints(5)]), [], "petg"), { translate: [32, 0, 0], rotate: [0, 0, 0], scale: 1.12 }),
  }),
  template({
    slug: "gear-disc",
    name: "Gear disc",
    tagline: "A twenty-tooth display gear with a keyed bore.",
    about:
      "Teeth from a radial wave rather than an involute profile — decorative rather than driving, but it prints crisply at any size and meshes well enough for a demonstration.",
    category: "structural",
    tags: ["primitive", "gear", "mechanical", "display"],
    root: shape("gear", primitive("cylinder", { radius: 40, height: 10, segments: 160 }), [
      { type: "radialWave", amplitude: 3.2, count: 20, phaseDeg: 0, axialTurns: 0 },
    ], "pla-orange"),
  }),
  template({
    slug: "calibration-cube",
    name: "Calibration cube",
    tagline: "The 20 mm cube, with a chamfered base to stop elephant's foot.",
    about:
      "Print it, measure all three axes with calipers, and correct your steps. The 0.6 mm base chamfer keeps the first layer from widening the measurement.",
    category: "structural",
    tags: ["primitive", "calibration", "test", "beginner"],
    root: shape("cube", extrude(roundedRect(20, 20, 1.2), 20, { bevel: 0.6 }), [], "pla-matte"),
  }),
  template({
    slug: "overhang-test",
    name: "Overhang test",
    tagline: "A stepped fin that walks from 30° to 70° of overhang.",
    about:
      "Five fins at increasing angles. Whichever one starts drooping tells you where this filament and this cooling fan give up.",
    category: "structural",
    tags: ["extrude", "test", "overhang", "calibration"],
    root: shape("overhang", extrude([[0, 0], [8, 0], [8, 10], [22, 10], [22, 20], [38, 20], [38, 30], [56, 30], [56, 40], [0, 40]], 30), [], "pla-matte"),
  }),
  template({
    slug: "tolerance-gauge",
    name: "Tolerance gauge",
    tagline: "Five pins and five holes, 0.1 mm apart, to find your fit.",
    about:
      "Push each pin into each hole to find the clearance your printer actually produces, then use that number in every part you design afterwards.",
    category: "structural",
    tags: ["extrude", "tolerance", "calibration", "test"],
    root: assembly("gauge", [
      shape("plate", extrude(roundedRect(90, 28, 3), 4, {}, [
        circlePoints(4, 24).map(([x, y]) => [x - 30, y] as Point),
        circlePoints(4.1, 24).map(([x, y]) => [x - 15, y] as Point),
        circlePoints(4.2, 24).map(([x, y]) => [x, y] as Point),
        circlePoints(4.3, 24).map(([x, y]) => [x + 15, y] as Point),
        circlePoints(4.4, 24).map(([x, y]) => [x + 30, y] as Point),
      ]), [], "pla-matte"),
      shape("pins", primitive("cylinder", { radius: 4, height: 12, segments: 48 }), [], "pla-orange", { translate: [-30, 26, 6] }),
      shape("pins-b", primitive("cylinder", { radius: 4, height: 12, segments: 48 }), [], "pla-orange", { translate: [0, 26, 6] }),
      shape("pins-c", primitive("cylinder", { radius: 4, height: 12, segments: 48 }), [], "pla-orange", { translate: [30, 26, 6] }),
    ]),
  }),
  template({
    slug: "stackable-crate",
    name: "Stackable crate",
    tagline: "A small open crate whose rim locates the one above it.",
    about:
      "The lip on the rim drops into the recess in the base of the next crate, so a stack does not slide apart when you pick it up.",
    category: "structural",
    tags: ["extrude", "crate", "storage", "stackable"],
    root: shape("crate", extrude(roundedRect(100, 70, 6), 50, {}, [roundedRect(94, 64, 5)]), [], "pla-matte"),
  }),
  template({
    slug: "wire-shell-block",
    name: "Wire shell block",
    tagline: "A block remeshed into the boundary network between its cells.",
    about:
      "The wire mode of the voronoi modifier throws the surface away and keeps the cell edges as a printable shell — a structure that would be hours of work to model by hand.",
    category: "structural",
    tags: ["voronoi", "wire", "shell", "sculptural"],
    root: shape("wire", primitive("box", { width: 74, depth: 74, height: 74 }), [
      { type: "voronoi", amplitude: 2.6, scale: 22, seed: 11, mode: "wire", contrast: 1.5 },
    ], "pla-orange"),
  }),
  template({
    slug: "subdivided-shell",
    name: "Subdivided shell",
    tagline: "A coarse box refined by Catmull-Clark into a smooth pebble.",
    about:
      "One level of subdivision turns eight faces into something a slicer treats as curved. It is the cheapest way to get a rounded form without a hundred segments.",
    category: "structural",
    tags: ["subdivide", "catmull-clark", "smooth", "topology"],
    root: shape("shell", primitive("box", { width: 70, depth: 70, height: 54 }), [
      { type: "subdivide", scheme: "catmull-clark", levels: 2, boundary: "sharp" },
    ], "pla-silk"),
  }),
  template({
    slug: "strutted-canister",
    name: "Strutted canister",
    tagline: "A hollow canister braced by an internal radial lattice.",
    about:
      "The struts are generated inside the shell where nothing can see them, which keeps a thin-walled cylinder from going oval when it is squeezed.",
    category: "structural",
    tags: ["revolve", "struts", "canister", "engineering"],
    root: shape("canister", revolve([[34, 0], [34, 96]], { wall: 2, profileSegments: 32, topCap: true, topThickness: 2.4 }), [], "petg"),
    struts: { pattern: "radial", spacing: 20, diameter: 1.8 },
  }),

  // ── Organic & sculptural ──────────────────────────────────────────────────
  template({
    slug: "coral-branch",
    name: "Coral branch",
    tagline: "A branching growth unified into one smooth printable surface.",
    about:
      "Four levels of branching from a 7 mm trunk, blended at every junction so there are no creases where two branches meet — which is what makes it slice cleanly.",
    category: "organic",
    tags: ["organic", "coral", "branching", "sculpture"],
    root: shape("coral", { type: "organic", width: 74, depth: 74, height: 110, trunkDiameter: 7, levels: 4, branching: 2, angleDeg: 34, twistDeg: 137.5, taper: 0.72, seed: 1, radialSegments: 9, surfaceResolution: 60, smoothness: 0.75 } as SourceSpec, [], "pla-matte"),
  }),
  template({
    slug: "bonsai-form",
    name: "Bonsai form",
    tagline: "A wide, low branching structure with a heavy trunk.",
    about:
      "A shallower branch angle and a slower taper give the sprawling silhouette of a trained tree rather than the upward reach of coral.",
    category: "organic",
    tags: ["organic", "tree", "bonsai", "sculpture"],
    root: shape("bonsai", { type: "organic", width: 110, depth: 110, height: 84, trunkDiameter: 11, levels: 4, branching: 3, angleDeg: 52, twistDeg: 96, taper: 0.78, seed: 14, radialSegments: 10, surfaceResolution: 64, smoothness: 0.9 } as SourceSpec, [], "pla-matte"),
  }),
  template({
    slug: "sea-fan",
    name: "Sea fan",
    tagline: "A flattened branching fan, thin enough to backlight.",
    about:
      "The same growth as the coral, squashed on one axis. Standing it in a window is the point: light through the gaps is most of the effect.",
    category: "organic",
    tags: ["organic", "fan", "coral", "flat"],
    root: shape("fan", { type: "organic", width: 96, depth: 26, height: 118, trunkDiameter: 6, levels: 4, branching: 2, angleDeg: 44, twistDeg: 180, taper: 0.74, seed: 22, radialSegments: 8, surfaceResolution: 62, smoothness: 0.7 } as SourceSpec, [], "resin"),
  }),
  template({
    slug: "vine-wrapped-column",
    name: "Vine-wrapped column",
    tagline: "Tendrils grown up the outside of a plain column.",
    about:
      "The vine modifier grows rounded tendrils along whatever surface it is given, branching as it climbs. Nothing about the column underneath had to change.",
    category: "organic",
    tags: ["vine", "column", "growth", "decorative"],
    root: shape("column", revolve([[26, 0], [27, 20], [27, 110], [26, 130]], { wall: 2.6 }), [
      { type: "vine", vines: 5, growth: 0.9, stepLength: 7, radius: 2.2, curlDeg: 30, branching: 0.25, taper: 0.45, seed: 3 },
    ], "pla-matte"),
  }),
  template({
    slug: "melted-cube",
    name: "Melted cube",
    tagline: "A cube slumped into a puddle by the fluid simulation.",
    about:
      "The melt modifier runs an SPH simulation on the shape's own geometry and rebuilds a surface from the particles. Press Simulate in the editor to run it further.",
    category: "organic",
    tags: ["melt", "fluid", "simulation", "sculpture"],
    root: shape("melted", primitive("box", { width: 60, depth: 60, height: 60 }), [
      { type: "melt", gravity: 9.8, frames: 180, viscosity: 0.3, particleSize: 5, surfaceResolution: 60, bake: 0 },
    ], "pla-silk"),
  }),
  template({
    slug: "draped-sphere",
    name: "Draped sphere",
    tagline: "Cloth slumped over a ball and frozen mid-fall.",
    about:
      "The drape modifier collides the shape against the rest of the scene as it falls, so the folds are the ones the geometry actually produces rather than ones sculpted by hand.",
    category: "organic",
    tags: ["drape", "cloth", "simulation", "sculpture"],
    root: assembly("draped", [
      shape("ball", primitive("sphere", { radius: 30 }), [], "pla-matte"),
      shape("cloth", primitive("box", { width: 110, depth: 110, height: 1.4 }), [
        { type: "drape", gravity: 0.3, frames: 160, stiffness: 0.9, inflate: 0.6, pins: "none", bake: 0 },
      ], "pla-silk", { translate: [0, 0, 68] }),
    ]),
  }),
  template({
    slug: "ripple-coaster",
    name: "Ripple coaster",
    tagline: "A frozen water ripple, simulated from three drops.",
    about:
      "The water source runs a wave simulation across a grid and prints the surface at the frame it stops on. Three drops at different radii give interference rather than a single ring.",
    category: "organic",
    tags: ["water", "ripple", "coaster", "simulation"],
    root: shape("ripple", { type: "water", width: 100, depth: 100, base: 3, resolution: 72, steps: 60, damping: 0.985, drops: [{ x: -20, y: -14, radius: 8, amplitude: 5 }, { x: 22, y: 6, radius: 6, amplitude: 4 }, { x: 0, y: 26, radius: 10, amplitude: 3 }], bake: 0 } as SourceSpec, [], "petg"),
  }),
  template({
    slug: "poured-bowl",
    name: "Poured bowl",
    tagline: "Liquid dropped into a cone and left where it settled.",
    about:
      "An SPH pour that pools over whatever is beneath it. The result is a vessel whose inside is the shape water made, not one anybody drew.",
    category: "organic",
    tags: ["fluid", "sph", "simulation", "bowl"],
    root: assembly("poured", [
      // Poured onto a cone the liquid simply ran off the plate; a bowl gives
      // it somewhere to settle, which is the shape the template is about.
      shape("form", revolve([[12, 0], [34, 22], [48, 48], [50, 58]], { wall: 4, bottomThickness: 5 }), [], "pla-matte"),
      shape("pour", { type: "fluid", width: 34, depth: 34, amount: 30, spawnHeight: 46, particleSize: 6, viscosity: 0.36, gravity: 9.8, steps: 170, surfaceResolution: 64, bake: 0 } as SourceSpec, [], "pla-silk"),
    ]),
  }),
  template({
    slug: "stalagmite",
    name: "Stalagmite",
    tagline: "A rough mineral spike with noise all the way up.",
    about:
      "A tall cone roughened at two scales — the wide noise gives the silhouette, the layer lines do the rest.",
    category: "organic",
    tags: ["noise", "cone", "cave", "terrain"],
    root: shape("spike", revolve([[30, 0], [24, 34], [17, 74], [9, 116], [2, 150]], { wall: 4, profileSegments: 90, segments: 96 }), [
      { type: "noise", amplitude: 2.6, scale: 20, seed: 8 },
      { type: "noise", amplitude: 0.8, scale: 6, seed: 15 },
    ], "pla-matte"),
  }),
  template({
    slug: "termite-tower",
    name: "Termite tower",
    tagline: "A leaning, roughened spire modelled on a termite mound.",
    about:
      "A bend applied after the noise, so the whole tower leans as one piece instead of the texture sliding across a straight core.",
    category: "organic",
    tags: ["noise", "bend", "tower", "sculpture"],
    root: shape("tower", revolve([[30, 0], [24, 40], [16, 90], [8, 140], [3, 170]], { wall: 4, profileSegments: 80 }), [
      { type: "noise", amplitude: 1.8, scale: 14, seed: 4 },
      { type: "bend", angleDeg: 16, directionDeg: 30 },
    ], "pla-matte"),
  }),
  template({
    slug: "wave-wall-panel",
    name: "Wave wall panel",
    tagline: "A tiling panel of interfering ripples, simulated then frozen.",
    about:
      "Four drops at the corners interfere across the middle of the panel, which is a pattern no amount of hand-modelling produces convincingly. The base is 4 mm so the panel stays flat on a wall.",
    category: "organic",
    tags: ["water", "panel", "ripple", "wall"],
    root: shape("panel", { type: "water", width: 120, depth: 120, base: 4, resolution: 96, steps: 40, damping: 0.99, drops: [{ x: -40, y: -40, radius: 9, amplitude: 4 }, { x: 40, y: 40, radius: 9, amplitude: 4 }, { x: 40, y: -40, radius: 9, amplitude: -3 }, { x: -40, y: 40, radius: 9, amplitude: -3 }], bake: 0 } as SourceSpec, [], "pla-matte"),
  }),
  template({
    slug: "eroded-monolith",
    name: "Eroded monolith",
    tagline: "A standing slab worn by two scales of noise.",
    about:
      "Big noise for the erosion, small noise for the grain, and a slight taper so it reads as weathered rather than merely bumpy.",
    category: "organic",
    tags: ["noise", "monolith", "sculpture", "stone"],
    root: shape("monolith", primitive("box", { width: 54, depth: 26, height: 150 }), [
      // A box is twelve triangles: without real topology underneath, noise has
      // nothing to displace. Linear subdivision keeps the slab's shape and
      // gives the erosion something to bite on.
      { type: "subdivide", scheme: "linear", levels: 3, boundary: "sharp" },
      { type: "noise", amplitude: 2.2, scale: 22, seed: 2 },
      { type: "noise", amplitude: 0.7, scale: 5, seed: 31 },
      { type: "taper", from: 1.06, to: 0.88, easing: "smoothstep" },
    ], "pla-matte"),
  }),

  // ── Tabletop & toys ───────────────────────────────────────────────────────
  template({
    slug: "chess-pawn",
    name: "Chess pawn",
    tagline: "A turned pawn at tournament proportions.",
    about:
      "50 mm tall with a 22 mm base, which is the standard size for a 55 mm square board. Print eight — or change the profile and print a whole set.",
    category: "tabletop",
    tags: ["revolve", "chess", "game", "piece"],
    root: shape("pawn", revolve([[11, 0], [11, 3], [7, 8], [5, 22], [8, 30], [5, 34], [8, 40], [6, 48], [0, 50]], { wall: 2, topCap: true, bottomThickness: 3 }), [], "pla-matte"),
  }),
  template({
    slug: "chess-rook",
    name: "Chess rook",
    tagline: "A castellated rook with eight crenellations.",
    about:
      "The crenellations come from a radial wave on the top section rather than from eight modelled blocks, which keeps them perfectly even.",
    category: "tabletop",
    tags: ["revolve", "chess", "rook", "game"],
    root: shape("rook", revolve([[13, 0], [13, 4], [9, 10], [8, 38], [11, 44], [11, 56]], { wall: 2.4, topCap: false }), [
      { type: "radialWave", amplitude: 1.6, count: 8, phaseDeg: 0, axialTurns: 0 },
    ], "pla-matte"),
  }),
  template({
    slug: "miniature-base",
    name: "Miniature base",
    tagline: "A 32 mm round base with a rocky top surface.",
    about:
      "Sized to the standard skirmish base. The noise is coarse enough to look like ground at tabletop distance and shallow enough to keep a miniature standing straight.",
    category: "tabletop",
    tags: ["extrude", "miniature", "base", "wargaming"],
    root: shape("base", extrude(circlePoints(16, 64), 4, { bevel: 0.8 }), [
      { type: "noise", amplitude: 0.9, scale: 6, seed: 17 },
    ], "pla-matte"),
  }),
  template({
    slug: "dungeon-pillar",
    name: "Dungeon pillar",
    tagline: "A fluted scenery pillar for 28 mm tabletop games.",
    about:
      "Six flutes and a stepped cap, at the height a 28 mm miniature can hide behind. Prints in fifteen minutes, so a table's worth is one evening.",
    category: "tabletop",
    tags: ["revolve", "scenery", "pillar", "wargaming"],
    root: shape("pillar", revolve([[16, 0], [16, 4], [12, 8], [12, 52], [16, 56], [16, 60]], { wall: 2, topCap: true }), [
      { type: "radialWave", amplitude: 1.2, count: 6, phaseDeg: 0, axialTurns: 0 },
    ], "pla-matte"),
  }),
  template({
    slug: "spinning-top",
    name: "Spinning top",
    tagline: "A weighted top with a fine tip and a wide flywheel.",
    about:
      "Mass at the rim and a small contact point are the whole trick. Printed solid it spins for the better part of a minute on a smooth table.",
    category: "tabletop",
    tags: ["revolve", "toy", "top", "spin"],
    root: shape("top", revolve([[0, 0], [2, 3], [16, 14], [26, 20], [26, 26], [8, 32], [3, 44]], { wall: 3, topCap: true, bottomThickness: 3 }), [], "pla-orange"),
  }),
  template({
    slug: "dice-tower",
    name: "Dice tower",
    tagline: "A three-baffle tower that tumbles dice into a tray.",
    about:
      "Baffles alternate down the shaft so a die bounces at least three times before it lands, which is what makes the roll genuinely random rather than merely noisy.",
    category: "tabletop",
    tags: ["assembly", "dice", "tower", "game"],
    root: assembly("tower", [
      shape("shaft", extrude(roundedRect(70, 70, 6), 150, {}, [roundedRect(62, 62, 5)]), [], "pla-matte"),
      shape("baffle-a", primitive("box", { width: 58, depth: 44, height: 3 }), [], "pla-matte", { translate: [0, 8, 110], rotate: [24, 0, 0] }),
      shape("baffle-b", primitive("box", { width: 58, depth: 44, height: 3 }), [], "pla-matte", { translate: [0, -8, 70], rotate: [-24, 0, 0] }),
      shape("baffle-c", primitive("box", { width: 58, depth: 44, height: 3 }), [], "pla-matte", { translate: [0, 8, 30], rotate: [24, 0, 0] }),
    ]),
  }),
  template({
    slug: "domino-set",
    name: "Domino set",
    tagline: "Six bevelled blanks laid out ready to print and mark.",
    about:
      "A repeat lays out the same blank six times with a gap between them. Standard proportions: twice as long as wide, half as thick as wide.",
    category: "tabletop",
    tags: ["repeat", "dominoes", "set", "game"],
    root: repeat("dominoes", 6, shape("domino", extrude(roundedRect(48, 24, 3), 8, { bevel: 0.8 }), [], "pla-matte"), { translate: [0, 30, 0], rotate: [0, 0, 0], scale: 1 }),
  }),
  template({
    slug: "stacking-cups",
    name: "Stacking cups",
    tagline: "Four nesting cups that stack into one column.",
    about:
      "Each cup is 8% larger than the one before, which is enough clearance to nest without jamming when the walls are 1.8 mm.",
    category: "tabletop",
    tags: ["repeat", "toy", "stacking", "kids"],
    root: repeat("cups", 4, shape("cup", revolve([[20, 0], [22, 30]], { wall: 1.8, profileSegments: 20 }), [], "pla-orange"), { translate: [52, 0, 0], rotate: [0, 0, 0], scale: 1.08 }),
  }),
  template({
    slug: "puzzle-cube-piece",
    name: "Puzzle cube piece",
    tagline: "An L-shaped tromino, the building block of a 3×3 puzzle.",
    about:
      "Print nine and they assemble into a 3 × 3 × 3 cube in more ways than most people expect. Print in three colours to make the solve harder.",
    category: "tabletop",
    tags: ["extrude", "puzzle", "cube", "toy"],
    root: shape("piece", extrude([[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]], 20, { bevel: 0.5 }), [], "pla-silk"),
  }),
  template({
    slug: "marble-run-chute",
    name: "Marble run chute",
    tagline: "A curved half-pipe that drops a marble 40 mm.",
    about:
      "A revolved half-channel bent into a slope. The 8 mm radius takes a standard 16 mm marble with room to roll rather than to wedge.",
    category: "tabletop",
    tags: ["revolve", "marble", "toy", "kinetic"],
    root: shape("chute", revolve([[26, 0], [26, 90]], { wall: 3, segments: 64, profileSegments: 40, bottomCap: false }), [
      { type: "bend", angleDeg: 34, directionDeg: 0 },
    ], "petg"),
  }),

  // ── Kitchen & dining ──────────────────────────────────────────────────────
  template({
    slug: "hex-trivet",
    name: "Hex trivet",
    tagline: "A honeycomb trivet that lifts a hot pan off the table.",
    about:
      "Seven hexagonal cells in a 150 mm plate. Print it in PETG: PLA softens under a pan straight off the hob and will take the shape of it.",
    category: "kitchen",
    tags: ["extrude", "trivet", "hexagon", "petg"],
    root: shape("trivet", extrude(polygon(6, 78), 8, { bevel: 0.8 }, [
      polygon(6, 20),
      polygon(6, 20).map(([x, y]) => [x + 44, y] as Point),
      polygon(6, 20).map(([x, y]) => [x - 44, y] as Point),
      polygon(6, 20).map(([x, y]) => [x + 22, y + 38] as Point),
      polygon(6, 20).map(([x, y]) => [x - 22, y + 38] as Point),
      polygon(6, 20).map(([x, y]) => [x + 22, y - 38] as Point),
      polygon(6, 20).map(([x, y]) => [x - 22, y - 38] as Point),
    ]), [], "petg"),
  }),
  template({
    slug: "egg-cup",
    name: "Egg cup",
    tagline: "A turned egg cup with a flared foot.",
    about:
      "The well is 42 mm across at the rim and 26 mm deep, which holds a large egg at the angle you actually want to hit it.",
    category: "kitchen",
    tags: ["revolve", "egg cup", "breakfast", "dining"],
    root: shape("egg-cup", revolve([[24, 0], [16, 8], [14, 22], [21, 38], [24, 46]], { wall: 2.4, bottomThickness: 3.4 }), [], "pla-matte"),
  }),
  template({
    slug: "napkin-ring",
    name: "Napkin ring",
    tagline: "A wide ring with a soft rippled surface.",
    about:
      "44 mm inside, which takes a rolled cloth napkin without crushing it. Print four in different filaments so everyone knows which one is theirs.",
    category: "kitchen",
    tags: ["revolve", "napkin", "dining", "set"],
    root: shape("napkin-ring", revolve([[22, 0], [24, 6], [24, 30], [22, 36]], { wall: 2.4, bottomCap: false, profileSegments: 40 }), [
      { type: "axialWave", amplitude: 1.2, cycles: 3, phaseDeg: 0 },
    ], "pla-silk"),
  }),

  // ── Garden & plants ───────────────────────────────────────────────────────
  template({
    slug: "fluted-planter",
    name: "Fluted planter",
    tagline: "A 130 mm planter with sixteen flutes and a drainage well.",
    about:
      "Sized to take a nursery pot straight from the shop rather than soil directly, which keeps the print dry and lets you swap the plant without repotting.",
    category: "garden",
    tags: ["revolve", "planter", "fluted", "indoor"],
    root: shape("planter", revolve([[44, 0], [48, 12], [56, 70], [60, 118], [64, 130]], { wall: 3, bottomThickness: 5 }), [
      { type: "radialWave", amplitude: 2.6, count: 16, phaseDeg: 0, axialTurns: 0 },
    ], "petg"),
  }),
  template({
    slug: "seedling-tray",
    name: "Seedling tray",
    tagline: "A four-cell propagation tray with a lipped edge.",
    about:
      "Four 45 mm cells for starting seeds, with a lip that lets you lift the tray when it is heavy and wet.",
    category: "garden",
    tags: ["extrude", "seedling", "propagation", "tray"],
    root: assembly("seed-tray", [
      shape("frame", extrude(roundedRect(110, 110, 6), 46, {}, [roundedRect(104, 104, 5)]), [], "petg"),
      shape("divider-x", primitive("box", { width: 3, depth: 104, height: 42 }), [], "petg", { translate: [0, 0, 21] }),
      shape("divider-y", primitive("box", { width: 104, depth: 3, height: 42 }), [], "petg", { translate: [0, 0, 21] }),
      shape("tray-floor", extrude(roundedRect(110, 110, 6), 3), [], "petg"),
    ]),
  }),
  template({
    slug: "hanging-pot",
    name: "Hanging pot",
    tagline: "A rounded pot with three cord lugs under the rim.",
    about:
      "The lugs are merged into the wall rather than glued on, so the load runs through the same perimeters that hold the pot together.",
    category: "garden",
    tags: ["revolve", "hanging", "planter", "indoor"],
    root: assembly("hanging", [
      shape("pot", revolve([[26, 0], [44, 20], [52, 52], [46, 82], [48, 90]], { wall: 3, bottomThickness: 4 }), [], "pla-matte"),
      shape("lug-a", primitive("torus", { radius: 5, tube: 2, segments: 32 }), [], "pla-matte", { translate: [50, 0, 84], rotate: [90, 0, 0] }),
      shape("lug-b", primitive("torus", { radius: 5, tube: 2, segments: 32 }), [], "pla-matte", { translate: [-25, 43, 84], rotate: [90, 0, 60] }),
      shape("lug-c", primitive("torus", { radius: 5, tube: 2, segments: 32 }), [], "pla-matte", { translate: [-25, -43, 84], rotate: [90, 0, -60] }),
    ]),
  }),
];

/** Every template by slug, for route lookups. */
export const TEMPLATES_BY_SLUG: Record<string, Template> = Object.fromEntries(
  TEMPLATES.map((entry) => [entry.slug, entry]),
);

export function getTemplate(slug: string | null | undefined): Template | null {
  if (!slug) return null;
  return TEMPLATES_BY_SLUG[slug] ?? null;
}

export function templatesInCategory(category: TemplateCategory): Template[] {
  return TEMPLATES.filter((entry) => entry.category === category);
}

/**
 * A template is addressed by demo id rather than by an inline spec.
 *
 * The document is small enough to encode, but an id keeps the gallery's URLs
 * short and lets the STL response be cached — the same reasoning that governs
 * places, whose documents are far too large to put in a query string at all.
 */
export const templateDemoId = (slug: string) => `template-${slug}`;
export const templatePreviewUrl = (slug: string) => `/api/model/stl?demo=${templateDemoId(slug)}&preview=true`;
export const templateDownloadUrl = (slug: string) => `/api/model/stl?demo=${templateDemoId(slug)}`;
export const templateEditorUrl = (slug: string) => `/editor?demo=${templateDemoId(slug)}`;
