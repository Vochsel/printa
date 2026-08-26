import type { MetadataRoute } from "next";
import { PLACES } from "@/lib/place-library";

/**
 * The indexable surface.
 *
 * Place pages are the top of the funnel — someone searching for a printable
 * model of their city should land on one — so each gets its own entry rather
 * than hiding behind a client-side gallery.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://printa-orcin.vercel.app";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/places`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/editor`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...PLACES.map((place) => ({
      url: `${base}/places/${place.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
