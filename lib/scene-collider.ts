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
  const toPoint = new Vector3();
  const hit: { point: Vector3; distance: number; faceIndex: number } = { point: new Vector3(), distance: 0, faceIndex: 0 };

  return {
    closest(point, target) {
      const result = bvh.closestPointToPoint(point, hit);
      if (!result) return null;
      target.copy(result.point);
      const face = result.faceIndex;
      const ia = index ? index.getX(face * 3) : face * 3;
      const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1;
      const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      // Geometric (outward) face normal — the push-out direction. It points
      // away from the solid interior for a consistently-wound closed mesh.
      normal.crossVectors(ab, ac).normalize();
      if (!Number.isFinite(normal.x)) normal.set(0, 0, 1);
      // `inside` means the query point is behind the surface (within the solid),
      // so it must be pushed out even when the nearest surface is far away.
      toPoint.subVectors(point, result.point);
      const inside = toPoint.dot(normal) < 0;
      return { distance: result.distance, inside, nx: normal.x, ny: normal.y, nz: normal.z };
    },
  };
}
