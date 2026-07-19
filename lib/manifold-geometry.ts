import Module, { type ManifoldToplevel } from "manifold-3d";
import { BufferAttribute, BufferGeometry } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

let runtimePromise: Promise<ManifoldToplevel> | null = null;

async function runtime() {
  if (!runtimePromise) runtimePromise = Module().then((wasm) => { wasm.setup(); return wasm; });
  return runtimePromise;
}

function weldForManifold(source: BufferGeometry) {
  const working = source.clone();
  for (const name of Object.keys(working.attributes)) {
    if (name !== "position") working.deleteAttribute(name);
  }
  const welded = mergeVertices(working, 1e-5);
  if (welded !== working) working.dispose();
  if (!welded.index) {
    welded.setIndex(Array.from({ length: welded.getAttribute("position").count }, (_, index) => index));
  }
  return welded;
}

export async function unionClosedGeometryParts(parts: BufferGeometry[]) {
  if (parts.length === 1) return parts[0].clone();
  const wasm = await runtime();
  const solids = parts.map((part, index) => {
    const geometry = weldForManifold(part);
    const position = geometry.getAttribute("position");
    const mesh = new wasm.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(position.array as ArrayLike<number>),
      triVerts: new Uint32Array(geometry.index!.array as ArrayLike<number>),
    });
    const solid = new wasm.Manifold(mesh);
    geometry.dispose();
    const status = solid.status();
    if (status !== "NoError") {
      solid.delete();
      throw new Error(`Interior strut part ${index + 1} is not manifold: ${status}.`);
    }
    return solid;
  });
  let union: InstanceType<ManifoldToplevel["Manifold"]> | null = null;
  try {
    union = wasm.Manifold.union(solids);
    const status = union.status();
    if (status !== "NoError") throw new Error(`Interior strut union failed: ${status}.`);
    const mesh = union.getMesh();
    const positions = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
    for (let vertex = 0; vertex < mesh.vertProperties.length / mesh.numProp; vertex += 1) {
      positions[vertex * 3] = mesh.vertProperties[vertex * mesh.numProp];
      positions[vertex * 3 + 1] = mesh.vertProperties[vertex * mesh.numProp + 1];
      positions[vertex * 3 + 2] = mesh.vertProperties[vertex * mesh.numProp + 2];
    }
    const vertexCount = positions.length / 3;
    const parent = new Uint32Array(vertexCount);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) parent[vertex] = vertex;
    const find = (vertex: number): number => parent[vertex] === vertex ? vertex : (parent[vertex] = find(parent[vertex]));
    for (let index = 0; index < mesh.mergeFromVert.length; index += 1) {
      const from = find(mesh.mergeFromVert[index]);
      const to = find(mesh.mergeToVert[index]);
      if (from !== to) parent[from] = to;
    }
    const triangles = new Uint32Array(mesh.triVerts.length);
    for (let index = 0; index < mesh.triVerts.length; index += 1) triangles[index] = find(mesh.triVerts[index]);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(triangles, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } finally {
    union?.delete();
    solids.forEach((solid) => solid.delete());
  }
}
