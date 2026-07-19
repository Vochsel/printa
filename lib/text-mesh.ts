import "server-only";
import { Mesh } from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { getGoogleFontFileUrl, resolveGoogleFont } from "@/lib/google-fonts";
import {
  createTextGeometry,
  geometryStats,
  normalizeTextModelOptions,
  parseOpenTypeFont,
  type TextModelOptions,
} from "@/lib/text-geometry";

const fontCache = new Map<string, Promise<ReturnType<typeof parseOpenTypeFont>>>();

async function loadFont(requestedFont: string, text: string, fontWeight: "regular" | "bold", italic: boolean) {
  const font = await resolveGoogleFont(requestedFont);
  const cacheKey = `${font.id}:${fontWeight}:${italic}:${text}`;
  const variant = await getGoogleFontFileUrl(font, text, {
    weight: fontWeight === "bold" ? 700 : 400,
    italic,
  });
  if (!fontCache.has(cacheKey)) {
    fontCache.set(
      cacheKey,
      fetch(variant.url, { next: { revalidate: 60 * 60 * 24 * 30 } })
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load ${font.family}.`);
          return response.arrayBuffer();
        })
        .then(parseOpenTypeFont),
    );
  }
  return { font: await fontCache.get(cacheKey)!, resolved: font, syntheticItalic: variant.syntheticItalic };
}

export async function createTextServerGeometry(input: Partial<TextModelOptions>) {
  const resolved = await resolveGoogleFont(input.font);
  const options = normalizeTextModelOptions({ ...input, font: resolved.id });
  const loaded = await loadFont(resolved.id, options.text, options.fontWeight, options.italic);
  return createTextGeometry(loaded.font, options, { syntheticItalic: loaded.syntheticItalic });
}

export async function getTextModelStats(input: Partial<TextModelOptions>) {
  const { geometry } = await createTextServerGeometry(input);
  const stats = geometryStats(geometry);
  geometry.dispose();
  return stats;
}

export async function createBinaryStl(input: Partial<TextModelOptions>) {
  const { geometry, options } = await createTextServerGeometry(input);
  const mesh = new Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const view = new STLExporter().parse(mesh, { binary: true });
  const copy = new Uint8Array(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  geometry.dispose();
  return { bytes: copy, options };
}

export function makeStlFilename(text: string) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
  return `printa-${slug || "text"}.stl`;
}

export { normalizeTextModelOptions } from "@/lib/text-geometry";
export type { TextModelOptions, TextModelStats } from "@/lib/text-geometry";
