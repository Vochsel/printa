import { BufferAttribute, BufferGeometry } from "three";

export function weldPositionArrays(source: BufferGeometry, tolerance = 1e-4) {
  const position = source.getAttribute("position");
  const sourceIndex = source.getIndex();
  const indexCount = sourceIndex?.count ?? position.count;
  const positions = new Float32Array(position.count * 3);
  const triangles = new Uint32Array(indexCount);
  const quantizedX = new Int32Array(position.count);
  const quantizedY = new Int32Array(position.count);
  const quantizedZ = new Int32Array(position.count);
  const hashToIndex = new Map<number, number | number[]>();
  const safeTolerance = Math.max(tolerance, Number.EPSILON);
  const hashMultiplier = 10 ** Math.log10(1 / safeTolerance);
  const hashAdditive = safeTolerance * 0.5 * hashMultiplier;
  let vertexCount = 0;

  for (let offset = 0; offset < indexCount; offset += 1) {
    const sourceVertex = sourceIndex ? sourceIndex.getX(offset) : offset;
    const x = position.getX(sourceVertex);
    const y = position.getY(sourceVertex);
    const z = position.getZ(sourceVertex);
    // Match BufferGeometryUtils.mergeVertices' quantization while hashing the
    // three integers numerically. Quantized coordinates are checked after the
    // hash so even a rare 32-bit collision cannot merge different vertices.
    const qx = ~~(x * hashMultiplier + hashAdditive);
    const qy = ~~(y * hashMultiplier + hashAdditive);
    const qz = ~~(z * hashMultiplier + hashAdditive);
    const hash = Math.imul(qx, 73_856_093) ^ Math.imul(qy, 19_349_663) ^ Math.imul(qz, 83_492_791);
    const candidates = hashToIndex.get(hash);
    let targetVertex: number | undefined;
    if (typeof candidates === "number") {
      if (quantizedX[candidates] === qx && quantizedY[candidates] === qy && quantizedZ[candidates] === qz) targetVertex = candidates;
    } else if (candidates) {
      for (const candidate of candidates) {
        if (quantizedX[candidate] === qx && quantizedY[candidate] === qy && quantizedZ[candidate] === qz) {
          targetVertex = candidate;
          break;
        }
      }
    }
    if (targetVertex === undefined) {
      targetVertex = vertexCount;
      if (candidates === undefined) hashToIndex.set(hash, targetVertex);
      else if (typeof candidates === "number") hashToIndex.set(hash, [candidates, targetVertex]);
      else candidates.push(targetVertex);
      quantizedX[targetVertex] = qx;
      quantizedY[targetVertex] = qy;
      quantizedZ[targetVertex] = qz;
      positions[targetVertex * 3] = x;
      positions[targetVertex * 3 + 1] = y;
      positions[targetVertex * 3 + 2] = z;
      vertexCount += 1;
    }
    triangles[offset] = targetVertex;
  }

  return {
    positions: positions.slice(0, vertexCount * 3),
    triangles,
  };
}

export function weldGeometryPositions(source: BufferGeometry, tolerance = 1e-4) {
  const welded = weldPositionArrays(source, tolerance);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(welded.positions, 3));
  geometry.setIndex(new BufferAttribute(welded.triangles, 1));
  return geometry;
}
