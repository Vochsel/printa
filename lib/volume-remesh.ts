import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { weldGeometryPositions } from "@/lib/geometry-weld";

export type CapsuleSegment = {
  start: Vector3;
  end: Vector3;
  startRadius: number;
  endRadius: number;
};

export type CapsuleRemeshOptions = {
  resolution: number;
  blend: number;
  smoothIterations?: number;
};

const EMPTY_FIELD = -1e6;

function smoothMaximum(a: number, b: number, blend: number) {
  if (a <= EMPTY_FIELD * 0.5) return b;
  if (blend <= 1e-6) return Math.max(a, b);
  const h = Math.max(blend - Math.abs(a - b), 0) / blend;
  return Math.max(a, b) + h * h * h * blend / 6;
}

function taubinSmooth(geometry: BufferGeometry, iterations: number) {
  const index = geometry.index;
  const position = geometry.getAttribute("position") as BufferAttribute;
  if (!index || iterations <= 0) return;
  const neighbors = Array.from({ length: position.count }, () => new Set<number>());
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }
  const source = new Float32Array(position.array as ArrayLike<number>);
  const target = new Float32Array(source.length);
  const pass = (weight: number) => {
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const adjacent = neighbors[vertex];
      if (!adjacent.size) {
        target[vertex * 3] = source[vertex * 3];
        target[vertex * 3 + 1] = source[vertex * 3 + 1];
        target[vertex * 3 + 2] = source[vertex * 3 + 2];
        continue;
      }
      let x = 0; let y = 0; let z = 0;
      for (const neighbor of adjacent) {
        x += source[neighbor * 3];
        y += source[neighbor * 3 + 1];
        z += source[neighbor * 3 + 2];
      }
      const inverse = 1 / adjacent.size;
      const offset = vertex * 3;
      target[offset] = source[offset] + (x * inverse - source[offset]) * weight;
      target[offset + 1] = source[offset + 1] + (y * inverse - source[offset + 1]) * weight;
      target[offset + 2] = source[offset + 2] + (z * inverse - source[offset + 2]) * weight;
    }
    source.set(target);
  };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    pass(0.34);
    pass(-0.35);
  }
  position.array.set(source);
  position.needsUpdate = true;
}

function removeRasterSpecks(geometry: BufferGeometry) {
  const index = geometry.index;
  const position = geometry.getAttribute("position") as BufferAttribute;
  if (!index) return geometry;
  const parent = new Uint32Array(position.count);
  for (let vertex = 0; vertex < position.count; vertex += 1) parent[vertex] = vertex;
  const find = (vertex: number): number => parent[vertex] === vertex ? vertex : (parent[vertex] = find(parent[vertex]));
  const join = (a: number, b: number) => { const rootA = find(a); const rootB = find(b); if (rootA !== rootB) parent[rootA] = rootB; };
  for (let offset = 0; offset < index.count; offset += 3) {
    join(index.getX(offset), index.getX(offset + 1));
    join(index.getX(offset + 1), index.getX(offset + 2));
  }
  const componentTriangles = new Map<number, number>();
  for (let offset = 0; offset < index.count; offset += 3) {
    const root = find(index.getX(offset));
    componentTriangles.set(root, (componentTriangles.get(root) ?? 0) + 1);
  }
  if (componentTriangles.size <= 1) return geometry;
  const largest = Math.max(...componentTriangles.values());
  const threshold = Math.max(12, Math.ceil(index.count / 3 * 0.002));
  const keep = new Set([...componentTriangles].filter(([, triangles]) => triangles === largest || triangles >= threshold).map(([root]) => root));
  if (keep.size === componentTriangles.size) return geometry;

  const remap = new Map<number, number>();
  const positions: number[] = [];
  const indices: number[] = [];
  const mapVertex = (vertex: number) => {
    const existing = remap.get(vertex);
    if (existing !== undefined) return existing;
    const mapped = remap.size;
    remap.set(vertex, mapped);
    positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
    return mapped;
  };
  for (let offset = 0; offset < index.count; offset += 3) {
    if (!keep.has(find(index.getX(offset)))) continue;
    indices.push(mapVertex(index.getX(offset)), mapVertex(index.getX(offset + 1)), mapVertex(index.getX(offset + 2)));
  }
  const cleaned = new BufferGeometry();
  cleaned.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  cleaned.setIndex(indices);
  geometry.dispose();
  return cleaned;
}

/**
 * Rasterize a connected network of tapered capsules into a smooth scalar field,
 * then extract one welded surface. This mirrors a PolyWire -> VDB Smooth SDF ->
 * Convert VDB workflow without paying for hundreds of mesh Boolean operations.
 */
export function remeshCapsuleNetwork(segments: CapsuleSegment[], options: CapsuleRemeshOptions) {
  if (!segments.length) throw new Error("Volumetric remesh requires at least one segment.");
  const resolution = Math.max(24, Math.min(96, Math.round(options.resolution)));
  const blend = Math.max(0, options.blend);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  let maxRadius = 0;
  for (const segment of segments) {
    const radius = Math.max(segment.startRadius, segment.endRadius, 1e-3);
    maxRadius = Math.max(maxRadius, radius);
    min.x = Math.min(min.x, segment.start.x - radius, segment.end.x - radius);
    min.y = Math.min(min.y, segment.start.y - radius, segment.end.y - radius);
    min.z = Math.min(min.z, segment.start.z - radius, segment.end.z - radius);
    max.x = Math.max(max.x, segment.start.x + radius, segment.end.x + radius);
    max.y = Math.max(max.y, segment.start.y + radius, segment.end.y + radius);
    max.z = Math.max(max.z, segment.start.z + radius, segment.end.z + radius);
  }
  const rawSpan = max.clone().sub(min);
  const padding = Math.max(maxRadius * 0.8 + blend, Math.max(rawSpan.x, rawSpan.y, rawSpan.z) * 0.025, 0.25);
  min.addScalar(-padding);
  max.addScalar(padding);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const span = max.clone().sub(min);
  const side = Math.max(span.x, span.y, span.z, 1e-3);
  const half = side / 2;
  const cubeMin = center.clone().subScalar(half);
  const gridScale = (resolution - 1) / side;
  const voxel = side / (resolution - 1);
  const field = new Float32Array(resolution ** 3);
  field.fill(EMPTY_FIELD);
  const size2 = resolution * resolution;
  const clampIndex = (value: number) => Math.max(1, Math.min(resolution - 2, value));

  for (const segment of segments) {
    const ax = segment.start.x; const ay = segment.start.y; const az = segment.start.z;
    const dx = segment.end.x - ax; const dy = segment.end.y - ay; const dz = segment.end.z - az;
    const length2 = Math.max(dx * dx + dy * dy + dz * dz, 1e-12);
    const radius = Math.max(segment.startRadius, segment.endRadius);
    const influence = radius + blend + voxel * 1.75;
    const loX = clampIndex(Math.floor((Math.min(ax, segment.end.x) - influence - cubeMin.x) * gridScale));
    const loY = clampIndex(Math.floor((Math.min(ay, segment.end.y) - influence - cubeMin.y) * gridScale));
    const loZ = clampIndex(Math.floor((Math.min(az, segment.end.z) - influence - cubeMin.z) * gridScale));
    const hiX = clampIndex(Math.ceil((Math.max(ax, segment.end.x) + influence - cubeMin.x) * gridScale));
    const hiY = clampIndex(Math.ceil((Math.max(ay, segment.end.y) + influence - cubeMin.y) * gridScale));
    const hiZ = clampIndex(Math.ceil((Math.max(az, segment.end.z) + influence - cubeMin.z) * gridScale));
    for (let z = loZ; z <= hiZ; z += 1) {
      const wz = cubeMin.z + z / (resolution - 1) * side;
      for (let y = loY; y <= hiY; y += 1) {
        const wy = cubeMin.y + y / (resolution - 1) * side;
        for (let x = loX; x <= hiX; x += 1) {
          const wx = cubeMin.x + x / (resolution - 1) * side;
          const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy + (wz - az) * dz) / length2));
          const px = ax + dx * t; const py = ay + dy * t; const pz = az + dz * t;
          const localRadius = segment.startRadius + (segment.endRadius - segment.startRadius) * t;
          const value = localRadius - Math.hypot(wx - px, wy - py, wz - pz);
          const offset = x + y * resolution + z * size2;
          field[offset] = smoothMaximum(field[offset], value, blend);
        }
      }
    }
  }

  // Avoid exact zero samples and symmetric saddle ties in the classic marching
  // cubes lookup table. The perturbation is five orders of magnitude below a
  // voxel, so it is invisible while preventing coincident four-face edges.
  const tieBreak = voxel * 1e-5;
  for (let offset = 0; offset < field.length; offset += 1) {
    if (field[offset] <= EMPTY_FIELD * 0.5) continue;
    const hash = Math.imul(offset + 1, 0x45d9f3b) >>> 0;
    field[offset] += ((hash & 1023) / 1023 - 0.5) * tieBreak;
  }

  const maxTriangles = Math.min(320_000, Math.max(48_000, resolution * resolution * 24));
  const marching = new MarchingCubes(resolution, undefined as never, false, false, maxTriangles);
  marching.field.set(field);
  // A tiny outward offset turns grid-scale tangencies into a real union. This
  // is the volumetric equivalent of VDB closing and avoids disconnected tips
  // or non-manifold edge contacts without visibly thickening the result.
  marching.isolation = -voxel * 0.025;
  marching.update();
  if (!marching.count) throw new Error("Volumetric remesh did not produce a surface; increase radius or resolution.");
  if (marching.count / 3 >= maxTriangles - 1) throw new Error(`Volumetric remesh exceeded its ${maxTriangles.toLocaleString("en-US")}-triangle safety budget.`);

  const raw = new BufferGeometry();
  const output = new Float32Array(marching.count * 3);
  for (let vertex = 0; vertex < marching.count; vertex += 1) {
    output[vertex * 3] = center.x + marching.positionArray[vertex * 3] * half;
    output[vertex * 3 + 1] = center.y + marching.positionArray[vertex * 3 + 1] * half;
    output[vertex * 3 + 2] = center.z + marching.positionArray[vertex * 3 + 2] * half;
  }
  raw.setAttribute("position", new BufferAttribute(output, 3));
  let geometry = weldGeometryPositions(raw, Math.max(1e-5, voxel * 1e-4));
  raw.dispose();
  geometry = removeRasterSpecks(geometry);
  taubinSmooth(geometry, Math.max(0, Math.min(4, Math.round(options.smoothIterations ?? 2))));
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
