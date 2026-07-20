"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerDownRight,
  Eye,
  EyeOff,
  Layers3,
  Plus,
  Printer,
  Search,
  Settings2,
  Trash2,
  Type,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JsonField, NumberField, PointListField, SelectField, TextField, ToggleField, VectorField } from "@/components/editor/fields";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sfx";
import type { ModelDocument, ModelNode, ModifierSpec, SourceSpec, TransformSpec } from "@/lib/model-spec";

type FontSummary = { id: string; family: string; category: string };
type Selection = { kind: "node"; nodeId: string } | { kind: "modifier"; nodeId: string; index: number };
type NodeEntry = { node: ModelNode; depth: number };

const MATERIALS = [
  { value: "pla-orange", label: "PLA · Coral" },
  { value: "pla-matte", label: "PLA · Matte bone" },
  { value: "pla-silk", label: "PLA · Silk lavender" },
  { value: "petg", label: "PETG · Sea glass" },
  { value: "resin", label: "Resin · Peach" },
] as const;

const SOURCE_TYPES: { value: SourceSpec["type"]; label: string; hint: string }[] = [
  { value: "text", label: "3D text", hint: "Any Google font, extruded" },
  { value: "primitive", label: "Basic shape", hint: "Box, cylinder, cone, sphere, torus" },
  { value: "extrude", label: "Extruded outline", hint: "A 2D path pulled into 3D" },
  { value: "revolve", label: "Spun profile", hint: "Vases, bowls, anything round" },
  { value: "cellular", label: "Cellular lattice", hint: "Lightweight seeded Voronoi-style struts" },
  { value: "organic", label: "Organic growth", hint: "Branching coral-like printable structures" },
  { value: "fluid", label: "Fluid (SPH)", hint: "Pour liquid that pools over the scene" },
  { value: "water", label: "Water ripple", hint: "Simulated ripple surface" },
  { value: "cloth", label: "Cloth drape", hint: "Drape fabric over the scene" },
];

const MODIFIER_META: Record<ModifierSpec["type"], { label: string; hint: string }> = {
  twist: { label: "Twist", hint: "Rotate the shape around its height" },
  taper: { label: "Taper", hint: "Narrow or widen toward the top" },
  radialWave: { label: "Flutes", hint: "Wavy ridges around the outside" },
  axialWave: { label: "Ripples", hint: "Waves running up the height" },
  bend: { label: "Bend", hint: "Lean the shape over" },
  noise: { label: "Roughen", hint: "Organic bumpy texture" },
  voronoi: { label: "Voronoi cells", hint: "Cellular panels or raised boundary ridges" },
  array: { label: "Transform array", hint: "Layer copies with incremental move, rotation, and scale" },
  step: { label: "Contour steps", hint: "Stack copies with a constant inset like layered lampshades" },
  smooth: { label: "Smooth", hint: "Soften sharp detail" },
  drape: { label: "Drape (cloth)", hint: "Slump the shape like fabric over the scene · runs on Simulate" },
  melt: { label: "Melt (fluid)", hint: "Melt the shape into a puddle · runs on Simulate" },
};

const MODIFIER_FIELDS: Record<string, { label: string; step?: number; min?: number; max?: number; unit?: string; options?: readonly string[] }> = {
  angleDeg: { label: "Angle", unit: "°" },
  directionDeg: { label: "Direction", unit: "°" },
  start: { label: "Start (0–1)", step: 0.05, min: 0, max: 1 },
  end: { label: "End (0–1)", step: 0.05, min: 0, max: 1 },
  from: { label: "Bottom scale", step: 0.05, min: 0.05 },
  to: { label: "Top scale", step: 0.05, min: 0.05 },
  easing: { label: "Easing", options: ["linear", "smoothstep"] },
  amplitude: { label: "Depth", step: 0.5, unit: "mm" },
  count: { label: "Count", min: 1 },
  cycles: { label: "Wave count", step: 0.5, min: 0.5 },
  phaseDeg: { label: "Rotate", unit: "°" },
  axialTurns: { label: "Spiral turns", step: 0.25 },
  scale: { label: "Feature size", min: 1, unit: "mm" },
  seed: { label: "Seed", min: 0 },
  iterations: { label: "Passes", min: 1, max: 10 },
  strength: { label: "Strength", step: 0.05, min: 0, max: 1 },
  frames: { label: "Frames", min: 1, max: 600 },
  gravity: { label: "Gravity", step: 0.1, min: 0 },
  stiffness: { label: "Stiffness", step: 0.05, min: 0, max: 1 },
  inflate: { label: "Balloon", step: 0.05, min: 0, max: 3 },
  pins: { label: "Pinned", options: ["none", "top", "base"] },
  viscosity: { label: "Viscosity", step: 0.05, min: 0, max: 1 },
  particleSize: { label: "Droplet size", step: 0.05, min: 0.05, max: 20, unit: "mm" },
  surfaceResolution: { label: "Surface detail", min: 24, max: 140 },
  mode: { label: "Cell style", options: ["cells", "ridges"] },
  contrast: { label: "Contrast", step: 0.1, min: 0.1, max: 6 },
  translate: { label: "Move per copy" },
  rotate: { label: "Rotate per copy" },
  levels: { label: "Layers", min: 2, max: 32 },
  axis: { label: "Stack axis", options: ["x", "y", "z"] },
  distance: { label: "Layer spacing", step: 0.25, unit: "mm" },
  inset: { label: "Inset per layer", step: 0.25, unit: "mm" },
  twistDeg: { label: "Twist per layer", step: 1, unit: "°" },
  "array.count": { label: "Copies", min: 2, max: 32 },
  "array.scale": { label: "Scale per copy", step: 0.01, min: 0.05, max: 4 },
};

const fontPreviewCache = new Map<string, Promise<void>>();

function loadFontPreview(font: FontSummary) {
  if (typeof FontFace === "undefined") return Promise.resolve();
  if (!fontPreviewCache.has(font.id)) {
    const family = `Printa Spec ${font.id}`;
    const url = `/api/font?id=${encodeURIComponent(font.id)}&text=${encodeURIComponent(`${font.family} Aa`)}&weight=regular&italic=false`;
    fontPreviewCache.set(font.id, new FontFace(family, `url("${url}")`).load().then((face) => { document.fonts.add(face); }).catch(() => undefined));
  }
  return fontPreviewCache.get(font.id)!;
}

function SpecFontPicker({ value, fonts, onChange }: { value: string; fonts: FontSummary[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const selected = fonts.find((font) => font.family.toLocaleLowerCase() === value.toLocaleLowerCase());
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const list = needle ? fonts.filter((font) => font.family.toLocaleLowerCase().includes(needle) || font.category.toLocaleLowerCase().includes(needle)) : fonts;
    if (needle || !selected) return list;
    return [selected, ...list.filter((font) => font.id !== selected.id)];
  }, [fonts, query, selected]);
  const visible = matches.slice(0, visibleCount);
  useEffect(() => { if (selected) void loadFontPreview(selected); }, [selected]);
  useEffect(() => { if (open) visible.forEach((font) => void loadFontPreview(font)); }, [open, visible]);
  return (
    <div className="relative grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-[11px] text-muted-foreground">Font</span>
      <button
        type="button"
        className="grid h-7 w-full grid-cols-[minmax(0,1fr)_14px] items-center gap-1.5 rounded-md border border-transparent bg-secondary px-2 text-left outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => { sfx("tick"); setOpen((prev) => !prev); setVisibleCount(50); }}
      >
        <span className="truncate text-xs" style={{ fontFamily: selected ? `"Printa Spec ${selected.id}", sans-serif` : undefined }}>{selected?.family ?? value}</span>
        <ChevronDown size={13} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 col-span-2 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <label className="flex h-9 items-center gap-2 border-b border-border px-2.5 text-muted-foreground">
            <Search size={13} />
            <input
              autoFocus
              value={query}
              onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }}
              onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
              placeholder={`Search ${fonts.length.toLocaleString()} Google Fonts…`}
              className="w-full bg-transparent text-xs text-foreground outline-none"
            />
          </label>
          <div
            className="max-h-72 overflow-y-auto p-1"
            onScroll={(event) => {
              const list = event.currentTarget;
              if (list.scrollTop + list.clientHeight >= list.scrollHeight - 80) setVisibleCount((count) => Math.min(matches.length, count + 50));
            }}
          >
            {visible.map((font) => (
              <button
                key={font.id}
                type="button"
                className={cn(
                  "grid h-8 w-full grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-2 rounded px-2 text-left hover:bg-accent",
                  font.family === value && "bg-[var(--accent-tool-soft)]",
                )}
                onClick={() => { sfx("droplet"); onChange(font.family); setOpen(false); setQuery(""); }}
              >
                <span className="truncate text-sm" style={{ fontFamily: `"Printa Spec ${font.id}", sans-serif` }}>{font.family}</span>
                <small className="text-[9px] uppercase text-muted-foreground">{font.category}</small>
                {font.family === value && <Check size={13} className="text-[var(--accent-tool)]" />}
              </button>
            ))}
            {visible.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No fonts match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function sourceDefaults(type: SourceSpec["type"]): SourceSpec {
  if (type === "text") return { type, text: "Printa", font: "Roboto", size: 36, depth: 4, bevel: 0.6, bevelSegments: 3, curveSegments: 10, extrudeSegments: 1, bevelSide: "top", smoothNormals: true, textCase: "original", weight: "regular", italic: false, underline: false };
  if (type === "primitive") return { type, shape: "cylinder", radius: 20, height: 60, segments: 64 };
  if (type === "revolve") return { type, profile: [[24, 0], [32, 30], [29, 70], [24, 110]], segments: 128, profileSegments: 96, radiusOffset: 0, wall: 2, bottomCap: true, bottomThickness: 2.4, topCap: false, topThickness: 2.4, interpolation: "catmull-rom", axis: "z" };
  if (type === "extrude") return { type, depth: 8, bevel: 0.8, bevelSegments: 3, curveSegments: 12, direction: [0, 0, 1], path: { commands: [{ op: "move", to: [-25, -25] }, { op: "line", to: [25, -25] }, { op: "line", to: [25, 25] }, { op: "line", to: [-25, 25] }, { op: "close" }], holes: [] } };
  if (type === "water") return { type, width: 100, depth: 80, base: 3, resolution: 56, steps: 50, damping: 0.985, drops: [{ x: 0, y: 0, radius: 8, amplitude: 5 }], bake: 0 };
  if (type === "fluid") return { type, width: 70, depth: 70, amount: 55, spawnHeight: 70, particleSize: 6, viscosity: 0.18, gravity: 9.8, steps: 220, surfaceResolution: 64, bake: 0 };
  if (type === "cellular") return { type, width: 64, depth: 64, height: 72, cellSize: 18, strutDiameter: 2.2, jitter: 0.62, neighbors: 3, seed: 1, radialSegments: 8 };
  if (type === "organic") return { type, width: 70, depth: 70, height: 100, trunkDiameter: 7, levels: 4, branching: 2, angleDeg: 34, twistDeg: 137.5, taper: 0.72, seed: 1, radialSegments: 9 };
  return { type: "cloth", width: 100, depth: 100, thickness: 1.2, resolution: 28, steps: 100, startHeight: 35, gravity: 0.18, constraintIterations: 4, pins: "corners", bake: 0 };
}

function modifierDefaults(type: ModifierSpec["type"]): ModifierSpec {
  if (type === "twist") return { type, angleDeg: 90, start: 0, end: 1 };
  if (type === "taper") return { type, from: 1, to: 0.7, easing: "smoothstep" };
  if (type === "radialWave") return { type, amplitude: 2, count: 8, phaseDeg: 0, axialTurns: 0 };
  if (type === "axialWave") return { type, amplitude: 2, cycles: 3, phaseDeg: 0 };
  if (type === "bend") return { type, angleDeg: 20, directionDeg: 0 };
  if (type === "noise") return { type, amplitude: 1, scale: 12, seed: 1 };
  if (type === "voronoi") return { type, amplitude: 1.5, scale: 14, seed: 1, mode: "cells", contrast: 1.4 };
  if (type === "array") return { type, count: 6, translate: [0, 0, 4], rotate: [0, 0, 8], scale: 1 };
  if (type === "step") return { type, levels: 8, axis: "z", distance: 3, inset: 1.2, twistDeg: 0 };
  if (type === "drape") return { type, gravity: 0.3, frames: 160, stiffness: 0.9, inflate: 0.7, pins: "none", bake: 0 };
  if (type === "melt") return { type, gravity: 9.8, frames: 200, viscosity: 0.25, particleSize: 5, surfaceResolution: 64, bake: 0 };
  return { type: "smooth", iterations: 1, strength: 0.35 };
}

function collectNodes(node: ModelNode, depth = 0, output: NodeEntry[] = []) {
  output.push({ node, depth });
  if (node.kind === "assembly") node.children.forEach((child) => collectNodes(child, depth + 1, output));
  if (node.kind === "repeat") collectNodes(node.child, depth + 1, output);
  return output;
}

function findNode(node: ModelNode, id: string): ModelNode | null {
  if (node.id === id) return node;
  if (node.kind === "assembly") {
    for (const child of node.children) {
      const match = findNode(child, id);
      if (match) return match;
    }
  }
  return node.kind === "repeat" ? findNode(node.child, id) : null;
}

function updateNode(node: ModelNode, id: string, update: (target: ModelNode) => void): boolean {
  if (node.id === id) { update(node); return true; }
  if (node.kind === "assembly") return node.children.some((child) => updateNode(child, id, update));
  return node.kind === "repeat" ? updateNode(node.child, id, update) : false;
}

function nodeIcon(node: ModelNode) {
  if (node.kind !== "shape") return <Layers3 size={13} />;
  if (node.source.type === "text") return <Type size={13} />;
  if (node.source.type === "water" || node.source.type === "cloth" || node.source.type === "fluid") return <Waves size={13} />;
  return <Box size={13} />;
}

function nodeTypeLabel(node: ModelNode) {
  if (node.kind === "shape") return SOURCE_TYPES.find((type) => type.value === node.source.type)?.label ?? node.source.type;
  return node.kind === "repeat" ? `repeat ×${node.count}` : "group";
}

function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex min-h-6 items-center justify-between">
      <strong className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">{title}</strong>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-1.5">{children}</div>;
}

function AdvancedData({ children }: { children: React.ReactNode }) {
  return (
    <details className="group/adv rounded-md border border-border bg-muted/40">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-2.5 text-[10px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        Advanced shape data
        <ChevronDown size={12} className="ml-auto transition-transform group-open/adv:rotate-180" />
      </summary>
      <div className="grid gap-2 border-t border-border p-2">{children}</div>
    </details>
  );
}

function SourceEditor({ source, fonts, update }: { source: SourceSpec; fonts: FontSummary[]; update: (patch: Partial<SourceSpec>) => void }) {
  const set = (key: string, value: unknown) => update({ [key]: value } as Partial<SourceSpec>);
  return (
    <div className="grid gap-2">
      <SelectField
        layout="row"
        label="Made from"
        value={source.type}
        options={SOURCE_TYPES.map(({ value, label }) => ({ value, label }))}
        onChange={(value) => update(sourceDefaults(value as SourceSpec["type"]))}
      />
      {source.type === "text" && <>
        <TextField label="Text" value={source.text} onChange={(value) => set("text", value)} />
        <SpecFontPicker value={source.font} fonts={fonts} onChange={(value) => set("font", value)} />
        <Grid2>
          <SelectField label="Case" value={source.textCase} options={["original", "uppercase", "lowercase", "titlecase"]} onChange={(value) => set("textCase", value)} />
          <SelectField label="Weight" value={source.weight} options={["regular", "bold"]} onChange={(value) => set("weight", value)} />
        </Grid2>
        <Grid2>
          <ToggleField label="Italic" value={source.italic} onChange={(value) => set("italic", value)} />
          <ToggleField label="Underline" value={source.underline} onChange={(value) => set("underline", value)} />
        </Grid2>
        <Grid3>
          <NumberField label="Width" optional value={source.width} min={0.1} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Height" value={source.height ?? source.size} min={0.1} unit="mm" onChange={(value) => set("height", value)} />
          <NumberField label="Depth" value={source.depth} min={0.1} step={0.5} unit="mm" onChange={(value) => set("depth", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Bevel" value={source.bevel} min={0} step={0.1} unit="mm" onChange={(value) => set("bevel", value)} />
          <NumberField label="Bevel detail" value={source.bevelSegments} min={1} max={12} onChange={(value) => set("bevelSegments", value)} />
          <NumberField label="Curve detail" value={source.curveSegments} min={2} max={24} onChange={(value) => set("curveSegments", value)} />
        </Grid3>
        <NumberField layout="row" label="Extrusion segments" value={source.extrudeSegments} min={1} max={64} onChange={(value) => set("extrudeSegments", value)} />
        <SelectField label="Bevel faces" value={source.bevelSide} options={["both", "top", "bottom"]} onChange={(value) => set("bevelSide", value)} />
      </>}
      {source.type === "primitive" && <>
        <SelectField layout="row" label="Shape" value={source.shape} options={["box", "cylinder", "cone", "sphere", "torus"]} onChange={(value) => set("shape", value)} />
        <Grid3>
          <NumberField label="Width" value={source.width ?? 40} min={0.1} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Depth" value={source.depth ?? 40} min={0.1} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Height" value={source.height ?? 60} min={0.1} unit="mm" onChange={(value) => set("height", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Radius" value={source.radius ?? 20} min={0.1} unit="mm" onChange={(value) => set("radius", value)} />
          <NumberField label="Top radius" value={source.radiusTop ?? source.radius ?? 20} min={0} unit="mm" onChange={(value) => set("radiusTop", value)} />
          <NumberField label="Tube" value={source.tube ?? 5} min={0.1} unit="mm" onChange={(value) => set("tube", value)} />
        </Grid3>
        <NumberField layout="row" label="Roundness" value={source.segments} min={3} max={256} onChange={(value) => set("segments", value)} />
      </>}
      {source.type === "revolve" && <>
        <PointListField label="Profile · bottom to top" columns={["Radius (mm)", "Height (mm)"]} value={source.profile} onChange={(value) => set("profile", value)} />
        <Grid3>
          <NumberField label="Wall" value={source.wall} min={0.1} step={0.1} unit="mm" onChange={(value) => set("wall", value)} />
          <NumberField label="Roundness" value={source.segments} min={8} max={512} onChange={(value) => set("segments", value)} />
          <NumberField label="Profile detail" value={source.profileSegments} min={2} max={256} onChange={(value) => set("profileSegments", value)} />
        </Grid3>
        <NumberField layout="row" label="Global radius offset" value={source.radiusOffset} step={0.5} unit="mm" onChange={(value) => set("radiusOffset", value)} />
        <Grid2>
          <ToggleField label="Solid base" detail="Close the bottom" value={source.bottomCap} onChange={(value) => set("bottomCap", value)} />
          <NumberField label="Base thickness" value={source.bottomThickness} min={0.1} step={0.1} unit="mm" onChange={(value) => set("bottomThickness", value)} />
        </Grid2>
        <Grid2>
          <ToggleField label="Solid top" detail="Close the top" value={source.topCap} onChange={(value) => set("topCap", value)} />
          <NumberField label="Top thickness" value={source.topThickness} min={0.1} step={0.1} unit="mm" onChange={(value) => set("topThickness", value)} />
        </Grid2>
        <Grid2>
          <SelectField label="Curve style" value={source.interpolation} options={[{ value: "linear", label: "Straight lines" }, { value: "catmull-rom", label: "Smooth curve" }]} onChange={(value) => set("interpolation", value)} />
          <SelectField label="Spin axis" value={source.axis} options={["x", "y", "z"]} onChange={(value) => set("axis", value)} />
        </Grid2>
      </>}
      {source.type === "extrude" && <>
        <Grid3>
          <NumberField label="Depth" value={source.depth} min={0.1} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Bevel" value={source.bevel} min={0} step={0.1} unit="mm" onChange={(value) => set("bevel", value)} />
          <NumberField label="Curve detail" value={source.curveSegments} min={1} max={64} onChange={(value) => set("curveSegments", value)} />
        </Grid3>
        <AdvancedData>
          <JsonField label="Outline path" value={source.path} onChange={(value) => set("path", value)} />
          <JsonField label="Direction [x, y, z]" rows={2} value={source.direction} onChange={(value) => set("direction", value)} />
        </AdvancedData>
      </>}
      {source.type === "cellular" && <>
        <p className="text-[11px] leading-relaxed text-muted-foreground">A seeded, stratified cell network connects nearest sites into a lightweight printable lattice.</p>
        <Grid3>
          <NumberField label="Width" value={source.width} min={4} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Depth" value={source.depth} min={4} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Height" value={source.height} min={4} unit="mm" onChange={(value) => set("height", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Cell size" value={source.cellSize} min={4} max={100} step={0.5} unit="mm" onChange={(value) => set("cellSize", value)} />
          <NumberField label="Strut" value={source.strutDiameter} min={0.4} max={12} step={0.1} unit="mm" onChange={(value) => set("strutDiameter", value)} />
          <NumberField label="Jitter" value={source.jitter} min={0} max={0.95} step={0.05} onChange={(value) => set("jitter", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Connections" value={source.neighbors} min={2} max={6} onChange={(value) => set("neighbors", value)} />
          <NumberField label="Seed" value={source.seed} onChange={(value) => set("seed", value)} />
          <NumberField label="Roundness" value={source.radialSegments} min={6} max={24} onChange={(value) => set("radialSegments", value)} />
        </Grid3>
      </>}
      {source.type === "organic" && <>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Grow a deterministic trunk into tapered, twisting branches for coral and root-like structures.</p>
        <Grid3>
          <NumberField label="Max width" value={source.width} min={4} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Max depth" value={source.depth} min={4} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Height" value={source.height} min={4} unit="mm" onChange={(value) => set("height", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Trunk" value={source.trunkDiameter} min={0.8} max={24} step={0.1} unit="mm" onChange={(value) => set("trunkDiameter", value)} />
          <NumberField label="Growth levels" value={source.levels} min={1} max={6} onChange={(value) => set("levels", value)} />
          <NumberField label="Branches" value={source.branching} min={1} max={4} onChange={(value) => set("branching", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Branch angle" value={source.angleDeg} min={5} max={80} unit="°" onChange={(value) => set("angleDeg", value)} />
          <NumberField label="Spiral" value={source.twistDeg} step={1} unit="°" onChange={(value) => set("twistDeg", value)} />
          <NumberField label="Taper" value={source.taper} min={0.35} max={0.95} step={0.01} onChange={(value) => set("taper", value)} />
        </Grid3>
        <Grid2>
          <NumberField label="Seed" value={source.seed} onChange={(value) => set("seed", value)} />
          <NumberField label="Roundness" value={source.radialSegments} min={6} max={24} onChange={(value) => set("radialSegments", value)} />
        </Grid2>
      </>}
      {source.type === "water" && <>
        <Grid3>
          <NumberField label="Width" value={source.width} min={0.1} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Depth" value={source.depth} min={0.1} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Base" value={source.base} min={0.1} unit="mm" onChange={(value) => set("base", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Resolution" value={source.resolution} min={12} max={160} onChange={(value) => set("resolution", value)} />
          <NumberField label="Sim steps" value={source.steps} min={1} max={400} onChange={(value) => set("steps", value)} />
          <NumberField label="Damping" value={source.damping} min={0.8} max={0.9999} step={0.001} onChange={(value) => set("damping", value)} />
        </Grid3>
        <AdvancedData>
          <JsonField label="Drops" value={source.drops} onChange={(value) => set("drops", value)} />
        </AdvancedData>
      </>}
      {source.type === "fluid" && <>
        <p className="text-[11px] leading-relaxed text-muted-foreground">A column of liquid is released from above and pools over the other shapes in your scene. Press <strong className="text-foreground">Simulate</strong> to run it.</p>
        <Grid3>
          <NumberField label="Pour width" value={source.width} min={4} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Pour depth" value={source.depth} min={4} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Amount" value={source.amount} min={4} unit="mm" onChange={(value) => set("amount", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Drop height" value={source.spawnHeight} min={0} unit="mm" onChange={(value) => set("spawnHeight", value)} />
          <NumberField label="Droplet size" value={source.particleSize} min={0.05} max={20} step={0.05} unit="mm" onChange={(value) => set("particleSize", value)} />
          <NumberField label="Viscosity" value={source.viscosity} min={0} max={1} step={0.02} onChange={(value) => set("viscosity", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Gravity" value={source.gravity} min={0.1} step={0.1} onChange={(value) => set("gravity", value)} />
          <NumberField label="Sim steps" value={source.steps} min={20} max={600} onChange={(value) => set("steps", value)} />
          <NumberField label="Surface detail" value={source.surfaceResolution} min={24} max={140} onChange={(value) => set("surfaceResolution", value)} />
        </Grid3>
      </>}
      {source.type === "cloth" && <>
        <Grid3>
          <NumberField label="Width" value={source.width} min={0.1} unit="mm" onChange={(value) => set("width", value)} />
          <NumberField label="Depth" value={source.depth} min={0.1} unit="mm" onChange={(value) => set("depth", value)} />
          <NumberField label="Thickness" value={source.thickness} min={0.1} step={0.1} unit="mm" onChange={(value) => set("thickness", value)} />
        </Grid3>
        <Grid3>
          <NumberField label="Resolution" value={source.resolution} min={8} max={80} onChange={(value) => set("resolution", value)} />
          <NumberField label="Sim steps" value={source.steps} min={1} max={300} onChange={(value) => set("steps", value)} />
          <NumberField label="Drop height" value={source.startHeight} min={0.1} unit="mm" onChange={(value) => set("startHeight", value)} />
        </Grid3>
        <Grid2>
          <NumberField label="Gravity" value={source.gravity} min={0.01} step={0.01} onChange={(value) => set("gravity", value)} />
          <SelectField label="Pinned at" value={source.pins} options={[{ value: "corners", label: "Corners" }, { value: "top-edge", label: "Top edge" }, { value: "none", label: "Nowhere" }]} onChange={(value) => set("pins", value)} />
        </Grid2>
        <AdvancedData>
          <JsonField label="Collider" value={source.collider ?? { type: "sphere", center: [0, 0, 0], radius: 20 }} onChange={(value) => set("collider", value)} />
        </AdvancedData>
      </>}
    </div>
  );
}

function TransformEditor({ value, onChange, title = "Position & rotation" }: { value?: TransformSpec; onChange: (value: TransformSpec) => void; title?: string }) {
  const transform = value ?? { translate: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
  const scale = typeof transform.scale === "number" ? transform.scale : transform.scale[0];
  return (
    <div className="mt-2.5 grid gap-2 border-t border-border pt-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">{title}</span>
      <VectorField label="Move" value={transform.translate} onChange={(vector) => onChange({ ...transform, translate: vector })} />
      <VectorField label="Rotate" value={transform.rotate} onChange={(vector) => onChange({ ...transform, rotate: vector })} />
      <NumberField layout="row" label="Scale" value={scale} step={0.05} min={0.01} onChange={(next) => onChange({ ...transform, scale: next ?? 1 })} />
    </div>
  );
}

export function SpecInspector({ document, fonts, onChange }: { document: ModelDocument; fonts: FontSummary[]; onChange: (document: ModelDocument) => void }) {
  const entries = useMemo(() => collectNodes(document.root), [document]);
  const [selection, setSelection] = useState<Selection>({ kind: "node", nodeId: document.root.id });
  const selectionExists = findNode(document.root, selection.nodeId);
  const activeSelection: Selection = selectionExists ? selection : { kind: "node", nodeId: document.root.id };
  const selectedNode = selectionExists ?? document.root;
  const modifierIndex = activeSelection.kind === "modifier" ? activeSelection.index : -1;
  const selectedModifier = modifierIndex >= 0 ? selectedNode.modifiers[modifierIndex] : null;
  const supportsInteriorStruts = entries.some(({ node }) => node.kind === "shape" && node.source.type === "revolve");

  const mutate = (recipe: (draft: ModelDocument) => void) => { const draft = structuredClone(document); recipe(draft); onChange(draft); };
  const mutateNode = (recipe: (node: ModelNode) => void) => mutate((draft) => { updateNode(draft.root, selectedNode.id, recipe); });

  const addLayer = (type: SourceSpec["type"]) => mutate((draft) => {
    const node: ModelNode = { kind: "shape", id: `${type}-${Date.now().toString(36)}`, source: sourceDefaults(type), modifiers: [], material: "pla-orange" };
    if (draft.root.kind === "assembly") draft.root.children.push(node);
    else draft.root = { kind: "assembly", id: "model", operation: "merge", children: [draft.root, node], modifiers: [] };
    setSelection({ kind: "node", nodeId: node.id });
    sfx("droplet");
  });
  const duplicateLayer = () => mutate((draft) => {
    const target = findNode(draft.root, activeSelection.nodeId);
    if (!target) return;
    const copy = structuredClone(target); copy.id = `${copy.id}-copy-${Date.now().toString(36)}`;
    if (draft.root.kind === "assembly") draft.root.children.push(copy);
    else draft.root = { kind: "assembly", id: "model", operation: "merge", children: [draft.root, copy], modifiers: [] };
    setSelection({ kind: "node", nodeId: copy.id });
    sfx("tick");
  });
  const deleteLayer = () => mutate((draft) => {
    if (draft.root.kind !== "assembly" || draft.root.children.length <= 1) return;
    draft.root.children = draft.root.children.filter((child) => child.id !== activeSelection.nodeId);
    setSelection({ kind: "node", nodeId: draft.root.id });
    sfx("whisper");
  });
  const addModifier = (type: ModifierSpec["type"]) => mutateNode((node) => {
    node.modifiers.push(modifierDefaults(type));
    setSelection({ kind: "modifier", nodeId: node.id, index: node.modifiers.length - 1 });
    sfx("droplet");
  });

  const canDelete = document.root.kind === "assembly" && activeSelection.nodeId !== document.root.id;

  return (
    <div className="grid gap-4">
      {/* Layers */}
      <section>
        <SectionHead title="Layers">
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={duplicateLayer} aria-label="Duplicate layer"><Copy /></Button>} />
              <TooltipContent>Duplicate selected layer</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-xs" disabled={!canDelete} onClick={deleteLayer} aria-label="Delete layer"><Trash2 /></Button>} />
              <TooltipContent>Delete selected layer</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="xs" className="text-[var(--accent-tool)]" data-cuelume-press><Plus /> Add</Button>} />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>New layer</DropdownMenuLabel>
                  {SOURCE_TYPES.map((type) => (
                    <DropdownMenuItem key={type.value} onClick={() => addLayer(type.value)}>
                      <div className="grid gap-0.5">
                        <span className="text-xs font-medium">{type.label}</span>
                        <span className="text-[10px] text-muted-foreground">{type.hint}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SectionHead>
        <div className="grid gap-px">
          {entries.map(({ node, depth }) => {
            const nodeActive = activeSelection.kind === "node" && activeSelection.nodeId === node.id;
            return (
              <div key={node.id} className="grid gap-px">
                <button
                  type="button"
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-muted",
                    nodeActive ? "bg-[var(--accent-tool-soft)]" : "text-foreground",
                  )}
                  style={{ paddingLeft: `${8 + depth * 14}px` }}
                  onClick={() => { sfx("tick"); setSelection({ kind: "node", nodeId: node.id }); }}
                >
                  <span className={cn("shrink-0", nodeActive ? "text-[var(--accent-tool)]" : "text-muted-foreground")}>{nodeIcon(node)}</span>
                  <span className={cn("min-w-0 flex-1 truncate text-xs", nodeActive ? "font-medium text-[var(--accent-tool)]" : "text-foreground")}>{node.id}</span>
                  <span className="text-[9px] lowercase text-muted-foreground/60">{nodeTypeLabel(node)}</span>
                </button>
                {node.modifiers.map((modifier, index) => {
                  const modifierActive = activeSelection.kind === "modifier" && activeSelection.nodeId === node.id && activeSelection.index === index;
                  const off = modifier.disabled === true;
                  return (
                    <div
                      key={`${node.id}-${index}`}
                      className={cn(
                        "group/mod flex h-6 items-center rounded-md pr-1 text-[11px] transition-colors hover:bg-muted",
                        modifierActive ? "bg-[var(--accent-tool-soft)] font-medium text-[var(--accent-tool)]" : "text-muted-foreground",
                      )}
                    >
                      <button
                        type="button"
                        className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                        style={{ paddingLeft: `${26 + depth * 14}px` }}
                        onClick={() => { sfx("tick"); setSelection({ kind: "modifier", nodeId: node.id, index }); }}
                      >
                        <CornerDownRight size={10} className="shrink-0 opacity-60" />
                        <span className={cn("truncate", off && "line-through opacity-50")}>{MODIFIER_META[modifier.type].label}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={off ? "Enable modifier" : "Disable modifier"}
                        title={off ? "Enable modifier" : "Disable modifier (preview without it)"}
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded text-muted-foreground/70 transition-opacity hover:text-foreground",
                          !off && "opacity-0 group-hover/mod:opacity-100 focus-visible:opacity-100",
                        )}
                        onClick={() => {
                          sfx("toggle");
                          mutate((draft) => { updateNode(draft.root, node.id, (target) => { const m = target.modifiers[index]; if (m) m.disabled = !off ? true : undefined; }); });
                        }}
                      >
                        {off ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* Inspector */}
      <section className="border-t border-border pt-3">
        {selectedModifier ? (
          <>
            <SectionHead title={`${MODIFIER_META[selectedModifier.type].label} modifier`}>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-xs" aria-label={selectedModifier.disabled ? "Enable modifier" : "Disable modifier"} title={selectedModifier.disabled ? "Enable modifier" : "Disable modifier (preview without it)"} className={cn(selectedModifier.disabled && "text-[var(--accent-tool)]")} onClick={() => { sfx("toggle"); mutateNode((node) => { const m = node.modifiers[modifierIndex]; if (m) m.disabled = m.disabled ? undefined : true; }); }}>{selectedModifier.disabled ? <EyeOff /> : <Eye />}</Button>
                <Button variant="ghost" size="icon-xs" aria-label="Move modifier up" disabled={modifierIndex === 0} onClick={() => { sfx("tick"); mutateNode((node) => { const [item] = node.modifiers.splice(modifierIndex, 1); node.modifiers.splice(modifierIndex - 1, 0, item); setSelection({ kind: "modifier", nodeId: node.id, index: modifierIndex - 1 }); }); }}><ChevronUp /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Move modifier down" disabled={modifierIndex >= selectedNode.modifiers.length - 1} onClick={() => { sfx("tick"); mutateNode((node) => { const [item] = node.modifiers.splice(modifierIndex, 1); node.modifiers.splice(modifierIndex + 1, 0, item); setSelection({ kind: "modifier", nodeId: node.id, index: modifierIndex + 1 }); }); }}><ChevronDown /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Remove modifier" className="text-destructive" onClick={() => { sfx("whisper"); mutateNode((node) => { node.modifiers.splice(modifierIndex, 1); setSelection({ kind: "node", nodeId: node.id }); }); }}><Trash2 /></Button>
              </div>
            </SectionHead>
            <p className="mb-2 text-[10px] text-muted-foreground">{selectedModifier.disabled ? "Muted — not applied to the model right now." : `${MODIFIER_META[selectedModifier.type].hint}. Modifiers apply top to bottom.`}</p>
            <Grid2>
              {Object.entries(selectedModifier).filter(([key]) => key !== "type" && key !== "modulation" && key !== "disabled" && key !== "bake").map(([key, value]) => {
                const meta = MODIFIER_FIELDS[`${selectedModifier.type}.${key}`] ?? MODIFIER_FIELDS[key] ?? { label: key };
                const write = (next: unknown) => mutateNode((node) => { (node.modifiers[modifierIndex] as unknown as Record<string, unknown>)[key] = next; });
                return Array.isArray(value) && value.length === 3 ? (
                  <VectorField key={key} label={meta.label} value={value as [number, number, number]} onChange={write} />
                ) : typeof value === "number" ? (
                  <NumberField key={key} label={meta.label} value={value} step={meta.step ?? 1} min={meta.min} max={meta.max} unit={meta.unit} onChange={(next) => write(next ?? 0)} />
                ) : (
                  <SelectField key={key} label={meta.label} value={String(value)} options={meta.options ?? [String(value)]} onChange={write} />
                );
              })}
            </Grid2>
            {selectedModifier.type !== "smooth" && selectedModifier.type !== "drape" && selectedModifier.type !== "melt" && selectedModifier.type !== "array" && selectedModifier.type !== "step" && <div className="mt-2 grid gap-2 border-t border-border pt-2">
              <ToggleField
                label="Vary amount over shape"
                detail="Normalized keyframes along a local axis"
                value={Boolean(selectedModifier.modulation)}
                onChange={(enabled) => mutateNode((node) => {
                  const modifier = node.modifiers[modifierIndex] as Exclude<ModifierSpec, { type: "smooth" | "drape" | "melt" | "array" | "step" }>;
                  if (enabled) modifier.modulation = { axis: "z", points: [[0, 0], [0.2, 1], [0.8, 1], [1, 0]], interpolation: "smoothstep" };
                  else delete modifier.modulation;
                })}
              />
              {selectedModifier.modulation && <>
                <Grid2>
                  <SelectField label="Modulation axis" value={selectedModifier.modulation.axis} options={["x", "y", "z"]} onChange={(value) => mutateNode((node) => { const modifier = node.modifiers[modifierIndex] as Exclude<ModifierSpec, { type: "smooth" | "drape" | "melt" | "array" | "step" }>; if (modifier.modulation) modifier.modulation.axis = value as "x" | "y" | "z"; })} />
                  <SelectField label="Interpolation" value={selectedModifier.modulation.interpolation} options={["linear", "smoothstep"]} onChange={(value) => mutateNode((node) => { const modifier = node.modifiers[modifierIndex] as Exclude<ModifierSpec, { type: "smooth" | "drape" | "melt" | "array" | "step" }>; if (modifier.modulation) modifier.modulation.interpolation = value as "linear" | "smoothstep"; })} />
                </Grid2>
                <PointListField label="Amount curve · normalized" columns={["Position 0–1", "Multiplier"]} value={selectedModifier.modulation.points} onChange={(points) => mutateNode((node) => { const modifier = node.modifiers[modifierIndex] as Exclude<ModifierSpec, { type: "smooth" | "drape" | "melt" | "array" | "step" }>; if (modifier.modulation) modifier.modulation.points = points; })} />
              </>}
            </div>}
          </>
        ) : (
          <>
            <SectionHead title="Selected layer" />
            <div className="grid gap-2">
              <TextField label="Name" value={selectedNode.id} commit="blur" onChange={(value) => { const next = value.trim(); if (!next || findNode(document.root, next)) return; mutateNode((node) => { node.id = next; }); setSelection({ kind: "node", nodeId: next }); }} />
              {selectedNode.kind === "shape" && <>
                <SelectField layout="row" label="Material" value={selectedNode.material ?? "pla-orange"} options={MATERIALS} onChange={(value) => mutateNode((node) => { if (node.kind === "shape") node.material = value as (typeof MATERIALS)[number]["value"]; })} />
                <SourceEditor source={selectedNode.source} fonts={fonts} update={(patch) => mutateNode((node) => { if (node.kind !== "shape") return; const next = patch as SourceSpec; node.source = next.type && next.type !== node.source.type ? next : { ...node.source, ...patch } as SourceSpec; })} />
              </>}
              {selectedNode.kind === "repeat" && <>
                <NumberField layout="row" label="Copies" value={selectedNode.count} min={1} max={32} onChange={(value) => mutateNode((node) => { if (node.kind === "repeat") node.count = value ?? 1; })} />
                <TransformEditor title="Step between copies" value={selectedNode.step} onChange={(value) => mutateNode((node) => { if (node.kind === "repeat") node.step = value; })} />
              </>}
              <TransformEditor value={selectedNode.transform} onChange={(value) => mutateNode((node) => { node.transform = value; })} />
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="mt-1 h-7 w-full justify-center border-dashed text-muted-foreground hover:text-foreground" data-cuelume-press><Plus /> Add modifier</Button>} />
                <DropdownMenuContent align="center" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Shape the layer</DropdownMenuLabel>
                    {(Object.keys(MODIFIER_META) as ModifierSpec["type"][]).map((type) => (
                      <DropdownMenuItem key={type} onClick={() => addModifier(type)}>
                        <div className="grid gap-0.5">
                          <span className="text-xs font-medium">{MODIFIER_META[type].label}</span>
                          <span className="text-[10px] text-muted-foreground">{MODIFIER_META[type].hint}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </section>

      {/* Document / print setup */}
      <details className="group border-t border-border">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80 [&::-webkit-details-marker]:hidden">
          <Printer size={12} />
          Print setup
          <ChevronDown size={13} className="ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-2.5 pb-2">
          <TextField label="Model name" value={document.name} onChange={(value) => mutate((draft) => { draft.name = value; })} />
          <TextField label="Description" value={document.description} onChange={(value) => mutate((draft) => { draft.description = value; })} />
          <Grid2>
            <SelectField label="Units" value={document.units} options={["mm", "cm", "in"]} onChange={(value) => mutate((draft) => { draft.units = value as ModelDocument["units"]; })} />
            <ToggleField label="Sit on bed" value={document.print.placeOnBed} onChange={(value) => mutate((draft) => { draft.print.placeOnBed = value; })} />
          </Grid2>
          <Grid3>
            {document.print.buildVolume.map((value, index) => (
              <NumberField key={index} label={["Printer W", "Printer D", "Printer H"][index]} value={value} min={0.1} unit="mm" onChange={(next) => mutate((draft) => { draft.print.buildVolume[index] = next ?? 1; })} />
            ))}
          </Grid3>
          <ToggleField label="Auto center" detail="Keep the model centered on the plate" value={document.print.autoCenter} onChange={(value) => mutate((draft) => { draft.print.autoCenter = value; })} />
          <ToggleField label="Preview build plate" detail={`${document.print.buildVolume[0]} × ${document.print.buildVolume[1]} mm`} value={document.display.buildPlate} onChange={(value) => mutate((draft) => { draft.display.buildPlate = value; })} />
          <div className="mt-1 grid gap-2.5 border-t border-border pt-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"><Settings2 size={12} /> Internal lattice</span>
            <ToggleField
              label="Structural lattice inside"
              detail={supportsInteriorStruts ? "Included in the preview and STL" : "Needs a hollow spun-profile layer"}
              disabled={!supportsInteriorStruts}
              value={document.print.interiorStruts.enabled}
              onChange={(value) => mutate((draft) => { draft.print.interiorStruts.enabled = value; })}
            />
            {document.print.interiorStruts.enabled && <>
              <SelectField layout="row" label="Pattern" value={document.print.interiorStruts.pattern} options={["diamond", "cross", "radial"]} onChange={(value) => mutate((draft) => { draft.print.interiorStruts.pattern = value as ModelDocument["print"]["interiorStruts"]["pattern"]; })} />
              <Grid3>
                <NumberField label="Spacing" value={document.print.interiorStruts.spacing} min={4} max={100} unit="mm" onChange={(value) => mutate((draft) => { draft.print.interiorStruts.spacing = value ?? 4; })} />
                <NumberField label="Thickness" value={document.print.interiorStruts.diameter} min={0.4} max={12} step={0.1} unit="mm" onChange={(value) => mutate((draft) => { draft.print.interiorStruts.diameter = value ?? 0.4; })} />
                <NumberField label="Edge inset" value={document.print.interiorStruts.boundaryInset} min={0} max={40} step={0.5} unit="mm" onChange={(value) => mutate((draft) => { draft.print.interiorStruts.boundaryInset = value ?? 0; })} />
              </Grid3>
              <Grid2>
                <NumberField label="Wall overlap" value={document.print.interiorStruts.wallOverlap} min={0} max={10} step={0.1} unit="mm" onChange={(value) => mutate((draft) => { draft.print.interiorStruts.wallOverlap = value ?? 0; })} />
                <NumberField label="Roundness" value={document.print.interiorStruts.radialSegments} min={6} max={24} onChange={(value) => mutate((draft) => { draft.print.interiorStruts.radialSegments = value ?? 6; })} />
              </Grid2>
            </>}
          </div>
        </div>
      </details>
    </div>
  );
}

export { type FontSummary };
