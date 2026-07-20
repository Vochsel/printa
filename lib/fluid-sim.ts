import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";

/**
 * A compact CPU SPH (Smoothed-Particle Hydrodynamics) fluid solver plus
 * marching-cubes surface reconstruction, used to bake a printable "frozen
 * liquid" mesh. It settles a released column of fluid under gravity, colliding
 * with a floor and an optional scene collider (nearest-surface push-out), then
 * reconstructs a watertight iso-surface of the particle density field using
 * three's MarchingCubes polygonizer.
 */

export type FluidParams = {
  width: number;
  depth: number;
  amount: number;
  spawnHeight: number;
  particleSize: number;
  viscosity: number;
  gravity: number;
  steps: number;
  surfaceResolution: number;
};

/**
 * Nearest-surface query against solid scene geometry (world space). Sets
 * `target` to the closest surface point and returns the signed distance, an
 * inside flag, and the outward unit surface normal for push-out.
 */
export type SceneCollider = {
  closest: (point: Vector3, target: Vector3) => { distance: number; inside: boolean; nx: number; ny: number; nz: number } | null;
};

export const MAX_PARTICLES = 6500;

/** SPH solve parameters shared by the fluid source and the melt modifier. */
export type FluidSolveParams = {
  particleSize: number;
  viscosity: number;
  gravity: number;
  steps: number;
  surfaceResolution: number;
};

export function simulateFluid(params: FluidParams, collider?: SceneCollider | null): BufferGeometry {
  // The droplet size can be arbitrarily small (down to 0.05 mm). Grow the
  // effective spacing so the released column stays within the particle budget —
  // and keep the SPH kernel (h) matched to the ACTUAL spacing so the fluid still
  // coheres. A small enough pour honours the requested size; a large one coarsens.
  const requested = Math.max(params.particleSize, 1e-3);
  const cells = (params.width / requested) * (params.depth / requested) * (params.amount / requested);
  const spacing = cells > MAX_PARTICLES ? requested * Math.cbrt(cells / MAX_PARTICLES) : requested;

  // --- spawn particles as a released grid column ---
  const nx = Math.max(2, Math.round(params.width / spacing));
  const ny = Math.max(2, Math.round(params.depth / spacing));
  let nz = Math.max(2, Math.round(params.amount / spacing));
  while (nx * ny * nz > MAX_PARTICLES && nz > 2) nz -= 1;
  const positions: Vector3[] = [];
  for (let iz = 0; iz < nz; iz += 1)
    for (let iy = 0; iy < ny; iy += 1)
      for (let ix = 0; ix < nx; ix += 1) {
        const jitter = ((((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0) % 1000) / 1000 - 0.5;
        positions.push(new Vector3(
          (ix / Math.max(1, nx - 1) - 0.5) * params.width + jitter * spacing * 0.25,
          (iy / Math.max(1, ny - 1) - 0.5) * params.depth + jitter * spacing * 0.25,
          params.spawnHeight + iz * spacing,
        ));
      }
  return simulateFluidParticles(positions, { ...params, particleSize: spacing }, collider);
}

/**
 * Settle an arbitrary set of seed particles under SPH + gravity + scene
 * collision, then reconstruct a watertight surface. The fluid source seeds a
 * poured column; the melt modifier seeds particles from a shape's own mesh.
 */
export function simulateFluidParticles(
  positions: Vector3[],
  params: FluidSolveParams,
  collider?: SceneCollider | null,
): BufferGeometry {
  const spacing = params.particleSize;
  const h = spacing * 1.7;
  const h2 = h * h;
  const mass = 1.0;
  const restDensity = 4.0;
  const stiffness = 20.0;
  const viscosity = 0.4 + params.viscosity * 14.0;
  const gravity = params.gravity;
  const radius = spacing * 0.5;

  const velocities: Vector3[] = positions.map(() => new Vector3());
  const count = positions.length;
  // soft outer bound so nothing escapes to infinity, from the seed extent
  const bmin = new Vector3(Infinity, Infinity, Infinity);
  const bmax = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of positions) { bmin.min(p); bmax.max(p); }
  const spread = Math.max(bmax.x - bmin.x, bmax.y - bmin.y, Math.abs(bmax.x), Math.abs(bmax.y), 1) * 1.6 + 80;
  const density = new Float64Array(count);
  const pressure = new Float64Array(count);

  const poly6 = 4 / (Math.PI * Math.pow(h, 8));
  const spikyGrad = -30 / (Math.PI * Math.pow(h, 5));
  const viscLap = 40 / (Math.PI * Math.pow(h, 5));

  const cellSize = h;
  const grid = new Map<number, number[]>();
  const keyOf = (x: number, y: number, z: number) =>
    ((Math.floor(x / cellSize) * 92837111) ^ (Math.floor(y / cellSize) * 689287499) ^ (Math.floor(z / cellSize) * 283923481)) >>> 0;
  const rebuildGrid = () => {
    grid.clear();
    for (let i = 0; i < count; i += 1) {
      const p = positions[i];
      const key = keyOf(p.x, p.y, p.z);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i); else grid.set(key, [i]);
    }
  };
  const forEachNeighbor = (p: Vector3, fn: (j: number) => void) => {
    const cx = Math.floor(p.x / cellSize), cy = Math.floor(p.y / cellSize), cz = Math.floor(p.z / cellSize);
    for (let dz = -1; dz <= 1; dz += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const key = (((cx + dx) * 92837111) ^ ((cy + dy) * 689287499) ^ ((cz + dz) * 283923481)) >>> 0;
          const bucket = grid.get(key);
          if (bucket) for (const j of bucket) fn(j);
        }
  };

  const dt = 0.08;
  const diff = new Vector3();
  const closestTarget = new Vector3();
  const relVel = new Vector3();
  const accel = new Vector3();
  const fx = new Vector3();
  const fvisc = new Vector3();

  for (let step = 0; step < params.steps; step += 1) {
    rebuildGrid();
    for (let i = 0; i < count; i += 1) {
      let rho = 0;
      const pi = positions[i];
      forEachNeighbor(pi, (j) => {
        const r2 = pi.distanceToSquared(positions[j]);
        if (r2 < h2) rho += mass * poly6 * Math.pow(h2 - r2, 3);
      });
      density[i] = Math.max(rho, restDensity * 0.25);
      pressure[i] = stiffness * (density[i] - restDensity);
    }
    for (let i = 0; i < count; i += 1) {
      const pi = positions[i];
      fx.set(0, 0, 0);
      fvisc.set(0, 0, 0);
      forEachNeighbor(pi, (j) => {
        if (j === i) return;
        diff.subVectors(pi, positions[j]);
        const r = diff.length();
        if (r > 1e-6 && r < h) {
          const pressureTerm = mass * (pressure[i] + pressure[j]) / (2 * density[j]) * spikyGrad * (h - r) * (h - r);
          fx.addScaledVector(diff, pressureTerm / r);
          relVel.subVectors(velocities[j], velocities[i]);
          fvisc.addScaledVector(relVel, viscosity * mass / density[j] * viscLap * (h - r));
        }
      });
      accel.addVectors(fx, fvisc).multiplyScalar(1 / density[i]);
      accel.z -= gravity;
      velocities[i].addScaledVector(accel, dt).multiplyScalar(0.986);
      pi.addScaledVector(velocities[i], dt);
      // floor
      if (pi.z < radius) { pi.z = radius; if (velocities[i].z < 0) velocities[i].z *= -0.2; }
      // soft outer bounds so nothing escapes to infinity
      pi.x = Math.max(-spread, Math.min(spread, pi.x));
      pi.y = Math.max(-spread, Math.min(spread, pi.y));
      // scene collision — keep particles out of solid shapes, along the surface normal
      if (collider) {
        const hit = collider.closest(pi, closestTarget);
        if (hit && (hit.inside || hit.distance < radius)) {
          diff.set(hit.nx, hit.ny, hit.nz);
          pi.copy(closestTarget).addScaledVector(diff, radius);
          const vn = velocities[i].dot(diff);
          if (vn < 0) velocities[i].addScaledVector(diff, -vn * 1.1);
        }
      }
    }
  }

  return reconstructSurface(positions, spacing, h, h2, poly6, mass, params.surfaceResolution);
}

// Watertight iso-surface of the settled particle density field. Density is
// sampled into a cubic grid (padded so the surface closes on every side) and
// polygonized by three's MarchingCubes, then mapped back to world millimetres.
function reconstructSurface(
  positions: Vector3[], spacing: number, h: number, h2: number, poly6: number, mass: number, maxRes: number,
): BufferGeometry {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of positions) { min.min(p); max.max(p); }
  const pad = spacing * 2.4;
  min.subScalar(pad); max.addScalar(pad);
  const center = new Vector3().addVectors(min, max).multiplyScalar(0.5);
  const span = new Vector3().subVectors(max, min);
  const side = Math.max(span.x, span.y, span.z);
  const half = side / 2;
  const res = Math.max(24, Math.min(140, Math.round(maxRes)));

  // density hash for fast field sampling
  const cellSize = h;
  const grid = new Map<number, number[]>();
  const keyOf = (x: number, y: number, z: number) =>
    ((Math.floor(x / cellSize) * 92837111) ^ (Math.floor(y / cellSize) * 689287499) ^ (Math.floor(z / cellSize) * 283923481)) >>> 0;
  positions.forEach((p, i) => {
    const k = keyOf(p.x, p.y, p.z);
    const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]);
  });
  const sample = new Vector3();
  const fieldAt = (x: number, y: number, z: number) => {
    sample.set(x, y, z);
    let value = 0;
    const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cz = Math.floor(z / cellSize);
    for (let dz = -1; dz <= 1; dz += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const b = grid.get((((cx + dx) * 92837111) ^ ((cy + dy) * 689287499) ^ ((cz + dz) * 283923481)) >>> 0);
          if (b) for (const j of b) {
            const r2 = sample.distanceToSquared(positions[j]);
            if (r2 < h2) value += mass * poly6 * Math.pow(h2 - r2, 3);
          }
        }
    return value;
  };

  const mc = new MarchingCubes(res, undefined as never, false, false, 320000);
  let maxField = 0;
  for (let z = 0; z < res; z += 1)
    for (let y = 0; y < res; y += 1)
      for (let x = 0; x < res; x += 1) {
        const wx = center.x + ((x / (res - 1)) * 2 - 1) * half;
        const wy = center.y + ((y / (res - 1)) * 2 - 1) * half;
        const wz = center.z + ((z / (res - 1)) * 2 - 1) * half;
        const value = fieldAt(wx, wy, wz);
        if (value > maxField) maxField = value;
        mc.setCell(x, y, z, value);
      }
  mc.isolation = Math.max(1e-6, maxField * 0.3);
  mc.update();

  const vertexCount = mc.count;
  const src = mc.positionArray;
  const out = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) {
    out[v * 3 + 0] = center.x + src[v * 3 + 0] * half;
    out[v * 3 + 1] = center.y + src[v * 3 + 1] * half;
    out[v * 3 + 2] = center.z + src[v * 3 + 2] * half;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(out, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
