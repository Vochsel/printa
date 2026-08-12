"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileUp,
  LoaderCircle,
  Shapes,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumberField, SelectField } from "@/components/editor/fields";
import { MAX_VECTOR_COMMANDS, unitScaleMm, type ModelDocument, type ModelNode, type VectorContourSpec } from "@/lib/model-spec";
import {
  boundsSize,
  mergeBounds,
  shapeToSvgPath,
  transformContour,
  type ImportedDocument,
  type ImportedShape,
} from "@/lib/vector-shapes";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

/*
 * Import modal for SVG and PDF artwork.
 *
 * The picker is deliberately two-way: the same shape can be selected from the
 * visual preview or from the outliner, and hovering either one highlights the
 * other. That matters because imported files routinely contain background
 * plates, registration marks, and stray stroked paths that are only
 * identifiable by looking at them.
 */

const MAX_CONTOURS_PER_SOURCE = 512;
// One layer per shape becomes one node per shape, and the model graph caps how
// many nodes a document may hold.
const MAX_SEPARATE_LAYERS = 24;

type ImportMode = "merge" | "separate";

type Options = {
  size: number;
  depth: number;
  bevel: number;
  mode: ImportMode;
};

function slug(value: string) {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "artwork";
}

function formatSize(shape: ImportedShape, unitScale: number, unit: string) {
  const size = boundsSize(shape.bounds);
  const round = (value: number) => (value / unitScale).toFixed(value / unitScale < 10 ? 1 : 0);
  return `${round(size.width)} × ${round(size.height)} ${unit}`;
}

export function buildImportNodes(
  document: ImportedDocument,
  selected: ImportedShape[],
  options: Options,
  units: ModelDocument["units"],
): ModelNode[] {
  if (!selected.length) return [];
  const unitScale = unitScaleMm(units);
  const bounds = mergeBounds(selected.map((shape) => shape.bounds));
  const size = boundsSize(bounds);
  const longest = Math.max(size.width, size.height) || 1;
  // Contours arrive in millimetres; `scale` takes them to document units at the
  // requested size in one step.
  const scale = (options.size * unitScale) / longest / unitScale;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const stamp = Date.now().toString(36);
  const name = slug(document.name);

  const common = {
    depth: options.depth,
    bevel: options.bevel,
    bevelSegments: 3,
    curveSegments: 12,
    origin: "center" as const,
  };

  if (options.mode === "merge") {
    const contours: VectorContourSpec[] = selected.flatMap((shape) =>
      shape.contours.map((contour) => transformContour(contour, scale, -centerX * scale, -centerY * scale)));
    return [{
      kind: "shape",
      id: `${name}-${stamp}`,
      source: {
        type: "vector",
        contours,
        fillRule: selected.find((shape) => shape.fillRule === "evenodd") ? "evenodd" : "nonzero",
        width: size.width * scale,
        height: size.height * scale,
        label: `${document.name}${document.pageCount > 1 ? ` · page ${document.page}` : ""}`.slice(0, 120),
        ...common,
      },
      modifiers: [],
      material: "pla-orange",
    }];
  }

  return selected.map((shape, index) => {
    const shapeSize = boundsSize(shape.bounds);
    const shapeCenterX = (shape.bounds.minX + shape.bounds.maxX) / 2;
    const shapeCenterY = (shape.bounds.minY + shape.bounds.maxY) / 2;
    return {
      kind: "shape",
      id: `${name}-${index + 1}-${stamp}`,
      source: {
        type: "vector",
        contours: shape.contours.map((contour) => transformContour(contour, scale, 0, 0)),
        fillRule: shape.fillRule,
        width: Math.max(0.01, shapeSize.width * scale),
        height: Math.max(0.01, shapeSize.height * scale),
        label: `${document.name} · ${shape.label}`.slice(0, 120),
        ...common,
      },
      modifiers: [],
      // Each source centers on its own bounds, so the offset restores the
      // arrangement the artwork had on the page.
      transform: {
        translate: [(shapeCenterX - centerX) * scale, (shapeCenterY - centerY) * scale, 0] as [number, number, number],
        rotate: [0, 0, 0] as [number, number, number],
        scale: 1,
      },
      material: "pla-orange",
    } satisfies ModelNode;
  });
}

export function ImportDialog({ open, onOpenChange, units, onImport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: ModelDocument["units"];
  onImport: (nodes: ModelNode[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [document, setDocument] = useState<ImportedDocument | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Options>({ size: 60, depth: 4, bevel: 0, mode: "merge" });
  const inputRef = useRef<HTMLInputElement>(null);
  const unitScale = unitScaleMm(units);

  // Closing keeps the parsed artwork so reopening can pick up more shapes from
  // the same file; "Replace file" is the way back to a clean slate.
  const upload = useCallback(async (next: File, page = 1) => {
    setLoading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", next);
      body.append("page", String(page));
      const response = await fetch("/api/vector/import", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "This file could not be imported.");
      const imported = data as ImportedDocument;
      setDocument(imported);
      setFile(next);
      setSelected(new Set(imported.shapes.filter((shape) => shape.recommended).map((shape) => shape.id)));
      const natural = Math.max(boundsSize(imported.bounds).width, boundsSize(imported.bounds).height) / unitScale;
      setOptions((previous) => ({ ...previous, size: Math.max(1, Math.round(natural * 10) / 10) }));
      sfx("ready");
    } catch (nextError) {
      sfx("error");
      setDocument(null);
      setError(nextError instanceof Error ? nextError.message : "This file could not be imported.");
    } finally {
      setLoading(false);
    }
  }, [unitScale]);

  const shapes = useMemo(() => document?.shapes ?? [], [document]);
  const selectedShapes = useMemo(() => shapes.filter((shape) => selected.has(shape.id)), [shapes, selected]);

  const viewBox = useMemo(() => {
    if (!document) return null;
    const bounds = mergeBounds(shapes.map((shape) => shape.bounds));
    const size = boundsSize(bounds);
    const pad = Math.max(size.width, size.height) * 0.04 + 0.5;
    // The preview renders model space (Y up) inside an SVG (Y down), so the
    // group flips once and the viewBox is expressed in flipped coordinates.
    return {
      value: `${bounds.minX - pad} ${-bounds.maxY - pad} ${size.width + pad * 2} ${size.height + pad * 2}`,
      stroke: Math.max(size.width, size.height) / 400,
    };
  }, [document, shapes]);

  const paths = useMemo(() => shapes.map((shape) => ({ id: shape.id, d: shapeToSvgPath(shape), fillRule: shape.fillRule })), [shapes]);

  const totalCommands = selectedShapes.reduce((total, shape) => total + shape.commands, 0);
  const totalContours = selectedShapes.reduce((total, shape) => total + shape.contours.length, 0);
  const tooManyCommands = totalCommands > MAX_VECTOR_COMMANDS;
  const tooManyContours = options.mode === "merge" && totalContours > MAX_CONTOURS_PER_SOURCE;
  const tooManyLayers = options.mode === "separate" && selectedShapes.length > MAX_SEPARATE_LAYERS;
  const blocked = tooManyCommands || tooManyContours || tooManyLayers;

  const toggle = (id: string) => {
    sfx("tick");
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFiles = (files: FileList | null) => {
    const next = files?.[0];
    if (next) void upload(next);
  };

  const confirm = () => {
    if (!document || !selectedShapes.length) return;
    onImport(buildImportNodes(document, selectedShapes, options, units));
    sfx("success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-3 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Import SVG or PDF</DialogTitle>
          <DialogDescription>
            Pick the outlines you want from the artwork. They become extrudable layers you can shape with modifiers.
          </DialogDescription>
        </DialogHeader>

        {!document ? (
          <div
            className={cn(
              "grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center transition-colors",
              dragging && "border-[var(--accent-tool)] bg-[var(--accent-tool-soft)]",
            )}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            {loading ? <LoaderCircle className="animate-spin text-[var(--accent-tool)]" size={22} /> : <Upload className="text-muted-foreground" size={22} />}
            <div className="grid gap-1">
              <strong className="text-sm font-medium">{loading ? "Reading artwork…" : "Drop an SVG or PDF here"}</strong>
              <span className="text-xs text-muted-foreground">Vector outlines only — text should be converted to outlines first.</span>
            </div>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => inputRef.current?.click()} data-cuelume-press>
              <FileUp /> Choose a file
            </Button>
            {error && <p className="max-w-sm text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            {/* Interactive preview */}
            <div className="relative min-h-[280px] overflow-hidden rounded-xl border border-border bg-[var(--stage)]">
              {viewBox && (
                <svg viewBox={viewBox.value} className="size-full" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Imported artwork preview">
                  <g transform="scale(1,-1)">
                    {paths.map((path) => {
                      const isSelected = selected.has(path.id);
                      const isHovered = hovered === path.id;
                      return (
                        <path
                          key={path.id}
                          d={path.d}
                          fillRule={path.fillRule}
                          clipRule={path.fillRule}
                          className="cursor-pointer outline-none transition-[fill-opacity]"
                          fill={isSelected ? "var(--accent-tool)" : "var(--foreground)"}
                          fillOpacity={isSelected ? (isHovered ? 0.95 : 0.8) : (isHovered ? 0.22 : 0.1)}
                          stroke={isSelected || isHovered ? "var(--accent-tool)" : "var(--muted-foreground)"}
                          strokeWidth={viewBox.stroke}
                          vectorEffect="non-scaling-stroke"
                          onClick={() => toggle(path.id)}
                          onPointerEnter={() => setHovered(path.id)}
                          onPointerLeave={() => setHovered((current) => (current === path.id ? null : current))}
                        />
                      );
                    })}
                  </g>
                </svg>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-muted-foreground">
                <span className="truncate">{document.name}</span>
                <span className="tabular-nums">
                  {(boundsSize(document.bounds).width / unitScale).toFixed(1)} × {(boundsSize(document.bounds).height / unitScale).toFixed(1)} {units}
                </span>
              </div>
              {document.pageCount > 1 && (
                <div className="absolute left-2 top-2 flex items-center gap-0.5 rounded-lg border border-border bg-background/85 p-0.5 backdrop-blur">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Previous page"
                    disabled={loading || document.page <= 1}
                    onClick={() => file && void upload(file, document.page - 1)}
                  ><ChevronLeft /></Button>
                  <span className="px-1 text-[10px] tabular-nums text-muted-foreground">{document.page} / {document.pageCount}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Next page"
                    disabled={loading || document.page >= document.pageCount}
                    onClick={() => file && void upload(file, document.page + 1)}
                  ><ChevronRight /></Button>
                </div>
              )}
              {loading && (
                <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                  <LoaderCircle className="animate-spin text-[var(--accent-tool)]" size={20} />
                </div>
              )}
            </div>

            {/* Outliner + options */}
            <div className="flex min-h-0 flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <strong className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
                  Shapes · {selectedShapes.length}/{shapes.length}
                </strong>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="xs" onClick={() => { sfx("tick"); setSelected(new Set(shapes.map((shape) => shape.id))); }}>All</Button>
                  <Button variant="ghost" size="xs" onClick={() => { sfx("tick"); setSelected(new Set()); }}>None</Button>
                </div>
              </div>
              <div className="scroll-slim max-h-52 min-h-24 flex-1 overflow-y-auto rounded-lg border border-border">
                {shapes.map((shape) => {
                  const isSelected = selected.has(shape.id);
                  return (
                    <button
                      key={shape.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors",
                        hovered === shape.id ? "bg-muted" : "hover:bg-muted/60",
                      )}
                      onClick={() => toggle(shape.id)}
                      onPointerEnter={() => setHovered(shape.id)}
                      onPointerLeave={() => setHovered((current) => (current === shape.id ? null : current))}
                    >
                      <span className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        isSelected ? "border-[var(--accent-tool)] bg-[var(--accent-tool)] text-white" : "border-border",
                      )}>
                        {isSelected && <Check size={11} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-xs", isSelected ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {shape.label}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground/70">
                          {formatSize(shape, unitScale, units)}
                          {shape.strokeOnly && " · outline"}
                          {shape.contours.length > 1 && ` · ${shape.contours.length} contours`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-2 border-t border-border pt-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  <NumberField label="Longest side" value={options.size} min={0.1} step={1} unit={units} onChange={(value) => setOptions((previous) => ({ ...previous, size: value ?? 1 }))} />
                  <NumberField label="Depth" value={options.depth} min={0.1} step={0.5} unit={units} onChange={(value) => setOptions((previous) => ({ ...previous, depth: value ?? 1 }))} />
                  <NumberField label="Bevel" value={options.bevel} min={0} step={0.1} unit={units} onChange={(value) => setOptions((previous) => ({ ...previous, bevel: value ?? 0 }))} />
                </div>
                <SelectField
                  layout="row"
                  label="Import as"
                  value={options.mode}
                  options={[
                    { value: "merge", label: "One layer (holes kept)" },
                    { value: "separate", label: "A layer per shape" },
                  ]}
                  onChange={(value) => setOptions((previous) => ({ ...previous, mode: value as ImportMode }))}
                />
              </div>
            </div>
          </div>
        )}

        {document && (document.warnings.length > 0 || blocked || error) && (
          <div className="grid gap-1 rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
            {tooManyCommands && (
              <p className="flex items-start gap-1.5 text-destructive">
                <TriangleAlert size={12} className="mt-px shrink-0" />
                {totalCommands.toLocaleString()} curve commands selected; the limit is {MAX_VECTOR_COMMANDS.toLocaleString()}. Import fewer shapes.
              </p>
            )}
            {tooManyContours && (
              <p className="flex items-start gap-1.5 text-destructive">
                <TriangleAlert size={12} className="mt-px shrink-0" />
                {totalContours} contours is too many for one layer. Choose “A layer per shape” or select fewer shapes.
              </p>
            )}
            {tooManyLayers && (
              <p className="flex items-start gap-1.5 text-destructive">
                <TriangleAlert size={12} className="mt-px shrink-0" />
                A layer per shape supports up to {MAX_SEPARATE_LAYERS} shapes. Choose “One layer” or select fewer shapes.
              </p>
            )}
            {error && <p className="text-destructive">{error}</p>}
            {document.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-1.5">
                <TriangleAlert size={12} className="mt-px shrink-0" />
                {warning}
              </p>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".svg,.pdf,image/svg+xml,application/pdf"
          className="hidden"
          onChange={(event) => { handleFiles(event.target.files); event.target.value = ""; }}
        />

        <DialogFooter className="items-center">
          {document && (
            <Button variant="ghost" size="sm" className="mr-auto" onClick={() => inputRef.current?.click()} data-cuelume-press>
              <FileUp /> Replace file
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!document || !selectedShapes.length || blocked || loading}
            onClick={confirm}
            data-cuelume-press
          >
            <Shapes /> Import {selectedShapes.length || ""} {selectedShapes.length === 1 ? "shape" : "shapes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
