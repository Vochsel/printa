import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Box, Download, Layers3, Ruler } from "lucide-react";
import { ModelTurntable } from "@/components/model-turntable";
import { SiteFooter } from "@/components/site-footer";
import { TemplateGlyph } from "@/components/template-glyph";
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplate,
  templateDownloadUrl,
  templateEditorUrl,
  templatePreviewUrl,
  templatesInCategory,
} from "@/lib/templates";

/**
 * A page per template.
 *
 * Statically generated and individually indexable — someone searching for a
 * printable hex trivet should land on the trivet, not on a gallery. The model
 * itself is compiled on request from the same document the editor opens.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return TEMPLATES.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const entry = getTemplate((await params).slug);
  if (!entry) return {};

  const title = `${entry.name} — free 3D print template`;
  const description = `${entry.tagline} Download the STL or edit every parameter in the browser. Free, no account needed.`;

  return {
    title,
    description,
    alternates: { canonical: `/templates/${entry.slug}` },
    keywords: [`${entry.name} STL`, `3D printed ${entry.name.toLowerCase()}`, ...entry.tags, "free STL", "3D print template"],
    openGraph: { title: `${title} · Printa`, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function describeSource(node: unknown): string {
  const shapeNode = node as { kind?: string; source?: { type?: string }; children?: unknown[]; child?: unknown; count?: number };
  if (shapeNode.kind === "assembly") return `${shapeNode.children?.length ?? 0} merged parts`;
  if (shapeNode.kind === "repeat") return `${shapeNode.count ?? 0} repeated copies`;
  const type = shapeNode.source?.type ?? "shape";
  const labels: Record<string, string> = {
    revolve: "Revolved profile",
    extrude: "Extruded outline",
    text: "Extruded type",
    primitive: "Primitive solid",
    cellular: "Cellular lattice",
    organic: "Organic growth",
    water: "Ripple simulation",
    fluid: "Fluid simulation",
    cloth: "Cloth simulation",
    place: "Captured place",
  };
  return labels[type] ?? type;
}

function countModifiers(node: unknown): number {
  const value = node as { modifiers?: unknown[]; children?: unknown[]; child?: unknown };
  let total = value.modifiers?.length ?? 0;
  for (const child of value.children ?? []) total += countModifiers(child);
  if (value.child) total += countModifiers(value.child);
  return total;
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const entry = getTemplate((await params).slug);
  if (!entry) notFound();

  const category = TEMPLATE_CATEGORIES[entry.category];
  const related = templatesInCategory(entry.category).filter((other) => other.slug !== entry.slug).slice(0, 4);
  const modifiers = countModifiers(entry.document.root);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "3DModel",
    name: entry.name,
    description: entry.about,
    encodingFormat: "model/stl",
    isAccessibleForFree: true,
    keywords: entry.tags.join(", "),
    creator: { "@type": "Organization", name: "Printa" },
    potentialAction: {
      "@type": "DownloadAction",
      target: `https://printa-orcin.vercel.app${templateDownloadUrl(entry.slug)}`,
    },
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Templates", item: "https://printa-orcin.vercel.app/templates" },
      { "@type": "ListItem", position: 2, name: category.name, item: `https://printa-orcin.vercel.app/templates/category/${entry.category}` },
      { "@type": "ListItem", position: 3, name: entry.name, item: `https://printa-orcin.vercel.app/templates/${entry.slug}` },
    ],
  };

  return (
    <main className="min-h-dvh bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />

      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pt-10 text-xs text-muted-foreground sm:px-6">
        <Link href="/templates" className="inline-flex items-center gap-1.5 transition hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All templates
        </Link>
        <span aria-hidden>·</span>
        <Link href={`/templates/category/${entry.category}`} className="transition hover:text-foreground">
          {category.name}
        </Link>
      </div>

      <section className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-12">
        <ModelTurntable
          specUrl={templatePreviewUrl(entry.slug)}
          className="aspect-square w-full overflow-hidden rounded-2xl border border-border bg-secondary/40"
        />

        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
            ))}
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{entry.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{entry.tagline}</p>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{entry.about}</p>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat icon={<Box className="size-3.5" />} label="Built from" value={describeSource(entry.document.root)} />
            <Stat icon={<Layers3 className="size-3.5" />} label="Modifiers" value={String(modifiers)} />
            <Stat icon={<Ruler className="size-3.5" />} label="Units" value="Millimetres" />
          </dl>

          <div className="mt-7 flex flex-wrap gap-2">
            <Link
              href={templateEditorUrl(entry.slug)}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Use this template <ArrowRight className="size-4" />
            </Link>
            <a
              href={templateDownloadUrl(entry.slug)}
              download={`${entry.slug}.stl`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary"
            >
              <Download className="size-4" /> Download STL
            </a>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            The STL is compiled when you ask for it, from the document above —
            so anything you change in the editor comes out of the same
            endpoint, watertight and ready to slice.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-secondary/30 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">Printing this</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Step n="1" title="Open or download" body="Press Use this to load the template into the editor, or take the STL as it stands and slice it." />
            <Step n="2" title="Change what matters" body="Every dimension is still a parameter: wall thickness, height, segment counts, fonts and modifiers are all editable, and the preview recompiles as you type." />
            <Step n="3" title="Slice and print" body="Models are closed solids with printable wall thicknesses, so a standard 0.2 mm profile is usually all a slicer needs." />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">More {category.name.toLowerCase()}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((other) => (
              <Link
                key={other.slug}
                href={`/templates/${other.slug}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-foreground/25"
              >
                <TemplateGlyph template={other} className="aspect-[4/3] w-full bg-secondary/40" />
                <div className="p-3">
                  <p className="text-xs font-medium">{other.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{other.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xs">{value}</dd>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
      <h3 className="mt-1 text-sm font-medium">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
