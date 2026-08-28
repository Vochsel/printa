import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { TEMPLATE_CATEGORIES, templatesInCategory, type TemplateCategory } from "@/lib/templates";
import { TemplateCard } from "../../TemplateCard";
import { templateShots } from "@/lib/template-shots";

/**
 * A landing page per category.
 *
 * "Printable vases" and "3D printed desk organisers" are different searches
 * from "3D print templates", and each deserves a page that answers it
 * directly rather than a filter applied to a gallery.
 */

export const dynamicParams = false;

const CATEGORIES = Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[];

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

function resolve(value: string): TemplateCategory | null {
  return (CATEGORIES as string[]).includes(value) ? (value as TemplateCategory) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const category = resolve((await params).category);
  if (!category) return {};
  const meta = TEMPLATE_CATEGORIES[category];
  const count = templatesInCategory(category).length;

  const title = `${meta.name} — ${count} free 3D print templates`;
  return {
    title,
    description: `${meta.blurb} ${count} free, editable templates you can download as STL or open in the browser editor.`,
    alternates: { canonical: `/templates/category/${category}` },
    keywords: [`3D printed ${meta.name.toLowerCase()}`, `${meta.name} STL`, "free STL files", "3D print templates"],
    openGraph: { title: `${title} · Printa`, description: meta.blurb, type: "website" },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const category = resolve((await params).category);
  if (!category) notFound();

  const meta = TEMPLATE_CATEGORIES[category];
  const templates = templatesInCategory(category);
  const shots = await templateShots();
  const others = CATEGORIES.filter((key) => key !== category);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Link href="/templates" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All templates
        </Link>
      </div>

      <section className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:px-6">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{meta.name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{meta.blurb}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {templates.length} templates · free STL · every dimension still editable.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((entry) => (
            <TemplateCard key={entry.slug} template={entry} shot={shots[entry.slug]} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-sm font-semibold tracking-tight">Other categories</h2>
        <nav aria-label="Other categories" className="mt-3 flex flex-wrap gap-2">
          {others.map((key) => (
            <Link
              key={key}
              href={`/templates/category/${key}`}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-foreground/25"
            >
              {TEMPLATE_CATEGORIES[key].name}
            </Link>
          ))}
        </nav>
      </section>

      <SiteFooter />
    </main>
  );
}
