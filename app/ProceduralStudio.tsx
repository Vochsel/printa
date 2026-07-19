"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Braces,
  Check,
  Download,
  FolderOpen,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Save,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { DEMO_MODEL_CARDS, type DemoModelId } from "@/lib/demo-models";
import type { PrintMaterialPreset } from "@/lib/material-presets";
import type { ModelDocument } from "@/lib/model-spec";
import { saveModel } from "@/lib/saved-models";
import { sfxError, sfxOpen, sfxSuccess, sfxTap } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { Inspector } from "@/components/editor/Inspector";
import type { FontSummary } from "@/components/editor/FontPicker";
import { LoadSaveDialog } from "@/components/editor/LoadSaveDialog";
import { ViewSettings } from "@/components/editor/ViewSettings";
import { Viewport, type PreviewSource, type ShadingMode, type ViewportHandle } from "@/components/editor/Viewport";

type InspectResult = {
  document: ModelDocument;
  spec: string;
  stlUrl: string;
  studioUrl: string;
  stats: { widthMm: number; depthMm: number; heightMm: number; triangles: number; volumeEstimateMm3: number };
  exceedsBuildVolume: boolean;
  warnings: string[];
  materialPreset: PrintMaterialPreset;
};

function encodeDocument(document: ModelDocument) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function geometryKey(document: ModelDocument) {
  const root = JSON.stringify(document.root, (key, value) => key === "id" || key === "material" ? undefined : value);
  return `${document.units}:${document.print.autoCenter}:${document.print.placeOnBed}:${root}`;
}

function documentMaterial(node: ModelDocument["root"]): PrintMaterialPreset {
  if (node.kind === "shape") return node.material ?? "pla-orange";
  if (node.kind === "repeat") return documentMaterial(node.child);
  return documentMaterial(node.children[0]);
}

/** Borderless model-name input in the header; commits into the document as you type. */
function ModelName({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);
  return (
    <input
      value={draft}
      aria-label="Model name"
      className="h-8 w-full min-w-0 max-w-72 truncate rounded-md bg-transparent px-2 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring/40"
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; setDraft(value); }}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value.trim()) onChange(event.target.value);
      }}
    />
  );
}

export function ProceduralStudio() {
  const [activeDemo, setActiveDemo] = useState<DemoModelId | null>("type-specimen");
  const [spec, setSpec] = useState("");
  const [result, setResult] = useState<InspectResult | null>(null);
  const [document, setDocument] = useState<ModelDocument | null>(null);
  const [preview, setPreview] = useState<PreviewSource | null>(null);
  const [fonts, setFonts] = useState<FontSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveUpdating, setLiveUpdating] = useState(false);
  const [compileInfo, setCompileInfo] = useState("");
  const [modelReady, setModelReady] = useState(false);
  const [shading, setShading] = useState<ShadingMode>("smooth");
  const [loadOpen, setLoadOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveSequenceRef = useRef(0);
  const compiledGeometryKeyRef = useRef("");
  const viewportRef = useRef<ViewportHandle>(null);
  const handleModelReady = useCallback(() => setModelReady(true), []);

  const inspect = useCallback(async (payload: { demo?: string; spec?: string | ModelDocument; encoded?: string }) => {
    liveAbortRef.current?.abort();
    liveSequenceRef.current += 1;
    setLoading(true);
    setModelReady(false);
    setError("");
    try {
      const response = await fetch("/api/model/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, format: "yaml" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Model spec is invalid.");
      setResult(data);
      setDocument(data.document);
      setSpec(data.spec);
      setPreview({ key: data.stlUrl, url: data.stlUrl });
      compiledGeometryKeyRef.current = geometryKey(data.document);
      setCompileInfo("");
      sfxSuccess();
      if (data.studioUrl) window.history.replaceState(window.history.state, "", data.studioUrl.replace(window.location.origin, ""));
      return true;
    } catch (nextError) {
      sfxError();
      setError(nextError instanceof Error ? nextError.message : "Model spec is invalid.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const compileLive = useCallback(async (next: ModelDocument) => {
    const sequence = ++liveSequenceRef.current;
    liveAbortRef.current?.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;
    setLiveUpdating(true);
    setError("");
    try {
      const response = await fetch("/api/model/stl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: next, preview: true }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Model preview could not be compiled.");
      }
      const buffer = await response.arrayBuffer();
      if (sequence !== liveSequenceRef.current) return;
      const dimensions = (response.headers.get("X-Printa-Dimensions") ?? "0,0,0").split(",").map(Number);
      const encoded = encodeDocument(next);
      const stlUrl = `/api/model/stl?spec=${encoded}`;
      const studioUrl = `/editor?spec=${encoded}`;
      const material = response.headers.get("X-Printa-Material") as PrintMaterialPreset | null;
      const exceedsBuildVolume = response.headers.get("X-Printa-Exceeds") === "true";
      setResult({
        document: next,
        spec: JSON.stringify(next, null, 2),
        stlUrl,
        studioUrl,
        stats: {
          widthMm: dimensions[0] ?? 0,
          depthMm: dimensions[1] ?? 0,
          heightMm: dimensions[2] ?? 0,
          triangles: Number(response.headers.get("X-Printa-Triangles") ?? 0),
          volumeEstimateMm3: Number(response.headers.get("X-Printa-Volume") ?? 0),
        },
        exceedsBuildVolume,
        warnings: exceedsBuildVolume ? [`Model exceeds the ${next.print.buildVolume.join(" × ")} mm reference build volume.`] : [],
        materialPreset: material ?? "pla-orange",
      });
      setPreview({ key: `live-${sequence}`, buffer });
      compiledGeometryKeyRef.current = geometryKey(next);
      setCompileInfo(`${response.headers.get("Server-Timing")?.replace("compile;dur=", "") ?? "—"} ms`);
      window.history.replaceState(window.history.state, "", studioUrl);
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === "AbortError") return;
      if (sequence === liveSequenceRef.current) {
        sfxError();
        setError(nextError instanceof Error ? nextError.message : "Model preview could not be compiled.");
      }
    } finally {
      if (sequence === liveSequenceRef.current) setLiveUpdating(false);
    }
  }, []);

  const updateDocument = useCallback((next: ModelDocument) => {
    setDocument(next);
    const nextSpec = JSON.stringify(next, null, 2);
    setSpec(nextSpec);
    liveAbortRef.current?.abort();
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    if (geometryKey(next) === compiledGeometryKeyRef.current) {
      liveSequenceRef.current += 1;
      setLiveUpdating(false);
      const encoded = encodeDocument(next);
      const studioUrl = `/editor?spec=${encoded}`;
      setResult((previous) => previous ? {
        ...previous,
        document: next,
        spec: nextSpec,
        stlUrl: `/api/model/stl?spec=${encoded}`,
        studioUrl,
        materialPreset: documentMaterial(next.root),
        exceedsBuildVolume: previous.stats.widthMm > next.print.buildVolume[0]
          || previous.stats.depthMm > next.print.buildVolume[1]
          || previous.stats.heightMm > next.print.buildVolume[2],
      } : previous);
      window.history.replaceState(window.history.state, "", studioUrl);
      return;
    }
    liveTimerRef.current = setTimeout(() => void compileLive(next), 170);
  }, [compileLive]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("spec");
    const demo = params.get("demo") as DemoModelId | null;
    const mode = params.get("mode");
    const fallback = mode === "procedural" ? "contour-spiral-vase" : "type-specimen";
    const nextDemo = DEMO_MODEL_CARDS.some((card) => card.id === demo) ? demo! : fallback;
    const timer = window.setTimeout(() => {
      if (encoded) {
        setActiveDemo(null);
        void inspect({ encoded });
      } else {
        setActiveDemo(nextDemo);
        void inspect({ demo: nextDemo });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [inspect]);

  useEffect(() => {
    void fetch("/api/fonts").then((response) => response.json()).then((data: { fonts: FontSummary[] }) => setFonts(data.fonts));
    return () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveAbortRef.current?.abort();
    };
  }, []);

  const stats = result?.stats;

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground">
      <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link className="grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-secondary" href="/" aria-label="Printa home">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground"><Layers3 className="size-3.5" /></span>
          </Link>
          {document && <ModelName value={document.name} onChange={(name) => { const draft = structuredClone(document); draft.name = name; updateDocument(draft); }} />}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => { sfxOpen(); setLoadOpen(true); }}>
            <FolderOpen className="size-4" /> <span className="hidden sm:inline">Open</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!document}
            onClick={() => {
              if (!document) return;
              sfxSuccess();
              saveModel(document.name, document);
              setSavedFlash(true);
              window.setTimeout(() => setSavedFlash(false), 1500);
            }}
          >
            {savedFlash ? <Check className="size-4 text-accent" /> : <Save className="size-4" />}
            <span className="hidden sm:inline">{savedFlash ? "Saved" : "Save"}</span>
          </Button>
          {result && (
            <Button asChild size="sm" onClick={() => sfxTap()}>
              <a href={result.stlUrl}>
                <Download className="size-4" /> <span className="hidden sm:inline">Download</span> STL
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More" onClick={() => sfxTap()}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { sfxOpen(); setSpecOpen(true); }}>
                <Braces className="size-4" /> Edit raw spec
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/skills" target="_blank"><ScrollText className="size-4" /> Modeling skill</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/api/model/schema" target="_blank"><Braces className="size-4" /> JSON schema</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" autoSaveId="printa-editor-panels" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={26} minSize={18} maxSize={44} className="min-w-64">
          <aside className="h-full overflow-y-auto overscroll-contain bg-background [scrollbar-width:thin]">
            {document && <Inspector document={document} fonts={fonts} onChange={updateDocument} />}
          </aside>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={74}>
          <section className="relative h-full min-w-0">
            {result && preview && document && (
              <Viewport
                ref={viewportRef}
                source={preview}
                materialPreset={result.materialPreset}
                display={document.display}
                units={document.units}
                shading={shading}
                onReady={handleModelReady}
              />
            )}

            {/* View settings + compile state, top-right of the viewport */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[10px] font-medium backdrop-blur-md transition-colors",
                  liveUpdating ? "text-amber-200" : "text-emerald-200/80",
                )}
              >
                {liveUpdating ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3" />}
                {liveUpdating ? "Updating…" : compileInfo || "Up to date"}
              </span>
              {document && (
                <ViewSettings
                  display={document.display}
                  shading={shading}
                  onShadingChange={setShading}
                  onDisplayChange={(nextDisplay) => {
                    if (!document) return;
                    const draft = structuredClone(document);
                    draft.display = nextDisplay;
                    updateDocument(draft);
                  }}
                />
              )}
            </div>

            {/* Model stats along the bottom of the stage */}
            {stats && (
              <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-4 overflow-x-auto rounded-full border border-white/10 bg-black/45 px-4 py-2 font-mono text-[10px] whitespace-nowrap text-white/70 backdrop-blur-md">
                <span><span className="text-white/40">Size</span> {stats.widthMm.toFixed(1)} × {stats.depthMm.toFixed(1)} × {stats.heightMm.toFixed(1)} mm</span>
                <span><span className="text-white/40">Mesh</span> {stats.triangles.toLocaleString()} tris</span>
                {result && !result.exceedsBuildVolume && <span className="flex items-center gap-1 text-emerald-300/90"><Check className="size-3" /> Fits printer</span>}
                {result?.exceedsBuildVolume && <span className="flex items-center gap-1 text-amber-300"><TriangleAlert className="size-3" /> Too big for printer</span>}
              </div>
            )}

            {error && (
              <div className="absolute bottom-16 left-1/2 flex max-w-md -translate-x-1/2 items-start gap-2 rounded-xl border border-destructive/40 bg-black/70 px-3.5 py-2.5 text-xs font-medium text-red-200 backdrop-blur-md">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
              </div>
            )}

            {!modelReady && (
              <div className="absolute inset-0 grid place-items-center bg-stage/70 backdrop-blur-[2px]">
                <span className="flex items-center gap-2.5 font-mono text-xs font-medium text-white/70">
                  <LoaderCircle className="size-4.5 animate-spin" /> {loading ? "Building your model…" : "Loading printable mesh…"}
                </span>
              </div>
            )}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      <LoadSaveDialog
        open={loadOpen}
        onOpenChange={setLoadOpen}
        document={document}
        activeDemo={activeDemo}
        onLoadDemo={(id) => {
          setActiveDemo(id);
          void inspect({ demo: id });
        }}
        onLoadDocument={(next) => {
          setActiveDemo(null);
          void inspect({ spec: next });
        }}
      />

      <Dialog
        open={specOpen}
        onOpenChange={(next) => {
          setSpecOpen(next);
          if (next && result) setSpec(result.spec);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Braces className="size-4.5" /> Model spec</DialogTitle>
            <DialogDescription>
              The whole model as editable JSON or YAML — everything in the editor lives here too.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={spec}
            spellCheck={false}
            rows={18}
            className="max-h-[55dvh] bg-stage font-mono text-[11px] leading-relaxed text-[#f6f0e4] selection:bg-white/20"
            aria-label="Model YAML or JSON spec"
            onChange={(event) => setSpec(event.target.value)}
          />
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button
              disabled={loading || !spec.trim()}
              onClick={() => {
                sfxTap();
                void inspect({ spec }).then((ok) => { if (ok) setSpecOpen(false); });
              }}
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} Apply spec
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
