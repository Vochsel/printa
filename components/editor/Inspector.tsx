"use client";

import { useMemo, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Layers3,
  Plus,
  Repeat2,
  Rotate3D,
  Trash2,
  Type,
  Wand2,
  Waves,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRINT_MATERIAL_PRESETS, type PrintMaterialPreset } from "@/lib/material-presets";
import type { ModelDocument, ModelNode, ModifierSpec, SourceSpec, TransformSpec } from "@/lib/model-spec";
import { sfxTap } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { FontPicker, type FontSummary } from "./FontPicker";
import { JsonField, NumberField, SelectField, SliderField, SwitchField, TextField, VectorField } from "./fields";

type Selection = { kind: "node"; nodeId: string } | { kind: "modifier"; nodeId: string; index: number };
type NodeEntry = { node: ModelNode; depth: number };

const SOURCE_META: Record<SourceSpec["type"], { label: string; hint: string }> = {
  text: { label: "Text", hint: "3D letters from any Google Font" },
  primitive: { label: "Basic shape", hint: "Box, cylinder, cone, sphere or torus" },
  extrude: { label: "Custom outline", hint: "Extrude a drawn 2D path" },
  revolve: { label: "Vessel", hint: "Spin a profile into a vase or bowl" },
  water: { label: "Water ripple", hint: "Frozen water-drop simulation" },
  cloth: { label: "Cloth drape", hint: "Frozen falling-fabric simulation" },
};

type FieldMeta = { label: string; step?: number; min?: number; max?: number; unit?: string; options?: readonly string[] };

const MODIFIER_META: Record<ModifierSpec["type"], { label: string; hint: string; fields: Record<string, FieldMeta> }> = {
  twist: {
    label: "Twist",
    hint: "Rotate the shape around its height",
    fields: {
      angleDeg: { label: "Angle", unit: "°" },
      start: { label: "Start (0–1)", step: 0.05, min: 0, max: 1 },
      end: { label: "End (0–1)", step: 0.05, min: 0, max: 1 },
    },
  },
  taper: {
    label: "Taper",
    hint: "Narrow or widen along the height",
    fields: {
      from: { label: "Bottom scale", step: 0.05, min: 0.05 },
      to: { label: "Top scale", step: 0.05, min: 0.05 },
      easing: { label: "Blend", options: ["linear", "smoothstep"] },
    },
  },
  radialWave: {
    label: "Ribs",
    hint: "Ridges around the outside",
    fields: {
      amplitude: { label: "Depth", unit: "mm", step: 0.5 },
      count: { label: "Ridge count", min: 1, max: 128 },
      phaseDeg: { label: "Rotate", unit: "°" },
      axialTurns: { label: "Spiral turns", step: 0.1 },
    },
  },
  axialWave: {
    label: "Waves",
    hint: "Waves running up the side",
    fields: {
      amplitude: { label: "Depth", unit: "mm", step: 0.5 },
      cycles: { label: "Wave count", step: 0.5, min: 0.5 },
      phaseDeg: { label: "Offset", unit: "°" },
    },
  },
  bend: {
    label: "Bend",
    hint: "Curve the whole shape over",
    fields: {
      angleDeg: { label: "Angle", unit: "°", min: -300, max: 300 },
      directionDeg: { label: "Direction", unit: "°" },
    },
  },
  noise: {
    label: "Texture",
    hint: "Organic rough surface",
    fields: {
      amplitude: { label: "Strength", step: 0.1, min: 0 },
      scale: { label: "Feature size", step: 1, min: 0.5 },
      seed: { label: "Seed" },
    },
  },
  smooth: {
    label: "Smooth",
    hint: "Soften sharp detail",
    fields: {
      iterations: { label: "Passes", min: 1, max: 8 },
      strength: { label: "Strength", step: 0.05, min: 0, max: 1 },
    },
  },
};

const MODIFIER_TYPES = Object.keys(MODIFIER_META) as ModifierSpec["type"][];
const SOURCE_TYPES = Object.keys(SOURCE_META) as SourceSpec["type"][];

function sourceDefaults(type: SourceSpec["type"]): SourceSpec {
  if (type === "text") return { type, text: "Printa", font: "Roboto", size: 36, depth: 4, bevel: 0.6, bevelSegments: 3, curveSegments: 10, bevelSide: "both", smoothNormals: true, textCase: "original", weight: "regular", italic: false, underline: false };
  if (type === "primitive") return { type, shape: "cylinder", radius: 20, height: 60, segments: 64 };
  if (type === "revolve") return { type, profile: [[24, 0], [32, 30], [29, 70], [24, 110]], segments: 128, profileSegments: 96, wall: 2, bottomCap: true, bottomThickness: 2.4, topCap: false, topThickness: 2.4, interpolation: "catmull-rom", axis: "z" };
  if (type === "extrude") return { type, depth: 8, bevel: 0.8, bevelSegments: 3, curveSegments: 12, direction: [0, 0, 1], path: { commands: [{ op: "move", to: [-25, -25] }, { op: "line", to: [25, -25] }, { op: "line", to: [25, 25] }, { op: "line", to: [-25, 25] }, { op: "close" }], holes: [] } };
  if (type === "water") return { type, width: 100, depth: 80, base: 3, resolution: 56, steps: 50, damping: 0.985, drops: [{ x: 0, y: 0, radius: 8, amplitude: 5 }] };
  return { type: "cloth", width: 100, depth: 100, thickness: 1.2, resolution: 28, steps: 100, startHeight: 35, gravity: 0.18, constraintIterations: 4, pins: "corners" };
}

function modifierDefaults(type: ModifierSpec["type"]): ModifierSpec {
  if (type === "twist") return { type, angleDeg: 90, start: 0, end: 1 };
  if (type === "taper") return { type, from: 1, to: 0.7, easing: "smoothstep" };
  if (type === "radialWave") return { type, amplitude: 2, count: 8, phaseDeg: 0, axialTurns: 0 };
  if (type === "axialWave") return { type, amplitude: 2, cycles: 3, phaseDeg: 0 };
  if (type === "bend") return { type, angleDeg: 20, directionDeg: 0 };
  if (type === "noise") return { type, amplitude: 1, scale: 12, seed: 1 };
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
  if (node.kind === "repeat") return <Repeat2 className="size-3.5" />;
  if (node.kind !== "shape") return <Layers3 className="size-3.5" />;
  if (node.source.type === "text") return <Type className="size-3.5" />;
  if (node.source.type === "water" || node.source.type === "cloth") return <Waves className="size-3.5" />;
  return <Box className="size-3.5" />;
}

function nodeSubtitle(node: ModelNode) {
  if (node.kind === "shape") return SOURCE_META[node.source.type].label;
  if (node.kind === "repeat") return `Repeat × ${node.count}`;
  return "Group";
}

function Section({
  title,
  action,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border/60 px-4 py-3.5">
      <div className="flex h-7 items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-foreground/80 transition-colors hover:text-foreground"
            onClick={() => {
              sfxTap();
              setOpen((value) => !value);
            }}
          >
            {open ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
            {title}
          </button>
        ) : (
          <span className="text-xs font-semibold text-foreground/80">{title}</span>
        )}
        {action}
      </div>
      {(!collapsible || open) && <div className="mt-2.5 grid gap-3">{children}</div>}
    </section>
  );
}

/** Tucks fine-tuning fields out of sight until asked for. */
function Advanced({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="flex w-fit cursor-pointer items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          sfxTap();
          setOpen((value) => !value);
        }}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} Advanced
      </button>
      {open && <div className="grid gap-3">{children}</div>}
    </div>
  );
}

function MaterialSelect({ value, onChange }: { value: PrintMaterialPreset; onChange: (value: PrintMaterialPreset) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs leading-none font-medium text-muted-foreground">Material</span>
      <Select value={value} onValueChange={(next) => { sfxTap(); onChange(next as PrintMaterialPreset); }}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRINT_MATERIAL_PRESETS.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              <span className="inline-block size-3 rounded-full border border-black/10" style={{ background: preset.color }} />
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TransformEditor({ value, onChange, title = "Placement" }: { value?: TransformSpec; onChange: (value: TransformSpec) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const transform = value ?? { translate: [0, 0, 0] as [number, number, number], rotate: [0, 0, 0] as [number, number, number], scale: 1 };
  const scale = typeof transform.scale === "number" ? transform.scale : transform.scale[0];
  return (
    <div className="rounded-xl border border-border/70 bg-background/50">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-foreground/80"
        onClick={() => { sfxTap(); setOpen((valueOpen) => !valueOpen); }}
      >
        <Rotate3D className="size-3.5 text-muted-foreground" /> {title}
        {open ? <ChevronDown className="ml-auto size-3.5 text-muted-foreground" /> : <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="grid gap-2.5 px-2.5 pb-2.5">
          <VectorField label="Move (mm)" value={transform.translate} onChange={(next) => onChange({ ...transform, translate: next })} />
          <VectorField label="Rotate (°)" value={transform.rotate} onChange={(next) => onChange({ ...transform, rotate: next })} />
          <NumberField label="Scale" value={scale} step={0.05} min={0.01} onChange={(next) => onChange({ ...transform, scale: next })} />
        </div>
      )}
    </div>
  );
}

function SourceEditor({ source, fonts, update }: { source: SourceSpec; fonts: FontSummary[]; update: (patch: Partial<SourceSpec>) => void }) {
  const set = (key: string, value: unknown) => update({ [key]: value } as Partial<SourceSpec>);
  return (
    <>
      <SelectField
        label="Shape type"
        value={source.type}
        options={SOURCE_TYPES.map((type) => ({ value: type, label: SOURCE_META[type].label }))}
        onChange={(next) => update(sourceDefaults(next))}
      />
      {source.type === "text" && (
        <>
          <TextField label="Text" value={source.text} onChange={(next) => set("text", next)} />
          <FontPicker value={source.font} fonts={fonts} onChange={(next) => set("font", next)} />
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Case" value={source.textCase} options={[{ value: "original", label: "As typed" }, { value: "uppercase", label: "UPPERCASE" }, { value: "lowercase", label: "lowercase" }, { value: "titlecase", label: "Title Case" }]} onChange={(next) => set("textCase", next)} />
            <SelectField label="Weight" value={source.weight} options={[{ value: "regular", label: "Regular" }, { value: "bold", label: "Bold" }]} onChange={(next) => set("weight", next)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SwitchField label="Italic" value={source.italic} onChange={(next) => set("italic", next)} />
            <SwitchField label="Underline" value={source.underline} onChange={(next) => set("underline", next)} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Height" unit="mm" value={source.size} min={0.1} onChange={(next) => set("size", next)} />
            <NumberField label="Depth" unit="mm" value={source.depth} min={0.1} step={0.5} onChange={(next) => set("depth", next)} />
            <NumberField label="Bevel" unit="mm" value={source.bevel} min={0} step={0.1} onChange={(next) => set("bevel", next)} />
          </div>
          <Advanced>
            <div className="grid grid-cols-2 gap-2">
              <SliderField label="Bevel detail" value={source.bevelSegments} min={1} max={12} onChange={(next) => set("bevelSegments", next)} />
              <SliderField label="Curve detail" value={source.curveSegments} min={2} max={24} onChange={(next) => set("curveSegments", next)} />
            </div>
            <SelectField label="Bevel edges" value={source.bevelSide} options={[{ value: "both", label: "Top + bottom" }, { value: "top", label: "Top only" }, { value: "bottom", label: "Bottom only" }]} onChange={(next) => set("bevelSide", next)} />
          </Advanced>
        </>
      )}
      {source.type === "primitive" && (
        <>
          <SelectField label="Primitive" value={source.shape} options={[{ value: "box", label: "Box" }, { value: "cylinder", label: "Cylinder" }, { value: "cone", label: "Cone" }, { value: "sphere", label: "Sphere" }, { value: "torus", label: "Donut" }]} onChange={(next) => set("shape", next)} />
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Width" unit="mm" value={source.width ?? 40} min={0.1} onChange={(next) => set("width", next)} />
            <NumberField label="Depth" unit="mm" value={source.depth ?? 40} min={0.1} onChange={(next) => set("depth", next)} />
            <NumberField label="Height" unit="mm" value={source.height ?? 60} min={0.1} onChange={(next) => set("height", next)} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Radius" unit="mm" value={source.radius ?? 20} min={0.1} onChange={(next) => set("radius", next)} />
            <NumberField label="Top radius" unit="mm" value={source.radiusTop ?? source.radius ?? 20} min={0} onChange={(next) => set("radiusTop", next)} />
            <NumberField label="Tube" unit="mm" value={source.tube ?? 5} min={0.1} onChange={(next) => set("tube", next)} />
          </div>
          <Advanced>
            <SliderField label="Roundness" value={source.segments} min={3} max={256} onChange={(next) => set("segments", next)} />
          </Advanced>
        </>
      )}
      {source.type === "revolve" && (
        <>
          <JsonField label="Profile — [radius, height] points" value={source.profile} onChange={(next) => set("profile", next)} />
          <NumberField label="Wall thickness" unit="mm" value={source.wall} min={0.1} step={0.1} onChange={(next) => set("wall", next)} />
          <div className="grid grid-cols-2 gap-2">
            <SwitchField label="Solid base" value={source.bottomCap} onChange={(next) => set("bottomCap", next)} />
            <SwitchField label="Solid lid" value={source.topCap} onChange={(next) => set("topCap", next)} />
          </div>
          <Advanced>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="Base" unit="mm" value={source.bottomThickness} min={0.1} step={0.1} onChange={(next) => set("bottomThickness", next)} />
              <NumberField label="Lid" unit="mm" value={source.topThickness} min={0.1} step={0.1} onChange={(next) => set("topThickness", next)} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="Roundness" value={source.segments} min={8} max={512} onChange={(next) => set("segments", next)} />
              <NumberField label="Profile detail" value={source.profileSegments} min={2} max={256} onChange={(next) => set("profileSegments", next)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="Curve" value={source.interpolation} options={[{ value: "catmull-rom", label: "Smooth" }, { value: "linear", label: "Straight" }]} onChange={(next) => set("interpolation", next)} />
              <SelectField label="Axis" value={source.axis} options={["x", "y", "z"]} onChange={(next) => set("axis", next)} />
            </div>
          </Advanced>
        </>
      )}
      {source.type === "extrude" && (
        <>
          <JsonField label="Outline path" value={source.path} onChange={(next) => set("path", next)} rows={7} />
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Depth" unit="mm" value={source.depth} min={0.1} onChange={(next) => set("depth", next)} />
            <NumberField label="Bevel" unit="mm" value={source.bevel} min={0} step={0.1} onChange={(next) => set("bevel", next)} />
            <NumberField label="Detail" value={source.curveSegments} min={1} max={64} onChange={(next) => set("curveSegments", next)} />
          </div>
        </>
      )}
      {source.type === "water" && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Width" unit="mm" value={source.width} min={0.1} onChange={(next) => set("width", next)} />
            <NumberField label="Depth" unit="mm" value={source.depth} min={0.1} onChange={(next) => set("depth", next)} />
            <NumberField label="Base" unit="mm" value={source.base} min={0.1} onChange={(next) => set("base", next)} />
          </div>
          <SliderField label="Ripple time" value={source.steps} min={1} max={400} onChange={(next) => set("steps", next)} />
          <Advanced>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="Detail" value={source.resolution} min={12} max={160} onChange={(next) => set("resolution", next)} />
              <NumberField label="Calm" value={source.damping} min={0.8} max={0.9999} step={0.001} onChange={(next) => set("damping", next)} />
            </div>
            <JsonField label="Drops" value={source.drops} onChange={(next) => set("drops", next)} />
          </Advanced>
        </>
      )}
      {source.type === "cloth" && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Width" unit="mm" value={source.width} min={0.1} onChange={(next) => set("width", next)} />
            <NumberField label="Depth" unit="mm" value={source.depth} min={0.1} onChange={(next) => set("depth", next)} />
            <NumberField label="Thickness" unit="mm" value={source.thickness} min={0.1} step={0.1} onChange={(next) => set("thickness", next)} />
          </div>
          <SliderField label="Fall time" value={source.steps} min={1} max={300} onChange={(next) => set("steps", next)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Drop from" unit="mm" value={source.startHeight} min={0.1} onChange={(next) => set("startHeight", next)} />
            <SelectField label="Pinned at" value={source.pins} options={[{ value: "corners", label: "Corners" }, { value: "top-edge", label: "Top edge" }, { value: "none", label: "Free fall" }]} onChange={(next) => set("pins", next)} />
          </div>
          <Advanced>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="Detail" value={source.resolution} min={8} max={80} onChange={(next) => set("resolution", next)} />
              <NumberField label="Gravity" value={source.gravity} min={0.01} step={0.01} onChange={(next) => set("gravity", next)} />
            </div>
          </Advanced>
        </>
      )}
    </>
  );
}

export function Inspector({ document, fonts, onChange }: { document: ModelDocument; fonts: FontSummary[]; onChange: (document: ModelDocument) => void }) {
  const entries = useMemo(() => collectNodes(document.root), [document]);
  const [selection, setSelection] = useState<Selection>({ kind: "node", nodeId: document.root.id });
  const selectionExists = findNode(document.root, selection.nodeId);
  const activeSelection: Selection = selectionExists ? selection : { kind: "node", nodeId: document.root.id };
  const selectedNode = selectionExists ?? document.root;
  const modifierIndex = activeSelection.kind === "modifier" ? activeSelection.index : -1;
  const selectedModifier = modifierIndex >= 0 ? selectedNode.modifiers[modifierIndex] : null;

  const mutate = (recipe: (draft: ModelDocument) => void) => {
    const draft = structuredClone(document);
    recipe(draft);
    onChange(draft);
  };
  const mutateNode = (recipe: (node: ModelNode) => void) => mutate((draft) => { updateNode(draft.root, selectedNode.id, recipe); });

  const addLayer = (type: SourceSpec["type"]) => mutate((draft) => {
    const node: ModelNode = { kind: "shape", id: `${type}-${Date.now().toString(36)}`, source: sourceDefaults(type), modifiers: [], material: "pla-orange" };
    if (draft.root.kind === "assembly") draft.root.children.push(node);
    else draft.root = { kind: "assembly", id: "model", operation: "merge", children: [draft.root, node], modifiers: [] };
    setSelection({ kind: "node", nodeId: node.id });
  });
  const duplicateLayer = () => mutate((draft) => {
    const target = findNode(draft.root, activeSelection.nodeId);
    if (!target) return;
    const copy = structuredClone(target);
    copy.id = `${copy.id}-copy-${Date.now().toString(36)}`;
    if (draft.root.kind === "assembly") draft.root.children.push(copy);
    else draft.root = { kind: "assembly", id: "model", operation: "merge", children: [draft.root, copy], modifiers: [] };
    setSelection({ kind: "node", nodeId: copy.id });
  });
  const deleteLayer = () => mutate((draft) => {
    if (draft.root.kind !== "assembly" || draft.root.children.length <= 1) return;
    draft.root.children = draft.root.children.filter((child) => child.id !== activeSelection.nodeId);
    if (draft.root.children.length === 1) draft.root = draft.root.children[0];
    setSelection({ kind: "node", nodeId: draft.root.id });
  });
  const addModifier = (type: ModifierSpec["type"]) => mutateNode((node) => {
    node.modifiers.push(modifierDefaults(type));
    setSelection({ kind: "modifier", nodeId: node.id, index: node.modifiers.length - 1 });
  });

  const canDelete = document.root.kind === "assembly" && activeSelection.nodeId !== document.root.id;

  return (
    <div className="flex min-h-0 flex-col">
      <Section
        title="Layers"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" onClick={() => sfxTap()}>
                <Plus className="size-3.5" /> Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>New layer</DropdownMenuLabel>
              {SOURCE_TYPES.map((type) => (
                <DropdownMenuItem key={type} onSelect={() => { sfxTap(); addLayer(type); }}>
                  <span className="grid gap-0.5">
                    <span>{SOURCE_META[type].label}</span>
                    <span className="text-[10px] text-muted-foreground">{SOURCE_META[type].hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <div className="grid gap-0.5">
          {entries.map(({ node, depth }) => (
            <div key={node.id} className="grid gap-0.5">
              <button
                type="button"
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 text-left transition-colors",
                  activeSelection.kind === "node" && activeSelection.nodeId === node.id
                    ? "bg-secondary text-foreground"
                    : "text-foreground/75 hover:bg-secondary/50",
                )}
                onClick={() => { sfxTap(); setSelection({ kind: "node", nodeId: node.id }); }}
              >
                <span className="text-muted-foreground">{nodeIcon(node)}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.id}</span>
                <span className="shrink-0 font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{nodeSubtitle(node)}</span>
              </button>
              {node.modifiers.map((modifier, index) => (
                <button
                  key={`${node.id}-${index}`}
                  type="button"
                  style={{ paddingLeft: `${26 + depth * 14}px` }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-1.5 rounded-lg py-1 pr-2 text-left transition-colors",
                    activeSelection.kind === "modifier" && activeSelection.nodeId === node.id && activeSelection.index === index
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50",
                  )}
                  onClick={() => { sfxTap(); setSelection({ kind: "modifier", nodeId: node.id, index }); }}
                >
                  <Wand2 className="size-3" />
                  <span className="text-[11px] font-medium">{MODIFIER_META[modifier.type].label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" className="flex-1" onClick={() => sfxTap()}>
                <Wand2 className="size-3.5" /> Add modifier
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Applies to “{selectedNode.id}”</DropdownMenuLabel>
              {MODIFIER_TYPES.map((type) => (
                <DropdownMenuItem key={type} onSelect={() => { sfxTap(); addModifier(type); }}>
                  <span className="grid gap-0.5">
                    <span>{MODIFIER_META[type].label}</span>
                    <span className="text-[10px] text-muted-foreground">{MODIFIER_META[type].hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon-xs" aria-label="Duplicate layer" onClick={() => { sfxTap(); duplicateLayer(); }}>
            <Copy className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" aria-label="Delete layer" disabled={!canDelete} onClick={() => { sfxTap(); deleteLayer(); }}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </Section>

      {selectedModifier ? (
        <Section
          title={`${MODIFIER_META[selectedModifier.type].label} modifier`}
          action={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move modifier up"
                disabled={modifierIndex === 0}
                onClick={() => { sfxTap(); mutateNode((node) => { const [item] = node.modifiers.splice(modifierIndex, 1); node.modifiers.splice(modifierIndex - 1, 0, item); setSelection({ kind: "modifier", nodeId: node.id, index: modifierIndex - 1 }); }); }}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move modifier down"
                disabled={modifierIndex >= selectedNode.modifiers.length - 1}
                onClick={() => { sfxTap(); mutateNode((node) => { const [item] = node.modifiers.splice(modifierIndex, 1); node.modifiers.splice(modifierIndex + 1, 0, item); setSelection({ kind: "modifier", nodeId: node.id, index: modifierIndex + 1 }); }); }}
              >
                <ChevronDown className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove modifier"
                onClick={() => { sfxTap(); mutateNode((node) => { node.modifiers.splice(modifierIndex, 1); setSelection({ kind: "node", nodeId: node.id }); }); }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          }
        >
          <p className="text-[11px] leading-snug text-muted-foreground">{MODIFIER_META[selectedModifier.type].hint}.</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(selectedModifier)
              .filter(([key]) => key !== "type")
              .map(([key, value]) => {
                const meta = MODIFIER_META[selectedModifier.type].fields[key] ?? { label: key };
                if (typeof value === "number") {
                  return (
                    <NumberField
                      key={key}
                      label={meta.label}
                      value={value}
                      step={meta.step ?? 1}
                      min={meta.min}
                      max={meta.max}
                      unit={meta.unit}
                      onChange={(next) => mutateNode((node) => { (node.modifiers[modifierIndex] as unknown as Record<string, unknown>)[key] = next; })}
                    />
                  );
                }
                return (
                  <SelectField
                    key={key}
                    label={meta.label}
                    value={String(value)}
                    options={meta.options ?? [String(value)]}
                    onChange={(next) => mutateNode((node) => { (node.modifiers[modifierIndex] as unknown as Record<string, unknown>)[key] = next; })}
                  />
                );
              })}
          </div>
        </Section>
      ) : (
        <Section title={selectedNode.kind === "shape" ? "Shape" : selectedNode.kind === "repeat" ? "Repeat" : "Group"}>
          <TextField label="Layer name" value={selectedNode.id} onChange={(next) => mutateNode((node) => { node.id = next; setSelection({ kind: "node", nodeId: next }); })} />
          {selectedNode.kind === "shape" && (
            <>
              <MaterialSelect
                value={selectedNode.material ?? "pla-orange"}
                onChange={(next) => mutateNode((node) => { if (node.kind === "shape") node.material = next; })}
              />
              <SourceEditor
                source={selectedNode.source}
                fonts={fonts}
                update={(patch) => mutateNode((node) => {
                  if (node.kind !== "shape") return;
                  const next = patch as SourceSpec;
                  node.source = next.type && next.type !== node.source.type ? next : ({ ...node.source, ...patch } as SourceSpec);
                })}
              />
            </>
          )}
          {selectedNode.kind === "repeat" && (
            <>
              <NumberField label="Copies" value={selectedNode.count} min={1} max={32} onChange={(next) => mutateNode((node) => { if (node.kind === "repeat") node.count = next; })} />
              <TransformEditor title="Step between copies" value={selectedNode.step} onChange={(next) => mutateNode((node) => { if (node.kind === "repeat") node.step = next; })} />
            </>
          )}
          <TransformEditor value={selectedNode.transform} onChange={(next) => mutateNode((node) => { node.transform = next; })} />
        </Section>
      )}

      <Section title="Print setup" collapsible defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Units" value={document.units} options={["mm", "cm", "in"]} onChange={(next) => mutate((draft) => { draft.units = next as ModelDocument["units"]; })} />
          <SelectField
            label="Printer size"
            value={String(document.print.buildVolume[0])}
            options={[
              { value: "120", label: "Small · 120³" },
              { value: "180", label: "Compact · 180³" },
              { value: "220", label: "Classic · 220³" },
              { value: "256", label: "Standard · 256³" },
              { value: "300", label: "Large · 300³" },
              { value: "350", label: "XL · 350³" },
              ...(["120", "180", "220", "256", "300", "350"].includes(String(document.print.buildVolume[0]))
                ? []
                : [{ value: String(document.print.buildVolume[0]), label: `Custom · ${document.print.buildVolume.join("×")}` }]),
            ]}
            onChange={(next) => mutate((draft) => { const size = Number(next); draft.print.buildVolume = [size, size, size]; })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SwitchField label="Sit on bed" value={document.print.placeOnBed} onChange={(next) => mutate((draft) => { draft.print.placeOnBed = next; })} />
          <SwitchField label="Auto center" value={document.print.autoCenter} onChange={(next) => mutate((draft) => { draft.print.autoCenter = next; })} />
        </div>
      </Section>
    </div>
  );
}
