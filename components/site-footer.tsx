import Link from "next/link";
import { TEMPLATE_CATEGORIES } from "@/lib/templates";

/**
 * The site's link floor.
 *
 * Every category page and both galleries are reachable from every page, which
 * is what stops a hundred template pages from being orphans that only a
 * sitemap knows about.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/20">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="font-heading text-sm font-semibold">Printa</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Print-ready 3D models from a spec: type it, describe it, or capture
            it from a map. Every model on this site is compiled by the same
            engine that serves the editor.
          </p>
        </div>

        <nav aria-label="Product">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Make</p>
          <ul className="mt-3 grid gap-1.5 text-xs">
            <li><Link href="/editor" className="text-muted-foreground hover:text-foreground">Open the editor</Link></li>
            <li><Link href="/templates" className="text-muted-foreground hover:text-foreground">All templates</Link></li>
            <li><Link href="/places" className="text-muted-foreground hover:text-foreground">City models</Link></li>
            <li><Link href="/editor?new=place" className="text-muted-foreground hover:text-foreground">Capture a place</Link></li>
            <li><Link href="/chat" className="text-muted-foreground hover:text-foreground">Describe a model</Link></li>
          </ul>
        </nav>

        <nav aria-label="Template categories" className="sm:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Templates by category</p>
          <ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
            {Object.entries(TEMPLATE_CATEGORIES).map(([key, meta]) => (
              <li key={key}>
                <Link href={`/templates/category/${key}`} className="text-muted-foreground hover:text-foreground">
                  {meta.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[11px] text-muted-foreground sm:px-6">
          Map data © OpenStreetMap contributors, ODbL. Elevation from open terrain tiles.
        </p>
      </div>
    </footer>
  );
}
