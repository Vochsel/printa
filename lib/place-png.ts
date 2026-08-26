import { inflateSync } from "node:zlib";

/**
 * Minimal PNG reader for terrain tiles.
 *
 * Terrain arrives as PNG, and the browser decodes it with `createImageBitmap`
 * and a canvas. Neither exists in Node, so baking a place from a script would
 * silently fall back to flat ground — which is exactly wrong for somewhere
 * like San Francisco, where the hills are the point.
 *
 * Only what terrain tiles actually use is handled: 8-bit RGB or RGBA, no
 * interlacing. Anything else returns null and the caller falls back.
 */
export function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x89504e47) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
    );
    const start = offset + 8;

    if (type === "IHDR") {
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(start, start + length));
    } else if (type === "IEND") {
      break;
    }
    offset = start + length + 4;
  }

  if (bitDepth !== 8 || interlace !== 0) return null;
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (channels === 0 || width === 0 || height === 0) return null;

  const merged = new Uint8Array(idat.reduce((sum, chunk) => sum + chunk.length, 0));
  let cursor = 0;
  for (const chunk of idat) {
    merged.set(chunk, cursor);
    cursor += chunk.length;
  }

  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(merged));
  } catch {
    return null;
  }

  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  let source = 0;

  for (let y = 0; y < height; y += 1) {
    if (source >= raw.length) return null;
    const filter = raw[source];
    source += 1;
    line.set(raw.subarray(source, source + stride));
    source += stride;

    // Undo the per-scanline filter. Each mode predicts a byte from its left
    // (a), the byte above (b), and the one above-left (c).
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = value & 0xff;
    }
    previous.set(line);

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      rgba[to] = line[from];
      rgba[to + 1] = line[from + 1];
      rgba[to + 2] = line[from + 2];
      rgba[to + 3] = channels === 4 ? line[from + 3] : 255;
    }
  }

  return { width, height, rgba };
}
