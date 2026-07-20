import "server-only";
import { BufferGeometry, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { SceneCollider } from "@/lib/fluid-sim";

/**
 * Wraps a merged, world-space scene geometry in a BVH and exposes a
 * nearest-surface query used by the fluid and cloth solvers to collide with
 * every other shape in the document. The outward normal is the closest face's
 * geometric normal, oriented away from the query point when it is inside.
 */
export function buildSceneCollider(geometry: BufferGeometry | null): SceneCollider | null {
  const position = geometry?.getAttribute("position");
  if (!geometry || !position || position.count < 3) return null;
  const bvh = new MeshBVH(geometry);
  const index = geometry.index;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const normal = new Vector3();
  const hit: { point: Vector3; distance: number; faceIndex: number } = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const closest = { distance: 0, inside: false, nx: 0, ny: 0, nz: 1 };
  const faceCount = Math.floor((index?.count ?? position.count) / 3);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!.clone();
  const faceNormals = new Float64Array(faceCount * 3);
  for (let face = 0; face < faceCount; face += 1) {
    const ia = index ? index.getX(face * 3) : face * 3;
    const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1;
    const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac).normalize();
    const offset = face * 3;
    faceNormals[offset] = Number.isFinite(normal.x) ? normal.x : 0;
    faceNormals[offset + 1] = Number.isFinite(normal.y) ? normal.y : 0;
    faceNormals[offset + 2] = Number.isFinite(normal.z) ? normal.z : 1;
  }

  return {
    mayContact(point, margin) {
      return point.x >= bounds.min.x - margin && point.x <= bounds.max.x + margin
        && point.y >= bounds.min.y - margin && point.y <= bounds.max.y + margin
        && point.z >= bounds.min.z - margin && point.z <= bounds.max.z + margin;
    },
    closest(point, target) {
      const result = bvh.closestPointToPoint(point, hit);
      if (!result) return null;
      target.copy(result.point);
      const face = result.faceIndex;
      // Geometric (outward) face normal — the push-out direction. It points
      // away from the solid interior for a consistently-wound closed mesh.
      const offset = face * 3;
      const nx = faceNormals[offset];
      const ny = faceNormals[offset + 1];
      const nz = faceNormals[offset + 2];
      // `inside` means the query point is behind the surface (within the solid),
      // so it must be pushed out even when the nearest surface is far away.
      closest.distance = result.distance;
      closest.inside = (point.x - result.point.x) * nx + (point.y - result.point.y) * ny + (point.z - result.point.z) * nz < 0;
      closest.nx = nx;
      closest.ny = ny;
      closest.nz = nz;
      return closest;
    },
  };
}
