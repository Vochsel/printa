import { createBinaryStl, makeStlFilename, normalizeTextModelOptions } from "@/lib/text-mesh";
import { resolveGoogleFont } from "@/lib/google-fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selectedFont = await resolveGoogleFont(url.searchParams.get("font"));
  const options = normalizeTextModelOptions({
    text: url.searchParams.get("text") ?? undefined,
    font: selectedFont.id,
    widthMm: url.searchParams.has("width") ? Number(url.searchParams.get("width")) : undefined,
    sizeMm: Number(url.searchParams.get("size") ?? 36),
    depthMm: Number(url.searchParams.get("depth") ?? 4),
    bevelMm: Number(url.searchParams.get("bevel") ?? 0.6),
    bevelSegments: Number(url.searchParams.get("bevelSegments") ?? 3),
    curveSegments: Number(url.searchParams.get("curveSegments") ?? 10),
    bevelSide: (url.searchParams.get("bevelSide") ?? "both") as "both" | "top" | "bottom",
    smoothNormals: url.searchParams.get("smoothNormals") !== "false",
    textCase: (url.searchParams.get("textCase") ?? "original") as "original" | "uppercase" | "lowercase" | "titlecase",
    fontWeight: url.searchParams.get("fontWeight") === "bold" ? "bold" : "regular",
    italic: url.searchParams.get("italic") === "true",
    underline: url.searchParams.get("underline") === "true",
  });
  const { bytes } = await createBinaryStl(options);
  const filename = makeStlFilename(options.text);

  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "model/stl",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
