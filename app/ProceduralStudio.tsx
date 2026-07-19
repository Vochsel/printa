"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Braces,
  Check,
  Download,
  Droplets,
  Focus,
  Layers3,
  LoaderCircle,
  Play,
  Rotate3D,
  ScrollText,
  Sparkles,
  Waves,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { DEMO_MODEL_CARDS, type DemoModelId } from "@/lib/demo-models";
import { printMaterialPreset, type PrintMaterialPreset } from "@/lib/material-presets";
import type { ModelDocument } from "@/lib/model-spec";
import { SpecInspector } from "@/app/SpecInspector";

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

type FontSummary = { id: string; family: string; category: string };
type PreviewSource = { key: string; url?: string; buffer?: ArrayBuffer };

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

function createDimensionLabel(text: string, color: string, worldSize: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(10, 26, 25, 0.92)";
  context.beginPath();
  context.roundRect(3, 3, 506, 122, 24);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = "#fffaf0";
  context.font = "700 48px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldSize * 4, worldSize), material);
  mesh.renderOrder = 12;
  return mesh;
}

function createGroundDimensions(box: THREE.Box3, display: ModelDocument["display"], units: ModelDocument["units"]) {
  const group = new THREE.Group();
  group.name = "spec-ground-dimensions";
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;
  const largest = Math.max(width, height);
  const unitScale = units === "cm" ? 10 : units === "in" ? 25.4 : 1;
  const margin = Math.max(display.dimensions.offset * unitScale, largest * 0.045);
  const arrow = THREE.MathUtils.clamp(largest * 0.025, 2.5, 9);
  const labelSize = THREE.MathUtils.clamp(largest * 0.035, 4, 10);
  const z = 0.32;
  const widthY = box.min.y - margin;
  const heightX = box.min.x - margin;
  const precision = display.dimensions.precision;
  const suffix = units;
  const inUnits = (value: number) => value / unitScale;
  const addSegments = (points: THREE.Vector3[], color: string, opacity = 1) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false }));
    lines.renderOrder = 10;
    group.add(lines);
  };
  if (display.dimensions.width) {
    addSegments([
      new THREE.Vector3(box.min.x, widthY, z), new THREE.Vector3(box.max.x, widthY, z),
      new THREE.Vector3(box.min.x, widthY, z), new THREE.Vector3(box.min.x + arrow, widthY + arrow * .52, z),
      new THREE.Vector3(box.min.x, widthY, z), new THREE.Vector3(box.min.x + arrow, widthY - arrow * .52, z),
      new THREE.Vector3(box.max.x, widthY, z), new THREE.Vector3(box.max.x - arrow, widthY + arrow * .52, z),
      new THREE.Vector3(box.max.x, widthY, z), new THREE.Vector3(box.max.x - arrow, widthY - arrow * .52, z),
      new THREE.Vector3(box.min.x, box.min.y, z), new THREE.Vector3(box.min.x, widthY - arrow, z),
      new THREE.Vector3(box.max.x, box.min.y, z), new THREE.Vector3(box.max.x, widthY - arrow, z),
    ], "#ff6b8f");
    const label = createDimensionLabel(`W  ${inUnits(width).toFixed(precision)} ${suffix}`, "#ff6b8f", labelSize);
    label.position.set((box.min.x + box.max.x) / 2, widthY - labelSize * 1.05, z + .03);
    group.add(label);
  }
  if (display.dimensions.height) {
    addSegments([
      new THREE.Vector3(heightX, box.min.y, z), new THREE.Vector3(heightX, box.max.y, z),
      new THREE.Vector3(heightX, box.min.y, z), new THREE.Vector3(heightX + arrow * .52, box.min.y + arrow, z),
      new THREE.Vector3(heightX, box.min.y, z), new THREE.Vector3(heightX - arrow * .52, box.min.y + arrow, z),
      new THREE.Vector3(heightX, box.max.y, z), new THREE.Vector3(heightX + arrow * .52, box.max.y - arrow, z),
      new THREE.Vector3(heightX, box.max.y, z), new THREE.Vector3(heightX - arrow * .52, box.max.y - arrow, z),
      new THREE.Vector3(box.min.x, box.min.y, z), new THREE.Vector3(heightX - arrow, box.min.y, z),
      new THREE.Vector3(box.min.x, box.max.y, z), new THREE.Vector3(heightX - arrow, box.max.y, z),
    ], "#b8a4ed");
    const label = createDimensionLabel(`H  ${inUnits(height).toFixed(precision)} ${suffix}`, "#b8a4ed", labelSize);
    label.rotation.z = Math.PI / 2;
    label.position.set(heightX - labelSize * 1.05, (box.min.y + box.max.y) / 2, z + .03);
    group.add(label);
  }
  return group;
}

function disposeObject(object: THREE.Object3D | null) {
  object?.traverse((child) => {
    const item = child as THREE.Mesh | THREE.LineSegments;
    item.geometry?.dispose();
    const materials = item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : [];
    materials.forEach((material) => {
      if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    });
  });
}

function createPreviewMaterial(materialPreset: PrintMaterialPreset) {
  const preset = printMaterialPreset(materialPreset);
  return new THREE.MeshPhysicalMaterial({
    color: preset.color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    transmission: preset.transmission,
    thickness: preset.transmission ? 2.2 : 0,
    emissive: preset.id === "pla-orange" ? "#401006" : "#000000",
    emissiveIntensity: preset.id === "pla-orange" ? 0.12 : 0,
  });
}

function ModelViewport({ source, materialPreset, display, units, onReady }: { source: PreviewSource; materialPreset: PrintMaterialPreset; display: ModelDocument["display"]; units: ModelDocument["units"]; onReady?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<() => void>(() => undefined);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const modelRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null>(null);
  const dimensionsRef = useRef<THREE.Group | null>(null);
  const invalidateRef = useRef<(frames?: number) => void>(() => undefined);
  const hasFramedRef = useRef(false);
  const displayRef = useRef(display);
  const unitsRef = useRef(units);
  const materialPresetRef = useRef(materialPreset);

  useEffect(() => {
    displayRef.current = display;
    unitsRef.current = units;
    materialPresetRef.current = materialPreset;
  }, [display, materialPreset, units]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#11110f");
    scene.fog = new THREE.Fog("#11110f", 440, 900);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);
    camera.up.set(0, 0, 1);
    camera.position.set(170, -210, 150);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.target.set(0, 0, 55);
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight("#fff7e8", "#182241", 2.5));
    const key = new THREE.DirectionalLight("#fff0d5", 5.4);
    key.position.set(-120, -150, 240);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#748cff", 4.2);
    rim.position.set(150, 100, 150);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(240, 128),
      new THREE.MeshStandardMaterial({ color: "#191916", roughness: 0.86, metalness: 0.08 }),
    );
    floor.receiveShadow = true;
    floor.position.z = -0.3;
    scene.add(floor);
    floorRef.current = floor;
    const grid = new THREE.GridHelper(420, 42, "#363631", "#272724");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.05;
    scene.add(grid);
    gridRef.current = grid;

    let animationFrame = 0;
    let interacting = false;
    let remainingFrames = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      if (interacting || remainingFrames > 0) {
        remainingFrames = Math.max(0, remainingFrames - 1);
        animationFrame = requestAnimationFrame(render);
      } else animationFrame = 0;
    };
    const invalidate = (frames = 2) => {
      remainingFrames = Math.max(remainingFrames, frames);
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    };
    invalidateRef.current = invalidate;
    const startInteraction = () => { interacting = true; invalidate(2); };
    const endInteraction = () => { interacting = false; invalidate(24); };
    const change = () => invalidate(2);
    controls.addEventListener("start", startInteraction);
    controls.addEventListener("end", endInteraction);
    controls.addEventListener("change", change);

    const frame = () => {
      const model = modelRef.current;
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model);
      if (dimensionsRef.current) box.expandByObject(dimensionsRef.current);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const distance = Math.max(45, sphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.22);
      camera.position.set(sphere.center.x + distance * 0.78, sphere.center.y - distance, sphere.center.z + distance * 0.66);
      camera.near = Math.max(0.1, distance / 150);
      camera.far = distance * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(sphere.center);
      controls.update();
      invalidate(24);
    };
    frameRef.current = frame;

    const resize = () => {
      const bounds = mount.getBoundingClientRect();
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / Math.max(bounds.height, 1);
      camera.updateProjectionMatrix();
      invalidate(2);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    invalidate(2);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.removeEventListener("start", startInteraction);
      controls.removeEventListener("end", endInteraction);
      controls.removeEventListener("change", change);
      controls.dispose();
      modelRef.current?.geometry.dispose();
      modelRef.current?.material.dispose();
      disposeObject(dimensionsRef.current);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      floorRef.current = null;
      gridRef.current = null;
      modelRef.current = null;
      dimensionsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const controller = new AbortController();
    let active = true;
    const load = source.buffer
      ? Promise.resolve(source.buffer)
      : fetch(source.url!, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error("Model could not be loaded.");
          return response.arrayBuffer();
        });
    void load.then((buffer) => {
      if (!active || !sceneRef.current) return;
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const model = new THREE.Mesh(geometry, createPreviewMaterial(materialPresetRef.current));
      model.castShadow = true;
      model.receiveShadow = true;
      if (modelRef.current) {
        scene.remove(modelRef.current);
        modelRef.current.geometry.dispose();
        modelRef.current.material.dispose();
      }
      if (dimensionsRef.current) {
        scene.remove(dimensionsRef.current);
        disposeObject(dimensionsRef.current);
      }
      modelRef.current = model;
      scene.add(model);
      const currentDisplay = displayRef.current;
      const currentUnits = unitsRef.current;
      dimensionsRef.current = currentDisplay.dimensions.visible && geometry.boundingBox ? createGroundDimensions(geometry.boundingBox, currentDisplay, currentUnits) : null;
      if (dimensionsRef.current) scene.add(dimensionsRef.current);
      if (!hasFramedRef.current) {
        hasFramedRef.current = true;
        frameRef.current();
      } else invalidateRef.current(4);
      onReady?.();
    }).catch((error) => { if (error?.name !== "AbortError") console.error(error); });
    return () => { active = false; controller.abort(); };
  }, [onReady, source]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const previous = model.material;
    model.material = createPreviewMaterial(materialPreset);
    previous.dispose();
    invalidateRef.current(3);
  }, [materialPreset]);

  useEffect(() => {
    if (floorRef.current) floorRef.current.visible = display.floor;
    if (gridRef.current) gridRef.current.visible = display.grid;
    const scene = sceneRef.current;
    const model = modelRef.current;
    if (scene && model) {
      if (dimensionsRef.current) { scene.remove(dimensionsRef.current); disposeObject(dimensionsRef.current); }
      model.geometry.computeBoundingBox();
      dimensionsRef.current = display.dimensions.visible && model.geometry.boundingBox ? createGroundDimensions(model.geometry.boundingBox, display, units) : null;
      if (dimensionsRef.current) scene.add(dimensionsRef.current);
    }
    invalidateRef.current(3);
  }, [display, units]);

  return (
    <div className="studio-viewer">
      <div ref={mountRef} className="studio-viewer-canvas" aria-label="Interactive procedural model preview" />
      <span className="studio-orbit-hint"><Rotate3D size={13} /> Drag to orbit · scroll to zoom</span>
      <button className="studio-focus" type="button" onClick={() => frameRef.current()} aria-label="Frame model"><Focus size={16} /></button>
    </div>
  );
}

export function ProceduralStudio() {
  const [activeDemo, setActiveDemo] = useState<DemoModelId>("type-specimen");
  const [spec, setSpec] = useState("");
  const [result, setResult] = useState<InspectResult | null>(null);
  const [document, setDocument] = useState<ModelDocument | null>(null);
  const [preview, setPreview] = useState<PreviewSource | null>(null);
  const [fonts, setFonts] = useState<FontSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveUpdating, setLiveUpdating] = useState(false);
  const [previewQuality, setPreviewQuality] = useState(false);
  const [compileInfo, setCompileInfo] = useState("");
  const [modelReady, setModelReady] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveSequenceRef = useRef(0);
  const compiledGeometryKeyRef = useRef("");
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
      setPreviewQuality(false);
      setCompileInfo("");
      if (data.studioUrl) window.history.replaceState(window.history.state, "", data.studioUrl.replace(window.location.origin, ""));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Model spec is invalid.");
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
      setPreviewQuality(true);
      setCompileInfo(`${response.headers.get("Server-Timing")?.replace("compile;dur=", "") ?? "—"} ms · ${response.headers.get("X-Printa-Cache") ?? "cold graph"}`);
      window.history.replaceState(window.history.state, "", studioUrl);
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === "AbortError") return;
      if (sequence === liveSequenceRef.current) setError(nextError instanceof Error ? nextError.message : "Model preview could not be compiled.");
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
      setCompileInfo("View/spec update · mesh reused");
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
      if (encoded) void inspect({ encoded });
      else {
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

  const selectDemo = (id: DemoModelId) => {
    setActiveDemo(id);
    void inspect({ demo: id });
  };

  return (
    <main className="studio-shell">
      <header className="studio-topbar">
        <Link className="brand" href="/" aria-label="Printa home"><span className="brand-mark"><Layers3 size={18} /></span><span>PRINTA</span><em>SPEC 1.0</em></Link>
        <div className="studio-topbar-center editor-mode-switch" aria-label="Unified editor">
          <Link className="mode-pill is-active" href="/editor"><Layers3 size={14} /> Model editor</Link>
          <span className="mode-pill"><Braces size={14} /> Spec + WYSIWYG</span>
          <i />
        </div>
        <nav><a href="/skills" target="_blank"><ScrollText size={14} /> Skill</a><a href="/api/model/schema" target="_blank"><Braces size={14} /> Schema</a></nav>
      </header>

      <div className="studio-workspace">
        <aside className="studio-sidebar">
          <section className="studio-intro"><span className="eyebrow"><Waves size={13} /> One editable model spec</span><h1>Shape what you see.</h1><p>Every layer, font, modifier, transform and viewport gizmo is stored in the document and rebuilt live.</p></section>

          <section className="studio-demo-section">
            <div className="studio-section-head"><strong>Starting form</strong><small>{DEMO_MODEL_CARDS.length} specs</small></div>
            <label className="studio-demo-select"><span>{DEMO_MODEL_CARDS.find((demo) => demo.id === activeDemo)?.family === "simulation" ? <Droplets size={14} /> : <Layers3 size={14} />}</span><select value={activeDemo} onChange={(event) => selectDemo(event.target.value as DemoModelId)}>{DEMO_MODEL_CARDS.map((demo) => <option key={demo.id} value={demo.id}>{demo.name}</option>)}</select></label>
          </section>

          {document && <SpecInspector document={document} fonts={fonts} onChange={updateDocument} />}

          <details className="studio-spec-section">
            <summary><span><Braces size={13} /> Full JSON / YAML spec</span><small>Advanced</small></summary>
            <textarea value={spec} onChange={(event) => setSpec(event.target.value)} spellCheck={false} aria-label="Procedural model YAML or JSON spec" />
            {error && <div className="studio-error">{error}</div>}
            <button className="studio-apply" type="button" onClick={() => void inspect({ spec })} disabled={loading || !spec.trim()}>
              {loading ? <LoaderCircle className="is-spinning" size={15} /> : <Play size={15} fill="currentColor" />} Apply spec
            </button>
          </details>
        </aside>

        <section className="studio-stage">
          <div className="studio-stage-head">
            <div><span className="eyebrow"><Sparkles size={13} /> Generated solid</span><h2>{result?.document.name ?? "Building form…"}</h2></div>
            {result && <span className={`studio-compile-state${liveUpdating ? " is-active" : ""}`}>{liveUpdating ? <LoaderCircle className="is-spinning" size={13} /> : <Check size={13} />}{liveUpdating ? "Compiling preview…" : compileInfo || "Graph ready"}</span>}
            {result && <a className="studio-download" href={result.stlUrl}><Download size={15} /> Download STL</a>}
          </div>
          <div className="studio-stage-body">
            {result && preview && document && <ModelViewport source={preview} materialPreset={result.materialPreset} display={document.display} units={document.units} onReady={handleModelReady} />}
            {!modelReady && <div className="studio-loading"><LoaderCircle className="is-spinning" size={19} /> {loading ? "Evaluating model graph…" : "Loading printable mesh…"}</div>}
          </div>
          <div className="studio-stage-foot">
            {result ? (
              <>
                <span><small>Bounds</small><strong>{result.stats.widthMm.toFixed(1)} × {result.stats.depthMm.toFixed(1)} × {result.stats.heightMm.toFixed(1)} mm</strong></span>
                <span><small>Mesh{previewQuality ? " preview" : ""}</small><strong>{result.stats.triangles.toLocaleString()} triangles</strong></span>
                <span><small>Volume est.</small><strong>{previewQuality ? "On full STL build" : `${(result.stats.volumeEstimateMm3 / 1000).toFixed(1)} cm³`}</strong></span>
                <span className={result.exceedsBuildVolume ? "is-warning" : "is-ready"}><Check size={13} /> {result.exceedsBuildVolume ? "Check build volume" : "Ready for slicer"}</span>
              </>
            ) : <span>Waiting for a valid model spec.</span>}
          </div>
        </section>
      </div>
    </main>
  );
}
