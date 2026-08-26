import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, Download, Layers, Mountain, Ruler, SlidersHorizontal } from "lucide-react";
import { PLACES, getPlace, placeScale } from "@/lib/place-library";
import { placeDownloadUrl, placeEditorUrl, placePreviewUrl } from "@/lib/place-links";
import { PlacePreview } from "../PlacePreview";

/**
 * A landing page per place.
 *
 * Statically generated so each one is a plain, indexable document, with the
 * model itself compiled on request from the same spec the editor would open.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PLACES.map((place) => ({ slug: place.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const place = getPlace((await params).slug);
  if (!place) return {};

  const title = `${place.name} — 3D printable city model`;
  const description = `Download a print-ready STL of ${place.name}, ${place.region}. ${place.blurb} ${place.radiusM * 2}m across at about 1:${placeScale(place).toLocaleString()}.`;

  return {
    title,
    description,
    alternates: { canonical: `/places/${place.slug}` },
    keywords: [
      `${place.name} 3D model`,
      `${place.name} STL`,
      `3D printed ${place.name}`,
      "city model",
      "printable map",
    ],
    openGraph: { title: `${title} · Printa`, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const place = getPlace((await params).slug);
  if (!place) notFound();

  const scale = placeScale(place);
  const others = PLACES.filter((entry) => entry.slug !== place.slug).slice(0, 3);

  // Structured data, so the model shows up as a product rather than a page.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "3DModel",
    name: `${place.name} — printable city model`,
    description: place.about,
    encodingFormat: "model/stl",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Printa" },
    spatialCoverage: {
      "@type": "Place",
      name: `${place.name}, ${place.region}`,
      geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng },
    },
  };

  return (
    <main className="min-h-dvh bg-background">
      <script
        type="application/ld+json"
        // Serialised from a literal defined just above; no user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Link
          href="/places"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All places
        </Link>
      </div>

      <section className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-12">
        <PlacePreview
          specUrl={placePreviewUrl(place)}
          className="aspect-square w-full overflow-hidden rounded-2xl border border-border bg-secondary/40"
        />

        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              {place.capture === "surface" ? <Mountain className="size-3" /> : <Layers className="size-3" />}
              {place.capture === "surface" ? "Photogrammetric surface" : "Mapped outlines"}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {place.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{place.region}</p>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{place.about}</p>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat icon={<Ruler className="size-3.5" />} label="Ground covered" value={`${place.radiusM * 2} m`} />
            <Stat icon={<Box className="size-3.5" />} label="Printed size" value="120 mm" />
            <Stat icon={<SlidersHorizontal className="size-3.5" />} label="Scale" value={`1:${scale.toLocaleString()}`} />
          </dl>

          <div className="mt-7 flex flex-wrap gap-2">
            <a
              href={placeDownloadUrl(place)}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              <Download className="size-4" />
              Download STL
            </a>
            <Link
              href={placeEditorUrl(place)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary"
            >
              Open in editor
            </Link>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            {place.capture === "surface"
              ? "Surface captured from Google's photorealistic 3D tiles. Check Google Maps Platform terms before redistributing a printed derivative."
              : "Building outlines © OpenStreetMap contributors, ODbL. Ground sampled from open terrain data."}
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-secondary/30 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">How this model is made</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Step
              n="1"
              title="Capture"
              body={
                place.capture === "surface"
                  ? "Photogrammetric tiles covering the area are read and reduced to the topmost surface over a grid, which discards the holes and loose fragments that make raw scans unprintable."
                  : "Mapped building outlines are read from OpenStreetMap and the ground beneath them sampled from open terrain tiles."
              }
            />
            <Step
              n="2"
              title="Solidify"
              body="The surface is closed into a watertight solid with a plinth and a raised rim, sharing boundary vertices so there are no seams for a slicer to complain about."
            />
            <Step
              n="3"
              title="Print"
              body="Download the STL and slice it. No supports needed: overhangs are removed by construction, and anything too fine for a nozzle is dropped rather than printed badly."
            />
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">More places</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/places/${other.slug}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-foreground/25"
              >
                <PlacePreview
                  specUrl={placePreviewUrl(other)}
                  className="aspect-[4/3] w-full bg-secondary/40"
                  spin={false}
                />
                <div className="p-3">
                  <p className="text-xs font-medium">{other.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{other.region}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
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
      <dd className="mt-1 font-mono text-sm">{value}</dd>
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
