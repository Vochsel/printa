import type { Metadata } from "next";
import Link from "next/link";
import { TEMPLATES, TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/templates";
import { TemplateCard } from "./TemplateCard";
import { templateShots } from "@/lib/template-shots";
import { SiteFooter } from "@/components/site-footer";

/**
 * The catalogue.
 *
 * A hundred starting points, each one an ordinary model document — so
 * "use this" is not an import step, it is the editor opening the same spec
 * this page describes.
 */

export const metadata: Metadata = {
  title: "3D print templates — 100 free STL starting points",
  description:
    "A hundred free, editable 3D printing templates: vases, lampshades, signs, desk organisers, jewellery, lattices, planters and more. Download the STL or open any of them in the browser editor.",
  alternates: { canonical: "/templates" },
  keywords: [
    "3D print templates",
    "free STL files",
    "printable models",
    "3D printing projects",
    "parametric templates",
    "STL download",
  ],
  openGraph: {
    title: "100 free 3D print templates · Printa",
    description:
      "Vases, lamps, signs, organisers, jewellery, lattices and planters — all editable in the browser and downloadable as STL.",
    type: "website",
  },
};

const categories = Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[];

export default async function TemplatesIndex() {
  const shots = await templateShots();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "3D print templates",
    description: `${TEMPLATES.length} free, editable 3D printing templates, downloadable as STL.`,
    hasPart: TEMPLATES.slice(0, 40).map((entry) => ({
      "@type": "3DModel",
      name: entry.name,
      description: entry.tagline,
      encodingFormat: "model/stl",
      url: `https://printa-orcin.vercel.app/templates/${entry.slug}`,
    })),
  };

  return (
    <main className="min-h-dvh bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-8 sm:px-6 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Templates</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          {TEMPLATES.length} 3D printing templates, all editable
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Every template here is a model document, not a mesh — so the wall
          thickness, the height, the number of flutes and the font are all
          still parameters when you open it. Download the STL as it stands, or
          press <strong className="font-medium text-foreground">Use this</strong> and
          change anything about it first.
        </p>

        <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
          {categories.map((key) => (
            <Link
              key={key}
              href={`/templates/category/${key}`}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-foreground/25"
            >
              {TEMPLATE_CATEGORIES[key].name}
              <span className="ml-1.5 text-muted-foreground">
                {TEMPLATES.filter((entry) => entry.category === key).length}
              </span>
            </Link>
          ))}
        </nav>
      </section>

      {categories.map((key) => {
        const inCategory = TEMPLATES.filter((entry) => entry.category === key);
        return (
          <section key={key} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                <Link href={`/templates/category/${key}`} className="hover:underline">
                  {TEMPLATE_CATEGORIES[key].name}
                </Link>
              </h2>
              <p className="text-xs text-muted-foreground">{TEMPLATE_CATEGORIES[key].blurb}</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {inCategory.map((entry) => (
                <TemplateCard key={entry.slug} template={entry} shot={shots[entry.slug]} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight">Nothing here quite right?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Start from the nearest template and change it, describe what you
            want to the assistant, or capture a real place from the map. All
            three end up in the same editor and the same STL.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/editor" className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90">
              Open the editor
            </Link>
            <Link href="/editor?new=place" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary">
              Capture a place
            </Link>
            <Link href="/places" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary">
              City models
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
