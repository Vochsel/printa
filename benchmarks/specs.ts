import { DEMO_MODELS } from "../lib/demo-models";
import type { ModelDocumentInput, ModifierSpec } from "../lib/model-spec";

const defaults = {
  print: { buildVolume: [256, 256, 256] as [number, number, number], autoCenter: true, placeOnBed: true },
  display: { floor: true, grid: true, dimensions: { visible: true, width: true, height: true, offset: 9, precision: 1 as const } },
};

const modifierGauntlet: ModifierSpec[] = [
  { type: "twist", angleDeg: 145, start: 0, end: 1 },
  { type: "taper", from: 1.1, to: 0.65, easing: "smoothstep" },
  { type: "radialWave", amplitude: 1.8, count: 7, phaseDeg: 12, axialTurns: 1.5 },
  { type: "axialWave", amplitude: 1.2, cycles: 4, phaseDeg: 20 },
  { type: "bend", angleDeg: 42, directionDeg: 25 },
  { type: "noise", amplitude: 0.35, scale: 11, seed: 19 },
  { type: "smooth", iterations: 2, strength: 0.22 },
];

function strutBenchmark(pattern: "cross" | "diamond" | "radial"): ModelDocumentInput {
  return {
    version: "1.0",
    name: `${pattern} interior struts`,
    description: `Exercises the ${pattern} structural lattice inside a capped revolved cavity.`,
    units: "mm",
    root: {
      kind: "shape",
      id: `${pattern}-strut-vessel`,
      source: {
        type: "revolve",
        profile: [[30, 0], [38, 28], [35, 72], [28, 118]],
        segments: 112,
        profileSegments: 80,
        wall: 2.4,
        bottomCap: true,
        bottomThickness: 3.2,
        topCap: true,
        topThickness: 3.2,
        interpolation: "catmull-rom",
        axis: "z",
      },
      modifiers: [],
      material: "pla-matte",
    },
    print: {
      buildVolume: [256, 256, 256],
      autoCenter: true,
      placeOnBed: true,
      interiorStruts: { enabled: true, pattern, spacing: 18, diameter: 1.8, boundaryInset: 3, wallOverlap: 0.8, radialSegments: 10 },
    },
    display: defaults.display,
    metadata: { benchmark: true, coverage: `interior-struts-${pattern}` },
  };
}

const addedCases = {
  "all-primitives-assembly": {
    version: "1.0",
    name: "All primitives assembly",
    description: "Exercises every primitive source and merge behavior.",
    units: "mm",
    root: {
      kind: "assembly",
      id: "primitive-suite",
      operation: "merge",
      modifiers: [],
      children: [
        { kind: "shape", id: "box", source: { type: "primitive", shape: "box", width: 18, depth: 18, height: 18, segments: 8 }, modifiers: [], transform: { translate: [-42, 0, 0], rotate: [0, 0, 8], scale: 1 } },
        { kind: "shape", id: "sphere", source: { type: "primitive", shape: "sphere", width: 22, depth: 18, height: 28, radius: 11, segments: 72 }, modifiers: [], transform: { translate: [-20, 0, 11], rotate: [0, 0, 0], scale: 1 } },
        { kind: "shape", id: "cylinder", source: { type: "primitive", shape: "cylinder", width: 20, depth: 17, height: 24, radius: 10, segments: 72 }, modifiers: [], transform: { translate: [4, 0, 0], rotate: [0, 0, 0], scale: 1 } },
        { kind: "shape", id: "cone", source: { type: "primitive", shape: "cone", width: 24, depth: 20, height: 26, radiusBottom: 12, radiusTop: 3, segments: 72 }, modifiers: [], transform: { translate: [29, 0, 0], rotate: [0, 0, 0], scale: 1 } },
        { kind: "shape", id: "torus", source: { type: "primitive", shape: "torus", width: 26, depth: 22, height: 7, radius: 10, tube: 3, segments: 72 }, modifiers: [], transform: { translate: [54, 0, 13], rotate: [90, 0, 0], scale: 1 } },
      ],
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "primitive,assembly,merge,transform" },
  },
  "modifier-gauntlet": {
    version: "1.0",
    name: "Modifier gauntlet",
    description: "Runs all ordered modifier implementations on one dense source.",
    units: "mm",
    root: {
      kind: "shape",
      id: "modifier-stack",
      source: { type: "primitive", shape: "sphere", radius: 34, segments: 96 },
      modifiers: modifierGauntlet,
      material: "pla-silk",
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "all-modifiers" },
  },
  "extrude-hole-curves": {
    version: "1.0",
    name: "Extrude hole curves",
    description: "Exercises line, quadratic, Bezier, hole, bevel, and non-default extrusion direction paths.",
    units: "mm",
    root: {
      kind: "shape",
      id: "curve-plate",
      source: {
        type: "extrude",
        depth: 9,
        bevel: 1.1,
        bevelSegments: 7,
        curveSegments: 28,
        direction: [0.12, 0.08, 1],
        path: {
          commands: [
            { op: "move", to: [-38, -24] }, { op: "line", to: [28, -28] },
            { op: "quadratic", control: [48, -8], to: [34, 22] },
            { op: "bezier", control1: [15, 38], control2: [-28, 38], to: [-40, 14] },
            { op: "line", to: [-38, -24] }, { op: "close" },
          ],
          holes: [[
            { op: "move", to: [-9, -8] }, { op: "quadratic", control: [13, -12], to: [14, 6] },
            { op: "bezier", control1: [9, 17], control2: [-13, 15], to: [-9, -8] }, { op: "close" },
          ]],
        },
      },
      modifiers: [{ type: "taper", from: 1, to: 0.94, easing: "linear" }],
      material: "resin",
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "extrude,curves,holes,bevel,direction" },
  },
  "deep-repeat-graph": {
    version: "1.0",
    name: "Deep repeat graph",
    description: "Exercises nested assembly evaluation, repeated transforms, and subgraph cache reuse.",
    units: "cm",
    root: {
      kind: "repeat",
      id: "repeat-cluster",
      count: 8,
      step: { translate: [1.7, 0, 0.3], rotate: [0, 0, 24], scale: 0.93 },
      modifiers: [{ type: "twist", angleDeg: 18, start: 0, end: 1 }],
      child: {
        kind: "assembly",
        id: "cluster",
        operation: "merge",
        modifiers: [],
        children: [
          { kind: "shape", id: "cluster-box", source: { type: "primitive", shape: "box", width: 1.2, depth: 1.2, height: 1.6, segments: 4 }, modifiers: [] },
          { kind: "shape", id: "cluster-orb", source: { type: "primitive", shape: "sphere", radius: 0.75, segments: 48 }, modifiers: [], transform: { translate: [0, 0, 1.7], rotate: [0, 0, 0], scale: 1 } },
        ],
      },
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "repeat,nested-assembly,units,cache" },
  },
  "styled-google-text": {
    version: "1.0",
    name: "Styled Google text",
    description: "Exercises font resolution and the complete printable typography pipeline.",
    units: "mm",
    root: {
      kind: "shape",
      id: "styled-word",
      source: {
        type: "text", text: "Realtime", font: "Roboto", size: 38, width: 142, height: 38, depth: 5.5, bevel: 0.7,
        bevelSegments: 6, curveSegments: 18, bevelSide: "top", smoothNormals: true,
        textCase: "lowercase", weight: "bold", italic: true, underline: true,
      },
      modifiers: [{ type: "bend", angleDeg: 9, directionDeg: 0 }],
      material: "pla-orange",
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "text,font,case,bold,italic,underline,bevel,exact-dimensions" },
  },
  "exact-sphere-centimetres": {
    version: "1.0",
    name: "Exact ellipsoid in centimetres",
    description: "Asserts non-uniform primitive bounds and one-time centimetre-to-millimetre conversion.",
    units: "cm",
    root: {
      kind: "shape",
      id: "metric-ellipsoid",
      source: { type: "primitive", shape: "sphere", width: 5.3, depth: 3.7, height: 6.1, radius: 2, segments: 37 },
      modifiers: [],
      material: "pla-matte",
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "primitive,exact-dimensions,units", expectedBoundsMm: "53,37,61" },
  },
  "exact-opentype-text": {
    version: "1.0",
    name: "Exact OpenType text bounds",
    description: "Asserts final tessellated text width, visible height, and bevel-inclusive depth.",
    units: "mm",
    root: {
      kind: "shape",
      id: "metric-type",
      source: {
        type: "text", text: "Metric", font: "Roboto", size: 31, width: 117, height: 31, depth: 6, bevel: 0.8,
        bevelSegments: 4, curveSegments: 14, bevelSide: "both", smoothNormals: true,
        textCase: "original", weight: "regular", italic: false, underline: false,
      },
      modifiers: [],
      material: "pla-orange",
    },
    ...defaults,
    metadata: { benchmark: true, coverage: "text,font,exact-dimensions", expectedBoundsMm: "117,31,6" },
  },
  "struts-cross": strutBenchmark("cross"),
  "struts-diamond": strutBenchmark("diamond"),
  "struts-radial": strutBenchmark("radial"),
} as const satisfies Record<string, ModelDocumentInput>;

export const BENCHMARK_SPECS = { ...DEMO_MODELS, ...addedCases } as const;

export const REQUIRED_BENCHMARK_COVERAGE = {
  sources: ["primitive", "extrude", "revolve", "text", "water", "cloth"],
  primitives: ["box", "cylinder", "cone", "sphere", "torus"],
  modifiers: ["twist", "taper", "radialWave", "axialWave", "bend", "noise", "smooth"],
  graph: ["shape", "assembly", "repeat"],
  curves: ["move", "line", "quadratic", "bezier", "close"],
} as const;

export const REQUIRED_STRUT_PATTERNS = ["cross", "diamond", "radial"] as const;
