import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, MapPin, Mountain } from "lucide-react";
import { PLACES, placeScale } from "@/lib/place-library";
import { placePreviewUrl } from "@/lib/place-links";
import { PlacePreview } from "./PlacePreview";

export const metadata: Metadata = {
  title: "3D printable city models",
  description:
    "Download print-ready STL models of real places — Sydney, Manhattan, London, San Francisco — built from photogrammetry or mapped building outlines.",
  alternates: { canonical: "/places" },
  openGraph: {
    title: "3D printable city models · Printa",
    description:
      "Print-ready STL models of real places, built from photogrammetry or mapped building outlines.",
    type: "website",
  },
};

export default function PlacesIndex() {
  return (
    <main className="min-h-dvh bg-background">
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Places
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          3D printable models of real cities
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Every model below is a real, closed, watertight solid — compiled by the
          same engine that powers the editor, and downloadable as an STL you can
          slice straight away. Pick a place to see it turning, change its size and
          plinth, or open it in the editor and keep going.
        </p>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Somewhere missing? Search any city, suburb or landmark on Earth in the
          editor and capture it yourself.
        </p>
        <Link
          href="/editor?new=place"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
        >
          <MapPin className="size-4" /> Make your own place
        </Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLACES.map((place) => (
            <Link
              key={place.slug}
              href={`/places/${place.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/25"
            >
              <PlacePreview
                specUrl={placePreviewUrl(place)}
                className="aspect-[4/3] w-full bg-secondary/40"
              />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{place.name}</h2>
                  <span
                    title={
                      place.capture === "surface"
                        ? "Photogrammetric surface"
                        : "Mapped building outlines"
                    }
                    className="ml-auto inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {place.capture === "surface" ? (
                      <Mountain className="size-3" />
                    ) : (
                      <Layers className="size-3" />
                    )}
                    {place.capture === "surface" ? "Surface" : "Mapped"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{place.region}</p>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {place.blurb}
                </p>
                <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  {place.radiusM * 2}m across · 1:{placeScale(place).toLocaleString()}
                  <ArrowRight className="ml-auto size-3.5 transition group-hover:translate-x-0.5" />
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
