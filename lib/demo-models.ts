import type { ModelDocument } from "@/lib/model-spec";

const printDefaults = {
  buildVolume: [256, 256, 256] as [number, number, number],
  autoCenter: true,
  placeOnBed: true,
};

export const DEMO_MODELS = {
  "contour-spiral-vase": {
    version: "1.0",
    name: "Contour spiral vase",
    description: "A rounded vessel with fine helical ribs inspired by layered ceramic forms.",
    units: "mm",
    root: {
      kind: "shape",
      id: "vessel",
      source: {
        type: "revolve",
        profile: [[31, 0], [35, 18], [41, 52], [37, 88], [31, 122], [27, 145]],
        segments: 192,
        profileSegments: 120,
        wall: 2.2,
        interpolation: "catmull-rom",
        axis: "z",
      },
      modifiers: [
        { type: "radialWave", amplitude: 1.7, count: 18, phaseDeg: 0, axialTurns: 0 },
        { type: "twist", angleDeg: 230, start: 0, end: 1 },
      ],
      material: "pla-matte",
    },
    print: printDefaults,
    metadata: { family: "vase", supportFree: true },
  },
  "zenith-twist": {
    version: "1.0",
    name: "Zenith twist vase",
    description: "A tall three-lobed vase with a strong continuous spiral.",
    units: "mm",
    root: {
      kind: "shape",
      id: "zenith",
      source: {
        type: "revolve",
        profile: [[24, 0], [27, 20], [29, 55], [28, 105], [25, 150], [24, 172]],
        segments: 180,
        profileSegments: 130,
        wall: 2.4,
        interpolation: "catmull-rom",
        axis: "z",
      },
      modifiers: [
        { type: "radialWave", amplitude: 7.2, count: 3, phaseDeg: 90, axialTurns: 0 },
        { type: "twist", angleDeg: 185, start: 0, end: 1 },
        { type: "taper", from: 1.04, to: 0.84, easing: "smoothstep" },
      ],
      material: "resin",
    },
    print: printDefaults,
    metadata: { family: "vase", lobes: 3 },
  },
  "fluted-bud-vase": {
    version: "1.0",
    name: "Fluted bud vase",
    description: "A bulbous lathed profile with sixteen flowing flutes.",
    units: "mm",
    root: {
      kind: "shape",
      id: "bud",
      source: {
        type: "revolve",
        profile: [[25, 0], [36, 22], [45, 60], [37, 96], [24, 122], [28, 144]],
        segments: 192,
        profileSegments: 112,
        wall: 2.1,
        interpolation: "catmull-rom",
        axis: "z",
      },
      modifiers: [
        { type: "radialWave", amplitude: 2.8, count: 16, phaseDeg: 0, axialTurns: 0 },
        { type: "twist", angleDeg: 58, start: 0.05, end: 1 },
      ],
      material: "pla-matte",
    },
    print: printDefaults,
    metadata: { family: "vase", flutes: 16 },
  },
  "ripple-column-vase": {
    version: "1.0",
    name: "Ripple column vase",
    description: "A marble-like stacked ripple silhouette made from one revolved profile.",
    units: "mm",
    root: {
      kind: "shape",
      id: "ripple-column",
      source: {
        type: "revolve",
        profile: [[29, 0], [37, 12], [31, 29], [43, 46], [32, 65], [43, 84], [31, 103], [38, 120], [29, 134]],
        segments: 180,
        profileSegments: 144,
        wall: 2.5,
        interpolation: "catmull-rom",
        axis: "z",
      },
      modifiers: [
        { type: "radialWave", amplitude: 1.2, count: 5, phaseDeg: 0, axialTurns: 0 },
        { type: "twist", angleDeg: 32, start: 0, end: 1 },
      ],
      material: "pla-silk",
    },
    print: printDefaults,
    metadata: { family: "vase", profile: "stacked-ripple" },
  },
  "spline-petal-dish": {
    version: "1.0",
    name: "Spline petal dish",
    description: "A custom Bézier outline extruded into a printable shallow dish blank.",
    units: "mm",
    root: {
      kind: "shape",
      id: "petal",
      source: {
        type: "extrude",
        depth: 8,
        bevel: 1.2,
        bevelSegments: 5,
        curveSegments: 20,
        direction: [0, 0, 1],
        path: {
          commands: [
            { op: "move", to: [0, 44] },
            { op: "bezier", control1: [24, 48], control2: [48, 28], to: [38, 4] },
            { op: "bezier", control1: [48, -18], control2: [25, -45], to: [0, -35] },
            { op: "bezier", control1: [-25, -45], control2: [-48, -18], to: [-38, 4] },
            { op: "bezier", control1: [-48, 28], control2: [-24, 48], to: [0, 44] },
            { op: "close" },
          ],
          holes: [],
        },
      },
      modifiers: [
        { type: "twist", angleDeg: 9, start: 0, end: 1 },
      ],
      material: "resin",
    },
    print: printDefaults,
    metadata: { family: "custom-curve" },
  },
  "primitive-totem": {
    version: "1.0",
    name: "Primitive totem",
    description: "A layered assembly of cylinders, toruses, and a tapered crown.",
    units: "mm",
    root: {
      kind: "assembly",
      id: "totem",
      operation: "merge",
      modifiers: [],
      children: [
        {
          kind: "shape",
          id: "core",
          source: { type: "primitive", shape: "cylinder", radius: 18, height: 72, segments: 96 },
          modifiers: [{ type: "axialWave", amplitude: 2.2, cycles: 3, phaseDeg: 0 }],
          material: "pla-orange",
        },
        {
          kind: "repeat",
          id: "rings",
          count: 4,
          modifiers: [],
          step: { translate: [0, 0, 18], rotate: [0, 0, 17], scale: 0.94 },
          child: {
            kind: "shape",
            id: "ring",
            source: { type: "primitive", shape: "torus", radius: 21, tube: 2.4, segments: 96 },
            modifiers: [],
          },
        },
        {
          kind: "shape",
          id: "crown",
          source: { type: "primitive", shape: "cone", radiusBottom: 17, radiusTop: 6, height: 26, segments: 96 },
          modifiers: [{ type: "radialWave", amplitude: 1.3, count: 8, phaseDeg: 0, axialTurns: 0 }],
          transform: { translate: [0, 0, 70], rotate: [0, 0, 0], scale: 1 },
        },
      ],
    },
    print: printDefaults,
    metadata: { family: "assembly" },
  },
  "water-ripple-tile": {
    version: "1.0",
    name: "Water ripple tile",
    description: "A frozen printable water simulation with three interacting drops.",
    units: "mm",
    root: {
      kind: "shape",
      id: "water",
      source: {
        type: "water",
        width: 112,
        depth: 88,
        base: 4,
        resolution: 64,
        steps: 34,
        damping: 0.989,
        drops: [
          { x: -22, y: -8, radius: 6, amplitude: 7 },
          { x: 20, y: 12, radius: 7, amplitude: -5.5 },
          { x: 4, y: -24, radius: 5, amplitude: 4.5 },
        ],
      },
      modifiers: [],
      material: "petg",
    },
    print: printDefaults,
    metadata: { family: "simulation", solver: "damped-wave" },
  },
  "cloth-drape-study": {
    version: "1.0",
    name: "Cloth drape study",
    description: "A deterministic Verlet cloth simulation pinned at four corners over a sphere.",
    units: "mm",
    root: {
      kind: "shape",
      id: "cloth",
      source: {
        type: "cloth",
        width: 112,
        depth: 112,
        thickness: 1.4,
        resolution: 30,
        steps: 115,
        startHeight: 46,
        gravity: 0.2,
        constraintIterations: 5,
        pins: "corners",
        collider: { type: "sphere", center: [0, 0, 4], radius: 27 },
      },
      modifiers: [{ type: "noise", amplitude: 0.35, scale: 14, seed: 7 }],
      material: "resin",
    },
    print: printDefaults,
    metadata: { family: "simulation", solver: "verlet-cloth" },
  },
} as const satisfies Record<string, ModelDocument>;

export type DemoModelId = keyof typeof DEMO_MODELS;

export const DEMO_MODEL_CARDS = Object.entries(DEMO_MODELS).map(([id, model]) => ({
  id: id as DemoModelId,
  name: model.name,
  description: model.description,
  family: String(model.metadata.family),
}));

export function getDemoModel(id: string | null | undefined) {
  if (!id || !(id in DEMO_MODELS)) return null;
  return DEMO_MODELS[id as DemoModelId];
}
