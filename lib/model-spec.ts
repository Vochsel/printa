import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

export const MODEL_SPEC_VERSION = "1.0" as const;
export const MAX_MODEL_NODES = 64;
export const MAX_REPEAT_COUNT = 32;

const finite = z.number().finite();
const positive = finite.positive();
const nonNegative = finite.nonnegative();
const vec3 = z.tuple([finite, finite, finite]);
const modifierModulationSchema = z.object({
  axis: z.enum(["x", "y", "z"]).default("z").describe("Local axis used to measure normalized modifier progress"),
  points: z.array(z.tuple([finite.min(0).max(1), finite])).min(2).max(16)
    .describe("[normalized position, amount multiplier] keyframes"),
  interpolation: z.enum(["linear", "smoothstep"]).default("smoothstep"),
}).strict();
const modulationField = { modulation: modifierModulationSchema.optional() };
// `disabled` lets the editor mute a modifier to preview its effect without
// deleting it; the geometry evaluator skips disabled modifiers.
const disabledField = { disabled: z.boolean().optional().describe("When true the modifier is kept but not applied") };
// A monotonic token the editor bumps to re-run an on-command simulation.
const bakeField = { bake: z.number().int().min(0).default(0).describe("Simulation bake token; bump to force a fresh on-command sim") };

export const interiorStrutsSchema = z.object({
  enabled: z.boolean().default(false),
  pattern: z.enum(["cross", "diamond", "radial"]).default("diamond"),
  spacing: finite.min(4).max(100).default(18).describe("Vertical distance between lattice levels in document units"),
  diameter: finite.min(0.4).max(12).default(1.8).describe("Printable strut diameter in document units"),
  boundaryInset: nonNegative.max(40).default(3).describe("Clearance from the interior floor and ceiling/open rim"),
  wallOverlap: nonNegative.max(10).default(0.8).describe("How far strut anchors overlap the shell wall"),
  radialSegments: z.number().int().min(6).max(24).default(10).describe("Roundness of each generated strut"),
}).strict();

export type InteriorStrutsSpec = z.infer<typeof interiorStrutsSchema>;

const DEFAULT_INTERIOR_STRUTS: InteriorStrutsSpec = {
  enabled: false,
  pattern: "diamond",
  spacing: 18,
  diameter: 1.8,
  boundaryInset: 3,
  wallOverlap: 0.8,
  radialSegments: 10,
};

export const transformSchema = z.object({
  translate: vec3.default([0, 0, 0]),
  rotate: vec3.default([0, 0, 0]).describe("Euler rotation in degrees [x, y, z]"),
  scale: z.union([positive, vec3]).default(1),
}).strict();

const twistModifierSchema = z.object({
  type: z.literal("twist"),
  angleDeg: finite,
  start: finite.min(0).max(1).default(0),
  end: finite.min(0).max(1).default(1),
  ...modulationField,
  ...disabledField,
}).strict();

const taperModifierSchema = z.object({
  type: z.literal("taper"),
  from: positive.default(1),
  to: positive,
  easing: z.enum(["linear", "smoothstep"]).default("smoothstep"),
  ...modulationField,
  ...disabledField,
}).strict();

const radialWaveModifierSchema = z.object({
  type: z.literal("radialWave"),
  amplitude: finite,
  count: z.number().int().min(1).max(128),
  phaseDeg: finite.default(0),
  axialTurns: finite.default(0),
  ...modulationField,
  ...disabledField,
}).strict();

const axialWaveModifierSchema = z.object({
  type: z.literal("axialWave"),
  amplitude: finite,
  cycles: positive,
  phaseDeg: finite.default(0),
  ...modulationField,
  ...disabledField,
}).strict();

const bendModifierSchema = z.object({
  type: z.literal("bend"),
  angleDeg: finite.min(-300).max(300),
  directionDeg: finite.default(0),
  ...modulationField,
  ...disabledField,
}).strict();

const noiseModifierSchema = z.object({
  type: z.literal("noise"),
  amplitude: nonNegative,
  scale: positive.default(12),
  seed: z.number().int().default(1),
  ...modulationField,
  ...disabledField,
}).strict();

const smoothModifierSchema = z.object({
  type: z.literal("smooth"),
  iterations: z.number().int().min(1).max(8).default(1),
  strength: finite.min(0).max(1).default(0.35),
  ...disabledField,
}).strict();

// Simulation modifiers — run on the shape's own geometry, on command.
const drapeModifierSchema = z.object({
  type: z.literal("drape"),
  gravity: positive.default(0.3).describe("Downward pull per frame"),
  frames: z.number().int().min(1).max(600).default(160).describe("Simulation frames to run"),
  stiffness: finite.min(0).max(1).default(0.9).describe("How rigid the fabric edges are"),
  inflate: finite.min(0).max(3).default(0.7).describe("Balloon pressure that keeps a closed shape from collapsing (0 = limp fabric)"),
  pins: z.enum(["top", "base", "none"]).default("none").describe("Vertices held in place"),
  ...disabledField,
  ...bakeField,
}).strict();

const meltModifierSchema = z.object({
  type: z.literal("melt"),
  gravity: positive.default(9.8),
  frames: z.number().int().min(1).max(600).default(200).describe("Simulation frames to run"),
  viscosity: finite.min(0).max(1).default(0.25).describe("0 = runny, 1 = gloopy"),
  particleSize: finite.min(0.05).max(20).default(5).describe("Melt droplet size in mm"),
  surfaceResolution: z.number().int().min(24).max(140).default(64),
  ...disabledField,
  ...bakeField,
}).strict();

export const modifierSchema = z.discriminatedUnion("type", [
  twistModifierSchema,
  taperModifierSchema,
  radialWaveModifierSchema,
  axialWaveModifierSchema,
  bendModifierSchema,
  noiseModifierSchema,
  smoothModifierSchema,
  drapeModifierSchema,
  meltModifierSchema,
]);

const curveCommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), to: z.tuple([finite, finite]) }).strict(),
  z.object({ op: z.literal("line"), to: z.tuple([finite, finite]) }).strict(),
  z.object({ op: z.literal("quadratic"), control: z.tuple([finite, finite]), to: z.tuple([finite, finite]) }).strict(),
  z.object({ op: z.literal("bezier"), control1: z.tuple([finite, finite]), control2: z.tuple([finite, finite]), to: z.tuple([finite, finite]) }).strict(),
  z.object({ op: z.literal("close") }).strict(),
]);

const curvePathSchema = z.object({
  commands: z.array(curveCommandSchema).min(3).max(256),
  holes: z.array(z.array(curveCommandSchema).min(3).max(128)).max(24).default([]),
}).strict();

const primitiveSourceSchema = z.object({
  type: z.literal("primitive"),
  shape: z.enum(["box", "cylinder", "cone", "sphere", "torus"]),
  width: positive.optional().describe("Exact outer X size in document units; overrides the radius-derived width"),
  depth: positive.optional().describe("Exact outer Y size in document units; overrides the radius-derived depth"),
  height: positive.optional().describe("Exact outer Z size in document units; overrides the radius-derived height"),
  radius: positive.optional().describe("Convenience radius used when explicit outer dimensions are omitted"),
  radiusTop: nonNegative.optional(),
  radiusBottom: positive.optional(),
  tube: positive.optional(),
  segments: z.number().int().min(3).max(256).default(64),
}).strict();

const extrudeSourceSchema = z.object({
  type: z.literal("extrude"),
  path: curvePathSchema,
  depth: positive,
  bevel: nonNegative.default(0),
  bevelSegments: z.number().int().min(1).max(16).default(3),
  curveSegments: z.number().int().min(1).max(64).default(12),
  direction: vec3.default([0, 0, 1]).describe("Extrusion vector; normalized before depth is applied"),
}).strict();

const revolveSourceSchema = z.object({
  type: z.literal("revolve"),
  profile: z.array(z.tuple([nonNegative, finite])).min(2).max(64).describe("[radius, height] control points"),
  segments: z.number().int().min(8).max(512).default(128),
  profileSegments: z.number().int().min(2).max(256).default(96),
  radiusOffset: finite.default(0).describe("Amount added to every profile radius before the surface is revolved"),
  wall: positive.default(2).describe("Shell wall thickness"),
  bottomCap: z.boolean().default(true).describe("Close the vessel with a solid printable base"),
  bottomThickness: positive.default(2.4).describe("Solid base thickness"),
  topCap: z.boolean().default(false).describe("Close the top of the vessel with a solid cap"),
  topThickness: positive.default(2.4).describe("Solid top cap thickness"),
  interpolation: z.enum(["linear", "catmull-rom"]).default("catmull-rom"),
  axis: z.enum(["x", "y", "z"]).default("z"),
}).strict();

const textSourceSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(24),
  font: z.string().min(1).max(80).default("Roboto"),
  size: positive.default(36).describe("Legacy alias and fallback for exact visible text height"),
  width: positive.optional().describe("Optional exact outer text width in document units; naturally proportioned when omitted"),
  height: positive.optional().describe("Exact outer visible text height in document units; defaults to size"),
  depth: positive.default(4).describe("Exact outer extrusion depth including bevels"),
  bevel: nonNegative.default(0.6),
  bevelSegments: z.number().int().min(1).max(12).default(3),
  curveSegments: z.number().int().min(2).max(24).default(10),
  extrudeSegments: z.number().int().min(1).max(64).default(1).describe("Subdivisions through the extrusion depth"),
  bevelSide: z.enum(["both", "top", "bottom"]).default("both"),
  smoothNormals: z.boolean().default(true),
  textCase: z.enum(["original", "uppercase", "lowercase", "titlecase"]).default("original"),
  weight: z.enum(["regular", "bold"]).default("regular"),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
}).strict();

const waterDropSchema = z.object({
  x: finite.default(0),
  y: finite.default(0),
  radius: positive.default(8),
  amplitude: finite.default(5),
}).strict();

const waterSourceSchema = z.object({
  type: z.literal("water"),
  width: positive.default(100),
  depth: positive.default(100),
  base: positive.default(3),
  resolution: z.number().int().min(12).max(160).default(56),
  steps: z.number().int().min(1).max(400).default(90),
  damping: finite.min(0.8).max(0.9999).default(0.985),
  drops: z.array(waterDropSchema).min(1).max(24),
  ...bakeField,
}).strict();

const fluidSourceSchema = z.object({
  type: z.literal("fluid"),
  width: positive.default(70).describe("Spawn box width (X) the fluid drops from"),
  depth: positive.default(70).describe("Spawn box depth (Y)"),
  amount: positive.default(55).describe("Height of the released fluid column — the volume of liquid"),
  spawnHeight: nonNegative.default(70).describe("Height above the scene the fluid is released from"),
  particleSize: finite.min(0.05).max(20).default(6).describe("Particle spacing in mm — smaller is more detailed and slower"),
  viscosity: finite.min(0).max(1).default(0.18).describe("0 = watery, 1 = thick/gloopy"),
  gravity: positive.default(9.8),
  steps: z.number().int().min(20).max(600).default(220).describe("Settling iterations"),
  surfaceResolution: z.number().int().min(24).max(140).default(64).describe("Marching-cubes grid resolution for the printable surface"),
  ...bakeField,
}).strict();

const clothColliderSchema = z.object({
  type: z.literal("sphere"),
  center: vec3.default([0, 0, 0]),
  radius: positive,
}).strict();

const clothSourceSchema = z.object({
  type: z.literal("cloth"),
  width: positive.default(100),
  depth: positive.default(100),
  thickness: positive.default(1.2),
  resolution: z.number().int().min(8).max(80).default(28),
  steps: z.number().int().min(1).max(300).default(100),
  startHeight: positive.default(35),
  gravity: positive.default(0.18),
  constraintIterations: z.number().int().min(1).max(12).default(4),
  pins: z.enum(["corners", "top-edge", "none"]).default("corners"),
  collider: clothColliderSchema.optional(),
  ...bakeField,
}).strict();

export const sourceSchema = z.discriminatedUnion("type", [
  primitiveSourceSchema,
  extrudeSourceSchema,
  revolveSourceSchema,
  textSourceSchema,
  waterSourceSchema,
  fluidSourceSchema,
  clothSourceSchema,
]);

export type TransformSpec = z.infer<typeof transformSchema>;
export type ModifierSpec = z.infer<typeof modifierSchema>;
export type SourceSpec = z.infer<typeof sourceSchema>;

export type ShapeNode = {
  kind: "shape";
  id: string;
  source: SourceSpec;
  modifiers: ModifierSpec[];
  transform?: TransformSpec;
  material?: "pla-orange" | "pla-matte" | "pla-silk" | "petg" | "resin";
};

export type AssemblyNode = {
  kind: "assembly";
  id: string;
  operation: "merge";
  children: ModelNode[];
  modifiers: ModifierSpec[];
  transform?: TransformSpec;
};

export type RepeatNode = {
  kind: "repeat";
  id: string;
  count: number;
  child: ModelNode;
  step: TransformSpec;
  modifiers: ModifierSpec[];
  transform?: TransformSpec;
};

export type ModelNode = ShapeNode | AssemblyNode | RepeatNode;

const shapeNodeSchema: z.ZodType<ShapeNode> = z.object({
  kind: z.literal("shape"),
  id: z.string().min(1).max(64),
  source: sourceSchema,
  modifiers: z.array(modifierSchema).max(24).default([]),
  transform: transformSchema.optional(),
  material: z.enum(["pla-orange", "pla-matte", "pla-silk", "petg", "resin"]).optional(),
}).strict();

export const modelNodeSchema = z.lazy(() => z.union([
  shapeNodeSchema,
  z.object({
    kind: z.literal("assembly"),
    id: z.string().min(1).max(64),
    operation: z.literal("merge").default("merge"),
    children: z.array(modelNodeSchema).min(1).max(32),
    modifiers: z.array(modifierSchema).max(24).default([]),
    transform: transformSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("repeat"),
    id: z.string().min(1).max(64),
    count: z.number().int().min(1).max(MAX_REPEAT_COUNT),
    child: modelNodeSchema,
    step: transformSchema,
    modifiers: z.array(modifierSchema).max(24).default([]),
    transform: transformSchema.optional(),
  }).strict(),
])) as z.ZodType<ModelNode>;

export const modelDocumentSchema = z.object({
  version: z.literal(MODEL_SPEC_VERSION),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  units: z.enum(["mm", "cm", "in"]).default("mm"),
  root: modelNodeSchema,
  print: z.object({
    buildVolume: vec3.default([256, 256, 256]),
    autoCenter: z.boolean().default(true),
    placeOnBed: z.boolean().default(true),
    interiorStruts: interiorStrutsSchema.default(DEFAULT_INTERIOR_STRUTS),
  }).strict().default({ buildVolume: [256, 256, 256], autoCenter: true, placeOnBed: true, interiorStruts: DEFAULT_INTERIOR_STRUTS }),
  display: z.object({
    floor: z.boolean().default(true),
    grid: z.boolean().default(true),
    buildPlate: z.boolean().default(false).describe("Preview the configured rectangular printer build plate"),
    dimensions: z.object({
      visible: z.boolean().default(true),
      width: z.boolean().default(true),
      height: z.boolean().default(true).describe("Show the model footprint height/depth measurement on the floor plane"),
      offset: nonNegative.default(9).describe("Distance from model bounds to dimension arrows in document units"),
      precision: z.number().int().min(0).max(3).default(1),
    }).strict().default({ visible: true, width: true, height: true, offset: 9, precision: 1 }),
  }).strict().default({
    floor: true,
    grid: true,
    buildPlate: false,
    dimensions: { visible: true, width: true, height: true, offset: 9, precision: 1 },
  }),
  metadata: z.record(z.string(), z.union([z.string(), finite, z.boolean()])).default({}),
}).strict();

export type ModelDocument = z.infer<typeof modelDocumentSchema>;
export type ModelDocumentInput = z.input<typeof modelDocumentSchema>;

function countNodes(node: ModelNode): number {
  if (node.kind === "shape") return 1;
  if (node.kind === "repeat") return 1 + countNodes(node.child) * node.count;
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

export function validateModelDocument(input: unknown): ModelDocument {
  const document = modelDocumentSchema.parse(input);
  const nodeCount = countNodes(document.root);
  if (nodeCount > MAX_MODEL_NODES) {
    throw new Error(`Model expands to ${nodeCount} nodes; the limit is ${MAX_MODEL_NODES}.`);
  }
  return document;
}

export function parseModelDocument(input: string | unknown): ModelDocument {
  if (typeof input !== "string") return validateModelDocument(input);
  if (input.length > 80_000) throw new Error("Model spec is larger than 80 KB.");
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Model spec is empty.");
  const parsed = trimmed.startsWith("{") || trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : parseYaml(trimmed, { maxAliasCount: 32 });
  return validateModelDocument(parsed);
}

export function stringifyModelDocument(document: ModelDocument, format: "json" | "yaml" = "yaml") {
  return format === "json"
    ? JSON.stringify(document, null, 2)
    : stringifyYaml(document, { indent: 2, lineWidth: 100 });
}

export function encodeModelDocument(document: ModelDocument) {
  return Buffer.from(JSON.stringify(document), "utf8").toString("base64url");
}

export function decodeModelDocument(encoded: string) {
  return parseModelDocument(Buffer.from(encoded, "base64url").toString("utf8"));
}

export function modelSpecJsonSchema() {
  return z.toJSONSchema(modelDocumentSchema, { target: "draft-7" });
}
