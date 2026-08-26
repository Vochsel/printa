"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Lock,
  MessageSquareText,
  MousePointer2,
  Search,
  Sparkles,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { DEFAULT_VIEW, fitCameraToBox } from "@/lib/camera-fit";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Everything on this page is built from the platform's real schema and compiled
// by the same /api/model/stl pipeline the editor and MCP tools use. The page
// runs exactly one WebGL context — the gallery swaps what it is showing rather
// than mounting a viewport per example.
// ---------------------------------------------------------------------------

function encodeSpec(document: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const previewUrl = (document: unknown) => `/api/model/stl?spec=${encodeSpec(document)}&preview=true`;
const downloadUrl = (document: unknown) => `/api/model/stl?spec=${encodeSpec(document)}`;
const editorUrl = (document: unknown) => `/editor?spec=${encodeSpec(document)}`;

/**
 * A model to render: either an inline spec, or a demo id.
 *
 * A place carries its captured ground with it and runs to tens of kilobytes,
 * which overflows what a URL will hold — so those are addressed by id and
 * compiled server-side from the same document.
 */
type ModelRef = { document?: unknown; demo?: string };

const refPreviewUrl = (ref: ModelRef) =>
  ref.demo ? `/api/model/stl?demo=${ref.demo}&preview=true` : previewUrl(ref.document);
const refDownloadUrl = (ref: ModelRef) =>
  ref.demo ? `/api/model/stl?demo=${ref.demo}` : downloadUrl(ref.document);
const refEditorUrl = (ref: ModelRef) =>
  ref.demo ? `/editor?demo=${ref.demo}` : editorUrl(ref.document);

async function loadGeometry(ref: ModelRef, signal: AbortSignal) {
  const response = await fetch(refPreviewUrl(ref), { signal });
  if (!response.ok) throw new Error(`model ${response.status}`);
  const geometry = new STLLoader().parse(await response.arrayBuffer());
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function textDoc({ text, font, depth, size }: { text: string; font: string; depth: number; size: number }) {
  return {
    version: "1.0",
    name: text || "Text",
    units: "mm",
    root: {
      kind: "shape",
      id: "text",
      source: { type: "text", text: text || "PRINTA", font, size, depth, bevel: Math.min(depth * 0.14, 1.4), bevelSide: "top" },
      modifiers: [],
    },
  };
}

// ---------------------------------------------------------------------------
// ModelStage — the page's single WebGL viewport. Recompiles when `document`
// changes; the old model stays on screen until the new one is ready so the
// gallery never flashes empty.
// ---------------------------------------------------------------------------

// A build plate just wide enough to read as a printer bed. Sizing it much
// larger than the model pushes the model into the distance and leaves the frame
// mostly empty plate.
function buildBed(size: number) {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: "#e9e4d8", roughness: 0.97, metalness: 0 }),
  );
  plate.position.z = -0.15;
  plate.receiveShadow = true;
  group.add(plate);
  const grid = new THREE.GridHelper(size, Math.max(6, Math.round(size / 10)), "#a9a191", "#cec7b8");
  grid.rotation.x = Math.PI / 2;
  group.add(grid);
  return group;
}

function disposeBed(bed: THREE.Group) {
  bed.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.GridHelper) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}

type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  gtao: GTAOPass;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
  bed: THREE.Group | null;
  loader: AbortController | null;
  markDirty: () => void;
};

function ModelStage({ document, demo, color = "#ff4d8b", className }: { document?: unknown; demo?: string; color?: string; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const store = useRef<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const specKey = useMemo(() => demo ?? JSON.stringify(document), [demo, document]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 4000);
    camera.up.set(0, 0, 1);
    camera.position.copy(DEFAULT_VIEW).multiplyScalar(220);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minDistance = 40;
    controls.maxDistance = 1400;
    controls.maxPolarAngle = Math.PI * 0.5;
    controls.target.set(0, 0, 20);

    scene.add(new THREE.HemisphereLight("#ffffff", "#cbc5b8", 2.2));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.6);
    keyLight.position.set(-60, -90, 130);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight("#b8a4ed", 1.1);
    rim.position.set(80, 60, 50);
    scene.add(rim);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 16, screenSpaceRadius: false });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());

    let dirty = true;
    const markDirty = () => { dirty = true; };
    controls.addEventListener("change", markDirty);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const moved = controls.update();
      if (dirty || moved) { composer.render(); dirty = false; }
    };
    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      gtao.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    animate();
    store.current = { scene, camera, controls, gtao, mesh: null, bed: null, loader: null, markDirty };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", markDirty);
      controls.dispose();
      store.current?.loader?.abort();
      if (store.current?.mesh) { scene.remove(store.current.mesh); store.current.mesh.geometry.dispose(); store.current.mesh.material.dispose(); }
      if (store.current?.bed) { scene.remove(store.current.bed); disposeBed(store.current.bed); }
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      store.current = null;
    };
  }, []);

  useEffect(() => {
    const active = store.current;
    if (!active) return;
    setLoading(true);
    const timer = window.setTimeout(() => {
      active.loader?.abort();
      const controller = new AbortController();
      active.loader = controller;
      loadGeometry({ document, demo }, controller.signal)
        .then((raw) => {
          if (controller.signal.aborted) { raw.dispose(); return; }
          // Sit the model on the bed: centre X/Y, drop its base to z = 0.
          raw.computeBoundingBox();
          const bb = raw.boundingBox!;
          raw.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
          // Creased normals keep curves smooth but show real facets (hexagons etc).
          const geometry = toCreasedNormals(raw, THREE.MathUtils.degToRad(35));
          raw.dispose();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const box = geometry.boundingBox!;
          const spanXY = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);

          if (active.mesh) { active.scene.remove(active.mesh); active.mesh.geometry.dispose(); active.mesh.material.dispose(); }
          if (active.bed) { active.scene.remove(active.bed); disposeBed(active.bed); }
          const bed = buildBed(Math.max(60, Math.ceil((spanXY * 1.45) / 10) * 10));
          active.scene.add(bed);
          active.bed = bed;

          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.02 }));
          active.scene.add(mesh);
          active.mesh = mesh;

          active.gtao.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(spanXY * 0.12, 2.5, 22) });
          // Frame on the model, not the plate. Keep whatever angle the visitor
          // has orbited to; only fall back to the house three-quarter view.
          const direction = active.camera.position.clone().sub(active.controls.target);
          if (direction.lengthSq() < 1e-4) direction.copy(DEFAULT_VIEW);
          fitCameraToBox(active.camera, active.controls, box, direction, { padding: 1.16 });
          active.markDirty();
          setLoading(false);
        })
        .catch((error) => { if ((error as Error).name !== "AbortError") setLoading(false); });
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, color]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={mountRef} className="h-full w-full overflow-hidden" aria-label="3D model preview" />
      <span
        className={cn(
          "pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-opacity duration-200",
          loading ? "opacity-100" : "opacity-0",
        )}
      >
        <Loader2 size={12} className="animate-spin" /> compiling geometry
      </span>
      <span className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
        <MousePointer2 size={11} /> drag to orbit
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FontPicker — searchable Google Fonts combobox for the text example.
// ---------------------------------------------------------------------------

const POPULAR_FONTS = ["Poppins", "Space Grotesk", "Bebas Neue", "Pacifico", "Playfair Display", "Lobster"];

function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<string[]>(POPULAR_FONTS);

  useEffect(() => {
    if (!open || fonts.length > POPULAR_FONTS.length) return;
    const controller = new AbortController();
    fetch("/api/fonts", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { fonts?: { family: string }[] }) => {
        if (data.fonts?.length) setFonts(data.fonts.map((f) => f.family));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, fonts.length]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (needle ? fonts.filter((f) => f.toLowerCase().includes(needle)) : fonts).slice(0, 80);
  }, [fonts, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <label className="flex h-10 items-center gap-2 border-b border-border px-3 text-muted-foreground">
            <Search size={13} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Google Fonts…"
              className="w-full bg-transparent text-xs text-foreground outline-none"
            />
          </label>
          <div className="max-h-56 overflow-y-auto p-1">
            {matches.map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => { onChange(font); setOpen(false); setQuery(""); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary",
                  font === value && "bg-secondary font-medium",
                )}
              >
                {font}
                {font === value && <Check size={13} className="text-[var(--accent-tool)]" />}
              </button>
            ))}
            {!matches.length && <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">No fonts match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery — each entry is a real Printa Spec document, drawn in the rail as a
// line-art silhouette of the form it compiles to.
// ---------------------------------------------------------------------------

type Glyph = (props: { className?: string }) => React.ReactElement;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const GLYPH_TEXT: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M5 6h14M12 6v12M9 18h6" /></svg>
);
const GLYPH_VASE: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M9 4c0 3-3 4-3 8s2.5 8 6 8 6-4 6-8-3-5-3-8" /><path d="M9 4h6" /></svg>
);
const GLYPH_TAG: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><rect x="3" y="8" width="18" height="9" rx="4.5" /><circle cx="7" cy="12.5" r="1.6" /><path d="M12 11h5" /></svg>
);
const GLYPH_PRISM: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M6 20 8 4h8l2 16z" /><path d="M7 14h10M7.5 9h9" /></svg>
);
const GLYPH_LANTERN: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M7 4h10l-1.5 16h-7z" /><path d="M10 4c-.6 5.5-.6 10.5 0 16M14 4c.6 5.5.6 10.5 0 16" /></svg>
);
const GLYPH_BOWL: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}><path d="M3 10h18c0 5.5-4 9-9 9s-9-3.5-9-9z" /><path d="M8 10.5c.4 4 .9 6.4 1.6 8M16 10.5c-.4 4-.9 6.4-1.6 8" /></svg>
);

// A circle as four cubic-bezier arcs (kappa ≈ 0.5523), used for the keyring hole.
function circlePath(cx: number, cy: number, r: number) {
  const k = 0.5523 * r;
  return [
    { op: "move", to: [cx + r, cy] },
    { op: "bezier", control1: [cx + r, cy + k], control2: [cx + k, cy + r], to: [cx, cy + r] },
    { op: "bezier", control1: [cx - k, cy + r], control2: [cx - r, cy + k], to: [cx - r, cy] },
    { op: "bezier", control1: [cx - r, cy - k], control2: [cx - k, cy - r], to: [cx, cy - r] },
    { op: "bezier", control1: [cx + k, cy - r], control2: [cx + r, cy - k], to: [cx + r, cy] },
    { op: "close" },
  ];
}

function roundedRectPath(w: number, h: number, r: number) {
  const x = w / 2, y = h / 2;
  return [
    { op: "move", to: [-x + r, -y] },
    { op: "line", to: [x - r, -y] },
    { op: "quadratic", control: [x, -y], to: [x, -y + r] },
    { op: "line", to: [x, y - r] },
    { op: "quadratic", control: [x, y], to: [x - r, y] },
    { op: "line", to: [-x + r, y] },
    { op: "quadratic", control: [-x, y], to: [-x, y - r] },
    { op: "line", to: [-x, -y + r] },
    { op: "quadratic", control: [-x, -y], to: [-x + r, -y] },
    { op: "close" },
  ];
}

type Example = { id: string; name: string; blurb: string; color: string; glyph: Glyph; document: unknown };

const EXAMPLES: Example[] = [
  {
    id: "vase", name: "Rippled vase", blurb: "A spun profile with fluted radial waves.", color: "#7b63ce", glyph: GLYPH_VASE,
    document: { version: "1.0", name: "Rippled vase", units: "mm", root: { kind: "shape", id: "v", source: { type: "revolve", profile: [[26, 0], [34, 40], [30, 90], [24, 130]], wall: 2.2, bottomCap: true, interpolation: "catmull-rom" }, modifiers: [{ type: "radialWave", amplitude: 2.4, count: 12, axialTurns: 0.5 }] } },
  },
  {
    id: "keychain", name: "Name keychain", blurb: "An extruded plate, a keyring hole, raised text.", color: "#e58fb4", glyph: GLYPH_TAG,
    document: {
      version: "1.0", name: "Name keychain", units: "mm",
      root: {
        kind: "assembly", id: "keychain", operation: "merge",
        children: [
          { kind: "shape", id: "plate", source: { type: "extrude", depth: 4, bevel: 0.8, bevelSegments: 3, curveSegments: 18, path: { commands: roundedRectPath(68, 26, 8), holes: [circlePath(-27, 0, 3.6)] } }, material: "pla-silk" },
          { kind: "shape", id: "label", source: { type: "text", text: "LUCK", font: "Poppins", size: 13, depth: 3, bevel: 0.35, bevelSide: "top" }, transform: { translate: [5, 0, 4], rotate: [0, 0, 0], scale: 1 } },
        ],
      },
    },
  },
  {
    id: "prism", name: "Prism vase", blurb: "A square column with a helical twist and taper.", color: "#4aa3c9", glyph: GLYPH_PRISM,
    document: { version: "1.0", name: "Prism vase", units: "mm", root: { kind: "shape", id: "p", source: { type: "primitive", shape: "box", width: 46, depth: 46, height: 128, segments: 10 }, modifiers: [{ type: "twist", angleDeg: 150, start: 0, end: 1 }, { type: "taper", from: 1, to: 0.62 }] } },
  },
  {
    id: "lantern", name: "Twisted lantern", blurb: "A fluted column twisted along its height.", color: "#ff4d8b", glyph: GLYPH_LANTERN,
    document: { version: "1.0", name: "Twisted lantern", units: "mm", root: { kind: "shape", id: "l", source: { type: "primitive", shape: "cylinder", radius: 26, height: 120, segments: 5 }, modifiers: [{ type: "radialWave", amplitude: 3, count: 5, axialTurns: 0 }, { type: "twist", angleDeg: 150, start: 0, end: 1 }, { type: "taper", from: 1, to: 0.72 }] } },
  },
  {
    id: "bowl", name: "Fluted bowl", blurb: "A shallow spun bowl with soft flutes.", color: "#e8934a", glyph: GLYPH_BOWL,
    document: { version: "1.0", name: "Fluted bowl", units: "mm", root: { kind: "shape", id: "w", source: { type: "revolve", profile: [[10, 0], [46, 8], [52, 34], [50, 40]], wall: 2.4, bottomCap: true, interpolation: "catmull-rom" }, modifiers: [{ type: "radialWave", amplitude: 1.6, count: 20, axialTurns: 0 }] } },
  },
];

// ---------------------------------------------------------------------------
// Workbench — the whole product in one block: pick a form on the left, watch it
// compile in the middle, tweak and download underneath.
// ---------------------------------------------------------------------------

function Workbench() {
  const [active, setActive] = useState("text");
  const [text, setText] = useState("PRINTA");
  const [font, setFont] = useState("Poppins");
  const [depth, setDepth] = useState(14);

  const yourText = useMemo(() => textDoc({ text, font, depth, size: 32 }), [text, font, depth]);
  const example = EXAMPLES.find((item) => item.id === active);
  const document = example ? example.document : yourText;
  const color = example ? example.color : "#ff4d8b";
  const name = example ? example.name : text || "Your text";
  const blurb = example ? example.blurb : "Any Google font, extruded and bevelled.";
  const filename = `${(example ? example.id : text || "printa").toLowerCase()}.stl`;

  const items: { id: string; name: string; glyph: Glyph }[] = [
    { id: "text", name: "Your text", glyph: GLYPH_TEXT },
    ...EXAMPLES.map(({ id, name: label, glyph }) => ({ id, name: label, glyph })),
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="grid lg:grid-cols-[188px_minmax(0,1fr)]">
        {/* Gallery rail */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-border p-2.5 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
          {items.map((item) => {
            const on = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                aria-pressed={on}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors lg:w-full",
                  on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.glyph className="size-[22px] shrink-0" />
                <span className="whitespace-nowrap">{item.name}</span>
              </button>
            );
          })}
          <p className="mt-auto hidden px-2.5 pb-1 pt-6 text-[11px] leading-relaxed text-muted-foreground lg:block">
            Every form here is a Printa Spec document, compiled to a mesh on request — the same pipeline the editor and the ChatGPT app use.
          </p>
        </div>

        {/* Stage + controls */}
        <div className="min-w-0">
          <ModelStage
            document={document}
            color={color}
            className="h-[300px] w-full bg-[radial-gradient(circle_at_50%_-10%,#f7f3ff,transparent_72%)] sm:h-[400px]"
          />
          <div className="grid gap-3 border-t border-border p-4">
            {!example && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Your text</span>
                  <input
                    value={text}
                    maxLength={16}
                    onChange={(e) => setText(e.target.value.toUpperCase())}
                    placeholder="Type something…"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </label>
                <div className="grid gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Font</span>
                  <FontPicker value={font} onChange={setFont} />
                </div>
                <label className="grid gap-1.5">
                  <span className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    Extrusion <span className="tabular-nums text-foreground">{depth} mm</span>
                  </span>
                  <input
                    type="range"
                    min={3}
                    max={40}
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                    className="h-10 w-full accent-[#ff4d8b]"
                  />
                </label>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{blurb}</p>
              </div>
              <a
                href={editorUrl(document)}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-3.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Open in editor <ArrowRight size={14} />
              </a>
              <a
                href={downloadUrl(document)}
                download={filename}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Download size={15} /> Download STL
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

type GalleryItem = {
  id: string;
  name: string;
  note: string;
  tag: string;
  color: string;
  document?: unknown;
  demo?: string;
  href?: string;
};

/**
 * What the engine makes, shown rather than described.
 *
 * Both place captures sit next to the hand-built forms so the difference
 * between a photogrammetric surface and mapped outlines is visible side by
 * side. Every tile compiles its own STL through the same endpoint the editor
 * uses, so none of this can drift from what actually builds.
 */
const GALLERY: GalleryItem[] = [
  {
    id: "sydney-cbd",
    name: "Sydney CBD",
    note: "Photogrammetric surface — towers, trees and the harbour edge, captured from Google 3D tiles.",
    tag: "Place · Surface",
    color: "#9aa4b8",
    demo: "place-sydney-cbd",
    href: "/places/sydney-cbd",
  },
  {
    id: "manhattan-midtown",
    name: "Midtown Manhattan",
    note: "Mapped outlines — OpenStreetMap footprints extruded into crisp blocks over sampled ground.",
    tag: "Place · Mapped",
    color: "#9aa4b8",
    demo: "place-manhattan-midtown",
    href: "/places/manhattan-midtown",
  },
  {
    id: "san-francisco-downtown",
    name: "Downtown San Francisco",
    note: "Mapped outlines on genuine hills — blocks step up the slope instead of sitting flat.",
    tag: "Place · Mapped",
    color: "#9aa4b8",
    demo: "place-san-francisco-downtown",
    href: "/places/san-francisco-downtown",
  },
  {
    id: "contour-spiral-vase",
    name: "Contour spiral vase",
    note: "A revolved profile with fine helical ribs and a wall thickness that slices without infill.",
    tag: "Revolve",
    color: "#7b63ce",
    demo: "contour-spiral-vase",
  },
  {
    id: "type-specimen",
    name: "Type specimen",
    note: "Any of 1,900+ Google Fonts, extruded and bevelled to an exact letter height.",
    tag: "Text",
    color: "#e58fb4",
    demo: "type-specimen",
  },
  {
    id: "cellular-lattice",
    name: "Cellular lattice",
    note: "A Voronoi strut lattice — light, rigid, and solid enough to print without infill.",
    tag: "Lattice",
    color: "#4aa3c9",
    demo: "cellular-lattice",
  },
];

function Gallery() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {GALLERY.map((item) => (
        <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
          <ModelStage document={item.document} demo={item.demo} color={item.color} className="h-48 w-full" />
          <div className="border-t border-border p-3.5">
            <div className="flex items-center gap-2">
              <p className="font-heading text-sm font-semibold">{item.name}</p>
              <span className="ml-auto shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {item.tag}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.note}</p>
            <div className="mt-3 flex items-center gap-2">
              <a
                href={refDownloadUrl(item)}
                download={`${item.id}.stl`}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-medium hover:bg-secondary"
              >
                <Download size={12} /> STL
              </a>
              <Link
                href={item.href ?? refEditorUrl(item)}
                className="flex h-7 items-center gap-1 rounded-lg bg-secondary px-2 text-[11px] font-medium hover:bg-secondary/70"
              >
                {item.href ? "About" : "Open"} <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  { label: "Ask", body: "Describe it in plain words — “a sign that says SYDNEY”." },
  { label: "Refine", body: "Taller, rounder, a softer font. The model updates as you talk." },
  { label: "Print", body: "Download a watertight STL that works in any slicer." },
];

const PRO_FEATURES = [
  "Every format — 3MF, OBJ, STEP",
  "Cloth & water sim",
  "Voronoi noise & lattices",
  "Organic growth",
  "Struts & smart seams",
  "Projects & chat history",
];

export function HomePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-heading text-[15px] font-semibold tracking-tight" aria-label="Printa home">
            <Image src="/printa-logo.png" alt="" width={26} height={26} priority />
            Printa
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/chat" className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex">
              <MessageSquareText size={15} /> Chat
            </Link>
            <Link href="/editor" className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Open editor <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — short copy, then the product itself */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Turn words into<br /><span className="text-[#ff4d8b]">printable objects.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Describe an object and Printa builds a real, watertight 3D model. Everything below is compiled live — pick a form, change it, download the STL.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Watertight, print-ready</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Any Google font</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Free, no sign-up</span>
          </div>
        </div>

        <div className="mt-10">
          <Workbench />
        </div>
      </section>

      {/* How it works — one compact strip */}
      <section id="how" className="border-y border-border bg-secondary/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--accent-tool-soft)] font-mono text-[11px] font-semibold text-[var(--accent-tool)]">
                {i + 1}
              </span>
              <div>
                <h2 className="font-heading text-base font-semibold tracking-tight">{step.label}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Real models, compiled on this page
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Type, vessels and lattices — and whole cities, captured from photogrammetry
            or mapped outlines. Every tile is a live STL, not a screenshot.
          </p>
        </div>
        <div className="mt-10">
          <Gallery />
        </div>
        <div className="mt-6 flex justify-center">
          <Link
            href="/places"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            Browse every place <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Start free. Go further with Pro.</h2>
          <p className="mt-3 text-[15px] text-muted-foreground">The editor, chat and STL export are free forever.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
            <h3 className="font-heading text-lg font-semibold tracking-tight">Free</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-heading text-4xl font-semibold tracking-tight">$0</span>
              <span className="text-sm text-muted-foreground">/ forever</span>
            </div>
            <ul className="mt-5 grid gap-2.5 text-sm">
              {["Visual editor & procedural modeling", "Text, shapes, revolves & modifiers", "Watertight STL download", "MCP endpoint for ChatGPT"].map((item) => (
                <li key={item} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-500" /> {item}</li>
              ))}
            </ul>
            <Link href="/editor" className="mt-6 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-medium transition-colors hover:bg-secondary">
              Open the editor <ArrowRight size={15} />
            </Link>
          </div>

          <div className="relative flex flex-col rounded-2xl border-2 border-foreground bg-card p-6">
            <span className="absolute -top-3 left-6 flex items-center gap-1 rounded-full bg-[#ff4d8b] px-2.5 py-0.5 text-[11px] font-semibold text-white">
              <Sparkles size={11} /> Pro
            </span>
            <h3 className="font-heading text-lg font-semibold tracking-tight">Pro</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-heading text-4xl font-semibold tracking-tight">$10</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            <ul className="mt-5 grid gap-2.5 text-sm sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {PRO_FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--accent-tool)]" /> {item}</li>
              ))}
            </ul>
            <a href="/chat" className="mt-6 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Go Pro — $10/mo
            </a>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
              <Lock size={11} /> Billing launches soon — early makers lock in this price.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/printa-logo.png" alt="" width={22} height={22} />
            <span className="font-heading font-semibold text-foreground">Printa</span>
            <span>· Ideas in. Objects out.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/editor" className="hover:text-foreground">Editor</Link>
            <Link href="/chat" className="hover:text-foreground">Chat</Link>
            <a href="/mcp" className="hover:text-foreground">MCP</a>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
