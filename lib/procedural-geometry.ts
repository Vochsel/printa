import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { ModifierSpec, SourceSpec, TransformSpec } from "@/lib/model-spec";

const DEG = Math.PI / 180;

function pathFromCommands(commands: Extract<SourceSpec, { type: "extrude" }> ["path"]["commands"]) {
  const path = new Shape();
  for (const command of commands) {
    if (command.op === "move") path.moveTo(...command.to);
    else if (command.op === "line") path.lineTo(...command.to);
    else if (command.op === "quadratic") path.quadraticCurveTo(...command.control, ...command.to);
    else if (command.op === "bezier") path.bezierCurveTo(...command.control1, ...command.control2, ...command.to);
    else path.closePath();
  }
  return path;
}

function createExtrudeGeometry(source: Extract<SourceSpec, { type: "extrude" }>) {
  const shape = pathFromCommands(source.path.commands);
  for (const holeCommands of source.path.holes) shape.holes.push(pathFromCommands(holeCommands));
  const bevel = Math.min(source.bevel, source.depth * 0.3);
  const geometry = new ExtrudeGeometry(shape, {
    depth: source.depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel * 0.72,
    bevelThickness: bevel,
    bevelSegments: source.bevelSegments,
    curveSegments: source.curveSegments,
  });
  const direction = new Vector3(...source.direction);
  if (direction.lengthSq() < 1e-10) throw new Error("Extrusion direction cannot be zero.");
  direction.normalize();
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction));
  return geometry;
}

function sampleProfile(source: Extract<SourceSpec, { type: "revolve" }>) {
  if (source.interpolation === "linear") {
    const output: Array<[number, number]> = [];
    const segmentCount = source.profile.length - 1;
    for (let index = 0; index <= source.profileSegments; index += 1) {
      const position = (index / source.profileSegments) * segmentCount;
      const segment = Math.min(segmentCount - 1, Math.floor(position));
      const t = position - segment;
      const a = source.profile[segment];
      const b = source.profile[segment + 1];
      output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return output;
  }
  const curve = new CatmullRomCurve3(
    source.profile.map(([radius, height]) => new Vector3(radius, 0, height)),
    false,
    "centripetal",
  );
  return curve.getPoints(source.profileSegments).map((point) => [Math.max(source.wall + 0.1, point.x), point.z] as [number, number]);
}

function createRevolveGeometry(source: Extract<SourceSpec, { type: "revolve" }>) {
  const profile = sampleProfile(source);
  if (profile.at(-1)![1] < profile[0][1]) profile.reverse();
  const radial = source.segments;
  const positions: number[] = [];
  const indices: number[] = [];
  const addRing = (radius: number, height: number) => {
    const start = positions.length / 3;
    for (let segment = 0; segment < radial; segment += 1) {
      const angle = (segment / radial) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, height);
    }
    return start;
  };
  const outerRings = profile.map(([radius, height]) => addRing(radius, height));
  const radiusAt = (height: number) => {
    for (let index = 0; index < profile.length - 1; index += 1) {
      const current = profile[index];
      const next = profile[index + 1];
      if (height >= current[1] && height <= next[1]) {
        const t = (height - current[1]) / Math.max(1e-8, next[1] - current[1]);
        return current[0] + (next[0] - current[0]) * t;
      }
    }
    return height <= profile[0][1] ? profile[0][0] : profile.at(-1)![0];
  };
  const bottomHeight = profile[0][1];
  const topHeight = profile.at(-1)![1];
  const totalHeight = Math.max(0.01, topHeight - bottomHeight);
  let bottomThickness = source.bottomCap ? Math.min(source.bottomThickness, totalHeight * 0.95) : 0;
  let topThickness = source.topCap ? Math.min(source.topThickness, totalHeight * 0.95) : 0;
  if (bottomThickness + topThickness > totalHeight * 0.99) {
    const scale = totalHeight * 0.99 / (bottomThickness + topThickness);
    bottomThickness *= scale;
    topThickness *= scale;
  }
  const interiorBottom = bottomHeight + bottomThickness;
  const interiorTop = topHeight - topThickness;
  const innerProfile: Array<[number, number]> = [[Math.max(0.1, radiusAt(interiorBottom) - source.wall), interiorBottom]];
  for (const [radius, height] of profile) {
    if (height > interiorBottom + 1e-6 && height < interiorTop - 1e-6) innerProfile.push([Math.max(0.1, radius - source.wall), height]);
  }
  innerProfile.push([Math.max(0.1, radiusAt(interiorTop) - source.wall), interiorTop]);
  const innerRings = innerProfile.map(([radius, height]) => addRing(radius, height));
  const at = (ring: number, segment: number) => ring + segment % radial;
  const connectRings = (rings: number[], inward = false) => {
    for (let ring = 0; ring < rings.length - 1; ring += 1) {
      for (let segment = 0; segment < radial; segment += 1) {
        const next = (segment + 1) % radial;
        const a = at(rings[ring], segment);
        const b = at(rings[ring], next);
        const c = at(rings[ring + 1], next);
        const d = at(rings[ring + 1], segment);
        if (inward) indices.push(a, d, b, b, d, c);
        else indices.push(a, b, d, b, c, d);
      }
    }
  };
  connectRings(outerRings);
  connectRings(innerRings, true);

  const addDisk = (ring: number, height: number, upward: boolean) => {
    const center = positions.length / 3;
    positions.push(0, 0, height);
    for (let segment = 0; segment < radial; segment += 1) {
      const next = (segment + 1) % radial;
      if (upward) indices.push(center, at(ring, segment), at(ring, next));
      else indices.push(center, at(ring, next), at(ring, segment));
    }
  };
  const addRim = (outerRing: number, innerRing: number, top: boolean) => {
    for (let segment = 0; segment < radial; segment += 1) {
      const next = (segment + 1) % radial;
      const outer = at(outerRing, segment);
      const outerNext = at(outerRing, next);
      const inner = at(innerRing, segment);
      const innerNext = at(innerRing, next);
      if (top) indices.push(outer, outerNext, innerNext, outer, innerNext, inner);
      else indices.push(outer, innerNext, outerNext, outer, inner, innerNext);
    }
  };
  if (source.bottomCap) {
    addDisk(outerRings[0], bottomHeight, false);
    addDisk(innerRings[0], interiorBottom, true);
  } else addRim(outerRings[0], innerRings[0], false);
  if (source.topCap) {
    addDisk(outerRings.at(-1)!, topHeight, true);
    addDisk(innerRings.at(-1)!, interiorTop, false);
  } else addRim(outerRings.at(-1)!, innerRings.at(-1)!, true);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (source.axis === "x") geometry.rotateY(Math.PI / 2);
  else if (source.axis === "y") geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createPrimitiveGeometry(source: Extract<SourceSpec, { type: "primitive" }>) {
  const width = source.width ?? (source.radius ? source.radius * 2 : 30);
  const depth = source.depth ?? width;
  const height = source.height ?? width;
  const radius = source.radius ?? Math.min(width, depth) / 2;
  let geometry: BufferGeometry;
  if (source.shape === "box") {
    geometry = new BoxGeometry(width, depth, height, 1, 1, 1);
    geometry.translate(0, 0, height / 2);
  } else if (source.shape === "cylinder" || source.shape === "cone") {
    const top = source.shape === "cone" ? source.radiusTop ?? 0 : source.radiusTop ?? radius;
    const bottom = source.radiusBottom ?? radius;
    geometry = new CylinderGeometry(top, bottom, height, source.segments, 1, false);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, height / 2);
  } else if (source.shape === "sphere") {
    geometry = new SphereGeometry(radius, source.segments, Math.max(8, Math.floor(source.segments / 2)));
    geometry.translate(0, 0, radius);
  } else {
    geometry = new TorusGeometry(radius, source.tube ?? radius * 0.25, Math.max(8, Math.floor(source.segments / 4)), source.segments);
    geometry.translate(0, 0, source.tube ?? radius * 0.25);
  }
  return geometry;
}

function solidHeightfield(
  width: number,
  depth: number,
  rows: number,
  columns: number,
  points: Array<{ x: number; y: number; z: number }>,
  thickness: number,
  flatBottomZ?: number,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  const count = rows * columns;
  for (const point of points) positions.push(point.x, point.y, point.z);
  for (const point of points) positions.push(point.x, point.y, flatBottomZ ?? point.z - thickness);
  const at = (row: number, column: number, bottom = false) => (bottom ? count : 0) + row * columns + column;

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = at(row, column);
      const b = at(row, column + 1);
      const c = at(row + 1, column + 1);
      const d = at(row + 1, column);
      indices.push(a, b, d, b, c, d);
      const ba = at(row, column, true);
      const bb = at(row, column + 1, true);
      const bc = at(row + 1, column + 1, true);
      const bd = at(row + 1, column, true);
      indices.push(ba, bd, bb, bb, bd, bc);
    }
  }

  const bridge = (topA: number, topB: number, bottomA: number, bottomB: number) => {
    indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
  };
  for (let column = 0; column < columns - 1; column += 1) {
    bridge(at(0, column), at(0, column + 1), at(0, column, true), at(0, column + 1, true));
    bridge(at(rows - 1, column + 1), at(rows - 1, column), at(rows - 1, column + 1, true), at(rows - 1, column, true));
  }
  for (let row = 0; row < rows - 1; row += 1) {
    bridge(at(row + 1, 0), at(row, 0), at(row + 1, 0, true), at(row, 0, true));
    bridge(at(row, columns - 1), at(row + 1, columns - 1), at(row, columns - 1, true), at(row + 1, columns - 1, true));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.footprint = [width, depth];
  return geometry;
}

function createWaterGeometry(source: Extract<SourceSpec, { type: "water" }>) {
  const size = source.resolution;
  const count = size * size;
  let previous = new Float64Array(count);
  let current = new Float64Array(count);
  for (let row = 0; row < size; row += 1) {
    const y = (row / (size - 1) - 0.5) * source.depth;
    for (let column = 0; column < size; column += 1) {
      const x = (column / (size - 1) - 0.5) * source.width;
      for (const drop of source.drops) {
        const distanceSquared = (x - drop.x) ** 2 + (y - drop.y) ** 2;
        current[row * size + column] += drop.amplitude * Math.exp(-distanceSquared / (2 * drop.radius ** 2));
      }
    }
  }
  previous.set(current);
  for (let step = 0; step < source.steps; step += 1) {
    const next = new Float64Array(count);
    for (let row = 1; row < size - 1; row += 1) {
      for (let column = 1; column < size - 1; column += 1) {
        const index = row * size + column;
        next[index] = ((
          current[index - 1] + current[index + 1] + current[index - size] + current[index + size]
        ) * 0.5 - previous[index]) * source.damping;
      }
    }
    previous = current;
    current = next;
  }
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      points.push({
        x: (column / (size - 1) - 0.5) * source.width,
        y: (row / (size - 1) - 0.5) * source.depth,
        z: Math.max(0.2, source.base + current[row * size + column]),
      });
    }
  }
  return solidHeightfield(source.width, source.depth, size, size, points, source.base, 0);
}

function createClothGeometry(source: Extract<SourceSpec, { type: "cloth" }>) {
  const size = source.resolution;
  const count = size * size;
  const positions = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    return new Vector3(
      (column / (size - 1) - 0.5) * source.width,
      (row / (size - 1) - 0.5) * source.depth,
      source.startHeight,
    );
  });
  const previous = positions.map((point) => point.clone());
  const pinned = new Set<number>();
  if (source.pins === "corners") {
    [0, size - 1, count - size, count - 1].forEach((index) => pinned.add(index));
  } else if (source.pins === "top-edge") {
    for (let column = 0; column < size; column += 1) pinned.add((size - 1) * size + column);
  }
  const restX = source.width / (size - 1);
  const restY = source.depth / (size - 1);
  const constraints: Array<[number, number, number]> = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const index = row * size + column;
      if (column + 1 < size) constraints.push([index, index + 1, restX]);
      if (row + 1 < size) constraints.push([index, index + size, restY]);
    }
  }
  const collider = source.collider;
  const colliderCenter = collider ? new Vector3(...collider.center) : null;
  const delta = new Vector3();
  for (let step = 0; step < source.steps; step += 1) {
    for (let index = 0; index < count; index += 1) {
      if (pinned.has(index)) continue;
      const point = positions[index];
      const velocity = point.clone().sub(previous[index]).multiplyScalar(0.992);
      previous[index].copy(point);
      point.add(velocity);
      point.z -= source.gravity;
    }
    for (let iteration = 0; iteration < source.constraintIterations; iteration += 1) {
      for (const [aIndex, bIndex, rest] of constraints) {
        const a = positions[aIndex];
        const b = positions[bIndex];
        delta.subVectors(b, a);
        const length = Math.max(delta.length(), 1e-6);
        const correction = delta.multiplyScalar((length - rest) / length * 0.5);
        if (!pinned.has(aIndex)) a.add(correction);
        if (!pinned.has(bIndex)) b.sub(correction);
      }
      if (collider && colliderCenter) {
        for (let index = 0; index < count; index += 1) {
          if (pinned.has(index)) continue;
          delta.subVectors(positions[index], colliderCenter);
          const length = delta.length();
          if (length < collider.radius) positions[index].copy(colliderCenter).add(delta.multiplyScalar(collider.radius / Math.max(length, 1e-6)));
        }
      }
    }
  }
  const points = positions.map((point) => ({ x: point.x, y: point.y, z: point.z }));
  return solidHeightfield(source.width, source.depth, size, size, points, source.thickness);
}

export function createSourceGeometry(source: Exclude<SourceSpec, { type: "text" }>) {
  if (source.type === "primitive") return createPrimitiveGeometry(source);
  if (source.type === "extrude") return createExtrudeGeometry(source);
  if (source.type === "revolve") return createRevolveGeometry(source);
  if (source.type === "water") return createWaterGeometry(source);
  return createClothGeometry(source);
}

function boundsFor(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  return {
    minZ: bounds.min.z,
    height: Math.max(1e-6, bounds.max.z - bounds.min.z),
  };
}

function laplacianSmooth(input: BufferGeometry, iterations: number, strength: number) {
  const geometry = mergeVertices(input.clone(), 1e-5);
  const index = geometry.index;
  if (!index) return geometry;
  const position = geometry.getAttribute("position") as BufferAttribute;
  const adjacency = Array.from({ length: position.count }, () => new Set<number>());
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    adjacency[a].add(b).add(c);
    adjacency[b].add(a).add(c);
    adjacency[c].add(a).add(b);
  }
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Float32Array(position.array as ArrayLike<number>);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const neighbors = adjacency[vertex];
      if (neighbors.size < 3) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      neighbors.forEach((neighbor) => {
        x += position.getX(neighbor);
        y += position.getY(neighbor);
        z += position.getZ(neighbor);
      });
      const offset = vertex * 3;
      next[offset] = position.getX(vertex) + (x / neighbors.size - position.getX(vertex)) * strength;
      next[offset + 1] = position.getY(vertex) + (y / neighbors.size - position.getY(vertex)) * strength;
      next[offset + 2] = position.getZ(vertex) + (z / neighbors.size - position.getZ(vertex)) * strength;
    }
    position.array.set(next);
    position.needsUpdate = true;
  }
  return geometry;
}

export function applyModifiers(input: BufferGeometry, modifiers: ModifierSpec[]) {
  let geometry = input;
  let bounds = boundsFor(geometry);
  for (const modifier of modifiers) {
    if (modifier.type === "smooth") {
      const previous = geometry;
      const next = laplacianSmooth(geometry, modifier.iterations, modifier.strength);
      geometry = next;
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      continue;
    }
    const position = geometry.getAttribute("position") as BufferAttribute;
    const { minZ, height } = bounds;
    for (let index = 0; index < position.count; index += 1) {
      let x = position.getX(index);
      let y = position.getY(index);
      let z = position.getZ(index);
      const t = Math.min(1, Math.max(0, (z - minZ) / height));
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      if (modifier.type === "twist") {
        const span = Math.max(1e-6, modifier.end - modifier.start);
        const local = Math.min(1, Math.max(0, (t - modifier.start) / span));
        const nextAngle = angle + modifier.angleDeg * DEG * local;
        x = Math.cos(nextAngle) * radius;
        y = Math.sin(nextAngle) * radius;
      } else if (modifier.type === "taper") {
        const eased = modifier.easing === "smoothstep" ? t * t * (3 - 2 * t) : t;
        const scale = modifier.from + (modifier.to - modifier.from) * eased;
        x *= scale;
        y *= scale;
      } else if (modifier.type === "radialWave" || modifier.type === "axialWave" || modifier.type === "noise") {
        let amount = 0;
        if (modifier.type === "radialWave") amount = modifier.amplitude * Math.sin(angle * modifier.count + modifier.phaseDeg * DEG + t * modifier.axialTurns * Math.PI * 2);
        else if (modifier.type === "axialWave") amount = modifier.amplitude * Math.sin(t * modifier.cycles * Math.PI * 2 + modifier.phaseDeg * DEG);
        else amount = modifier.amplitude * Math.sin((x + modifier.seed * 17.17) / modifier.scale * 2.13 + Math.sin((y - modifier.seed * 7.31) / modifier.scale * 1.71) + z / modifier.scale * 2.47);
        const nextRadius = Math.max(0.05, radius + amount);
        x = Math.cos(angle) * nextRadius;
        y = Math.sin(angle) * nextRadius;
      } else if (modifier.type === "bend" && Math.abs(modifier.angleDeg) > 1e-4) {
        const direction = modifier.directionDeg * DEG;
        const cosDirection = Math.cos(direction);
        const sinDirection = Math.sin(direction);
        const localX = x * cosDirection + y * sinDirection;
        const localY = -x * sinDirection + y * cosDirection;
        const totalAngle = modifier.angleDeg * DEG;
        const bendAngle = totalAngle * t;
        const bendRadius = height / totalAngle;
        const bentX = localX * Math.cos(bendAngle) + bendRadius * (1 - Math.cos(bendAngle));
        z = minZ + bendRadius * Math.sin(bendAngle) - localX * Math.sin(bendAngle);
        x = bentX * cosDirection - localY * sinDirection;
        y = bentX * sinDirection + localY * cosDirection;
      }
      position.setXYZ(index, x, y, z);
    }
    position.needsUpdate = true;
    if (modifier.type === "bend") bounds = boundsFor(geometry);
  }
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function transformMatrix(transform?: TransformSpec) {
  const value = transform ?? { translate: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
  const scale = typeof value.scale === "number" ? [value.scale, value.scale, value.scale] : value.scale;
  return new Matrix4().compose(
    new Vector3(...value.translate),
    new Quaternion().setFromEuler(new Euler(value.rotate[0] * DEG, value.rotate[1] * DEG, value.rotate[2] * DEG, "XYZ")),
    new Vector3(...scale),
  );
}

export function applyTransform(geometry: BufferGeometry, transform?: TransformSpec) {
  if (transform) geometry.applyMatrix4(transformMatrix(transform));
  return geometry;
}

export function repeatedTransform(transform: TransformSpec, index: number): TransformSpec {
  const scale = typeof transform.scale === "number"
    ? transform.scale ** index
    : transform.scale.map((value) => value ** index) as [number, number, number];
  return {
    translate: transform.translate.map((value) => value * index) as [number, number, number],
    rotate: transform.rotate.map((value) => value * index) as [number, number, number],
    scale,
  };
}

export function mergeModelGeometries(geometries: BufferGeometry[]) {
  if (geometries.length === 1) return geometries[0];
  const clean = geometries.map((source) => {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position") geometry.deleteAttribute(name);
    }
    return geometry;
  });
  const merged = mergeGeometries(clean, false);
  clean.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Could not merge model geometries.");
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}
