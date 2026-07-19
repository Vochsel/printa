import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as opentype from "opentype.js";
import type { BufferGeometry } from "three";
import { DEMO_MODELS } from "../lib/demo-models";
import { BENCHMARK_SPECS, REQUIRED_BENCHMARK_COVERAGE, REQUIRED_STRUT_PATTERNS } from "../benchmarks/specs";
import {
  decodeModelDocument,
  encodeModelDocument,
  modelSpecJsonSchema,
  parseModelDocument,
  validateModelDocument,
  type ModelNode,
} from "../lib/model-spec";
import {
  applyModifiers,
  applyTransform,
  createSourceGeometry,
  createSourceGeometryParts,
  mergeModelGeometries,
  repeatedTransform,
} from "../lib/procedural-geometry";
import { unionClosedGeometryParts } from "../lib/manifold-geometry";
import { createTextGeometry, geometryStats } from "../lib/text-geometry";

const openTypeRuntime = (opentype as typeof opentype & { default?: typeof opentype }).default ?? opentype;

async function buildNode(node: ModelNode): Promise<BufferGeometry> {
  if (node.kind === "shape") {
    if (node.source.type === "text") throw new Error("Text demos require the server font loader.");
    return applyTransform(applyModifiers(createSourceGeometry(node.source), node.modifiers), node.transform);
  }
  if (node.kind === "assembly") {
    const children = await Promise.all(node.children.map(buildNode));
    const merged = mergeModelGeometries(children);
    children.forEach((child) => { if (child !== merged) child.dispose(); });
    return applyTransform(applyModifiers(merged, node.modifiers), node.transform);
  }
  const source = await buildNode(node.child);
  const copies = Array.from({ length: node.count }, (_, index) => {
    const copy = source.clone();
    return applyTransform(copy, repeatedTransform(node.step, index));
  });
  source.dispose();
  const merged = mergeModelGeometries(copies);
  copies.forEach((copy) => { if (copy !== merged) copy.dispose(); });
  return applyTransform(applyModifiers(merged, node.modifiers), node.transform);
}

function geometryBounds(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  return [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
}

function boundaryEdgeCount(geometry: BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const edges = new Map<string, number>();
  const vertexKey = (index: number) => [position.getX(index), position.getY(index), position.getZ(index)]
    .map((value) => Math.round(value * 10_000)).join(",");
  for (let index = 0; index < position.count; index += 3) {
    const vertices = [vertexKey(index), vertexKey(index + 1), vertexKey(index + 2)];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const edge = vertices[a] < vertices[b] ? `${vertices[a]}|${vertices[b]}` : `${vertices[b]}|${vertices[a]}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  if (source !== geometry) source.dispose();
  return [...edges.values()].filter((count) => count !== 2).length;
}

function topologicalBoundaryEdgeCount(geometry: BufferGeometry) {
  const index = geometry.index;
  assert.ok(index, "manifold geometry should be indexed");
  const edges = new Map<string, number>();
  for (let offset = 0; offset < index.count; offset += 3) {
    const vertices = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const edge = vertices[a] < vertices[b] ? `${vertices[a]}|${vertices[b]}` : `${vertices[b]}|${vertices[a]}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}

function meshVolume(geometry: BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  let volume = 0;
  for (let index = 0; index < position.count; index += 3) {
    const ax = position.getX(index); const ay = position.getY(index); const az = position.getZ(index);
    const bx = position.getX(index + 1); const by = position.getY(index + 1); const bz = position.getZ(index + 1);
    const cx = position.getX(index + 2); const cy = position.getY(index + 2); const cz = position.getZ(index + 2);
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  if (source !== geometry) source.dispose();
  return Math.abs(volume / 6);
}

test("parses equivalent JSON and YAML Printa documents", () => {
  const yaml = `
version: "1.0"
name: Test cylinder
units: mm
root:
  kind: shape
  id: body
  source: { type: primitive, shape: cylinder, radius: 10, height: 30, segments: 32 }
  modifiers: []
`;
  const fromYaml = parseModelDocument(yaml);
  const fromJson = parseModelDocument(JSON.stringify(fromYaml));
  assert.deepEqual(fromJson, fromYaml);
  assert.equal(fromYaml.print.placeOnBed, true);
  assert.equal(fromYaml.print.interiorStruts.enabled, false);
  assert.equal(fromYaml.display.dimensions.visible, true);
  assert.equal(fromYaml.display.buildPlate, false);
  assert.equal(decodeModelDocument(encodeModelDocument(fromYaml)).name, "Test cylinder");
});

test("publishes a machine-readable schema with every source family", () => {
  const schema = JSON.stringify(modelSpecJsonSchema());
  for (const source of ["primitive", "extrude", "revolve", "text", "water", "cloth"]) {
    assert.match(schema, new RegExp(`\\b${source}\\b`));
  }
  for (const modifier of ["twist", "taper", "radialWave", "bend", "noise", "smooth"]) {
    assert.match(schema, new RegExp(modifier));
  }
  for (const textField of ["bevelSegments", "curveSegments", "extrudeSegments", "bevelSide", "smoothNormals", "textCase", "underline"]) {
    assert.match(schema, new RegExp(textField));
  }
  for (const field of ["radiusOffset", "modulation", "buildPlate"]) assert.match(schema, new RegExp(field));
  assert.match(schema, /dimensions/);
});

test("benchmark matrix touches every evaluator family and validates every spec", () => {
  const serialized = JSON.stringify(BENCHMARK_SPECS);
  for (const family of Object.values(REQUIRED_BENCHMARK_COVERAGE).flat()) {
    assert.match(serialized, new RegExp(`\"(?:type|shape|kind|op)\":\"${family}\"`), `benchmark coverage should include ${family}`);
  }
  for (const [name, spec] of Object.entries(BENCHMARK_SPECS)) {
    assert.doesNotThrow(() => parseModelDocument(spec), `${name} should be a valid benchmark document`);
  }
  for (const shellField of ["wall", "bottomCap", "bottomThickness", "topCap", "topThickness"]) {
    assert.match(serialized, new RegExp(`\"${shellField}\"`), `benchmark coverage should include ${shellField}`);
  }
  for (const pattern of REQUIRED_STRUT_PATTERNS) assert.match(serialized, new RegExp(`\"pattern\":\"${pattern}\"`));
});

test("rejects graphs that expand beyond the safe node limit", () => {
  const base = DEMO_MODELS["spline-petal-dish"];
  assert.throws(() => validateModelDocument({
    ...base,
    root: {
      kind: "repeat",
      id: "outer-repeat",
      count: 32,
      modifiers: [],
      step: { translate: [1, 0, 0], rotate: [0, 0, 0], scale: 1 },
      child: {
        kind: "repeat",
        id: "inner-repeat",
        count: 3,
        modifiers: [],
        step: { translate: [0, 1, 0], rotate: [0, 0, 0], scale: 1 },
        child: base.root,
      },
    },
  }), /limit is 64/);
});

test("water and cloth solvers are deterministic", () => {
  for (const id of ["water-ripple-tile", "cloth-drape-study"] as const) {
    const source = DEMO_MODELS[id].root;
    assert.equal(source.kind, "shape");
    if (source.kind !== "shape") continue;
    const first = createSourceGeometry(source.source);
    const second = createSourceGeometry(source.source);
    assert.deepEqual(Array.from(first.getAttribute("position").array), Array.from(second.getAttribute("position").array));
    assert.equal(boundaryEdgeCount(first), 0, `${id} should be a closed solid`);
    first.dispose();
    second.dispose();
  }
});

test("ordered modifiers materially deform geometry", () => {
  const source = createSourceGeometry({ type: "primitive", shape: "box", width: 28, depth: 18, height: 80, segments: 8 });
  const original = geometryBounds(source);
  const modified = applyModifiers(source.clone(), [
    { type: "radialWave", amplitude: 3, count: 4, phaseDeg: 0, axialTurns: 1 },
    { type: "twist", angleDeg: 150, start: 0, end: 1 },
    { type: "taper", from: 1, to: 0.55, easing: "smoothstep" },
  ]);
  assert.notDeepEqual(geometryBounds(modified).map((value) => value.toFixed(3)), original.map((value) => value.toFixed(3)));
  source.dispose();
  modified.dispose();
});

test("modifier modulation can fade a deformation across a local axis", () => {
  const source = createSourceGeometry({
    type: "revolve",
    profile: [[20, 0], [24, 30], [24, 60], [20, 90]],
    segments: 48,
    profileSegments: 36,
    radiusOffset: 0,
    wall: 2,
    bottomCap: true,
    bottomThickness: 2.4,
    topCap: false,
    topThickness: 2.4,
    interpolation: "linear",
    axis: "z",
  });
  const zeroed = applyModifiers(source.clone(), [{
    type: "radialWave", amplitude: 6, count: 5, phaseDeg: 0, axialTurns: 0,
    modulation: { axis: "z", points: [[0, 0], [1, 0]], interpolation: "linear" },
  }]);
  const active = applyModifiers(source.clone(), [{ type: "radialWave", amplitude: 6, count: 5, phaseDeg: 0, axialTurns: 0 }]);
  assert.deepEqual(geometryBounds(zeroed).map((value) => value.toFixed(4)), geometryBounds(source).map((value) => value.toFixed(4)));
  assert.notDeepEqual(geometryBounds(active).map((value) => value.toFixed(4)), geometryBounds(source).map((value) => value.toFixed(4)));
  source.dispose(); zeroed.dispose(); active.dispose();
});

test("every primitive honors exact outer width, depth, and height", () => {
  for (const [shape, extras] of [
    ["box", {}],
    ["cylinder", { radius: 14 }],
    ["cone", { radiusBottom: 17, radiusTop: 3 }],
    ["sphere", { radius: 11 }],
    ["torus", { radius: 13, tube: 4 }],
  ] as const) {
    const geometry = createSourceGeometry({
      type: "primitive",
      shape,
      width: 53,
      depth: 37,
      height: 61,
      segments: 19,
      ...extras,
    });
    assert.deepEqual(geometryBounds(geometry).map((value) => Number(value.toFixed(5))), [53, 37, 61], `${shape} should match its requested outer bounds`);
    geometry.dispose();
  }
});

test("OpenType text honors exact tessellated width, visible height, and total bevel depth", () => {
  const glyphPath = new openTypeRuntime.Path();
  glyphPath.moveTo(0, 0); glyphPath.lineTo(600, 0); glyphPath.lineTo(600, 700); glyphPath.lineTo(0, 700); glyphPath.close();
  const font = new openTypeRuntime.Font({
    familyName: "Metric Test",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      new openTypeRuntime.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 650, path: new openTypeRuntime.Path() }),
      new openTypeRuntime.Glyph({ name: "A", unicode: 65, advanceWidth: 650, path: glyphPath }),
    ],
  });
  let lowResolutionTriangles = 0;
  for (const bevelSide of ["both", "top", "bottom"] as const) {
    const { geometry } = createTextGeometry(font, {
      text: "A", font: "metric-test", widthMm: 52, sizeMm: 37, depthMm: 5.5,
      bevelMm: 0.8, bevelSegments: 3, curveSegments: 6, extrudeSegments: 1, bevelSide,
      smoothNormals: true, textCase: "original", fontWeight: "regular", italic: false, underline: false,
    });
    const stats = geometryStats(geometry);
    assert.deepEqual([stats.widthMm, stats.heightMm, stats.depthMm].map((value) => Number(value.toFixed(5))), [52, 37, 5.5], `${bevelSide} bevel text should match its requested outer bounds`);
    lowResolutionTriangles = Math.max(lowResolutionTriangles, stats.triangles);
    geometry.dispose();
  }
  const { geometry: segmented } = createTextGeometry(font, {
    text: "A", font: "metric-test", widthMm: 52, sizeMm: 37, depthMm: 5.5,
    bevelMm: 0.8, bevelSegments: 3, curveSegments: 6, extrudeSegments: 8, bevelSide: "both",
    smoothNormals: true, textCase: "original", fontWeight: "regular", italic: false, underline: false,
  });
  assert.ok(geometryStats(segmented).triangles > lowResolutionTriangles, "depth subdivisions should add deformation-ready text geometry");
  assert.deepEqual(geometryBounds(segmented).map((value) => Number(value.toFixed(5))), [52, 37, 5.5]);
  segmented.dispose();
});

test("revolve radius offset expands the entire spun profile without changing height", () => {
  const shared = {
    type: "revolve" as const,
    profile: [[18, 0], [24, 35], [20, 80]] as Array<[number, number]>,
    segments: 64,
    profileSegments: 40,
    wall: 2,
    bottomCap: true,
    bottomThickness: 2.4,
    topCap: false,
    topThickness: 2.4,
    interpolation: "linear" as const,
    axis: "z" as const,
  };
  const original = createSourceGeometry({ ...shared, radiusOffset: 0 });
  const expanded = createSourceGeometry({ ...shared, radiusOffset: 5 });
  const originalBounds = geometryBounds(original);
  const expandedBounds = geometryBounds(expanded);
  assert.deepEqual(expandedBounds.map((value) => Number(value.toFixed(4))), [originalBounds[0] + 10, originalBounds[1] + 10, originalBounds[2]].map((value) => Number(value.toFixed(4))));
  original.dispose(); expanded.dispose();
});

test("revolved shells support watertight solid bases and top caps with thickness", () => {
  const shared = {
    type: "revolve" as const,
    profile: [[24, 0], [32, 30], [29, 70], [24, 110]] as Array<[number, number]>,
    segments: 72,
    profileSegments: 48,
    radiusOffset: 0,
    wall: 2,
    interpolation: "catmull-rom" as const,
    axis: "z" as const,
  };
  const open = createSourceGeometry({ ...shared, bottomCap: false, bottomThickness: 2.4, topCap: false, topThickness: 2.4 });
  const based = createSourceGeometry({ ...shared, bottomCap: true, bottomThickness: 5, topCap: false, topThickness: 2.4 });
  const sealed = createSourceGeometry({ ...shared, bottomCap: true, bottomThickness: 5, topCap: true, topThickness: 6 });
  for (const geometry of [open, based, sealed]) assert.equal(boundaryEdgeCount(geometry), 0, "every cap mode should remain watertight");
  assert.ok(meshVolume(based) > meshVolume(open), "a solid base should add material volume");
  assert.ok(meshVolume(sealed) > meshVolume(based), "a solid top cap should add material volume");
  open.dispose(); based.dispose(); sealed.dispose();
});

test("all interior strut patterns fuse into bounded manifold printable geometry", async () => {
  const source = {
    type: "revolve" as const,
    profile: [[28, 0], [36, 30], [33, 74], [27, 116]] as Array<[number, number]>,
    segments: 72,
    profileSegments: 48,
    radiusOffset: 0,
    wall: 2.4,
    bottomCap: true,
    bottomThickness: 3,
    topCap: true,
    topThickness: 3,
    interpolation: "catmull-rom" as const,
    axis: "z" as const,
  };
  const shell = createSourceGeometry(source);
  const shellBounds = geometryBounds(shell);
  const shellVertices = shell.getAttribute("position").count;
  for (const pattern of REQUIRED_STRUT_PATTERNS) {
    const parts = createSourceGeometryParts(source, { interiorStruts: { enabled: true, pattern, spacing: 18, diameter: 1.8, boundaryInset: 3, wallOverlap: 0.8, radialSegments: 8 } });
    const geometry = await unionClosedGeometryParts(parts);
    parts.forEach((part) => part.dispose());
    assert.ok(geometry.getAttribute("position").count > shellVertices, `${pattern} should add strut triangles`);
    assert.equal(topologicalBoundaryEdgeCount(geometry), 0, `${pattern} should be a fused 2-manifold`);
    assert.deepEqual(geometryBounds(geometry).map((value) => value.toFixed(3)), shellBounds.map((value) => value.toFixed(3)), `${pattern} should stay inside the shell bounds`);
    geometry.dispose();
  }
  shell.dispose();
});

test("the dense MCP vase regression spec evaluates to a finite printable mesh", async () => {
  const input = readFileSync(new URL("./fixtures/tall-marble-vase.yaml", import.meta.url), "utf8");
  const document = parseModelDocument(input);
  const geometry = await buildNode(document.root);
  const bounds = geometryBounds(geometry);
  assert.deepEqual(bounds.map((value) => Number(value.toFixed(2))), [84.37, 84.37, 183.7]);
  assert.equal(Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3), 149_888);
  assert.ok(geometry.getAttribute("position").count > 100_000);
  geometry.dispose();
});

test("every bundled demo produces finite, closed, printable-scale geometry", async (t) => {
  for (const [id, document] of Object.entries(DEMO_MODELS)) {
    await t.test(id, async () => {
      const parsed = parseModelDocument(document);
      if (parsed.root.kind === "shape" && parsed.root.source.type === "text") {
        assert.equal(parsed.root.source.font, "Space Grotesk");
        assert.equal(parsed.root.source.weight, "bold");
        assert.equal(parsed.display.dimensions.visible, true);
        return;
      }
      const geometry = await buildNode(parsed.root);
      const position = geometry.getAttribute("position");
      const bounds = geometryBounds(geometry);
      assert.ok(position.count >= 24);
      assert.ok(bounds.every((value) => Number.isFinite(value) && value > 0.05));
      assert.ok(bounds.every((value) => value < 256), `${id} should fit the reference build volume`);
      assert.equal(boundaryEdgeCount(geometry), 0, `${id} should have no open mesh edges`);
      geometry.dispose();
    });
  }
});
