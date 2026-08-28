import type { MetadataRoute } from "next";
import { PLACES } from "@/lib/place-library";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates";

/**
 * The indexable surface.
 *
 * Place and template pages are the top of the funnel — someone searching for
 * a printable model of their city, or for a hex trivet, should land on the
 * page for that thing rather than on a gallery that filters client-side.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://printa-orcin.vercel.app";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/places`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/editor`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/templates`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...PLACES.map((place) => ({
      url: `${base}/places/${place.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...Object.keys(TEMPLATE_CATEGORIES).map((category) => ({
      url: `${base}/templates/category/${category}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...TEMPLATES.map((entry) => ({
      url: `${base}/templates/${entry.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
