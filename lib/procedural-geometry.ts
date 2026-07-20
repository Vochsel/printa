import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Ray,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH } from "three-mesh-bvh";
import { weldGeometryPositions } from "@/lib/geometry-weld";
import type { InteriorStrutsSpec, ModifierSpec, SourceSpec, TransformSpec } from "@/lib/model-spec";
import { simulateFluid, simulateFluidParticles, MAX_PARTICLES, type SceneCollider } from "@/lib/fluid-sim";
import { remeshCapsuleNetwork, type CapsuleSegment } from "@/lib/volume-remesh";
import { subdivideGeometry, subdivisionTriangleCount } from "@/lib/subdivision";

export type SourceBuildOptions = { interiorStruts?: InteriorStrutsSpec; sceneCollider?: SceneCollider | null };

const DEG = Math.PI / 180;
const MAX_MODIFIER_TRIANGLES = 1_200_000;

function assertModifierExpansion(input: BufferGeometry, copies: number, label: string) {
  const triangles = Math.floor((input.index?.count ?? input.getAttribute("position").count) / 3);
  const expanded = triangles * copies;
  if (expanded > MAX_MODIFIER_TRIANGLES) {
    throw new Error(`${label} modifier would create ${expanded.toLocaleString("en-US")} triangles; the safe limit is ${MAX_MODIFIER_TRIANGLES.toLocaleString("en-US")}.`);
  }
}

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
  const sourceProfile = source.profile.map(([radius, height]) => [
    Math.max(source.wall + 0.1, radius + source.radiusOffset),
    height,
  ] as [number, number]);
  if (source.interpolation === "linear") {
    const output: Array<[number, number]> = [];
    const segmentCount = sourceProfile.length - 1;
    for (let index = 0; index <= source.profileSegments; index += 1) {
      const position = (index / source.profileSegments) * segmentCount;
      const segment = Math.min(segmentCount - 1, Math.floor(position));
      const t = position - segment;
      const a = sourceProfile[segment];
      const b = sourceProfile[segment + 1];
      output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return output;
  }
  const curve = new CatmullRomCurve3(
    sourceProfile.map(([radius, height]) => new Vector3(radius, 0, height)),
    false,
    "centripetal",
  );
  return curve.getPoints(source.profileSegments).map((point) => [Math.max(source.wall + 0.1, point.x), point.z] as [number, number]);
}

function strutBetween(start: Vector3, end: Vector3, diameter: number, radialSegments: number, overlap = 0) {
  const direction = end.clone().sub(start);
  const length = direction.length() + overlap * 2;
  if (length < 1e-4) return null;
  const geometry = new CylinderGeometry(diameter / 2, diameter / 2, length, radialSegments, 1, false);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  return geometry;
}

function createRevolveGeometryParts(source: Extract<SourceSpec, { type: "revolve" }>, struts?: InteriorStrutsSpec) {
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
  const strutGeometries: BufferGeometry[] = [];
  if (struts?.enabled) {
    const inset = Math.min(struts.boundaryInset, Math.max(0, (interiorTop - interiorBottom) * 0.4));
    const zMin = interiorBottom + inset;
    const zMax = interiorTop - inset;
    const usableHeight = zMax - zMin;
    if (usableHeight > struts.diameter) {
      const layerCount = Math.max(1, Math.floor(usableHeight / struts.spacing) + 1);
      const layers = Array.from({ length: layerCount }, (_, index) => layerCount === 1
        ? (zMin + zMax) / 2
        : zMin + index / (layerCount - 1) * usableHeight);
      const pointOnWall = (angle: number, height: number) => {
        const inside = Math.max(struts.diameter, radiusAt(height) - source.wall);
        const overlap = Math.min(struts.wallOverlap, source.wall * 0.8, Math.max(0, source.wall - struts.diameter * 0.55));
        const radius = inside + overlap;
        return new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, height);
      };
      const joints = new Set<string>();
      const addJoint = (point: Vector3) => {
        const key = [point.x, point.y, point.z].map((value) => Math.round(value * 10_000)).join(":");
        if (joints.has(key) || strutGeometries.length >= 320) return;
        joints.add(key);
        const joint = new SphereGeometry(struts.diameter * 0.5, struts.radialSegments, Math.max(4, Math.floor(struts.radialSegments / 2)));
        joint.translate(point.x, point.y, point.z);
        strutGeometries.push(joint);
      };
      const addStrut = (start: Vector3, end: Vector3) => {
        if (strutGeometries.length >= 317) return;
        const strut = strutBetween(start, end, struts.diameter, struts.radialSegments);
        if (strut) {
          strutGeometries.push(strut);
          addJoint(start);
          addJoint(end);
        }
      };
      layers.forEach((height, layer) => {
        const angle = layer % 2 * Math.PI / 4;
        if (struts.pattern === "radial") {
          for (let spoke = 0; spoke < 4; spoke += 1) addStrut(new Vector3(0, 0, height), pointOnWall(angle + spoke * Math.PI / 2, height));
        } else {
          addStrut(pointOnWall(angle, height), pointOnWall(angle + Math.PI, height));
          addStrut(pointOnWall(angle + Math.PI / 2, height), pointOnWall(angle + Math.PI * 1.5, height));
        }
      });
      if (struts.pattern === "radial") addStrut(new Vector3(0, 0, zMin), new Vector3(0, 0, zMax));
      if (struts.pattern === "diamond") {
        for (let layer = 0; layer < layers.length - 1; layer += 1) {
          const lowerAngle = layer % 2 * Math.PI / 4;
          const upperAngle = (layer + 1) % 2 * Math.PI / 4;
          for (let side = 0; side < 4; side += 1) {
            addStrut(
              pointOnWall(lowerAngle + side * Math.PI / 2, layers[layer]),
              pointOnWall(upperAngle + (side + 1) * Math.PI / 2, layers[layer + 1]),
            );
          }
        }
      }
    }
  }
  const parts = [geometry, ...strutGeometries];
  if (source.axis === "x") parts.forEach((part) => part.rotateY(Math.PI / 2));
  else if (source.axis === "y") parts.forEach((part) => part.rotateX(-Math.PI / 2));
  return parts;
}

function createPrimitiveGeometry(source: Extract<SourceSpec, { type: "primitive" }>) {
  const profileRadius = Math.max(source.radiusBottom ?? 0, source.radiusTop ?? 0);
  const radius = source.radius ?? (profileRadius > 0 ? profileRadius : Math.min(source.width ?? 30, source.depth ?? source.width ?? 30) / 2);
  const tube = source.tube ?? radius * 0.25;
  const outerRadius = source.shape === "cone" || source.shape === "cylinder"
    ? Math.max(source.radiusBottom ?? radius, source.radiusTop ?? (source.shape === "cone" ? 0 : radius))
    : radius;
  const radialDiameter = source.shape === "torus" ? (radius + tube) * 2 : outerRadius * 2;
  const naturalHeight = source.shape === "torus" ? tube * 2 : radialDiameter;
  const width = source.width ?? radialDiameter;
  const depth = source.depth ?? radialDiameter;
  const height = source.height ?? naturalHeight;
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
    geometry = new TorusGeometry(radius, tube, Math.max(8, Math.floor(source.segments / 4)), source.segments);
    geometry.translate(0, 0, tube);
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const measuredWidth = bounds.max.x - bounds.min.x;
  const measuredDepth = bounds.max.y - bounds.min.y;
  const measuredHeight = bounds.max.z - bounds.min.z;
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, -bounds.min.z);
  geometry.scale(width / measuredWidth, depth / measuredDepth, height / measuredHeight);
  geometry.computeBoundingBox();
  return geometry;
}

function seededUnit(seed: number, x: number, y = 0, z = 0, salt = 0) {
  let value = Math.imul((seed ^ salt) | 0, 0x45d9f3b);
  value ^= Math.imul((x + 0x9e3779b9) | 0, 0x27d4eb2d);
  value ^= Math.imul((y + 0x85ebca6b) | 0, 0x165667b1);
  value ^= Math.imul((z + 0xc2b2ae35) | 0, 0x1b873593);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function mergeClosedNetwork(parts: BufferGeometry[]) {
  if (!parts.length) throw new Error("Procedural network did not produce any printable parts.");
  const geometry = mergeModelGeometries(parts);
  parts.forEach((part) => { if (part !== geometry) part.dispose(); });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addNetworkJoint(parts: BufferGeometry[], point: Vector3, diameter: number, radialSegments: number) {
  const joint = new SphereGeometry(diameter / 2, radialSegments, Math.max(4, Math.floor(radialSegments / 2)));
  joint.translate(point.x, point.y, point.z);
  parts.push(joint);
}

function createCellularGeometry(source: Extract<SourceSpec, { type: "cellular" }>) {
  // Keep nearest-neighbour discovery and output topology bounded even when a
  // document asks for tiny cells in a large volume. The effective lattice is
  // still stratified across the requested bounds and never weakens strut size.
  let cellSize = source.cellSize;
  let nx = Math.max(2, Math.floor(source.width / cellSize) + 1);
  let ny = Math.max(2, Math.floor(source.depth / cellSize) + 1);
  let nz = Math.max(2, Math.floor(source.height / cellSize) + 1);
  while (nx * ny * nz > 96) {
    cellSize *= 1.12;
    nx = Math.max(2, Math.floor(source.width / cellSize) + 1);
    ny = Math.max(2, Math.floor(source.depth / cellSize) + 1);
    nz = Math.max(2, Math.floor(source.height / cellSize) + 1);
  }

  // Nodes are deliberately wider than struts: that creates a real overlap at
  // each connection without leaving coincident cylinder/sphere equators in the
  // exported STL, which many slicers interpret as non-manifold duplicate edges.
  const jointDiameter = source.strutDiameter * 1.25;
  if (jointDiameter > Math.min(source.width, source.depth, source.height)) {
    throw new Error("Cellular strut diameter is too large for the requested lattice bounds.");
  }
  const radius = jointDiameter / 2;
  const points: Vector3[] = [];
  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const baseX = (ix / Math.max(1, nx - 1) - 0.5) * (source.width - jointDiameter);
        const baseY = (iy / Math.max(1, ny - 1) - 0.5) * (source.depth - jointDiameter);
        const baseZ = radius + iz / Math.max(1, nz - 1) * Math.max(0, source.height - jointDiameter);
        const boundaryX = ix === 0 || ix === nx - 1;
        const boundaryY = iy === 0 || iy === ny - 1;
        const boundaryZ = iz === 0 || iz === nz - 1;
        const jitter = Math.min(source.width / nx, source.depth / ny, source.height / nz) * source.jitter * 0.42;
        points.push(new Vector3(
          baseX + (boundaryX ? 0 : (seededUnit(source.seed, ix, iy, iz, 11) - 0.5) * jitter),
          baseY + (boundaryY ? 0 : (seededUnit(source.seed, ix, iy, iz, 23) - 0.5) * jitter),
          baseZ + (boundaryZ ? 0 : (seededUnit(source.seed, ix, iy, iz, 37) - 0.5) * jitter),
        ));
      }
    }
  }

  const edges = new Set<string>();
  for (let index = 0; index < points.length; index += 1) {
    const nearest: Array<{ index: number; distance: number }> = [];
    for (let candidate = 0; candidate < points.length; candidate += 1) {
      if (candidate === index) continue;
      nearest.push({ index: candidate, distance: points[index].distanceToSquared(points[candidate]) });
    }
    nearest.sort((a, b) => a.distance - b.distance || a.index - b.index);
    for (const neighbor of nearest.slice(0, source.neighbors)) {
      const low = Math.min(index, neighbor.index);
      const high = Math.max(index, neighbor.index);
      edges.add(`${low}:${high}`);
    }
  }

  const parts: BufferGeometry[] = [];
  for (const edge of edges) {
    const [start, end] = edge.split(":").map(Number);
    const strut = strutBetween(points[start], points[end], source.strutDiameter, source.radialSegments, source.strutDiameter * 0.35);
    if (strut) parts.push(strut);
  }
  for (const point of points) addNetworkJoint(parts, point, jointDiameter, source.radialSegments);
  const geometry = mergeClosedNetwork(parts);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const measured = bounds.getSize(new Vector3());
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, -bounds.min.z);
  geometry.scale(source.width / measured.x, source.depth / measured.y, source.height / measured.z);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createOrganicGeometry(source: Extract<SourceSpec, { type: "organic" }>) {
  type Tip = { point: Vector3; direction: Vector3; radius: number; lineage: number };
  const segments: CapsuleSegment[] = [];
  const rootRadius = source.trunkDiameter / 2;
  const minRadius = Math.max(0.6, rootRadius * 0.38);
  const stepsPerLevel = 3;
  const nominalLength = source.height / (source.levels + 1) / stepsPerLevel;
  const maxSegments = 240;
  let tips: Tip[] = [{ point: new Vector3(0, 0, rootRadius), direction: new Vector3(0, 0, 1), radius: rootRadius, lineage: 1 }];

  // Grow a point graph in short curved advances. Branches share their exact
  // parent point; the graph is converted to a single smooth field below rather
  // than appending cylinders and spheres at every advance.
  for (let level = 0; level <= source.levels && tips.length && segments.length < maxSegments; level += 1) {
    const next: Tip[] = [];
    for (let tipIndex = 0; tipIndex < tips.length && segments.length < maxSegments; tipIndex += 1) {
      const tip = tips[tipIndex];
      let point = tip.point.clone();
      const direction = tip.direction.clone();
      let radius = tip.radius;
      for (let advance = 0; advance < stepsPerLevel && segments.length < maxSegments; advance += 1) {
        const phase = source.twistDeg * DEG * (level + advance / stepsPerLevel + tip.lineage * 0.071);
        const wander = (seededUnit(source.seed, level, tip.lineage, advance, 53) - 0.5) * Math.PI * 0.82;
        const tilt = source.angleDeg * DEG * (0.24 + seededUnit(source.seed, level, tip.lineage, advance, 71) * 0.32);
        const radial = new Vector3(Math.cos(phase + wander), Math.sin(phase + wander), 0);
        const desired = direction.clone().multiplyScalar(0.72)
          .addScaledVector(radial, Math.sin(tilt) * 0.52)
          .addScaledVector(new Vector3(0, 0, 1), Math.cos(tilt) * 0.26)
          .normalize();
        direction.lerp(desired, 0.28 + seededUnit(source.seed, level, tip.lineage, advance, 83) * 0.18).normalize();
        if (direction.z < 0.08) direction.z = 0.08;
        direction.normalize();
        const length = nominalLength * (0.82 + seededUnit(source.seed, level, tip.lineage, advance, 89) * 0.34) * source.taper ** (level * 0.12);
        const end = point.clone().addScaledVector(direction, length);
        const endRadius = Math.max(minRadius, radius * source.taper ** (1 / stepsPerLevel));
        segments.push({ start: point, end, startRadius: radius, endRadius });
        point = end;
        radius = endRadius;
      }
      if (level >= source.levels) continue;
      for (let branch = 0; branch < source.branching && segments.length + next.length < maxSegments; branch += 1) {
        const phase = source.twistDeg * DEG * (level + branch / Math.max(1, source.branching) + tip.lineage * 0.11);
        const wander = (seededUnit(source.seed, level, tip.lineage, branch, 101) - 0.5) * Math.PI * 0.6;
        const tilt = source.angleDeg * DEG * (0.78 + seededUnit(source.seed, level, tip.lineage, branch, 113) * 0.42);
        const radial = new Vector3(Math.cos(phase + wander), Math.sin(phase + wander), 0);
        const branchDirection = direction.clone().multiplyScalar(0.42)
          .addScaledVector(radial, Math.sin(tilt))
          .addScaledVector(new Vector3(0, 0, 1), Math.cos(tilt) * 0.7)
          .normalize();
        next.push({ point: point.clone(), direction: branchDirection, radius, lineage: tip.lineage * 5 + branch + 1 });
      }
    }
    tips = next;
  }

  const geometry = remeshCapsuleNetwork(segments, {
    resolution: Math.max(source.surfaceResolution, source.radialSegments * 5),
    blend: rootRadius * source.smoothness,
    smoothIterations: 2,
  });
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const measured = bounds.getSize(new Vector3());
  const scaleX = measured.x > 1e-6 ? Math.min(1, source.width / measured.x) : 1;
  const scaleY = measured.y > 1e-6 ? Math.min(1, source.depth / measured.y) : 1;
  const scaleZ = measured.z > 1e-6 ? source.height / measured.z : 1;
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, -bounds.min.z);
  geometry.scale(scaleX, scaleY, scaleZ);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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

function createClothGeometry(source: Extract<SourceSpec, { type: "cloth" }>, sceneCollider?: SceneCollider | null) {
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
  const velocity = new Vector3();
  const closestTarget = new Vector3();
  const margin = source.thickness * 0.5 + 0.4;
  // Cap per-step motion so a collision push-out can't inject a runaway verlet
  // velocity and blow the sheet up.
  const maxStep = Math.max(restX, restY) * 1.8;
  for (let step = 0; step < source.steps; step += 1) {
    for (let index = 0; index < count; index += 1) {
      if (pinned.has(index)) continue;
      const point = positions[index];
      velocity.subVectors(point, previous[index]).multiplyScalar(0.992);
      const speed = velocity.length();
      if (speed > maxStep) velocity.multiplyScalar(maxStep / speed);
      previous[index].copy(point);
      point.add(velocity);
      point.z -= source.gravity;
      // rest on the print bed rather than free-falling
      if (point.z < margin) { point.z = margin; previous[index].z = margin; }
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
      // legacy explicit sphere collider
      if (collider && colliderCenter) {
        for (let index = 0; index < count; index += 1) {
          if (pinned.has(index)) continue;
          delta.subVectors(positions[index], colliderCenter);
          const length = delta.length();
          if (length < collider.radius) positions[index].copy(colliderCenter).add(delta.multiplyScalar(collider.radius / Math.max(length, 1e-6)));
        }
      }
      // drape over every other shape in the scene
      if (sceneCollider) {
        for (let index = 0; index < count; index += 1) {
          if (pinned.has(index)) continue;
          const point = positions[index];
          if (sceneCollider.mayContact && !sceneCollider.mayContact(point, margin)) continue;
          const hit = sceneCollider.closest(point, closestTarget);
          if (hit && (hit.inside || hit.distance < margin)) {
            point.copy(closestTarget).addScaledVector(delta.set(hit.nx, hit.ny, hit.nz), margin);
            // contact friction — bleed off velocity so the fabric grips the
            // surface and drapes rather than sliding straight off.
            previous[index].lerp(point, 0.5);
          }
        }
      }
    }
  }
  const points = positions.map((point) => ({ x: point.x, y: point.y, z: point.z }));
  return solidHeightfield(source.width, source.depth, size, size, points, source.thickness);
}

function createFluidGeometry(source: Extract<SourceSpec, { type: "fluid" }>, collider?: SceneCollider | null) {
  return simulateFluid({
    width: source.width,
    depth: source.depth,
    amount: source.amount,
    spawnHeight: source.spawnHeight,
    particleSize: source.particleSize,
    viscosity: source.viscosity,
    gravity: source.gravity,
    steps: source.steps,
    surfaceResolution: source.surfaceResolution,
  }, collider);
}

export function createSourceGeometryParts(source: Exclude<SourceSpec, { type: "text" }>, options?: SourceBuildOptions) {
  if (source.type === "primitive") return [createPrimitiveGeometry(source)];
  if (source.type === "extrude") return [createExtrudeGeometry(source)];
  if (source.type === "revolve") return createRevolveGeometryParts(source, options?.interiorStruts);
  if (source.type === "water") return [createWaterGeometry(source)];
  if (source.type === "fluid") return [createFluidGeometry(source, options?.sceneCollider)];
  if (source.type === "cloth") return [createClothGeometry(source, options?.sceneCollider)];
  if (source.type === "cellular") return [createCellularGeometry(source)];
  return [createOrganicGeometry(source)];
}

export function createSourceGeometry(source: Exclude<SourceSpec, { type: "text" }>, options?: SourceBuildOptions) {
  const parts = createSourceGeometryParts(source, options);
  if (parts.length === 1) return parts[0];
  const geometry = mergeModelGeometries(parts);
  parts.forEach((part) => { if (part !== geometry) part.dispose(); });
  return geometry;
}

function boundsFor(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  return {
    minX: bounds.min.x,
    minY: bounds.min.y,
    minZ: bounds.min.z,
    width: Math.max(1e-6, bounds.max.x - bounds.min.x),
    depth: Math.max(1e-6, bounds.max.y - bounds.min.y),
    height: Math.max(1e-6, bounds.max.z - bounds.min.z),
  };
}

function modulationAmount(modifier: ModifierSpec, coordinates: { x: number; y: number; z: number }, bounds: ReturnType<typeof boundsFor>) {
  if (!("modulation" in modifier) || !modifier.modulation) return 1;
  const { axis, interpolation } = modifier.modulation;
  const t = axis === "x"
    ? (coordinates.x - bounds.minX) / bounds.width
    : axis === "y"
      ? (coordinates.y - bounds.minY) / bounds.depth
      : (coordinates.z - bounds.minZ) / bounds.height;
  const points = [...modifier.modulation.points].sort((a, b) => a[0] - b[0]);
  if (t <= points[0][0]) return points[0][1];
  if (t >= points.at(-1)![0]) return points.at(-1)![1];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (t > to[0]) continue;
    let local = (t - from[0]) / Math.max(1e-8, to[0] - from[0]);
    if (interpolation === "smoothstep") local = local * local * (3 - 2 * local);
    return from[1] + (to[1] - from[1]) * local;
  }
  return 1;
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

// Weld a geometry by POSITION only (dropping normals/uvs) so coincident verts
// across hard edges fuse into one connected, closed shell. Plain mergeVertices
// keeps a box's corners split because their per-face normals differ, which makes
// the mesh read as "open" and defeats the closed-solid checks below.
function weldByPosition(input: BufferGeometry): BufferGeometry {
  return weldGeometryPositions(input, 1e-4);
}

// Signed volume of a closed triangle mesh (divergence theorem). Positive for
// outward-wound (CCW) faces, which three's generated geometry uses.
function signedMeshVolume(positions: Vector3[], faces: Uint32Array | number[]): number {
  const bxc = new Vector3();
  let v = 0;
  for (let i = 0; i < faces.length; i += 3) {
    const a = positions[faces[i]], b = positions[faces[i + 1]], c = positions[faces[i + 2]];
    bxc.crossVectors(b, c);
    v += a.dot(bxc);
  }
  return v / 6;
}

// Fill a solid's interior with a regular lattice of particles using a BVH
// inside-test (odd ray crossings ⇒ inside). This represents the shape's real
// volume for melting, independent of how densely its surface is tessellated —
// a low-poly cylinder fills as a solid slug, not a ring of rim vertices. Grows
// the spacing to stay within the particle budget (so a 0.05 mm droplet on a big
// shape coarsens instead of exploding), and returns the spacing actually used so
// the SPH kernel can match it. Returns `spacing: 0` when the mesh has no volume.
function fillSolidParticles(indexed: BufferGeometry, targetSpacing: number, budget: number): { particles: Vector3[]; spacing: number } {
  indexed.computeBoundingBox();
  const bb = indexed.boundingBox;
  if (!bb) return { particles: [], spacing: 0 };
  const size = new Vector3();
  bb.getSize(size);
  const gridPoints = (s: number) => (Math.floor(size.x / s) + 1) * (Math.floor(size.y / s) + 1) * (Math.floor(size.z / s) + 1);
  let spacing = Math.max(targetSpacing, 0.02);
  // Roughly half a bounding box is typically inside, so aim the grid a bit high.
  for (let i = 0; i < 48 && gridPoints(spacing) > budget * 2; i += 1) spacing *= 1.18;
  const bvh = new MeshBVH(indexed);
  const ray = new Ray();
  ray.direction.set(0, 0, 1);
  const half = spacing * 0.5;
  const particles: Vector3[] = [];
  for (let z = bb.min.z + half; z <= bb.max.z && particles.length < budget; z += spacing)
    for (let y = bb.min.y + half; y <= bb.max.y && particles.length < budget; y += spacing)
      for (let x = bb.min.x + half; x <= bb.max.x; x += spacing) {
        ray.origin.set(x, y, z);
        if (bvh.raycast(ray, DoubleSide).length % 2 === 1) {
          particles.push(new Vector3(x, y, z));
          if (particles.length >= budget) break;
        }
      }
  return { particles, spacing };
}

// Uniformly subdivide every triangle (1→4, sharing midpoints) while the mesh's
// longest edge exceeds `targetEdge` and it is under the vertex cap. Uniform
// splitting keeps the mesh watertight — adaptive splitting leaves T-junctions
// where a face splits but its neighbour does not. A bare primitive (a box is 12
// tris / 8 verts) has nothing to drape until it is tessellated into a real sheet.
function tessellate(positions: Vector3[], faces: number[], targetEdge: number, vertexCap: number): { positions: Vector3[]; faces: number[] } {
  const target2 = targetEdge * targetEdge;
  for (let pass = 0; pass < 7; pass += 1) {
    if (positions.length * 4 > vertexCap) break;
    let longest = 0;
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f], b = faces[f + 1], c = faces[f + 2];
      longest = Math.max(longest, positions[a].distanceToSquared(positions[b]), positions[b].distanceToSquared(positions[c]), positions[c].distanceToSquared(positions[a]));
    }
    if (longest <= target2) break;
    const mid = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const existing = mid.get(key);
      if (existing !== undefined) return existing;
      const index = positions.length;
      positions.push(new Vector3().addVectors(positions[a], positions[b]).multiplyScalar(0.5));
      mid.set(key, index);
      return index;
    };
    const next: number[] = [];
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f], b = faces[f + 1], c = faces[f + 2];
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    faces = next;
  }
  return { positions, faces };
}

// Treat a shape's own mesh as cloth: weld coincident verts, tessellate so it has
// enough vertices to deform, use the mesh edges as distance constraints, then
// settle under gravity + scene collision. A closed solid also gets an internal
// "balloon" pressure (modifier.inflate) that resists volume loss, so it squishes
// and drapes softly instead of collapsing flat.
function drapeGeometry(
  input: BufferGeometry,
  modifier: Extract<ModifierSpec, { type: "drape" }>,
  sceneCollider?: SceneCollider | null,
): BufferGeometry {
  const welded = weldByPosition(input);
  const weldIndex = welded.index;
  const weldPos = welded.getAttribute("position") as BufferAttribute;
  const bounds = boundsFor(welded);
  let positions = Array.from({ length: weldPos.count }, (_, i) => new Vector3(weldPos.getX(i), weldPos.getY(i), weldPos.getZ(i)));
  let faces: number[] = weldIndex
    ? Array.from(weldIndex.array as ArrayLike<number>)
    : Array.from({ length: weldPos.count }, (_, i) => i);
  welded.dispose();

  // Subdivide so even a coarse primitive has a workable mesh to drape/inflate.
  // The cap keeps the per-frame cost bounded (this is a CPU soft-body sim).
  const maxDim = Math.max(bounds.height, bounds.width, bounds.depth, 1);
  ({ positions, faces } = tessellate(positions, faces, Math.max(2, maxDim / 10), 2600));
  const count = positions.length;
  const previous = positions.map((p) => p.clone());

  const minZ = bounds.minZ;
  const maxZ = minZ + bounds.height;
  const band = Math.max(1e-3, bounds.height * 0.06);
  const pinned = new Set<number>();
  if (modifier.pins === "top") positions.forEach((p, i) => { if (p.z >= maxZ - band) pinned.add(i); });
  else if (modifier.pins === "base") positions.forEach((p, i) => { if (p.z <= minZ + band) pinned.add(i); });

  // Unique edges → distance constraints at rest length; edge→face counts tell us
  // whether the mesh is closed (every edge shared by two faces).
  const constraints: Array<[number, number, number]> = [];
  const seen = new Set<number>();
  const edgeFaces = new Map<number, number>();
  const addEdge = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * count + hi;
    edgeFaces.set(key, (edgeFaces.get(key) ?? 0) + 1);
    if (seen.has(key)) return;
    seen.add(key);
    constraints.push([lo, hi, positions[lo].distanceTo(positions[hi])]);
  };
  for (let i = 0; i < faces.length; i += 3) {
    const a = faces[i], b = faces[i + 1], c = faces[i + 2];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  let boundaryEdges = 0;
  for (const c of edgeFaces.values()) if (c === 1) boundaryEdges += 1;

  const stiffness = modifier.stiffness;
  const restVolume = signedMeshVolume(positions, faces);
  // Balloon pressure only makes sense for a closed, positively-wound solid.
  const inflating = modifier.inflate > 0 && boundaryEdges === 0 && faces.length > 0 && restVolume > 1e-3;
  const vertexNormals = inflating ? Array.from({ length: count }, () => new Vector3()) : null;
  const ab = new Vector3();
  const ac = new Vector3();
  const faceNormal = new Vector3();
  const delta = new Vector3();
  const velocity = new Vector3();
  const closestTarget = new Vector3();
  const margin = Math.max(0.4, bounds.height * 0.01);
  let maxRest = 0;
  for (const [, , rest] of constraints) if (rest > maxRest) maxRest = rest;
  const maxStep = Math.max(maxRest * 1.8, 1);
  const iterations = 4;
  for (let step = 0; step < modifier.frames; step += 1) {
    for (let i = 0; i < count; i += 1) {
      if (pinned.has(i)) continue;
      const point = positions[i];
      velocity.subVectors(point, previous[i]).multiplyScalar(0.992);
      const speed = velocity.length();
      if (speed > maxStep) velocity.multiplyScalar(maxStep / speed);
      previous[i].copy(point);
      point.add(velocity);
      point.z -= modifier.gravity;
      if (point.z < margin) { point.z = margin; previous[i].z = margin; }
    }
    // Gas pressure: restore the volume deficit as an outward push over the whole
    // surface (spread evenly), scaled by inflate. Keeps a closed shape puffed.
    if (inflating && vertexNormals) {
      for (const n of vertexNormals) n.set(0, 0, 0);
      let volume = 0;
      let area = 0;
      for (let f = 0; f < faces.length; f += 3) {
        const ia = faces[f], ib = faces[f + 1], ic = faces[f + 2];
        const pa = positions[ia], pb = positions[ib], pc = positions[ic];
        ab.subVectors(pb, pa);
        ac.subVectors(pc, pa);
        faceNormal.crossVectors(ab, ac); // length = 2 × area, outward
        area += faceNormal.length() * 0.5;
        vertexNormals[ia].add(faceNormal);
        vertexNormals[ib].add(faceNormal);
        vertexNormals[ic].add(faceNormal);
        delta.crossVectors(pb, pc);
        volume += pa.dot(delta);
      }
      volume /= 6;
      if (area > 1e-6 && volume > 1e-6) {
        const push = Math.max(-maxStep, Math.min(maxStep, modifier.inflate * (restVolume - volume) / area));
        for (let i = 0; i < count; i += 1) {
          if (pinned.has(i)) continue;
          const n = vertexNormals[i];
          const len = n.length();
          if (len > 1e-6) positions[i].addScaledVector(n, push / len);
        }
      }
    }
    for (let iter = 0; iter < iterations; iter += 1) {
      for (const [a, b, rest] of constraints) {
        const pa = positions[a], pb = positions[b];
        delta.subVectors(pb, pa);
        const length = Math.max(delta.length(), 1e-6);
        const correction = delta.multiplyScalar((length - rest) / length * 0.5 * stiffness);
        if (!pinned.has(a)) pa.add(correction);
        if (!pinned.has(b)) pb.sub(correction);
      }
    }
    // Scene collision once per frame (not per constraint iteration) — each check
    // is a BVH closest-point query, so this keeps the drape affordable.
    if (sceneCollider) {
      for (let i = 0; i < count; i += 1) {
        if (pinned.has(i)) continue;
        const point = positions[i];
        if (sceneCollider.mayContact && !sceneCollider.mayContact(point, margin)) continue;
        const hit = sceneCollider.closest(point, closestTarget);
        if (hit && (hit.inside || hit.distance < margin)) {
          point.copy(closestTarget).addScaledVector(delta.set(hit.nx, hit.ny, hit.nz), margin);
          previous[i].lerp(point, 0.5);
        }
      }
    }
  }
  const out = new BufferGeometry();
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) { array[i * 3] = positions[i].x; array[i * 3 + 1] = positions[i].y; array[i * 3 + 2] = positions[i].z; }
  out.setAttribute("position", new BufferAttribute(array, 3));
  out.setIndex(faces);
  out.computeVertexNormals();
  out.computeBoundingBox();
  return out;
}

// Melt a solid into a puddle: fill its volume with SPH particles (surface +
// interior via a BVH inside-test), settle them, and reconstruct a new watertight
// surface. Falls back to vertex seeding for open/degenerate meshes.
function meltGeometry(
  input: BufferGeometry,
  modifier: Extract<ModifierSpec, { type: "melt" }>,
  sceneCollider?: SceneCollider | null,
): BufferGeometry {
  const welded = weldByPosition(input);
  const filled = fillSolidParticles(welded, modifier.particleSize, MAX_PARTICLES);
  let seeds = filled.particles;
  // Use the spacing the fill actually settled on (a tiny droplet is only honoured
  // when the shape is small enough to fit the budget) so the SPH kernel matches.
  let spacing = filled.spacing || modifier.particleSize;
  if (seeds.length < 8) {
    const position = welded.getAttribute("position") as BufferAttribute;
    const total = position.count;
    const stride = Math.max(1, Math.ceil(total / MAX_PARTICLES));
    seeds = [];
    for (let i = 0; i < total; i += stride) seeds.push(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    welded.computeBoundingBox();
    const span = welded.boundingBox ? welded.boundingBox.getSize(new Vector3()).length() : 40;
    spacing = Math.max(modifier.particleSize, span / 24);
  }
  welded.dispose();
  return simulateFluidParticles(seeds, {
    particleSize: spacing,
    viscosity: modifier.viscosity,
    gravity: modifier.gravity,
    steps: modifier.frames,
    surfaceResolution: modifier.surfaceResolution,
  }, sceneCollider);
}

function arrayGeometry(input: BufferGeometry, modifier: Extract<ModifierSpec, { type: "array" }>) {
  assertModifierExpansion(input, modifier.count, "Array");
  const copies: BufferGeometry[] = [];
  const step: TransformSpec = { translate: modifier.translate, rotate: modifier.rotate, scale: modifier.scale };
  for (let index = 0; index < modifier.count; index += 1) {
    const copy = input.clone();
    applyTransform(copy, repeatedTransform(step, index));
    copies.push(copy);
  }
  const geometry = mergeModelGeometries(copies);
  copies.forEach((copy) => { if (copy !== geometry) copy.dispose(); });
  return geometry;
}

function stepGeometry(input: BufferGeometry, modifier: Extract<ModifierSpec, { type: "step" }>) {
  assertModifierExpansion(input, modifier.levels, "Step");
  input.computeBoundingBox();
  const bounds = input.boundingBox!;
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const copies: BufferGeometry[] = [];
  const toOrigin = new Matrix4().makeTranslation(-center.x, -center.y, -center.z);

  for (let level = 0; level < modifier.levels; level += 1) {
    const planarScale = (span: number) => Math.max(0.05, (span - modifier.inset * 2 * level) / Math.max(span, 1e-6));
    const scale = new Vector3(1, 1, 1);
    const translation = center.clone();
    const rotation = new Euler();
    if (modifier.axis === "x") {
      scale.y = planarScale(size.y);
      scale.z = planarScale(size.z);
      translation.x += modifier.distance * level;
      rotation.x = modifier.twistDeg * DEG * level;
    } else if (modifier.axis === "y") {
      scale.x = planarScale(size.x);
      scale.z = planarScale(size.z);
      translation.y += modifier.distance * level;
      rotation.y = modifier.twistDeg * DEG * level;
    } else {
      scale.x = planarScale(size.x);
      scale.y = planarScale(size.y);
      translation.z += modifier.distance * level;
      rotation.z = modifier.twistDeg * DEG * level;
    }
    const matrix = new Matrix4().compose(translation, new Quaternion().setFromEuler(rotation), scale).multiply(toOrigin);
    const copy = input.clone();
    copy.applyMatrix4(matrix);
    copies.push(copy);
  }
  const geometry = mergeModelGeometries(copies);
  copies.forEach((copy) => { if (copy !== geometry) copy.dispose(); });
  return geometry;
}

function voronoiSignal(x: number, y: number, z: number, modifier: Extract<ModifierSpec, { type: "voronoi" }>) {
  const px = x / modifier.scale;
  const py = y / modifier.scale;
  const pz = z / modifier.scale;
  const cellX = Math.floor(px);
  const cellY = Math.floor(py);
  const cellZ = Math.floor(pz);
  let nearest = Infinity;
  let second = Infinity;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const ix = cellX + dx;
        const iy = cellY + dy;
        const iz = cellZ + dz;
        const fx = ix + seededUnit(modifier.seed, ix, iy, iz, 101);
        const fy = iy + seededUnit(modifier.seed, ix, iy, iz, 131);
        const fz = iz + seededUnit(modifier.seed, ix, iy, iz, 167);
        const distance = (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2;
        if (distance < nearest) {
          second = nearest;
          nearest = distance;
        } else if (distance < second) second = distance;
      }
    }
  }
  const raw = modifier.mode === "ridges"
    ? 1 - Math.min(1, Math.max(0, (Math.sqrt(second) - Math.sqrt(nearest)) * 3.2)) * 2
    : (0.58 - Math.sqrt(nearest)) * 2.3;
  return Math.tanh(raw * modifier.contrast) / Math.tanh(modifier.contrast);
}

function tessellateForVoronoi(input: BufferGeometry, featureSize: number) {
  const welded = weldByPosition(input);
  const position = welded.getAttribute("position") as BufferAttribute;
  const sourceIndex = welded.index;
  let positions = Array.from({ length: position.count }, (_, index) => new Vector3(
    position.getX(index), position.getY(index), position.getZ(index),
  ));
  let faces = sourceIndex
    ? Array.from(sourceIndex.array as ArrayLike<number>)
    : Array.from({ length: position.count }, (_, index) => index);
  welded.dispose();
  ({ positions, faces } = tessellate(positions, faces, Math.max(0.4, featureSize * 0.45), 50_000));
  const array = new Float32Array(positions.length * 3);
  for (let index = 0; index < positions.length; index += 1) {
    array[index * 3] = positions[index].x;
    array[index * 3 + 1] = positions[index].y;
    array[index * 3 + 2] = positions[index].z;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(array, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function voronoiWireGeometry(input: BufferGeometry, modifier: Extract<ModifierSpec, { type: "voronoi" }>) {
  const surface = tessellateForVoronoi(input, modifier.scale);
  const position = surface.getAttribute("position") as BufferAttribute;
  const index = surface.index;
  if (!index) {
    surface.dispose();
    throw new Error("Voronoi wire requires indexed surface topology.");
  }

  const cumulativeArea: number[] = [];
  let surfaceArea = 0;
  const a = new Vector3(); const b = new Vector3(); const c = new Vector3();
  const ab = new Vector3(); const ac = new Vector3();
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    surfaceArea += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    cumulativeArea.push(surfaceArea);
  }
  const targetSeeds = Math.max(6, Math.min(72, Math.round(surfaceArea / (modifier.scale * modifier.scale) * 0.85)));
  const seeds: Vector3[] = [];
  const minDistance2 = (modifier.scale * 0.42) ** 2;
  const candidateLimit = targetSeeds * 24;
  for (let candidate = 0; candidate < candidateLimit && seeds.length < targetSeeds; candidate += 1) {
    const areaPick = seededUnit(modifier.seed, candidate, 0, 0, 211) * surfaceArea;
    let low = 0; let high = cumulativeArea.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (cumulativeArea[middle] < areaPick) low = middle + 1;
      else high = middle;
    }
    const offset = low * 3;
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    const root = Math.sqrt(seededUnit(modifier.seed, candidate, 0, 0, 223));
    const beta = seededUnit(modifier.seed, candidate, 0, 0, 227);
    const wa = 1 - root;
    const wb = root * (1 - beta);
    const wc = root * beta;
    const point = new Vector3(
      a.x * wa + b.x * wb + c.x * wc,
      a.y * wa + b.y * wb + c.y * wc,
      a.z * wa + b.z * wb + c.z * wc,
    );
    if (seeds.every((seed) => seed.distanceToSquared(point) >= minDistance2)) seeds.push(point);
  }
  // Thin or unusually folded surfaces can reject many Poisson candidates. Fill
  // deterministically so every request still yields a useful cell network.
  for (let candidate = 0; seeds.length < targetSeeds && candidate < targetSeeds * 8; candidate += 1) {
    const vertex = Math.floor(seededUnit(modifier.seed, candidate, 0, 0, 239) * position.count) % position.count;
    seeds.push(new Vector3().fromBufferAttribute(position, vertex));
  }

  const labels = new Uint16Array(position.count);
  const point = new Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    point.fromBufferAttribute(position, vertex);
    let nearest = 0;
    let nearestDistance = Infinity;
    for (let seed = 0; seed < seeds.length; seed += 1) {
      const distance = point.distanceToSquared(seeds[seed]);
      if (distance < nearestDistance) { nearest = seed; nearestDistance = distance; }
    }
    labels[vertex] = nearest;
  }

  const wireRadius = Math.max(0.2, Math.abs(modifier.amplitude));
  const segments: CapsuleSegment[] = [];
  const seen = new Set<string>();
  const addSegment = (start: Vector3, end: Vector3) => {
    if (start.distanceToSquared(end) < wireRadius * wireRadius * 0.04) return;
    const keyOf = (value: Vector3) => `${Math.round(value.x * 1e4)},${Math.round(value.y * 1e4)},${Math.round(value.z * 1e4)}`;
    const first = keyOf(start); const second = keyOf(end);
    const key = first < second ? `${first}|${second}` : `${second}|${first}`;
    if (seen.has(key)) return;
    seen.add(key);
    segments.push({ start: start.clone(), end: end.clone(), startRadius: wireRadius, endRadius: wireRadius });
  };
  const va = new Vector3(); const vb = new Vector3(); const vc = new Vector3();
  for (let offset = 0; offset < index.count; offset += 3) {
    const ia = index.getX(offset); const ib = index.getX(offset + 1); const ic = index.getX(offset + 2);
    const la = labels[ia]; const lb = labels[ib]; const lc = labels[ic];
    if (la === lb && lb === lc) continue;
    va.fromBufferAttribute(position, ia);
    vb.fromBufferAttribute(position, ib);
    vc.fromBufferAttribute(position, ic);
    const transitions: Vector3[] = [];
    if (la !== lb) transitions.push(va.clone().add(vb).multiplyScalar(0.5));
    if (lb !== lc) transitions.push(vb.clone().add(vc).multiplyScalar(0.5));
    if (lc !== la) transitions.push(vc.clone().add(va).multiplyScalar(0.5));
    if (transitions.length === 2) addSegment(transitions[0], transitions[1]);
    else if (transitions.length === 3) {
      const center = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
      transitions.forEach((transition) => addSegment(center, transition));
    }
  }
  surface.computeBoundingBox();
  const size = surface.boundingBox!.getSize(new Vector3());
  surface.dispose();
  if (!segments.length) throw new Error("Voronoi wire did not find enough cell boundaries; reduce cell scale.");
  const resolution = Math.max(40, Math.min(48, Math.ceil(Math.max(size.x, size.y, size.z) / Math.max(wireRadius * 0.72, modifier.scale / 10))));
  return remeshCapsuleNetwork(segments, {
    resolution,
    blend: wireRadius * Math.min(1.15, 0.45 + modifier.contrast * 0.2),
    smoothIterations: 2,
  });
}

export function applyModifiers(input: BufferGeometry, modifiers: ModifierSpec[], sceneCollider?: SceneCollider | null) {
  let geometry = input;
  let bounds = boundsFor(geometry);
  for (const modifier of modifiers) {
    if (modifier.disabled) continue;
    if (modifier.type === "subdivide") {
      const triangles = Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
      const expanded = subdivisionTriangleCount(triangles, modifier.scheme, modifier.levels);
      if (expanded > MAX_MODIFIER_TRIANGLES) {
        throw new Error(`Subdivision modifier would create ${expanded.toLocaleString("en-US")} triangles; the safe limit is ${MAX_MODIFIER_TRIANGLES.toLocaleString("en-US")}.`);
      }
      const previous = geometry;
      geometry = subdivideGeometry(geometry, modifier.scheme, modifier.levels, modifier.boundary);
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      continue;
    }
    if (modifier.type === "smooth") {
      const previous = geometry;
      const next = laplacianSmooth(geometry, modifier.iterations, modifier.strength);
      geometry = next;
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      continue;
    }
    if (modifier.type === "drape") {
      const previous = geometry;
      geometry = drapeGeometry(geometry, modifier, sceneCollider);
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      continue;
    }
    if (modifier.type === "melt") {
      const previous = geometry;
      geometry = meltGeometry(geometry, modifier, sceneCollider);
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      continue;
    }
    if (modifier.type === "array" || modifier.type === "step") {
      const previous = geometry;
      geometry = modifier.type === "array" ? arrayGeometry(geometry, modifier) : stepGeometry(geometry, modifier);
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      continue;
    }
    if (modifier.type === "voronoi") {
      const previous = geometry;
      if (modifier.mode === "wire") {
        geometry = voronoiWireGeometry(geometry, modifier);
        if (previous !== geometry) previous.dispose();
        bounds = boundsFor(geometry);
        continue;
      }
      geometry = tessellateForVoronoi(geometry, modifier.scale);
      if (previous !== geometry) previous.dispose();
      bounds = boundsFor(geometry);
      const position = geometry.getAttribute("position") as BufferAttribute;
      const normal = geometry.getAttribute("normal") as BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const amount = modifier.amplitude
          * modulationAmount(modifier, { x, y, z }, bounds)
          * voronoiSignal(x, y, z, modifier);
        position.setXYZ(
          index,
          x + normal.getX(index) * amount,
          y + normal.getY(index) * amount,
          z + normal.getZ(index) * amount,
        );
      }
      position.needsUpdate = true;
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
      const modulation = modulationAmount(modifier, { x, y, z }, bounds);
      if (modifier.type === "twist") {
        const span = Math.max(1e-6, modifier.end - modifier.start);
        const local = Math.min(1, Math.max(0, (t - modifier.start) / span));
        const nextAngle = angle + modifier.angleDeg * DEG * local * modulation;
        x = Math.cos(nextAngle) * radius;
        y = Math.sin(nextAngle) * radius;
      } else if (modifier.type === "taper") {
        const eased = modifier.easing === "smoothstep" ? t * t * (3 - 2 * t) : t;
        const rawScale = modifier.from + (modifier.to - modifier.from) * eased;
        const scale = 1 + (rawScale - 1) * modulation;
        x *= scale;
        y *= scale;
      } else if (modifier.type === "radialWave" || modifier.type === "axialWave" || modifier.type === "noise") {
        let amount = 0;
        if (modifier.type === "radialWave") amount = modifier.amplitude * modulation * Math.sin(angle * modifier.count + modifier.phaseDeg * DEG + t * modifier.axialTurns * Math.PI * 2);
        else if (modifier.type === "axialWave") amount = modifier.amplitude * modulation * Math.sin(t * modifier.cycles * Math.PI * 2 + modifier.phaseDeg * DEG);
        else amount = modifier.amplitude * modulation * Math.sin((x + modifier.seed * 17.17) / modifier.scale * 2.13 + Math.sin((y - modifier.seed * 7.31) / modifier.scale * 1.71) + z / modifier.scale * 2.47);
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
        const bendAngle = totalAngle * t * modulation;
        const bendRadius = height / totalAngle;
        const bentX = localX * Math.cos(bendAngle) + bendRadius * (1 - Math.cos(bendAngle));
        z = minZ + bendRadius * Math.sin(bendAngle) - localX * Math.sin(bendAngle);
        x = bentX * cosDirection - localY * sinDirection;
        y = bentX * sinDirection + localY * cosDirection;
      }
      position.setXYZ(index, x, y, z);
    }
    position.needsUpdate = true;
    bounds = boundsFor(geometry);
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
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    if (!position || position.itemSize !== 3) throw new Error("Could not merge model geometry without XYZ positions.");
    vertexCount += position.count;
    indexCount += geometry.index?.count ?? position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const indices = vertexCount <= 65_535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position") as BufferAttribute;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const target = (vertexOffset + vertex) * 3;
      positions[target] = position.getX(vertex);
      positions[target + 1] = position.getY(vertex);
      positions[target + 2] = position.getZ(vertex);
    }
    const sourceIndex = geometry.index;
    const count = sourceIndex?.count ?? position.count;
    for (let index = 0; index < count; index += 1) {
      indices[indexOffset + index] = vertexOffset + (sourceIndex ? sourceIndex.getX(index) : index);
    }
    vertexOffset += position.count;
    indexOffset += count;
  }

  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(positions, 3));
  merged.setIndex(new BufferAttribute(indices, 1));
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}
