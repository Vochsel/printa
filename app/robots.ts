import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // The STL endpoint compiles geometry on request; crawling it would burn
      // real work for pages that are not indexable anyway.
      { userAgent: "*", allow: "/", disallow: ["/api/", "/make/"] },
    ],
    sitemap: "https://printa-orcin.vercel.app/sitemap.xml",
  };
}
