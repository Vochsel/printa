import "server-only";

export type GoogleFontSummary = {
  id: string;
  family: string;
  category: string;
  weights: number[];
  italicWeights: number[];
};

type GoogleFontsMetadataResponse = {
  familyMetadataList: Array<{
    family: string;
    category?: string | null;
    fonts?: Record<string, unknown>;
  }>;
};

const FALLBACK_FONTS: GoogleFontSummary[] = [
  { id: "roboto", family: "Roboto", category: "Sans Serif", weights: [400, 700], italicWeights: [400, 700] },
  { id: "lobster", family: "Lobster", category: "Display", weights: [400], italicWeights: [] },
  { id: "space-grotesk", family: "Space Grotesk", category: "Sans Serif", weights: [400, 700], italicWeights: [] },
];

let catalogPromise: Promise<GoogleFontSummary[]> | null = null;

function slugifyFont(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getGoogleFontCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch("https://fonts.google.com/metadata/fonts", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Google Fonts catalog unavailable.");
        return response.json() as Promise<GoogleFontsMetadataResponse>;
      })
      .then((data) =>
        data.familyMetadataList
          .filter((font) => font.family && Object.keys(font.fonts ?? {}).length > 0)
          .map((font) => ({
            id: slugifyFont(font.family),
            family: font.family,
            category: font.category ?? "Display",
            weights: Object.keys(font.fonts ?? {}).filter((key) => /^\d+$/.test(key)).map(Number).sort((a, b) => a - b),
            italicWeights: Object.keys(font.fonts ?? {}).filter((key) => /^\d+i$/.test(key)).map((key) => Number(key.slice(0, -1))).sort((a, b) => a - b),
          }))
          .sort((a, b) => a.family.localeCompare(b.family)),
      )
      .catch(() => FALLBACK_FONTS);
  }
  return catalogPromise;
}

export async function resolveGoogleFont(value?: string | null) {
  const requested = value?.trim() || "Roboto";
  const slug = slugifyFont(requested);
  const bundled = FALLBACK_FONTS.find((font) => font.id === slug || font.family.toLowerCase() === requested.toLowerCase());
  if (bundled) return bundled;
  const catalog = await getGoogleFontCatalog();
  return (
    catalog.find((font) => font.id === slug || font.family.toLowerCase() === requested.toLowerCase()) ??
    catalog.find((font) => font.id === "roboto") ??
    FALLBACK_FONTS[0]
  );
}

function closestWeight(weights: number[], requested: number) {
  return (weights.length ? weights : [400]).reduce((best, weight) =>
    Math.abs(weight - requested) < Math.abs(best - requested) ? weight : best,
  );
}

export async function getGoogleFontFileUrl(
  font: GoogleFontSummary,
  text?: string,
  style: { weight?: number; italic?: boolean } = {},
) {
  const requestedWeight = style.weight ?? 400;
  const useItalic = Boolean(style.italic && font.italicWeights.length);
  const availableWeights = useItalic ? font.italicWeights : font.weights;
  const resolvedWeight = closestWeight(availableWeights, requestedWeight);
  const cssUrl = new URL("https://fonts.googleapis.com/css2");
  const family = useItalic
    ? `${font.family}:ital,wght@1,${resolvedWeight}`
    : `${font.family}:wght@${resolvedWeight}`;
  cssUrl.searchParams.set("family", family);
  if (text) cssUrl.searchParams.set("text", text);
  const response = await fetch(cssUrl, {
    next: { revalidate: 60 * 60 * 24 * 30 },
    headers: { "User-Agent": "curl/8.0.1", Accept: "text/css" },
  });
  if (!response.ok) throw new Error(`Google Fonts could not serve ${font.family}.`);
  const css = await response.text();
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!match) throw new Error(`No outline font file is available for ${font.family}.`);
  return {
    url: match[1],
    resolvedWeight,
    resolvedItalic: useItalic,
    syntheticItalic: Boolean(style.italic && !useItalic),
  };
}
