import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { TemplateGlyph } from "@/components/template-glyph";
import { templateDownloadUrl, templateEditorUrl, type Template } from "@/lib/templates";

/** One catalogue card: glyph, name, tagline, and the two things to do with it. */
export function TemplateCard({ template }: { template: Template }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/25">
      <Link href={`/templates/${template.slug}`} aria-label={template.name}>
        <TemplateGlyph template={template} className="aspect-[4/3] w-full bg-secondary/40" />
      </Link>
      <div className="flex flex-1 flex-col p-3.5">
        <Link href={`/templates/${template.slug}`} className="text-sm font-semibold hover:underline">
          {template.name}
        </Link>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{template.tagline}</p>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href={templateEditorUrl(template.slug)}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-foreground px-2 text-[11px] font-medium text-background transition hover:opacity-90"
          >
            Use this <ArrowRight size={12} />
          </Link>
          <a
            href={templateDownloadUrl(template.slug)}
            download={`${template.slug}.stl`}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-medium hover:bg-secondary"
          >
            <Download size={12} /> STL
          </a>
        </div>
      </div>
    </div>
  );
}
