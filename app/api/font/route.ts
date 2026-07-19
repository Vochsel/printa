import { getGoogleFontFileUrl, resolveGoogleFont } from "@/lib/google-fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selected = await resolveGoogleFont(url.searchParams.get("id"));
  const variant = await getGoogleFontFileUrl(selected, url.searchParams.get("text") ?? undefined, {
    weight: url.searchParams.get("weight") === "bold" ? 700 : 400,
    italic: url.searchParams.get("italic") === "true",
  });
  const response = await fetch(variant.url, { next: { revalidate: 60 * 60 * 24 * 30 } });
  if (!response.ok) {
    return Response.json(
      { error: "Font file unavailable." },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  const bytes = await response.arrayBuffer();
  const isOpenType = variant.url.includes(".otf");
  return new Response(bytes, {
    headers: {
      "Content-Type": isOpenType ? "font/otf" : "font/ttf",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Printa-Font-Family": encodeURIComponent(selected.family),
      "X-Printa-Resolved-Weight": String(variant.resolvedWeight),
      "X-Printa-Resolved-Italic": String(variant.resolvedItalic),
      "X-Printa-Synthetic-Italic": String(variant.syntheticItalic),
    },
  });
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
