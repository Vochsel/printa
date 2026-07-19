import { getGoogleFontCatalog } from "@/lib/google-fonts";

export const runtime = "nodejs";

export async function GET() {
  const fonts = await getGoogleFontCatalog();
  return Response.json(
    { fonts, count: fonts.length },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
