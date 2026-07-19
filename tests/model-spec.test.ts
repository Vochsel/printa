import assert from "node:assert/strict";
import test from "node:test";
import type { BufferGeometry } from "three";
import { DEMO_MODELS } from "../lib/demo-models";
import { BENCHMARK_SPECS, REQUIRED_BENCHMARK_COVERAGE } from "../benchmarks/specs";
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
  mergeModelGeometries,
  repeatedTransform,
} from "../lib/procedural-geometry";

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
  assert.equal(fromYaml.display.dimensions.visible, true);
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
  for (const textField of ["bevelSegments", "curveSegments", "bevelSide", "smoothNormals", "textCase", "underline"]) {
    assert.match(schema, new RegExp(textField));
  }
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
