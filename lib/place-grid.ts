/**
 * The sampling grid shared by every place data source.
 *
 * Both capture modes reduce to the same thing — heights over a square grid of
 * local metres, centred on the place — so tiles, terrain rasters and mapped
 * ground all fill the same structure and the baker treats them alike.
 */

export type SampleGrid = {
  size: number;
  /** Half-extent of the sampled square, in real metres. */
  radiusM: number;
  /** Metres above sea level; NaN marks a sample nothing covered. */
  heights: Float32Array;
};

export function createGrid(size: number, radiusM: number): SampleGrid {
  const heights = new Float32Array(size * size);
  heights.fill(NaN);
  return { size, radiusM, heights };
}

/**
 * Replace unknown samples by pulling in their neighbours.
 *
 * A gap in the source is a hole in the print. Repeated neighbour averaging
 * closes them, which is as much as a grid this size warrants; anything still
 * unknown afterwards becomes flat ground.
 */
export function fillGaps(grid: SampleGrid, passes = 12): void {
  const { size, heights } = grid;
  for (let pass = 0; pass < passes; pass += 1) {
    let remaining = 0;
    const next = Float32Array.from(heights);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        if (!Number.isNaN(heights[index])) continue;
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const jx = x + dx;
            const jy = y + dy;
            if (jx < 0 || jy < 0 || jx >= size || jy >= size) continue;
            const value = heights[jy * size + jx];
            if (!Number.isNaN(value)) {
              sum += value;
              n += 1;
            }
          }
        }
        if (n > 0) next[index] = sum / n;
        else remaining += 1;
      }
    }
    heights.set(next);
    if (remaining === 0) break;
  }
  for (let i = 0; i < heights.length; i += 1) {
    if (Number.isNaN(heights[i])) heights[i] = 0;
  }
}

/**
 * Flatten isolated high samples.
 *
 * A photogrammetric surface carries debris — birds, wires, reconstruction
 * noise — and because the grid keeps whatever is topmost over a cell, that
 * debris survives as narrow spikes which print as loose spindles.
 *
 * The test is against the tallest neighbour, not the median. A cell on the
 * edge of a tower sits beside roughly as many street cells as roof cells, so
 * a median comparison reads it as a spike and pulls it down — eroding one
 * ring off every building per pass and leaving the melted look that gives
 * away a naive filter. Debris has no tall neighbour at all, which is exactly
 * what this catches.
 */
export function despeckle(grid: SampleGrid, toleranceM = 6): void {
  const { size, heights } = grid;
  const out = Float32Array.from(heights);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let tallest = -Infinity;
      let secondTallest = -Infinity;
      let neighbours = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const jx = x + dx;
          const jy = y + dy;
          if (jx < 0 || jy < 0 || jx >= size || jy >= size) continue;
          const value = heights[jy * size + jx];
          neighbours += 1;
          if (value > tallest) {
            secondTallest = tallest;
            tallest = value;
          } else if (value > secondTallest) {
            secondTallest = value;
          }
        }
      }
      if (neighbours < 5 || !Number.isFinite(secondTallest)) continue;

      // Stand down to the second tallest rather than the tallest, so a pair
      // of adjacent specks cannot hold each other up.
      const here = heights[y * size + x];
      if (here - secondTallest > toleranceM) out[y * size + x] = secondTallest;
    }
  }
  heights.set(out);
}

/**
 * Raise an implausible low tail to the ground around it.
 *
 * Terrain tiles carry voids and ocean readings, and a capture next to water
 * comes back with a hundred samples near −600 m among ground that never
 * leaves ±10 m. Nothing in the model reports that: the plinth simply sinks a
 * kilometre and the city becomes a rim on top of a cylinder.
 *
 * The floor is a full inter-percentile spread below the first percentile, so
 * it only catches values no terrain in the frame could explain. A genuine
 * valley is left alone, because its own floor *is* the first percentile — and
 * a capture that is mostly open water keeps its depth for the same reason.
 *
 * Returns how many samples were raised, so the capture can say so.
 */
export function raiseVoids(grid: SampleGrid): number {
  const { heights } = grid;
  if (heights.length < 100) return 0;

  const sorted = Float32Array.from(heights).sort();
  const low = sorted[Math.floor(0.01 * (sorted.length - 1))];
  const high = sorted[Math.floor(0.99 * (sorted.length - 1))];
  const floor = low - Math.max(1, high - low);

  let raised = 0;
  for (let i = 0; i < heights.length; i += 1) {
    if (heights[i] < floor) {
      heights[i] = low;
      raised += 1;
    }
  }
  return raised;
}
