import type { BufferAttribute, BufferGeometry } from "three";

export type BinaryStlResult = {
  bytes: Uint8Array;
  triangles: number;
  volumeEstimate: number;
};

/**
 * Encode one BufferGeometry as binary STL while optionally accumulating its
 * signed-volume terms. Keeping both operations in this triangle walk avoids a
 * second O(triangle count) pass for full-resolution downloads.
 */
export function createBinaryStl(geometry: BufferGeometry, options: { includeVolume?: boolean } = {}): BinaryStlResult {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const positions = position.array as ArrayLike<number>;
  const positionStride = position.itemSize;
  const indices = geometry.index?.array as ArrayLike<number> | undefined;
  const indexCount = indices?.length ?? position.count;
  const triangles = Math.floor(indexCount / 3);
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles, true);

  const includeVolume = options.includeVolume !== false;
  let volumeTerms = 0;
  let byteOffset = 84;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const faceOffset = triangle * 3;
    const a = (indices ? indices[faceOffset] : faceOffset) * positionStride;
    const b = (indices ? indices[faceOffset + 1] : faceOffset + 1) * positionStride;
    const c = (indices ? indices[faceOffset + 2] : faceOffset + 2) * positionStride;
    const ax = Number(positions[a]);
    const ay = Number(positions[a + 1]);
    const az = Number(positions[a + 2]);
    const bx = Number(positions[b]);
    const by = Number(positions[b + 1]);
    const bz = Number(positions[b + 2]);
    const cx = Number(positions[c]);
    const cy = Number(positions[c + 1]);
    const cz = Number(positions[c + 2]);

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const normalLength = Math.hypot(nx, ny, nz);
    if (normalLength > 0) {
      nx /= normalLength;
      ny /= normalLength;
      nz /= normalLength;
    }

    view.setFloat32(byteOffset, nx, true);
    view.setFloat32(byteOffset + 4, ny, true);
    view.setFloat32(byteOffset + 8, nz, true);
    view.setFloat32(byteOffset + 12, ax, true);
    view.setFloat32(byteOffset + 16, ay, true);
    view.setFloat32(byteOffset + 20, az, true);
    view.setFloat32(byteOffset + 24, bx, true);
    view.setFloat32(byteOffset + 28, by, true);
    view.setFloat32(byteOffset + 32, bz, true);
    view.setFloat32(byteOffset + 36, cx, true);
    view.setFloat32(byteOffset + 40, cy, true);
    view.setFloat32(byteOffset + 44, cz, true);
    view.setUint16(byteOffset + 48, 0, true);
    byteOffset += 50;

    if (includeVolume) {
      volumeTerms += ax * (by * cz - bz * cy)
        + ay * (bz * cx - bx * cz)
        + az * (bx * cy - by * cx);
    }
  }

  return {
    bytes: new Uint8Array(buffer),
    triangles,
    volumeEstimate: includeVolume ? Math.abs(volumeTerms / 6) : 0,
  };
}
