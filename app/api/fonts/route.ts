import { getGoogleFontCatalog } from "@/lib/google-fonts";

export const runtime = "nodejs";

export async function GET() {
  const fonts = await getGoogleFontCatalog();
  return Response.json(
    { fonts, count: fonts.length },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
