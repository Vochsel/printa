"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Braces,
  Check,
  ChevronDown,
  Download,
  FileBox,
  FolderKanban,
  Grid3x3,
  History,
  Loader2,
  Lock,
  MessageSquareText,
  MousePointer2,
  Search,
  Sprout,
  Tag,
  Waves,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared: everything on this page is built from the platform's real schema and
// compiled by the same /api/model/stl pipeline the editor and MCP tools use.
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

async function loadGeometry(document: unknown, signal: AbortSignal) {
  const response = await fetch(previewUrl(document), { signal });
  if (!response.ok) throw new Error(`model ${response.status}`);
  const geometry = new STLLoader().parse(await response.arrayBuffer());
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function frameGeometry(camera: THREE.PerspectiveCamera, controls: OrbitControls, sphere: THREE.Sphere) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (sphere.radius / Math.sin(fov / 2)) * 1.15;
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-4) direction.set(0.4, -0.85, 0.7);
  direction.normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.updateProjectionMatrix();
  controls.update();
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
// ModelStage — one reusable WebGL viewport. Recompiles when `document` changes.
// ---------------------------------------------------------------------------

// A fake 3D-printer build plate + grid the model sits on, sized to the model.
function buildBed(size: number) {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: "#f1ede3", roughness: 0.97, metalness: 0 }),
  );
  plate.position.z = -0.15;
  plate.receiveShadow = true;
  group.add(plate);
  const divisions = Math.max(6, Math.round(size / 10));
  const grid = new THREE.GridHelper(size, divisions, "#c4bdac", "#e1dbcd");
  grid.rotation.x = Math.PI / 2;
  group.add(grid);
  return group;
}

function disposeBed(bed: THREE.Group) {
  bed.traverse((child) => {
    if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
    if (child instanceof THREE.GridHelper) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
  });
}

type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer;
  gtao: GTAOPass;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
  bed: THREE.Group | null;
  loader: AbortController | null;
  markDirty: () => void;
};

function ModelStage({ document, color = "#ff4d8b", className }: { document: unknown; color?: string; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const store = useRef<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const specKey = useMemo(() => JSON.stringify(document), [document]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 4000);
    camera.up.set(0, 0, 1);
    camera.position.set(90, -150, 115);

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
    store.current = { scene, camera, controls, composer, gtao, mesh: null, bed: null, loader: null, markDirty };

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
      loadGeometry(document, controller.signal)
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
          const heightZ = box.max.z - box.min.z;

          if (active.mesh) { active.scene.remove(active.mesh); active.mesh.geometry.dispose(); active.mesh.material.dispose(); }
          if (active.bed) { active.scene.remove(active.bed); disposeBed(active.bed); }
          const bed = buildBed(Math.max(70, Math.ceil((spanXY * 2.1) / 10) * 10));
          active.scene.add(bed);
          active.bed = bed;

          const material = new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.02 });
          const mesh = new THREE.Mesh(geometry, material);
          active.scene.add(mesh);
          active.mesh = mesh;

          active.gtao.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(spanXY * 0.12, 2.5, 22) });
          frameGeometry(active.camera, active.controls, new THREE.Sphere(new THREE.Vector3(0, 0, heightZ / 2), geometry.boundingSphere!.radius));
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
      {loading && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
          <Loader2 size={12} className="animate-spin" /> generating geometry
        </div>
      )}
      <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
        <MousePointer2 size={11} /> drag to orbit
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FontPicker — searchable Google Fonts combobox for the hero playground.
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
    const list = needle ? fonts.filter((f) => f.toLowerCase().includes(needle)) : fonts;
    return list.slice(0, 80);
  }, [fonts, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <label className="flex h-9 items-center gap-2 border-b border-border px-2.5 text-muted-foreground">
            <Search size={13} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts…"
              className="w-full bg-transparent text-xs outline-none"
            />
          </label>
          <div className="max-h-56 overflow-y-auto p-1">
            {matches.map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => { onChange(font); setOpen(false); setQuery(""); }}
                className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-secondary", font === value && "bg-secondary font-medium")}
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
// Hero playground — editable text, font, extrusion → live model + real STL.
// ---------------------------------------------------------------------------

function TextPlayground() {
  const [text, setText] = useState("PRINTA");
  const [font, setFont] = useState("Poppins");
  const [depth, setDepth] = useState(14);
  const document = useMemo(() => textDoc({ text, font, depth, size: 32 }), [text, font, depth]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between rounded-t-2xl border-b border-border px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="size-1.5 rounded-full bg-[#ff4d8b]" /> live playground
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">source · text</span>
      </div>
      <ModelStage document={document} color="#ff4d8b" className="h-64 w-full bg-[radial-gradient(circle_at_50%_0%,#faf7ff,transparent_70%)] sm:h-72" />
      <div className="grid gap-3 border-t border-border p-3.5">
        <div className="grid gap-1.5">
          <label htmlFor="pg-text" className="text-[11px] font-medium text-muted-foreground">Your text</label>
          <input
            id="pg-text"
            value={text}
            maxLength={16}
            onChange={(e) => setText(e.target.value.toUpperCase())}
            placeholder="Type something…"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Font</label>
            <FontPicker value={font} onChange={setFont} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="pg-depth" className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              Extrusion <span className="font-mono text-foreground">{depth} mm</span>
            </label>
            <input
              id="pg-depth"
              type="range"
              min={3}
              max={40}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="h-9 w-full accent-[#ff4d8b]"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={downloadUrl(document)}
            download={`${(text || "printa").toLowerCase()}.stl`}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download size={15} /> Download STL
          </a>
          <a
            href={editorUrl(document)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Open in editor <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story chat — three steps of one user's conversation, model updating live.
// ---------------------------------------------------------------------------

type StoryStep = { step: string; user: string; reply: string; tool: string; args: string; document: unknown };

const STORY: StoryStep[] = [
  {
    step: "Ask",
    user: "Make a sign that says SYDNEY, about 4 cm tall.",
    reply: "Here's SYDNEY in Space Grotesk.",
    tool: "build_model",
    args: "text · SYDNEY · 42 mm",
    document: textDoc({ text: "SYDNEY", font: "Space Grotesk", depth: 6, size: 42 }),
  },
  {
    step: "Refine",
    user: "Taller, and round the edges a bit.",
    reply: "Bumped it to 60 mm with a soft bevel.",
    tool: "build_model",
    args: "height 60 · soft edges",
    document: textDoc({ text: "SYDNEY", font: "Space Grotesk", depth: 10, size: 60 }),
  },
  {
    step: "Print",
    user: "Perfect — can I download it?",
    reply: "Here's your print-ready STL. ✓",
    tool: "build_model",
    args: "SYDNEY.stl ready",
    document: textDoc({ text: "SYDNEY", font: "Space Grotesk", depth: 10, size: 60 }),
  },
];

// Each step plays out as three beats so the user message, the "generating"
// spinner, and the assistant reply never appear at the same instant.
type Beat = { step: number; phase: "user" | "gen" | "reply" };
const BEATS: Beat[] = STORY.flatMap((_, step) => [
  { step, phase: "user" as const },
  { step, phase: "gen" as const },
  { step, phase: "reply" as const },
]);
const DWELL: Record<Beat["phase"], number> = { user: 1300, gen: 1500, reply: 1900 };

function StoryChat() {
  const [beatIndex, setBeatIndex] = useState(BEATS.length - 1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let index = -1;
    let timer = 0;
    const tick = () => {
      index = (index + 1) % BEATS.length;
      setBeatIndex(index);
      timer = window.setTimeout(tick, DWELL[BEATS[index].phase]);
    };
    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, []);

  const beat = BEATS[beatIndex];
  // On "user" the model still shows the previous state; it starts regenerating
  // on "gen" (viewport spinner) and is ready by "reply".
  const activeDoc = beat.phase === "user" ? STORY[Math.max(0, beat.step - 1)].document : STORY[beat.step].document;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <Image src="/printa-logo.png" alt="" width={18} height={18} />
          <span className="font-mono text-[11px] text-muted-foreground">printa · chat</span>
        </div>
        <div className="flex min-h-[220px] flex-col gap-2.5 p-3.5">
          {STORY.slice(0, beat.step + 1).map((step, i) => {
            const isCurrent = i === beat.step;
            const showReply = !isCurrent || beat.phase === "reply";
            const showGen = isCurrent && beat.phase === "gen";
            return (
              <div key={i} className="flex flex-col gap-2">
                <span className="w-fit rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">0{i + 1} · {step.step}</span>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3 py-2 text-sm text-background">{step.user}</div>
                {showGen && (
                  <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> generating geometry…
                  </div>
                )}
                {showReply && (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm">
                    <span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"><Braces size={11} /> {step.tool} · {step.args} <Check size={11} className="text-emerald-500" /></span>
                    {step.reply}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <ModelStage document={activeDoc} color="#ff4d8b" className="h-64 w-full sm:h-[420px]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Showcase — many real examples, compiled from their actual schema on demand.
// ---------------------------------------------------------------------------

type Example = { id: string; name: string; blurb: string; color: string; document: unknown };

// A circle as four cubic-bezier arcs (kappa ≈ 0.5523), used for the keychain hole.
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

const KEYCHAIN = {
  version: "1.0", name: "Name keychain", units: "mm",
  root: {
    kind: "assembly", id: "keychain", operation: "merge",
    children: [
      { kind: "shape", id: "plate", source: { type: "extrude", depth: 4, bevel: 0.8, bevelSegments: 3, curveSegments: 18, path: { commands: roundedRectPath(68, 26, 8), holes: [circlePath(-27, 0, 3.6)] } }, material: "pla-silk" },
      { kind: "shape", id: "label", source: { type: "text", text: "LUCK", font: "Poppins", size: 13, depth: 3, bevel: 0.35, bevelSide: "top" }, transform: { translate: [5, 0, 4], rotate: [0, 0, 0], scale: 1 } },
    ],
  },
};

const EXAMPLES: Example[] = [
  {
    id: "vase", name: "Rippled vase", blurb: "A revolved profile with fluted radial waves.", color: "#7b63ce",
    document: { version: "1.0", name: "Rippled vase", units: "mm", root: { kind: "shape", id: "v", source: { type: "revolve", profile: [[26, 0], [34, 40], [30, 90], [24, 130]], wall: 2.2, bottomCap: true, interpolation: "catmull-rom" }, modifiers: [{ type: "radialWave", amplitude: 2.4, count: 12, axialTurns: 0.5 }] } },
  },
  {
    id: "keychain", name: "Name keychain", blurb: "An extruded plate with a keyring hole and raised text.", color: "#e58fb4",
    document: KEYCHAIN,
  },
  {
    id: "prism", name: "Prism vase", blurb: "A square column with a smooth helical twist and taper.", color: "#4aa3c9",
    document: { version: "1.0", name: "Prism vase", units: "mm", root: { kind: "shape", id: "p", source: { type: "primitive", shape: "box", width: 46, depth: 46, height: 128, segments: 10 }, modifiers: [{ type: "twist", angleDeg: 150, start: 0, end: 1 }, { type: "taper", from: 1, to: 0.62 }] } },
  },
  {
    id: "spiral", name: "Spiral vessel", blurb: "A revolved vase twisted into a spiral.", color: "#c05fe0",
    document: { version: "1.0", name: "Spiral vessel", units: "mm", root: { kind: "shape", id: "s", source: { type: "revolve", profile: [[22, 0], [30, 50], [26, 110], [20, 150]], wall: 2, bottomCap: true, interpolation: "catmull-rom" }, modifiers: [{ type: "radialWave", amplitude: 3, count: 6, axialTurns: 1.5 }, { type: "twist", angleDeg: 60, start: 0, end: 1 }] } },
  },
  {
    id: "lantern", name: "Twisted lantern", blurb: "A fluted column twisted along its full height.", color: "#ff4d8b",
    document: { version: "1.0", name: "Twisted lantern", units: "mm", root: { kind: "shape", id: "l", source: { type: "primitive", shape: "cylinder", radius: 26, height: 120, segments: 5 }, modifiers: [{ type: "radialWave", amplitude: 3, count: 5, axialTurns: 0 }, { type: "twist", angleDeg: 150, start: 0, end: 1 }, { type: "taper", from: 1, to: 0.72 }] } },
  },
  {
    id: "bowl", name: "Fluted bowl", blurb: "A shallow revolved bowl with soft flutes.", color: "#e8934a",
    document: { version: "1.0", name: "Fluted bowl", units: "mm", root: { kind: "shape", id: "w", source: { type: "revolve", profile: [[10, 0], [46, 8], [52, 34], [50, 40]], wall: 2.4, bottomCap: true, interpolation: "catmull-rom" }, modifiers: [{ type: "radialWave", amplitude: 1.6, count: 20, axialTurns: 0 }] } },
  },
];

function Showcase() {
  const [active, setActive] = useState(0);
  const example = EXAMPLES[active];
  const json = useMemo(() => JSON.stringify(example.document, null, 2), [example]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                i === active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-secondary",
              )}
            >
              {ex.name}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ModelStage document={example.document} color={example.color} className="h-72 w-full sm:h-80" />
          <div className="flex flex-wrap items-center gap-2 border-t border-border p-3.5">
            <div className="mr-auto">
              <p className="text-sm font-semibold">{example.name}</p>
              <p className="text-xs text-muted-foreground">{example.blurb}</p>
            </div>
            <a href={downloadUrl(example.document)} download={`${example.id}.stl`} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-secondary"><Download size={13} /> STL</a>
            <a href={editorUrl(example.document)} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Open <ArrowRight size={13} /></a>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-[#0e0e12]">
        <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-white/50"><Braces size={12} /> printa spec — compiled live</span>
          <span className="font-mono text-[11px] text-white/40">{example.id}.json</span>
        </div>
        <pre className="max-h-[26rem] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-[#c9d1e6]"><code>{json}</code></pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const STEPS = [
  { icon: MessageSquareText, label: "Ask", title: "Say what you want", body: "Type it in plain words — “a sign that says SYDNEY”. No modeling, no menus." },
  { icon: MousePointer2, label: "Refine", title: "Tweak by talking", body: "Taller, rounder, a softer font. Every message updates the real 3D model." },
  { icon: Download, label: "Print", title: "Download the file", body: "Get a watertight STL that works with any slicer and any 3D printer." },
];

const PRO_FEATURES = [
  { icon: FileBox, title: "Every format", body: "Export 3MF, OBJ and STEP — not just STL." },
  { icon: Waves, title: "Cloth & water sim", body: "Drape fabric and pour fluid that settles over your scene." },
  { icon: Grid3x3, title: "Voronoi noise", body: "Cellular textures and lightweight lattice infills." },
  { icon: Sprout, title: "Organic growth", body: "Grow branching, coral-like structures procedurally." },
  { icon: Boxes, title: "Struts & smart seams", body: "Auto interior bracing and seams placed where they hide." },
  { icon: FolderKanban, title: "Projects", body: "Save, organise and revisit everything you make." },
  { icon: History, title: "Chat history", body: "Your whole conversation, kept and searchable." },
  { icon: Tag, title: "Print-on-demand discounts", body: "Order finished prints at member pricing." },
];

function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#ff4d8b]">{kicker}</span>
      <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function HomePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-heading text-[15px] font-semibold tracking-tight" aria-label="Printa home">
            <Image src="/printa-logo.png" alt="" width={26} height={26} priority />
            Printa
            <span className="rounded border border-border px-1 py-0.5 font-mono text-[9px] font-medium text-muted-foreground">alpha</span>
          </Link>
          <div className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#showcase" className="hover:text-foreground">Showcase</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link href="/chat" className="hover:text-foreground">Chat</Link>
          </div>
          <Link href="/editor" className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:ml-0">
            Open editor <ArrowRight size={15} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:py-20">
        <div>
          <h1 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Turn words into<br /><span className="text-[#ff4d8b]">printable objects.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Describe an object in plain language and Printa builds a real, watertight 3D model — ready to download and print. Start right here: edit the text, pick a font, grab the STL.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/editor" className="flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Start creating <ArrowRight size={16} />
            </Link>
            <Link href="/chat" className="flex h-11 items-center gap-2 rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-secondary">
              <MessageSquareText size={16} /> Chat to create
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Watertight, print-ready</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Any Google font</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Free editor, no sign-up</span>
          </div>
        </div>
        <TextPlayground />
      </section>

      {/* How it works — one story */}
      <section id="how" className="border-t border-border bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead kicker="How it works" title="From a sentence to a solid" sub="Three steps, one conversation. Watch a real thread take an idea to a printable file." />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, label, title, body }, i) => (
              <article key={label} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-lg bg-[var(--accent-tool-soft)] text-[var(--accent-tool)]"><Icon size={18} /></span>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">0{i + 1} · {label}</span>
                </div>
                <h3 className="mt-4 font-heading text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
          <div className="mt-8">
            <StoryChat />
          </div>
        </div>
      </section>

      {/* Showcase */}
      <section id="showcase" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead kicker="Showcase" title="Everything here is really compiled" sub="Pick an example — the model on the left is built from the exact schema on the right, by the same engine that powers the editor." />
          <div className="mt-10">
            <Showcase />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead kicker="Pricing" title="Start free. Go further with Pro." sub="The editor, chat and STL export are free. Pro unlocks the heavy machinery." />
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
            {/* Free */}
            <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
              <h3 className="font-heading text-lg font-semibold tracking-tight">Free</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-heading text-4xl font-semibold tracking-tight">$0</span>
                <span className="text-sm text-muted-foreground">/ forever</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Everything you need to make and print.</p>
              <ul className="mt-5 grid gap-2.5 text-sm">
                {["Visual editor & procedural modeling", "Text, shapes, revolves & modifiers", "Watertight STL download", "MCP endpoint for ChatGPT"].map((item) => (
                  <li key={item} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-500" /> {item}</li>
                ))}
              </ul>
              <Link href="/editor" className="mt-6 flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-secondary">
                Open the editor <ArrowRight size={15} />
              </Link>
            </div>
            {/* Pro */}
            <div className="relative flex flex-col rounded-2xl border-2 border-foreground bg-card p-6">
              <span className="absolute -top-3 left-6 rounded-full bg-[#ff4d8b] px-2.5 py-0.5 text-[11px] font-semibold text-white">Pro</span>
              <h3 className="font-heading text-lg font-semibold tracking-tight">Pro</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-heading text-4xl font-semibold tracking-tight">$10</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">For makers who want the full toolbox.</p>
              <ul className="mt-5 grid gap-2.5 text-sm">
                {PRO_FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-[var(--accent-tool-soft)] text-[var(--accent-tool)]"><Icon size={12} /></span>
                    <span><span className="font-medium">{title}</span> <span className="text-muted-foreground">— {body}</span></span>
                  </li>
                ))}
              </ul>
              <a href="/chat" className="mt-6 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Go Pro — $10/mo
              </a>
              <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground"><Lock size={11} /> Billing launches soon — early makers lock in this price.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <Image src="/printa-logo.png" alt="" width={48} height={48} className="mx-auto" />
        <h2 className="mt-5 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Make something real.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-muted-foreground">From an idea to a printable file in a couple of minutes.</p>
        <Link href="/editor" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          Start creating <ArrowRight size={16} />
        </Link>
      </section>

      {/* Footer */}
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
