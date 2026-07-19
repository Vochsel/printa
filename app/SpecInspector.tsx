"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Layers3,
  Plus,
  Rotate3D,
  Search,
  Trash2,
  Type,
  Waves,
} from "lucide-react";
import type { ModelDocument, ModelNode, ModifierSpec, SourceSpec, TransformSpec } from "@/lib/model-spec";

type FontSummary = { id: string; family: string; category: string };
type Selection = { kind: "node"; nodeId: string } | { kind: "modifier"; nodeId: string; index: number };
type NodeEntry = { node: ModelNode; depth: number };

const MATERIALS = ["pla-orange", "pla-matte", "pla-silk", "petg", "resin"] as const;
const SOURCE_TYPES = ["text", "primitive", "extrude", "revolve", "water", "cloth"] as const;
const MODIFIER_TYPES = ["twist", "taper", "radialWave", "axialWave", "bend", "noise", "smooth"] as const;
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
  return <div className="spec-font-picker"><span className="spec-font-label">Google font <small>{fonts.length.toLocaleString()} families</small></span><button type="button" className="spec-font-trigger" onClick={() => { setOpen((value) => !value); setVisibleCount(50); }}><span style={{ fontFamily: selected ? `"Printa Spec ${selected.id}", sans-serif` : undefined }}>{selected?.family ?? value}</span><small>{selected?.category ?? "Google Font"}</small><ChevronDown size={14} /></button>{open && <div className="spec-font-popover"><label><Search size={14} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} placeholder="Search all Google Fonts…" /></label><div className="spec-font-summary"><span>{matches.length.toLocaleString()} fonts</span><small>{visible.length.toLocaleString()} shown · scroll for all</small></div><div className="spec-font-list" onScroll={(event) => { const list = event.currentTarget; if (list.scrollTop + list.clientHeight >= list.scrollHeight - 80) setVisibleCount((count) => Math.min(matches.length, count + 50)); }}>{visible.map((font) => <button key={font.id} type="button" onClick={() => { onChange(font.family); setOpen(false); setQuery(""); }}><span style={{ fontFamily: `"Printa Spec ${font.id}", sans-serif` }}>{font.family}</span><small>{font.category}</small>{font.family === value && <Check size={14} />}</button>)}</div></div>}</div>;
}

function sourceDefaults(type: SourceSpec["type"]): SourceSpec {
  if (type === "text") return { type, text: "Printa", font: "Roboto", size: 36, depth: 4, bevel: 0.6, bevelSegments: 3, curveSegments: 10, bevelSide: "both", smoothNormals: true, textCase: "original", weight: "regular", italic: false, underline: false };
  if (type === "primitive") return { type, shape: "cylinder", radius: 20, height: 60, segments: 64 };
  if (type === "revolve") return { type, profile: [[24, 0], [32, 30], [29, 70], [24, 110]], segments: 128, profileSegments: 96, wall: 2, interpolation: "catmull-rom", axis: "z" };
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
  if (node.kind !== "shape") return <Layers3 size={14} />;
  if (node.source.type === "text") return <Type size={14} />;
  if (node.source.type === "water" || node.source.type === "cloth") return <Waves size={14} />;
  return <Box size={14} />;
}

function NumberInput({ label, value, step = 1, min, max, onChange }: { label: string; value: number; step?: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className="spec-field"><span>{label}</span><input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function TextInput({ label, value, onChange, list }: { label: string; value: string; onChange: (value: string) => void; list?: string }) {
  return <label className="spec-field"><span>{label}</span><input value={value} list={list} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="spec-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function ToggleInput({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="spec-toggle"><span><strong>{label}</strong>{detail && <small>{detail}</small>}</span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function JsonInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: unknown) => void }) {
  const serialized = JSON.stringify(value, null, 2);
  const [draftState, setDraftState] = useState(() => ({ source: serialized, draft: serialized, invalid: false }));
  const current = draftState.source === serialized ? draftState : { source: serialized, draft: serialized, invalid: false };
  return <label className={`spec-field spec-json${current.invalid ? " is-invalid" : ""}`}><span>{label}</span><textarea value={current.draft} spellCheck={false} onChange={(event) => {
    const next = event.target.value;
    try { onChange(JSON.parse(next)); setDraftState({ source: serialized, draft: next, invalid: false }); }
    catch { setDraftState({ source: serialized, draft: next, invalid: true }); }
  }} /></label>;
}

function TransformEditor({ value, onChange, title = "Transform" }: { value?: TransformSpec; onChange: (value: TransformSpec) => void; title?: string }) {
  const transform = value ?? { translate: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
  const updateVector = (key: "translate" | "rotate", index: number, next: number) => {
    const vector = [...transform[key]] as [number, number, number];
    vector[index] = next;
    onChange({ ...transform, [key]: vector });
  };
  const scale = typeof transform.scale === "number" ? transform.scale : transform.scale[0];
  return <div className="spec-subsection"><div className="spec-subhead"><Rotate3D size={13} /> {title}</div><div className="spec-vector"><span>Position</span>{transform.translate.map((item, index) => <input key={index} type="number" step="1" value={item} aria-label={`Position ${index}`} onChange={(event) => updateVector("translate", index, Number(event.target.value))} />)}</div><div className="spec-vector"><span>Rotation</span>{transform.rotate.map((item, index) => <input key={index} type="number" step="1" value={item} aria-label={`Rotation ${index}`} onChange={(event) => updateVector("rotate", index, Number(event.target.value))} />)}</div><NumberInput label="Uniform scale" value={scale} step={0.05} min={0.01} onChange={(next) => onChange({ ...transform, scale: next })} /></div>;
}

function SourceEditor({ source, fonts, update }: { source: SourceSpec; fonts: FontSummary[]; update: (patch: Partial<SourceSpec>) => void }) {
  const set = (key: string, value: unknown) => update({ [key]: value } as Partial<SourceSpec>);
  return <div className="spec-fields">
    <SelectInput label="Source type" value={source.type} options={SOURCE_TYPES} onChange={(value) => update(sourceDefaults(value as SourceSpec["type"]))} />
    {source.type === "text" && <>
      <TextInput label="Text" value={source.text} onChange={(value) => set("text", value)} />
      <SpecFontPicker value={source.font} fonts={fonts} onChange={(value) => set("font", value)} />
      <div className="spec-two"><SelectInput label="Case" value={source.textCase} options={["original", "uppercase", "lowercase", "titlecase"]} onChange={(value) => set("textCase", value)} /><SelectInput label="Weight" value={source.weight} options={["regular", "bold"]} onChange={(value) => set("weight", value)} /></div>
      <div className="spec-two"><ToggleInput label="Italic" value={source.italic} onChange={(value) => set("italic", value)} /><ToggleInput label="Underline" value={source.underline} onChange={(value) => set("underline", value)} /></div>
      <div className="spec-three"><NumberInput label="Size" value={source.size} min={0.1} step={1} onChange={(value) => set("size", value)} /><NumberInput label="Depth" value={source.depth} min={0.1} step={0.5} onChange={(value) => set("depth", value)} /><NumberInput label="Bevel" value={source.bevel} min={0} step={0.1} onChange={(value) => set("bevel", value)} /></div>
      <div className="spec-two"><NumberInput label="Bevel resolution" value={source.bevelSegments} min={1} max={12} onChange={(value) => set("bevelSegments", value)} /><NumberInput label="Curve resolution" value={source.curveSegments} min={2} max={24} onChange={(value) => set("curveSegments", value)} /></div>
      <SelectInput label="Bevel faces" value={source.bevelSide} options={["both", "top", "bottom"]} onChange={(value) => set("bevelSide", value)} />
      <ToggleInput label="Smooth normals" value={source.smoothNormals} onChange={(value) => set("smoothNormals", value)} />
    </>}
    {source.type === "primitive" && <><SelectInput label="Primitive" value={source.shape} options={["box", "cylinder", "cone", "sphere", "torus"]} onChange={(value) => set("shape", value)} /><div className="spec-three"><NumberInput label="Width" value={source.width ?? 40} min={0.1} onChange={(value) => set("width", value)} /><NumberInput label="Depth" value={source.depth ?? 40} min={0.1} onChange={(value) => set("depth", value)} /><NumberInput label="Height" value={source.height ?? 60} min={0.1} onChange={(value) => set("height", value)} /></div><div className="spec-three"><NumberInput label="Radius" value={source.radius ?? 20} min={0.1} onChange={(value) => set("radius", value)} /><NumberInput label="Top radius" value={source.radiusTop ?? source.radius ?? 20} min={0} onChange={(value) => set("radiusTop", value)} /><NumberInput label="Tube" value={source.tube ?? 5} min={0.1} onChange={(value) => set("tube", value)} /></div><NumberInput label="Resolution" value={source.segments} min={3} max={256} onChange={(value) => set("segments", value)} /></>}
    {source.type === "revolve" && <><JsonInput label="Profile [radius, height]" value={source.profile} onChange={(value) => set("profile", value)} /><div className="spec-three"><NumberInput label="Wall" value={source.wall} min={0.1} step={0.1} onChange={(value) => set("wall", value)} /><NumberInput label="Radial segments" value={source.segments} min={8} max={512} onChange={(value) => set("segments", value)} /><NumberInput label="Profile resolution" value={source.profileSegments} min={2} max={256} onChange={(value) => set("profileSegments", value)} /></div><div className="spec-two"><SelectInput label="Interpolation" value={source.interpolation} options={["linear", "catmull-rom"]} onChange={(value) => set("interpolation", value)} /><SelectInput label="Axis" value={source.axis} options={["x", "y", "z"]} onChange={(value) => set("axis", value)} /></div></>}
    {source.type === "extrude" && <><JsonInput label="Curve path" value={source.path} onChange={(value) => set("path", value)} /><div className="spec-three"><NumberInput label="Depth" value={source.depth} min={0.1} onChange={(value) => set("depth", value)} /><NumberInput label="Bevel" value={source.bevel} min={0} step={0.1} onChange={(value) => set("bevel", value)} /><NumberInput label="Resolution" value={source.curveSegments} min={1} max={64} onChange={(value) => set("curveSegments", value)} /></div><JsonInput label="Direction [x,y,z]" value={source.direction} onChange={(value) => set("direction", value)} /></>}
    {source.type === "water" && <><div className="spec-three"><NumberInput label="Width" value={source.width} min={0.1} onChange={(value) => set("width", value)} /><NumberInput label="Depth" value={source.depth} min={0.1} onChange={(value) => set("depth", value)} /><NumberInput label="Base" value={source.base} min={0.1} onChange={(value) => set("base", value)} /></div><div className="spec-three"><NumberInput label="Resolution" value={source.resolution} min={12} max={160} onChange={(value) => set("resolution", value)} /><NumberInput label="Steps" value={source.steps} min={1} max={400} onChange={(value) => set("steps", value)} /><NumberInput label="Damping" value={source.damping} min={0.8} max={0.9999} step={0.001} onChange={(value) => set("damping", value)} /></div><JsonInput label="Drops" value={source.drops} onChange={(value) => set("drops", value)} /></>}
    {source.type === "cloth" && <><div className="spec-three"><NumberInput label="Width" value={source.width} min={0.1} onChange={(value) => set("width", value)} /><NumberInput label="Depth" value={source.depth} min={0.1} onChange={(value) => set("depth", value)} /><NumberInput label="Thickness" value={source.thickness} min={0.1} step={0.1} onChange={(value) => set("thickness", value)} /></div><div className="spec-three"><NumberInput label="Resolution" value={source.resolution} min={8} max={80} onChange={(value) => set("resolution", value)} /><NumberInput label="Steps" value={source.steps} min={1} max={300} onChange={(value) => set("steps", value)} /><NumberInput label="Start height" value={source.startHeight} min={0.1} onChange={(value) => set("startHeight", value)} /></div><div className="spec-two"><NumberInput label="Gravity" value={source.gravity} min={0.01} step={0.01} onChange={(value) => set("gravity", value)} /><SelectInput label="Pins" value={source.pins} options={["corners", "top-edge", "none"]} onChange={(value) => set("pins", value)} /></div><JsonInput label="Collider" value={source.collider ?? { type: "sphere", center: [0, 0, 0], radius: 20 }} onChange={(value) => set("collider", value)} /></>}
  </div>;
}

export function SpecInspector({ document, fonts, onChange }: { document: ModelDocument; fonts: FontSummary[]; onChange: (document: ModelDocument) => void }) {
  const entries = useMemo(() => collectNodes(document.root), [document]);
  const [selection, setSelection] = useState<Selection>({ kind: "node", nodeId: document.root.id });
  const selectionExists = findNode(document.root, selection.nodeId);
  const activeSelection: Selection = selectionExists ? selection : { kind: "node", nodeId: document.root.id };
  const selectedNode = selectionExists ?? document.root;
  const modifierIndex = activeSelection.kind === "modifier" ? activeSelection.index : -1;
  const selectedModifier = modifierIndex >= 0 ? selectedNode.modifiers[modifierIndex] : null;

  const mutate = (recipe: (draft: ModelDocument) => void) => { const draft = structuredClone(document); recipe(draft); onChange(draft); };
  const mutateNode = (recipe: (node: ModelNode) => void) => mutate((draft) => { updateNode(draft.root, selectedNode.id, recipe); });
  const addLayer = () => mutate((draft) => {
    const node: ModelNode = { kind: "shape", id: `shape-${Date.now().toString(36)}`, source: sourceDefaults("primitive"), modifiers: [], material: "pla-orange" };
    if (draft.root.kind === "assembly") draft.root.children.push(node);
    else draft.root = { kind: "assembly", id: "model", operation: "merge", children: [draft.root, node], modifiers: [] };
    setSelection({ kind: "node", nodeId: node.id });
  });
  const duplicateLayer = () => mutate((draft) => {
    const target = findNode(draft.root, activeSelection.nodeId);
    if (!target) return;
    const copy = structuredClone(target); copy.id = `${copy.id}-copy-${Date.now().toString(36)}`;
    if (draft.root.kind === "assembly") draft.root.children.push(copy);
    else draft.root = { kind: "assembly", id: "model", operation: "merge", children: [draft.root, copy], modifiers: [] };
    setSelection({ kind: "node", nodeId: copy.id });
  });
  const deleteLayer = () => mutate((draft) => {
    if (draft.root.kind !== "assembly" || draft.root.children.length <= 1) return;
    draft.root.children = draft.root.children.filter((child) => child.id !== activeSelection.nodeId);
    setSelection({ kind: "node", nodeId: draft.root.id });
  });

  return <>
    <section className="spec-document-card">
      <div className="studio-section-head"><strong>Document</strong><small>Live spec</small></div>
      <TextInput label="Name" value={document.name} onChange={(value) => mutate((draft) => { draft.name = value; })} />
      <TextInput label="Description" value={document.description} onChange={(value) => mutate((draft) => { draft.description = value; })} />
      <div className="spec-two"><SelectInput label="Units" value={document.units} options={["mm", "cm", "in"]} onChange={(value) => mutate((draft) => { draft.units = value as ModelDocument["units"]; })} /><ToggleInput label="Place on bed" value={document.print.placeOnBed} onChange={(value) => mutate((draft) => { draft.print.placeOnBed = value; })} /></div>
      <div className="spec-three">{document.print.buildVolume.map((value, index) => <NumberInput key={index} label={["Build W", "Build H", "Build Z"][index]} value={value} min={0.1} onChange={(next) => mutate((draft) => { draft.print.buildVolume[index] = next; })} />)}</div>
      <ToggleInput label="Auto center" value={document.print.autoCenter} onChange={(value) => mutate((draft) => { draft.print.autoCenter = value; })} />
    </section>

    <section className="spec-layer-section">
      <div className="studio-section-head"><strong>Layers</strong><button type="button" onClick={addLayer}><Plus size={13} /> Add layer</button></div>
      <div className="spec-layer-list">{entries.map(({ node, depth }) => <div key={node.id} className="spec-layer-wrap"><button type="button" className={`spec-layer${activeSelection.kind === "node" && activeSelection.nodeId === node.id ? " is-active" : ""}`} style={{ paddingLeft: `${12 + depth * 18}px` }} onClick={() => setSelection({ kind: "node", nodeId: node.id })}><GripVertical size={12} />{nodeIcon(node)}<span><strong>{node.id}</strong><small>{node.kind === "shape" ? node.source.type : node.kind}</small></span></button>{node.modifiers.map((modifier, index) => <button key={`${node.id}-${index}`} type="button" className={`spec-modifier-layer${activeSelection.kind === "modifier" && activeSelection.nodeId === node.id && activeSelection.index === index ? " is-active" : ""}`} style={{ paddingLeft: `${42 + depth * 18}px` }} onClick={() => setSelection({ kind: "modifier", nodeId: node.id, index })}><span>↳ {modifier.type}</span></button>)}</div>)}</div>
      <div className="spec-layer-actions"><button type="button" onClick={duplicateLayer}><Copy size={13} /> Duplicate</button><button type="button" onClick={deleteLayer} disabled={document.root.kind !== "assembly" || activeSelection.nodeId === document.root.id}><Trash2 size={13} /> Delete</button></div>
    </section>

    <section className="spec-inspector-section">
      <div className="studio-section-head"><strong>{selectedModifier ? `${selectedModifier.type} modifier` : `${selectedNode.id} properties`}</strong><small>Realtime</small></div>
      {selectedModifier ? <div className="spec-fields">{Object.entries(selectedModifier).filter(([key]) => key !== "type").map(([key, value]) => typeof value === "number" ? <NumberInput key={key} label={key} value={value} step={key.toLowerCase().includes("strength") || key === "start" || key === "end" ? 0.05 : 1} onChange={(next) => mutateNode((node) => { (node.modifiers[modifierIndex] as unknown as Record<string, unknown>)[key] = next; })} /> : <SelectInput key={key} label={key} value={String(value)} options={key === "easing" ? ["linear", "smoothstep"] : [String(value)]} onChange={(next) => mutateNode((node) => { (node.modifiers[modifierIndex] as unknown as Record<string, unknown>)[key] = next; })} />)}<div className="spec-modifier-actions"><button type="button" disabled={modifierIndex === 0} onClick={() => mutateNode((node) => { const [item] = node.modifiers.splice(modifierIndex, 1); node.modifiers.splice(modifierIndex - 1, 0, item); setSelection({ kind: "modifier", nodeId: node.id, index: modifierIndex - 1 }); })}><ChevronUp size={14} /></button><button type="button" disabled={modifierIndex >= selectedNode.modifiers.length - 1} onClick={() => mutateNode((node) => { const [item] = node.modifiers.splice(modifierIndex, 1); node.modifiers.splice(modifierIndex + 1, 0, item); setSelection({ kind: "modifier", nodeId: node.id, index: modifierIndex + 1 }); })}><ChevronDown size={14} /></button><button type="button" onClick={() => mutateNode((node) => { node.modifiers.splice(modifierIndex, 1); setSelection({ kind: "node", nodeId: node.id }); })}><Trash2 size={14} /></button></div></div> : <>
        <TextInput label="Layer id" value={selectedNode.id} onChange={(value) => mutateNode((node) => { node.id = value; setSelection({ kind: "node", nodeId: value }); })} />
        {selectedNode.kind === "shape" && <><SelectInput label="Material" value={selectedNode.material ?? "pla-orange"} options={MATERIALS} onChange={(value) => mutateNode((node) => { if (node.kind === "shape") node.material = value as typeof MATERIALS[number]; })} /><SourceEditor source={selectedNode.source} fonts={fonts} update={(patch) => mutateNode((node) => { if (node.kind !== "shape") return; const next = patch as SourceSpec; node.source = next.type && next.type !== node.source.type ? next : { ...node.source, ...patch } as SourceSpec; })} /></>}
        {selectedNode.kind === "repeat" && <><NumberInput label="Repeat count" value={selectedNode.count} min={1} max={32} onChange={(value) => mutateNode((node) => { if (node.kind === "repeat") node.count = value; })} /><TransformEditor title="Repeat step" value={selectedNode.step} onChange={(value) => mutateNode((node) => { if (node.kind === "repeat") node.step = value; })} /></>}
        <TransformEditor value={selectedNode.transform} onChange={(value) => mutateNode((node) => { node.transform = value; })} />
        <div className="spec-add-modifier"><label className="spec-field"><span>Add modifier</span><select defaultValue="" onChange={(event) => { const value = event.target.value as ModifierSpec["type"]; if (!value) return; mutateNode((node) => { node.modifiers.push(modifierDefaults(value)); setSelection({ kind: "modifier", nodeId: node.id, index: node.modifiers.length - 1 }); }); event.target.value = ""; }}><option value="" disabled>Choose modifier…</option>{MODIFIER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><span>Selecting adds it immediately</span></div>
      </>}
    </section>

    <section className="spec-display-section">
      <div className="studio-section-head"><strong>Viewport in spec</strong><Eye size={13} /></div>
      <div className="spec-two"><ToggleInput label="Floor" value={document.display.floor} onChange={(value) => mutate((draft) => { draft.display.floor = value; })} /><ToggleInput label="Grid" value={document.display.grid} onChange={(value) => mutate((draft) => { draft.display.grid = value; })} /></div>
      <ToggleInput label="Floor W/H gizmos" detail="Stored in display.dimensions" value={document.display.dimensions.visible} onChange={(value) => mutate((draft) => { draft.display.dimensions.visible = value; })} />
      <div className="spec-three"><ToggleInput label="Width" value={document.display.dimensions.width} onChange={(value) => mutate((draft) => { draft.display.dimensions.width = value; })} /><ToggleInput label="Height" value={document.display.dimensions.height} onChange={(value) => mutate((draft) => { draft.display.dimensions.height = value; })} /><NumberInput label="Offset" value={document.display.dimensions.offset} min={0} step={1} onChange={(value) => mutate((draft) => { draft.display.dimensions.offset = value; })} /></div>
      <NumberInput label="Label precision" value={document.display.dimensions.precision} min={0} max={3} onChange={(value) => mutate((draft) => { draft.display.dimensions.precision = value; })} />
      <JsonInput label="Metadata" value={document.metadata} onChange={(value) => mutate((draft) => { draft.metadata = value as ModelDocument["metadata"]; })} />
    </section>
  </>;
}
