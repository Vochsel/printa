import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/**
 * The rendered picture of each template, if there is one.
 *
 * `npm run shots` photographs every template from the running site and stores
 * the PNG in Convex. The catalogue reads that here so a card can show the
 * model rather than a silhouette drawn from its spec — and falls back to the
 * silhouette whenever a shot is missing, the store is unreachable, or Convex
 * is not configured at all, because a page of a hundred cards must not depend
 * on a network call to render.
 */

export type TemplateShot = { url: string; width: number; height: number };

/** Re-read hourly: shots change only when someone runs the capture script. */
export const revalidate = 3600;

export async function templateShots(): Promise<Record<string, TemplateShot>> {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return {};

  try {
    const rows = await new ConvexHttpClient(url).query(api.templateShots.list, {});
    return Object.fromEntries(
      rows
        .filter((row): row is typeof row & { url: string } => Boolean(row.url))
        .map((row) => [row.slug, { url: row.url, width: row.width, height: row.height }]),
    );
  } catch {
    return {};
  }
}
