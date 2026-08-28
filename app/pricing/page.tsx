import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ProButton } from "@/components/pro-button";
import { SiteFooter } from "@/components/site-footer";

/**
 * Pricing, on its own page.
 *
 * The landing page has a pricing section, but a checkout has to come back
 * somewhere, a link has to point somewhere, and "what does it cost" is its
 * own search. This is that page.
 */

export const metadata: Metadata = {
  title: "Pricing — free forever, Pro at $10/month",
  description:
    "The Printa editor, the templates, the city captures and STL export are free with no account. Pro adds cloud projects, simulations and every export format for $10 a month.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Printa pricing", description: "Free forever. Pro at $10/month.", type: "website" },
};

const FREE = [
  "The full visual editor",
  "Every template and city model",
  "Capture any place on Earth",
  "Watertight STL export",
  "The assistant, and the MCP endpoint",
];

const PRO = [
  "Projects saved to your account",
  "Every format — 3MF, OBJ, STEP",
  "Cloth, water and fluid simulation",
  "Voronoi lattices and organic growth",
  "Interior struts and smart seams",
  "Priority model generation",
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; cancelled?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-dvh bg-background">
      <section className="mx-auto max-w-4xl px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
        {params.upgraded && (
          <p className="mb-6 rounded-xl border border-emerald-300/50 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            You&apos;re on Pro — thank you. Everything unlocks on your next reload of the editor.
          </p>
        )}
        {params.cancelled && (
          <p className="mb-6 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
            Checkout cancelled — nothing was charged.
          </p>
        )}

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Start free. Go further with Pro.</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Everything that makes a printable model — the editor, a hundred
          templates, real cities captured from the map, and watertight STL
          export — is free and needs no account. Pro is for keeping your work
          somewhere it follows you, and for the heavier parts of the engine.
        </p>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Free</h2>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-heading text-4xl font-semibold tracking-tight">$0</span>
            <span className="text-sm text-muted-foreground">/ forever</span>
          </div>
          <ul className="mt-5 grid flex-1 gap-2.5 text-sm">
            {FREE.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" /> {item}
              </li>
            ))}
          </ul>
          <Link
            href="/editor"
            className="mt-6 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-medium transition-colors hover:bg-secondary"
          >
            Open the editor <ArrowRight size={15} />
          </Link>
        </div>

        <div className="relative flex flex-col rounded-2xl border-2 border-foreground bg-card p-6">
          <span className="absolute -top-3 left-6 rounded-full bg-[#ff4d8b] px-2.5 py-0.5 text-[11px] font-semibold text-white">Pro</span>
          <h2 className="font-heading text-lg font-semibold tracking-tight">Pro</h2>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-heading text-4xl font-semibold tracking-tight">$10</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </div>
          <ul className="mt-5 grid flex-1 gap-2.5 text-sm">
            {PRO.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent-tool)]" /> {item}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <ProButton className="w-full" />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
