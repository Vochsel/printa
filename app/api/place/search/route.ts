import { searchPlaces } from "@/lib/place-search";

/**
 * Find somewhere to print, by name or by street address.
 *
 * Thin over `lib/place-search`, which the assistant's find_place tool calls
 * directly — one geocoding policy, whether the question came from a person
 * typing in the editor or from a model asked for "my street".
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  try {
    const { results, source } = await searchPlaces(query);
    return Response.json({ results, source });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Place search is unavailable." },
      { status: 502 },
    );
  }
}
