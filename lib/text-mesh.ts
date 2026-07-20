import "server-only";
import { createBinaryStl as encodeBinaryStl } from "@/lib/binary-stl";
import { getGoogleFontFileUrl, resolveGoogleFont } from "@/lib/google-fonts";
import {
  createTextGeometry,
  geometryStats,
  normalizeTextModelOptions,
  parseOpenTypeFont,
  type TextModelOptions,
} from "@/lib/text-geometry";

type LoadedFont = {
  font: ReturnType<typeof parseOpenTypeFont>;
  resolved: Awaited<ReturnType<typeof resolveGoogleFont>>;
  syntheticItalic: boolean;
};

const fontCache = new Map<string, Promise<LoadedFont>>();
const editFontCache = new Map<string, Promise<LoadedFont>>();
const servedVariants = new Set<string>();
const SHARED_PRINTABLE_GLYPHS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

function loadFontSubset(
  font: Awaited<ReturnType<typeof resolveGoogleFont>>,
  text: string,
  fontWeight: "regular" | "bold",
  italic: boolean,
) {
  return getGoogleFontFileUrl(font, text, {
    weight: fontWeight === "bold" ? 700 : 400,
    italic,
  }).then(async (variant) => {
    const response = await fetch(variant.url, { next: { revalidate: 60 * 60 * 24 * 30 } });
    if (!response.ok) throw new Error(`Could not load ${font.family}.`);
    return {
      font: parseOpenTypeFont(await response.arrayBuffer()),
      resolved: font,
      syntheticItalic: variant.syntheticItalic,
    };
  });
}

function warmEditFont(
  font: Awaited<ReturnType<typeof resolveGoogleFont>>,
  variantKey: string,
  fontWeight: "regular" | "bold",
  italic: boolean,
) {
  if (!editFontCache.has(variantKey)) {
    const loading = loadFontSubset(font, SHARED_PRINTABLE_GLYPHS, fontWeight, italic);
    editFontCache.set(variantKey, loading);
    void loading.catch(() => editFontCache.delete(variantKey));
  }
  return editFontCache.get(variantKey)!;
}

async function loadFont(requestedFont: string, text: string, fontWeight: "regular" | "bold", italic: boolean) {
  const font = await resolveGoogleFont(requestedFont);
  const variantKey = `${font.id}:${fontWeight}:${italic}`;
  const cacheKey = `${font.id}:${fontWeight}:${italic}:${text}`;
  const exact = fontCache.get(cacheKey);
  if (exact) return exact;

  const isFollowup = servedVariants.has(variantKey);
  servedVariants.add(variantKey);
  if (isFollowup && [...text].every((character) => SHARED_PRINTABLE_GLYPHS.includes(character))) {
    return warmEditFont(font, variantKey, fontWeight, italic);
  }

  if (!fontCache.has(cacheKey)) {
    const loading = loadFontSubset(font, text, fontWeight, italic);
    fontCache.set(cacheKey, loading);
    void loading.catch(() => fontCache.delete(cacheKey));
  }
  const loaded = await fontCache.get(cacheKey)!;
  void warmEditFont(font, variantKey, fontWeight, italic);
  return loaded;
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
  const bytes = encodeBinaryStl(geometry, { includeVolume: false }).bytes;
  geometry.dispose();
  return { bytes, options };
}

export function makeStlFilename(text: string) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
  return `printa-${slug || "text"}.stl`;
}

export { normalizeTextModelOptions } from "@/lib/text-geometry";
export type { TextModelOptions, TextModelStats } from "@/lib/text-geometry";
