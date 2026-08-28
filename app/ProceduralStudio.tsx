"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Braces,
  Check,
  Download,
  Droplets,
  Ellipsis,
  Eye,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Minus,
  Play,
  Plus,
  Rotate3D,
  Save,
  Scan,
  ScrollText,
  Sparkles,
  Trash2,
  TriangleAlert,
  LogOut,
  MapPin,
  UserRound,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { bind } from "cuelume";
import { DEFAULT_VIEW, fitCameraToBox } from "@/lib/camera-fit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToggleField } from "@/components/editor/fields";
import { ChatPanel } from "@/components/editor/ChatPanel";
import { BrandLink } from "@/components/brand-link";
import { DEMO_MODEL_CARDS, type DemoModelId } from "@/lib/demo-models";
import { newPlaceDocument } from "@/lib/place-capture";
import { takeHandoff } from "@/lib/model-handoff";
import { capturePlace, searchPlaces, placeCaptureDocument, MAX_CAPTURE_RADIUS_M } from "@/lib/place-capture";
import { say, useWebMcpTools } from "@/lib/webmcp";
import { printMaterialPreset, type PrintMaterialPreset } from "@/lib/material-presets";
import type { ModelDocument, ModelDocumentInput } from "@/lib/model-spec";
import { initSfx, isSfxEnabled, setSfxEnabled, sfx, sfxThrottled } from "@/lib/sfx";
import { deleteSavedModel, listSavedModels, saveModel, type SavedModel } from "@/lib/user-models";
import {
  deleteCloudProject,
  fetchAccount,
  listCloudProjects,
  saveCloudProject,
  type Account,
  type CloudProject,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
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
type ShadingMode = "smooth" | "flat";

const SHADING_KEY = "printa:shading";
const SIDEBAR_KEY = "printa:sidebar-width";
const CHAT_DOCKED_KEY = "printa:assistant-docked";
const CHAT_WIDTH_KEY = "printa:assistant-width";

/**
 * How much document a URL will carry.
 *
 * A place holds its captured ground inline, which is hundreds of kilobytes;
 * put that in a query string and the server answers 431 before the compiler
 * ever sees it, so the preview silently fails. Anything larger is addressed
 * by POST instead — the preview compiles over the request body and the
 * download streams through a blob — and the address bar keeps the demo id, or
 * nothing at all, rather than a link that cannot be opened.
 */
const SPEC_URL_LIMIT = 6000;

function encodeJson(json: string) {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

type SpecLinks = { encoded: string; stlUrl: string; studioUrl: string };

/** Shareable URLs for a document, or empty ones when it is too big to encode. */
function specLinks(document: ModelDocument, studioFallback = "/editor"): SpecLinks {
  const json = JSON.stringify(document);
  if (json.length > SPEC_URL_LIMIT) return { encoded: "", stlUrl: "", studioUrl: studioFallback };
  const encoded = encodeJson(json);
  return { encoded, stlUrl: `/make/model.stl?spec=${encoded}`, studioUrl: `/editor?spec=${encoded}` };
}

function geometryKey(document: ModelDocument) {
  const root = JSON.stringify(document.root, (key, value) => key === "id" || key === "material" ? undefined : value);
  return `${document.units}:${document.print.autoCenter}:${document.print.placeOnBed}:${JSON.stringify(document.print.interiorStruts)}:${root}`;
}

function documentMaterial(node: ModelDocument["root"]): PrintMaterialPreset {
  if (node.kind === "shape") return node.material ?? "pla-orange";
  if (node.kind === "repeat") return documentMaterial(node.child);
  return documentMaterial(node.children[0]);
}

// Fluid and cloth are on-command sims — as sources, or as drape/melt modifiers
// on any shape. A document containing one doesn't auto-recompile on edits; the
// user presses Simulate to bake it.
function hasSimModifier(modifiers: ModelDocument["root"]["modifiers"]): boolean {
  return modifiers.some((m) => m.type === "drape" || m.type === "melt");
}

function documentHasSim(node: ModelDocument["root"]): boolean {
  if (hasSimModifier(node.modifiers)) return true;
  if (node.kind === "shape") return node.source.type === "fluid" || node.source.type === "cloth";
  if (node.kind === "repeat") return documentHasSim(node.child);
  return node.children.some(documentHasSim);
}

// Bump the bake token on every simulation source and sim modifier so the next
// compile re-runs it. Optionally step the frame count by `frameDelta`.
function bumpBakeTokens(node: ModelDocument["root"], frameDelta = 0) {
  for (const m of node.modifiers) {
    if (m.type === "drape" || m.type === "melt") {
      m.bake = (m.bake ?? 0) + 1;
      if (frameDelta) m.frames = Math.max(1, Math.min(600, m.frames + frameDelta));
    }
  }
  if (node.kind === "shape") {
    const source = node.source as { type: string; bake?: number; steps?: number };
    if (source.type === "fluid" || source.type === "cloth" || source.type === "water") {
      source.bake = (source.bake ?? 0) + 1;
      if (frameDelta && typeof source.steps === "number") source.steps = Math.max(1, Math.min(600, source.steps + frameDelta));
    }
  } else if (node.kind === "repeat") bumpBakeTokens(node.child, frameDelta);
  else node.children.forEach((child) => bumpBakeTokens(child, frameDelta));
}

// Total simulation frames configured across the document (max over all sims),
// shown in the frame stepper.
function simFrameCount(node: ModelDocument["root"]): number {
  let max = 0;
  for (const m of node.modifiers) if (m.type === "drape" || m.type === "melt") max = Math.max(max, m.frames);
  if (node.kind === "shape") {
    const source = node.source as { type: string; steps?: number };
    if ((source.type === "fluid" || source.type === "cloth" || source.type === "water") && typeof source.steps === "number") max = Math.max(max, source.steps);
  } else if (node.kind === "repeat") max = Math.max(max, simFrameCount(node.child));
  else for (const child of node.children) max = Math.max(max, simFrameCount(child));
  return max;
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

function createBuildPlate(buildVolume: [number, number, number]) {
  const [width, depth] = buildVolume;
  const group = new THREE.Group();
  group.name = "spec-build-plate";
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: "#263c39", transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
  );
  surface.position.z = 0.08;
  group.add(surface);
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(surface.geometry),
    new THREE.LineBasicMaterial({ color: "#63d4c7", transparent: true, opacity: 0.92, depthTest: false }),
  );
  border.position.z = 0.11;
  border.renderOrder = 8;
  group.add(border);
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

const PATH_TRACE_SAMPLE_CAP = 128;

// A dedicated scene for the progressive GPU path tracer — the current mesh
// (with its shading + material) over a soft floor lit for a beauty render.
function createPathTraceScene(model: THREE.Mesh) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#11110f");
  // A plain standard material renders reliably in the path tracer; the physical
  // material's clearcoat/transmission features render black in this build.
  const source = model.material as THREE.MeshPhysicalMaterial;
  const tracedMaterial = new THREE.MeshStandardMaterial({
    color: source.color.clone(),
    roughness: Math.max(0.15, source.roughness),
    metalness: source.metalness,
    side: THREE.FrontSide,
  });
  const traced = new THREE.Mesh(model.geometry, tracedMaterial);
  traced.castShadow = true;
  traced.receiveShadow = true;
  scene.add(traced);
  const box = new THREE.Box3().setFromObject(model);
  const span = Math.max(180, box.max.x - box.min.x, box.max.y - box.min.y);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 2.6, span * 2.6),
    new THREE.MeshStandardMaterial({ color: "#171714", roughness: 0.85, metalness: 0.04 }),
  );
  floor.position.z = (box.min.z ?? 0) - 0.05;
  floor.receiveShadow = true;
  scene.add(floor);
  const center = box.getCenter(new THREE.Vector3());
  const key = new THREE.DirectionalLight("#fff1d5", 5.5);
  key.position.set(center.x - span, center.y - span * 1.2, center.z + span * 1.6);
  key.target.position.copy(center);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight("#c9d4ff", 3.2);
  fill.position.set(center.x + span, center.y + span * 0.8, center.z + span);
  fill.target.position.copy(center);
  scene.add(fill, fill.target);
  // Camera-side fill so the front of the model isn't left in shadow.
  const front = new THREE.DirectionalLight("#ffffff", 2.4);
  front.position.set(center.x, center.y - span * 1.6, center.z + span * 0.6);
  front.target.position.copy(center);
  scene.add(front, front.target);
  return scene;
}

function disposePathTraceScene(scene: THREE.Scene | null) {
  scene?.environment?.dispose();
  scene?.traverse((child) => {
    const item = child as THREE.Mesh;
    if (item.isMesh) {
      // The traced model shares the live geometry; only dispose the clones we made.
      if (item.geometry instanceof THREE.PlaneGeometry) item.geometry.dispose();
      const material = item.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(material) ? material : material ? [material] : []).forEach((mat) => mat.dispose());
    }
  });
}

function ModelViewport({ source, materialPreset, display, units, buildVolume, shading, slice, pathTraced, onSamples, onReady, onRegisterFrame }: {
  source: PreviewSource;
  materialPreset: PrintMaterialPreset;
  display: ModelDocument["display"];
  units: ModelDocument["units"];
  buildVolume: [number, number, number];
  shading: ShadingMode;
  slice: number;
  pathTraced: boolean;
  onSamples?: (samples: number) => void;
  onReady?: () => void;
  /** Hands the "fit model in view" action to the parent so every viewport
   *  control can live in one tool rail instead of floating separately. */
  onRegisterFrame?: (frame: () => void) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<() => void>(() => undefined);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const buildPlateRef = useRef<THREE.Group | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const modelRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null>(null);
  const baseGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const dimensionsRef = useRef<THREE.Group | null>(null);
  const invalidateRef = useRef<(frames?: number) => void>(() => undefined);
  const composerRef = useRef<EffectComposer | null>(null);
  const gtaoRef = useRef<GTAOPass | null>(null);
  const hasFramedRef = useRef(false);
  const displayRef = useRef(display);
  const unitsRef = useRef(units);
  const buildVolumeRef = useRef(buildVolume);
  const materialPresetRef = useRef(materialPreset);
  const shadingRef = useRef(shading);
  const sliceRef = useRef(slice);
  const slicePlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));
  const pathTracedRef = useRef(pathTraced);
  const pathTracerRef = useRef<{ dispose: () => void; setScene: (s: THREE.Scene, c: THREE.Camera) => void; updateCamera: () => void; renderSample: () => void; samples: number } | null>(null);
  const pathSceneRef = useRef<THREE.Scene | null>(null);
  const pathTokenRef = useRef(0);
  const restartPathTraceRef = useRef<() => void>(() => undefined);
  const onSamplesRef = useRef(onSamples);
  const onRegisterFrameRef = useRef(onRegisterFrame);
  useEffect(() => { onSamplesRef.current = onSamples; }, [onSamples]);
  useEffect(() => { onRegisterFrameRef.current = onRegisterFrame; }, [onRegisterFrame]);

  useEffect(() => {
    displayRef.current = display;
    unitsRef.current = units;
    buildVolumeRef.current = buildVolume;
    materialPresetRef.current = materialPreset;
  }, [buildVolume, display, materialPreset, units]);

  // Sizes the key light's orthographic shadow frustum (and the floor, grid and
  // fog) to the model so shadows land correctly no matter how big the print is.
  const fitSceneToModel = useCallback((box: THREE.Box3) => {
    const key = keyLightRef.current;
    const scene = sceneRef.current;
    if (!key || !scene) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 24);
    key.position.copy(sphere.center).add(new THREE.Vector3(-0.42, -0.52, 0.84).normalize().multiplyScalar(radius * 3));
    key.target.position.copy(sphere.center);
    key.target.updateMatrixWorld();
    const shadowCamera = key.shadow.camera;
    const extent = radius * 1.45;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = radius * 0.4;
    shadowCamera.far = radius * 7;
    shadowCamera.updateProjectionMatrix();
    key.shadow.normalBias = Math.max(0.02, radius * 0.0015);
    // Scale the AO sampling radius to the model so crevices read at any size.
    gtaoRef.current?.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(radius * 0.22, 2, 40) });
    const groundScale = Math.max(1, (radius * 1.8) / 240);
    floorRef.current?.scale.setScalar(groundScale);
    gridRef.current?.scale.setScalar(groundScale);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(440, radius * 5);
      scene.fog.far = Math.max(900, radius * 11);
    }
  }, []);

  const applyShading = useCallback((mode: ShadingMode) => {
    shadingRef.current = mode;
    const model = modelRef.current;
    const base = baseGeometryRef.current;
    if (!model || !base) return;
    // 50° smooths tessellated curves (e.g. an 8-sided cylinder's 45° facets)
    // while keeping genuine hard edges (90° caps, box corners) crisp.
    const next = mode === "smooth" ? toCreasedNormals(base, THREE.MathUtils.degToRad(50)) : base;
    if (model.geometry !== base && model.geometry !== next) model.geometry.dispose();
    if (model.geometry !== next) {
      model.geometry = next;
      if (mode === "smooth") next.computeBoundingBox();
      invalidateRef.current(3);
    }
  }, []);

  const applySlice = useCallback((fraction: number) => {
    sliceRef.current = fraction;
    const model = modelRef.current;
    const box = baseGeometryRef.current?.boundingBox;
    if (!model || !box) return;
    const active = fraction < 0.999;
    const material = model.material;
    if (active) {
      slicePlaneRef.current.constant = box.min.z + (box.max.z - box.min.z) * fraction;
      material.clippingPlanes = [slicePlaneRef.current];
    } else {
      material.clippingPlanes = [];
    }
    material.clipShadows = true;
    material.side = active ? THREE.DoubleSide : THREE.FrontSide;
    material.needsUpdate = true;
    invalidateRef.current(3);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#11110f");
    scene.fog = new THREE.Fog("#11110f", 440, 900);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);
    camera.up.set(0, 0, 1);
    camera.position.copy(DEFAULT_VIEW).multiplyScalar(320);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.localClippingEnabled = true;
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
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    scene.add(key.target);
    keyLightRef.current = key;
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
    const buildPlate = createBuildPlate(buildVolumeRef.current);
    buildPlate.visible = displayRef.current.buildPlate;
    scene.add(buildPlate);
    buildPlateRef.current = buildPlate;

    // Ambient occlusion (GTAO) postprocessing for the realtime render — adds
    // soft contact darkening in crevices (flutes, concavities, base seam).
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 8, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 16, screenSpaceRadius: false });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    composerRef.current = composer;
    gtaoRef.current = gtao;

    let animationFrame = 0;
    let interacting = false;
    let remainingFrames = 0;
    let reportedSamples = -1;
    const disposePathTracer = () => {
      pathTracerRef.current?.dispose();
      pathTracerRef.current = null;
      disposePathTraceScene(pathSceneRef.current);
      pathSceneRef.current = null;
    };
    const render = () => {
      controls.update();
      const tracer = pathTracerRef.current;
      if (pathTracedRef.current && tracer) {
        try {
          if (tracer.samples < PATH_TRACE_SAMPLE_CAP) tracer.renderSample();
          const samples = Math.floor(tracer.samples);
          if (samples !== reportedSamples) { reportedSamples = samples; onSamplesRef.current?.(samples); }
        } catch {
          disposePathTracer();
          onSamplesRef.current?.(-1);
          renderer.render(scene, camera);
        }
        animationFrame = requestAnimationFrame(render);
        return;
      }
      composer.render();
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

    const updatePathCamera = () => { pathTracerRef.current?.updateCamera(); reportedSamples = -1; onSamplesRef.current?.(0); };
    const restartPathTrace = () => {
      const token = ++pathTokenRef.current;
      disposePathTracer();
      reportedSamples = -1;
      onSamplesRef.current?.(0);
      if (!pathTracedRef.current || !modelRef.current) return;
      void import("three-gpu-pathtracer").then(({ GradientEquirectTexture, WebGLPathTracer }) => {
        if (token !== pathTokenRef.current || !pathTracedRef.current || !modelRef.current) return;
        const pathScene = createPathTraceScene(modelRef.current);
        // A bright, nearly-uniform studio environment. The gradient is Y-up
        // while the scene is Z-up, so keeping the two colors close avoids the
        // model's camera-facing side falling into the dark end of the gradient.
        const environment = new GradientEquirectTexture(64);
        environment.topColor.set("#fff6e8");
        environment.bottomColor.set("#c4ccdb");
        environment.exponent = 0.5;
        environment.update();
        pathScene.environment = environment;
        pathScene.environmentIntensity = 1.6;
        const tracer = new WebGLPathTracer(renderer);
        tracer.tiles.set(3, 3);
        tracer.bounces = 4;
        tracer.filterGlossyFactor = 0.25;
        tracer.renderDelay = 0;
        tracer.fadeDuration = 200;
        tracer.minSamples = 1;
        tracer.renderScale = Math.min(0.85, 1 / renderer.getPixelRatio());
        tracer.dynamicLowRes = false;
        tracer.rasterizeScene = true;
        tracer.rasterizeSceneCallback = () => renderer.render(scene, camera);
        tracer.setScene(pathScene, camera);
        pathSceneRef.current = pathScene;
        pathTracerRef.current = tracer as unknown as typeof pathTracerRef.current;
        invalidate(1);
      }).catch(() => {
        if (token === pathTokenRef.current) { disposePathTracer(); onSamplesRef.current?.(-1); }
      });
    };
    restartPathTraceRef.current = restartPathTrace;

    const startInteraction = () => { interacting = true; invalidate(2); };
    const endInteraction = () => { interacting = false; invalidate(24); };
    const change = () => { invalidate(2); if (pathTracedRef.current) updatePathCamera(); };
    controls.addEventListener("start", startInteraction);
    controls.addEventListener("end", endInteraction);
    controls.addEventListener("change", change);

    const frame = () => {
      const model = modelRef.current;
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model);
      if (dimensionsRef.current) box.expandByObject(dimensionsRef.current);
      if (buildPlateRef.current?.visible) box.expandByObject(buildPlateRef.current);
      // Re-frame from the angle the user is already looking from, so hitting
      // "fit" zooms rather than snapping the view back to a default.
      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < 1e-4) direction.copy(DEFAULT_VIEW);
      fitCameraToBox(camera, controls, box, direction, { padding: 1.12, minDistance: 45 });
      invalidate(24);
    };
    frameRef.current = frame;
    onRegisterFrameRef.current?.(frame);

    const resize = () => {
      const bounds = mount.getBoundingClientRect();
      renderer.setSize(bounds.width, bounds.height, false);
      composer.setSize(bounds.width, bounds.height);
      gtao.setSize(bounds.width, bounds.height);
      camera.aspect = bounds.width / Math.max(bounds.height, 1);
      camera.updateProjectionMatrix();
      if (pathTracedRef.current) updatePathCamera();
      invalidate(2);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    invalidate(2);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      pathTokenRef.current += 1;
      disposePathTracer();
      controls.removeEventListener("start", startInteraction);
      controls.removeEventListener("end", endInteraction);
      controls.removeEventListener("change", change);
      controls.dispose();
      if (modelRef.current) {
        if (modelRef.current.geometry !== baseGeometryRef.current) modelRef.current.geometry.dispose();
        modelRef.current.material.dispose();
      }
      baseGeometryRef.current?.dispose();
      disposeObject(dimensionsRef.current);
      disposeObject(buildPlateRef.current);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      floorRef.current = null;
      gridRef.current = null;
      buildPlateRef.current = null;
      keyLightRef.current = null;
      modelRef.current = null;
      baseGeometryRef.current = null;
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
        if (modelRef.current.geometry !== baseGeometryRef.current) modelRef.current.geometry.dispose();
        modelRef.current.material.dispose();
      }
      baseGeometryRef.current?.dispose();
      baseGeometryRef.current = geometry;
      if (dimensionsRef.current) {
        scene.remove(dimensionsRef.current);
        disposeObject(dimensionsRef.current);
      }
      modelRef.current = model;
      scene.add(model);
      applyShading(shadingRef.current);
      applySlice(sliceRef.current);
      if (geometry.boundingBox) fitSceneToModel(geometry.boundingBox.clone());
      const currentDisplay = displayRef.current;
      const currentUnits = unitsRef.current;
      dimensionsRef.current = currentDisplay.dimensions.visible && geometry.boundingBox ? createGroundDimensions(geometry.boundingBox, currentDisplay, currentUnits) : null;
      if (dimensionsRef.current) scene.add(dimensionsRef.current);
      if (!hasFramedRef.current) {
        hasFramedRef.current = true;
        frameRef.current();
      } else invalidateRef.current(4);
      if (pathTracedRef.current) restartPathTraceRef.current();
      onReady?.();
    }).catch((error) => { if (error?.name !== "AbortError") console.error(error); });
    return () => { active = false; controller.abort(); };
  }, [applyShading, applySlice, fitSceneToModel, onReady, source]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const previous = model.material;
    model.material = createPreviewMaterial(materialPreset);
    previous.dispose();
    applySlice(sliceRef.current);
    if (pathTracedRef.current) restartPathTraceRef.current();
    invalidateRef.current(3);
  }, [applySlice, materialPreset]);

  useEffect(() => { applyShading(shading); if (pathTracedRef.current) restartPathTraceRef.current(); }, [applyShading, shading]);
  useEffect(() => { applySlice(slice); }, [applySlice, slice]);
  useEffect(() => { pathTracedRef.current = pathTraced; restartPathTraceRef.current(); }, [pathTraced]);

  useEffect(() => {
    if (floorRef.current) floorRef.current.visible = display.floor;
    if (gridRef.current) gridRef.current.visible = display.grid;
    const scene = sceneRef.current;
    if (scene) {
      if (buildPlateRef.current) { scene.remove(buildPlateRef.current); disposeObject(buildPlateRef.current); }
      buildPlateRef.current = createBuildPlate(buildVolume);
      buildPlateRef.current.visible = display.buildPlate;
      scene.add(buildPlateRef.current);
    }
    const model = modelRef.current;
    if (scene && model) {
      if (dimensionsRef.current) { scene.remove(dimensionsRef.current); disposeObject(dimensionsRef.current); }
      const box = baseGeometryRef.current?.boundingBox ?? null;
      dimensionsRef.current = display.dimensions.visible && box ? createGroundDimensions(box, display, units) : null;
      if (dimensionsRef.current) scene.add(dimensionsRef.current);
    }
    invalidateRef.current(3);
  }, [buildVolume, display, units]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
      aria-label="Interactive procedural model preview"
    />
  );
}

function statChip(label: string, value: string) {
  return (
    <span className="pointer-events-none flex items-baseline gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[11px] tabular-nums text-white/85 backdrop-blur">
      <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">{label}</span>
      {value}
    </span>
  );
}

/** One button in the viewport tool rail. */
function RailButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-lg transition-colors",
        active ? "bg-[var(--accent-tool)] text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export function ProceduralStudio() {
  const [spec, setSpec] = useState("");
  const [result, setResult] = useState<InspectResult | null>(null);
  const [document, setDocument] = useState<ModelDocument | null>(null);
  const [preview, setPreview] = useState<PreviewSource | null>(null);
  const [fonts, setFonts] = useState<FontSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveUpdating, setLiveUpdating] = useState(false);
  const [previewQuality, setPreviewQuality] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [shading, setShading] = useState<ShadingMode>(() =>
    typeof window !== "undefined" && window.localStorage.getItem(SHADING_KEY) === "flat" ? "flat" : "smooth");
  const [slice, setSlice] = useState(1);
  const [sliceOpen, setSliceOpen] = useState(false);
  const [pathTraced, setPathTraced] = useState(false);
  const [pathSamples, setPathSamples] = useState(0);
  const [simStale, setSimStale] = useState(false);
  const handleSamples = useCallback((samples: number) => setPathSamples(samples), []);
  const [soundOn, setSoundOn] = useState(() => typeof window === "undefined" || isSfxEnabled());
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [downloading, setDownloading] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  // The assistant is a docked panel, not a popover: once someone works with
  // it beside the model, closing it on every reload is just a chore.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(340);
  const [saveName, setSaveName] = useState("");
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [authAvailable, setAuthAvailable] = useState(false);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [saving, setSaving] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveSequenceRef = useRef(0);
  const compiledGeometryKeyRef = useRef("");
  const modelWasReadyRef = useRef(false);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const frameModelRef = useRef<() => void>(() => undefined);
  const registerFrame = useCallback((frame: () => void) => { frameModelRef.current = frame; }, []);

  const setChatDocked = useCallback((docked: boolean) => {
    setChatOpen(docked);
    window.localStorage.setItem(CHAT_DOCKED_KEY, String(docked));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth)), 250);
    return () => window.clearTimeout(timer);
  }, [chatWidth]);

  const handleModelReady = useCallback(() => {
    setModelReady(true);
    if (!modelWasReadyRef.current) {
      modelWasReadyRef.current = true;
      sfx("ready");
    }
  }, []);

  useEffect(() => {
    initSfx();
    bind();
    const raf = requestAnimationFrame(() => {
      const storedWidth = Number(window.localStorage.getItem(SIDEBAR_KEY));
      if (Number.isFinite(storedWidth) && storedWidth >= 264 && storedWidth <= 520) setSidebarWidth(storedWidth);
      const storedChat = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
      if (Number.isFinite(storedChat) && storedChat >= 280 && storedChat <= 560) setChatWidth(storedChat);
      setChatOpen(window.localStorage.getItem(CHAT_DOCKED_KEY) === "true");
    });
    return () => cancelAnimationFrame(raf);
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
      const { stlUrl, studioUrl } = specLinks(next);
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
      window.history.replaceState(window.history.state, "", studioUrl);
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === "AbortError") return;
      if (sequence === liveSequenceRef.current) {
        sfx("error");
        setError(nextError instanceof Error ? nextError.message : "Model preview could not be compiled.");
      }
    } finally {
      if (sequence === liveSequenceRef.current) setLiveUpdating(false);
    }
  }, []);

  const inspect = useCallback(async (payload: { demo?: string; model?: string; spec?: string | ModelDocument | ModelDocumentInput; encoded?: string }) => {
    liveAbortRef.current?.abort();
    liveSequenceRef.current += 1;
    setLoading(true);
    setModelReady(false);
    modelWasReadyRef.current = false;
    setError("");
    try {
      const response = await fetch("/api/model/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, format: "yaml" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Model spec is invalid.");
      const demoUrl = payload.demo
        ? `/editor?demo=${encodeURIComponent(payload.demo)}`
        : payload.model
          ? `/editor?model=${encodeURIComponent(payload.model)}`
          : "/editor";
      const links = specLinks(data.document, demoUrl);
      setResult({ ...data, stlUrl: links.stlUrl, studioUrl: links.studioUrl });
      setDocument(data.document);
      setSimStale(false);
      setSpec(data.spec);
      compiledGeometryKeyRef.current = geometryKey(data.document);
      setPreviewQuality(false);
      setSlice(1);
      window.history.replaceState(window.history.state, "", links.studioUrl);
      if (links.encoded) {
        setPreview({ key: links.stlUrl, url: `/api/model/stl?spec=${links.encoded}&preview=true` });
      } else if (payload.model) {
        // A stored document is addressed by key everywhere, including here.
        setPreview({ key: `model-${payload.model}`, url: `/api/model/stl?model=${encodeURIComponent(payload.model)}&preview=true` });
      } else if (payload.demo) {
        // A place carries its captured ground, which no query string will
        // hold — but its demo id says the same thing in twenty characters,
        // and that response is cacheable.
        setPreview({ key: `demo-${payload.demo}`, url: `/api/model/stl?demo=${encodeURIComponent(payload.demo)}&preview=true` });
      } else {
        // A saved or generated place has no id to be fetched by, so it
        // compiles over POST exactly like an edit does.
        void compileLive(data.document);
      }
    } catch (nextError) {
      sfx("error");
      setError(nextError instanceof Error ? nextError.message : "Model spec is invalid.");
    } finally {
      setLoading(false);
    }
  }, [compileLive]);

  const updateDocument = useCallback((next: ModelDocument) => {
    setDocument(next);
    const nextSpec = JSON.stringify(next, null, 2);
    setSpec(nextSpec);
    liveAbortRef.current?.abort();
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    if (geometryKey(next) === compiledGeometryKeyRef.current) {
      liveSequenceRef.current += 1;
      setLiveUpdating(false);
      const { stlUrl, studioUrl } = specLinks(next);
      setResult((previous) => previous ? {
        ...previous,
        document: next,
        spec: nextSpec,
        stlUrl,
        studioUrl,
        materialPreset: documentMaterial(next.root),
        exceedsBuildVolume: previous.stats.widthMm > next.print.buildVolume[0]
          || previous.stats.depthMm > next.print.buildVolume[1]
          || previous.stats.heightMm > next.print.buildVolume[2],
      } : previous);
      window.history.replaceState(window.history.state, "", studioUrl);
      return;
    }
    // Fluid/cloth are on-command: stage the edit and wait for Simulate rather
    // than auto-running an expensive scene-colliding simulation.
    if (documentHasSim(next.root)) {
      liveSequenceRef.current += 1;
      setLiveUpdating(false);
      setSimStale(true);
      const { stlUrl, studioUrl } = specLinks(next);
      setResult((previous) => previous ? { ...previous, document: next, spec: nextSpec, stlUrl, studioUrl, materialPreset: documentMaterial(next.root) } : previous);
      window.history.replaceState(window.history.state, "", studioUrl);
      return;
    }
    setLiveUpdating(true);
    liveTimerRef.current = setTimeout(() => void compileLive(next), 170);
  }, [compileLive]);

  const simulate = useCallback((frameDelta = 0) => {
    if (!document) return;
    const next = structuredClone(document);
    bumpBakeTokens(next.root, frameDelta);
    setSimStale(false);
    sfx("press");
    setDocument(next);
    setSpec(JSON.stringify(next, null, 2));
    liveAbortRef.current?.abort();
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    setLiveUpdating(true);
    void compileLive(next);
  }, [document, compileLive]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("spec");
    const demo = params.get("demo") as DemoModelId | null;
    const mode = params.get("mode");
    // `?new=place` starts an empty place, which is how the places gallery
    // hands someone a map of their own to capture.
    const blank = params.get("new");
    // A document too large for a URL is left in this tab's storage by whoever
    // sent us here — the landing page's map capture, mostly.
    const handoff = params.get("handoff") ? takeHandoff() : null;
    const model = params.get("model");
    const fallback = mode === "procedural" ? "contour-spiral-vase" : "type-specimen";
    const nextDemo = DEMO_MODEL_CARDS.some((card) => card.id === demo) ? demo! : fallback;
    const timer = window.setTimeout(() => {
      if (handoff) void inspect({ spec: handoff as ModelDocumentInput });
      else if (model) void inspect({ model });
      else if (blank === "place") void inspect({ spec: newPlaceDocument() });
      else if (encoded) void inspect({ encoded });
      else void inspect({ demo: nextDemo });
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

  /**
   * Save the STL.
   *
   * A document that fits a URL is opened as a link, so the file is fetched by
   * the browser with a proper name and can be shared. A place is far past
   * that, so its bytes are compiled over POST and handed to a blob download
   * instead of a request the server would refuse.
   */
  const downloadStl = useCallback(async () => {
    if (!result || downloading) return;
    sfx("chime");
    if (result.stlUrl) {
      window.open(result.stlUrl, "_blank");
      return;
    }
    setDownloading(true);
    try {
      const response = await fetch("/api/model/stl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: result.document }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "The model could not be compiled.");
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1]
        ?? `${result.document.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "model"}.stl`;
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      sfx("error");
      setError(nextError instanceof Error ? nextError.message : "The model could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }, [result, downloading]);

  const refreshProjects = useCallback(async () => {
    const projects = await listCloudProjects();
    setCloudProjects(projects);
  }, []);

  useEffect(() => {
    void fetchAccount().then(({ authAvailable: available, account: person }) => {
      setAuthAvailable(available);
      setAccount(person);
      if (person) void refreshProjects();
    });
  }, [refreshProjects]);

  const openLoad = () => {
    setSavedModels(listSavedModels());
    if (account) void refreshProjects();
    setLoadOpen(true);
    sfx("page");
  };

  const openSave = () => {
    setSaveName(document?.name ?? "");
    setSaveOpen(true);
    sfx("page");
  };

  /**
   * Saving.
   *
   * Signed in, a project goes to the account and can be opened anywhere;
   * signed out it stays in this browser, which is what it always did. The
   * dialog says which is happening rather than making it a setting.
   */
  const handleSave = async () => {
    if (!document || saving) return;
    setSaving(true);
    try {
      if (account) {
        const saved = await saveCloudProject(saveName || document.name, document);
        await refreshProjects();
        window.history.replaceState(window.history.state, "", `/editor?model=${saved.key}`);
      } else {
        saveModel(saveName, document);
      }
      setSaveOpen(false);
      sfx("success");
    } catch (nextError) {
      sfx("error");
      setError(nextError instanceof Error ? nextError.message : "That project could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  // Places are demo ids too, and they are generated from the place roster
  // rather than the literal DEMO_MODELS keys.
  const loadDemo = (id: string) => {
    setLoadOpen(false);
    sfx("droplet");
    void inspect({ demo: id });
  };

  const loadSaved = (model: SavedModel) => {
    setLoadOpen(false);
    sfx("droplet");
    void inspect({ spec: model.document });
  };

  const startSidebarDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    sidebarDragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSidebarDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = sidebarDragRef.current;
    if (!drag) return;
    const next = Math.min(520, Math.max(264, drag.startWidth + event.clientX - drag.startX));
    setSidebarWidth(next);
  };

  const endSidebarDrag = () => {
    if (!sidebarDragRef.current) return;
    sidebarDragRef.current = null;
    window.localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth));
    sfxThrottled("tick", 150);
  };

  /**
   * The editor, offered to the browser's own agent.
   *
   * Same capabilities as the HTTP MCP server, pointed at the document on
   * screen: describe it, replace it, capture a place into it, save the STL.
   * Where the browser has no WebMCP, none of this exists.
   */
  useWebMcpTools(() => [
    {
      name: "printa_get_model",
      description: "Read the model currently open in the Printa editor: its Printa Spec document and printed dimensions.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => say(
        result
          ? `${result.document.name} — ${result.stats.widthMm.toFixed(1)} × ${result.stats.depthMm.toFixed(1)} × ${result.stats.heightMm.toFixed(1)} mm, ${result.stats.triangles.toLocaleString()} triangles.

${result.spec}`
          : "Nothing is loaded in the editor yet.",
      ),
    },
    {
      name: "printa_set_model",
      description: "Replace the model in the Printa editor with a complete Printa Spec 1.0 document, given as JSON. The viewport recompiles immediately.",
      inputSchema: {
        type: "object",
        properties: { spec: { type: "string", description: "A complete Printa Spec 1.0 document as JSON." } },
        required: ["spec"],
      },
      execute: async (input) => {
        const spec = String((input as unknown as { spec?: string }).spec ?? "");
        try {
          await inspect({ spec: JSON.parse(spec) as ModelDocument });
          return say("Loaded into the editor.");
        } catch (error) {
          return say(`That spec did not load: ${error instanceof Error ? error.message : "invalid JSON"}`);
        }
      },
    },
    {
      name: "printa_capture_place",
      description: "Find a real place by name or address and capture it as a printable model — mapped buildings and streets over sampled ground — then open it in the editor.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "An address, suburb, city or landmark." },
          radiusM: { type: "number", description: "Half-width of the ground to capture in metres; 300-500 suits a city block." },
        },
        required: ["query"],
      },
      execute: async (input) => {
        const { query, radiusM } = input as unknown as { query?: string; radiusM?: number };
        try {
          const hits = await searchPlaces(String(query ?? ""));
          const hit = hits[0];
          if (!hit) return say(`Nothing found for "${query}".`);
          const radius = Math.min(radiusM ?? hit.radiusM, MAX_CAPTURE_RADIUS_M.buildings);
          const captured = await capturePlace({ lat: hit.lat, lng: hit.lng, radiusM: radius, capture: "buildings", label: hit.label });
          const document = placeCaptureDocument({
            name: hit.label.split(",")[0]?.trim() || hit.label,
            lat: hit.lat,
            lng: hit.lng,
            radiusM: radius,
            capture: "buildings",
            baked: captured,
          });
          await inspect({ spec: document });
          return say(`Captured ${hit.label} at ${radius * 2} m across. ${captured.note}`);
        } catch (error) {
          return say(`That place could not be captured: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      },
    },
    {
      name: "printa_download_stl",
      description: "Download the model currently open in the Printa editor as a binary STL.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        if (!result) return say("Nothing is loaded to download.");
        await downloadStl();
        return say(`Saving ${result.document.name} as STL.`);
      },
    },
  ]);

  const sliceMm = result ? slice * result.stats.heightMm : 0;

  const updateDisplay = (recipe: (display: ModelDocument["display"]) => void) => {
    if (!document) return;
    const next = structuredClone(document);
    recipe(next.display);
    updateDocument(next);
  };

  return (
    <TooltipProvider>
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        {/* Top bar */}
        <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
          <BrandLink />
          <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
          <span className="hidden min-w-0 truncate text-[13px] font-medium text-foreground sm:block">
            {result?.document.name ?? "Building form…"}
          </span>
          <span className={cn("hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex", liveUpdating && "text-[var(--accent-tool)]")}>
            {liveUpdating ? <LoaderCircle className="animate-spin" size={11} /> : <Check size={11} />}
            {liveUpdating ? "Compiling…" : "Ready"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant={chatOpen ? "secondary" : "ghost"}
              size="sm"
              className={cn(!chatOpen && "text-[var(--accent-tool)]")}
              onClick={() => { sfx("page"); setChatDocked(!chatOpen); }}
              data-cuelume-press
            >
              <Sparkles /> <span className="hidden sm:inline">Assistant</span>
            </Button>
            {document && documentHasSim(document.root) && (
              <>
                <span className="mx-0.5 h-4 w-px bg-border" />
                <Button
                  variant={simStale ? "default" : "outline"}
                  size="sm"
                  disabled={liveUpdating}
                  onClick={() => simulate()}
                  className={cn(simStale && "bg-[var(--accent-tool)] text-white hover:bg-[var(--accent-tool)]/90")}
                  data-cuelume-press
                  title="Run the fluid / cloth simulation to its configured frame count"
                >
                  {liveUpdating ? <LoaderCircle className="animate-spin" /> : <Play fill="currentColor" />}
                  {simStale ? "Simulate ●" : "Simulate"}
                </Button>
                <div className="flex items-center rounded-md border border-border" title="Step the simulation frame count and re-bake">
                  <Button variant="ghost" size="icon-sm" aria-label="Simulate 10 fewer frames" disabled={liveUpdating} onClick={() => simulate(-10)}><Minus /></Button>
                  <span className="min-w-[3.5rem] text-center text-[11px] tabular-nums text-muted-foreground">{simFrameCount(document.root)} fr</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Simulate 10 more frames" disabled={liveUpdating} onClick={() => simulate(10)}><Plus /></Button>
                </div>
              </>
            )}
            <span className="mx-0.5 h-4 w-px bg-border" />
            {/* Load/Save collapse into the overflow menu on narrow screens so the
                bar never wraps behind the primary Download action. */}
            {authAvailable && (
              account ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="sm" className="hidden md:inline-flex" data-cuelume-press>
                      <UserRound /> <span className="max-w-[9rem] truncate">{account.name ?? account.email}</span>
                    </Button>
                  } />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={openLoad}><FolderOpen /> My projects</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { window.location.href = "/sign-out?next=/editor"; }}><LogOut /> Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => { window.location.href = "/sign-in?next=/editor"; }} data-cuelume-press>
                  <UserRound /> Sign in
                </Button>
              )
            )}
            <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={openLoad} data-cuelume-press><FolderOpen /> Load</Button>
            <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={openSave} disabled={!document} data-cuelume-press><Save /> Save</Button>
            <Button
              size="sm"
              disabled={!result || liveUpdating || downloading}
              onClick={() => void downloadStl()}
              data-cuelume-press
            >
              <Download /> <span className="hidden sm:inline">{liveUpdating ? "Updating…" : downloading ? "Compiling…" : "Download STL"}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More"><Ellipsis /></Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="lg:hidden" onClick={openLoad}><FolderOpen /> Load</DropdownMenuItem>
                <DropdownMenuItem className="lg:hidden" disabled={!document} onClick={openSave}><Save /> Save</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { sfx("page"); setSpecOpen(true); }}><Braces /> Raw spec (advanced)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open("/skills", "_blank")}><ScrollText /> Agent skill</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open("/api/model/schema", "_blank")}><Braces /> JSON schema</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside
            className="scroll-slim flex min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-background px-3 py-3"
            style={{ width: `min(${sidebarWidth}px, 46vw)` }}
          >
            {document && <SpecInspector document={document} fonts={fonts} onChange={updateDocument} />}
          </aside>

          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize"
            onPointerDown={startSidebarDrag}
            onPointerMove={moveSidebarDrag}
            onPointerUp={endSidebarDrag}
            onPointerCancel={endSidebarDrag}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[var(--accent-tool)] group-active:bg-[var(--accent-tool)]" />
          </div>

          {/* Viewport */}
          <section className="relative min-w-0 flex-1 bg-[var(--stage)]">
            {result && preview && document && (
              <ModelViewport
                source={preview}
                materialPreset={result.materialPreset}
                display={document.display}
                units={document.units}
                buildVolume={document.print.buildVolume}
                shading={shading}
                slice={slice}
                pathTraced={pathTraced}
                onSamples={handleSamples}
                onReady={handleModelReady}
                onRegisterFrame={registerFrame}
              />
            )}
            {!modelReady && (
              <div className="absolute inset-0 z-30 flex items-center justify-center gap-2.5 bg-black/60 text-[12px] text-white/70 backdrop-blur-sm">
                <LoaderCircle className="animate-spin" size={17} /> {loading ? "Evaluating model graph…" : "Loading printable mesh…"}
              </div>
            )}

            {/* One tool rail holds every viewport control, so the stage stays
                clear instead of sprouting a floating button per feature. */}
            <div className="absolute right-3.5 top-3.5 z-20 flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur">
              <RailButton label="Fit model in view" onClick={() => { sfx("tick"); frameModelRef.current(); }}>
                <Scan size={15} />
              </RailButton>

              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="View settings"
                      title="View settings"
                      onClick={() => sfx("page")}
                    >
                      <Eye size={15} />
                    </button>
                  }
                />
                <PopoverContent align="end" className="w-64 p-3">
                <div className="grid gap-2.5">
                  <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">View settings</span>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground">Shading</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                      {(["smooth", "flat"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={cn(
                            "rounded-md px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors",
                            shading === mode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => {
                            sfx("toggle");
                            setShading(mode);
                            window.localStorage.setItem(SHADING_KEY, mode);
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground">Render</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                      {([["realtime", "Realtime"], ["pathTraced", "Path traced"]] as const).map(([key, labelText]) => {
                        const active = (key === "pathTraced") === pathTraced;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={cn(
                              "rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                              active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => { sfx("toggle"); setPathTraced(key === "pathTraced"); }}
                          >
                            {labelText}
                          </button>
                        );
                      })}
                    </div>
                    {pathTraced && (
                      <span className="flex items-center gap-1.5 px-0.5 font-mono text-[10px] text-muted-foreground">
                        {pathSamples < 0 ? (
                          <><TriangleAlert size={11} className="text-amber-600" /> Path tracing unavailable on this device</>
                        ) : pathSamples >= PATH_TRACE_SAMPLE_CAP ? (
                          <><Check size={11} className="text-emerald-600" /> Render complete · {pathSamples} samples</>
                        ) : (
                          <><LoaderCircle size={11} className="animate-spin" /> Refining · {pathSamples}/{PATH_TRACE_SAMPLE_CAP} samples</>
                        )}
                      </span>
                    )}
                  </div>
                  {document && <>
                    <ToggleField label="Floor" value={document.display.floor} onChange={(value) => updateDisplay((display) => { display.floor = value; })} />
                    <ToggleField label="Grid" value={document.display.grid} onChange={(value) => updateDisplay((display) => { display.grid = value; })} />
                    <ToggleField label="Size labels" detail="Width & depth callouts on the floor" value={document.display.dimensions.visible} onChange={(value) => updateDisplay((display) => { display.dimensions.visible = value; })} />
                  </>}
                  <ToggleField
                    label="Sounds"
                    detail="Subtle interface audio"
                    value={soundOn}
                    onChange={(value) => { setSoundOn(value); setSfxEnabled(value); }}
                  />
                  </div>
                </PopoverContent>
              </Popover>

              <RailButton label="Cutaway view" active={sliceOpen || slice <= 0.998} onClick={() => { sfx("page"); setSliceOpen((open) => !open); }}>
                <Layers3 size={15} />
              </RailButton>

              {/* The slice slider drops out of the rail so it reads as part of
                  the same cluster rather than a stray control mid-canvas. */}
              {sliceOpen && (
                <div className="flex flex-col items-center gap-2 border-t border-white/10 pb-1 pt-2.5">
                  <div className="h-32">
                    <Slider
                      orientation="vertical"
                      min={0.02}
                      max={1}
                      step={0.005}
                      value={[slice]}
                      aria-label="Cutaway height"
                      onValueChange={(value) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        if (next !== slice) sfxThrottled("tick", 80);
                        setSlice(next);
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-white/60">{slice > 0.998 ? "Full" : `${sliceMm.toFixed(1)}mm`}</span>
                </div>
              )}
            </div>

            {/* Status bar: everything the model is, on one line */}
            <div className="pointer-events-none absolute inset-x-3.5 bottom-3.5 z-10 flex flex-wrap items-center gap-1.5">
              {result && <>
                {statChip("Size", `${result.stats.widthMm.toFixed(1)} × ${result.stats.depthMm.toFixed(1)} × ${result.stats.heightMm.toFixed(1)} mm`)}
                {statChip("Mesh", `${result.stats.triangles.toLocaleString()} tris${previewQuality ? " · preview" : ""}`)}
                {!previewQuality && statChip("Volume", `${(result.stats.volumeEstimateMm3 / 1000).toFixed(1)} cm³`)}
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] backdrop-blur",
                  result.exceedsBuildVolume ? "border border-amber-300/40 bg-amber-950/60 text-amber-200" : "border border-emerald-300/25 bg-emerald-950/50 text-emerald-200",
                )}>
                  {result.exceedsBuildVolume ? <TriangleAlert size={12} /> : <Check size={12} />}
                  {result.exceedsBuildVolume ? "Too big for printer" : "Ready to print"}
                </span>
              </>}
              {error && !loading && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-300/40 bg-red-950/70 px-3 py-1.5 text-[11px] text-red-200 backdrop-blur">
                  <TriangleAlert size={12} /> {error}
                </span>
              )}
              <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-[10px] text-white/45 backdrop-blur lg:flex">
                <Rotate3D size={11} /> Drag to orbit · scroll to zoom
              </span>
            </div>
          </section>

          {/* AI assistant */}
          {chatOpen && (
            <ChatPanel
              currentSpec={spec}
              width={chatWidth}
              onResize={setChatWidth}
              onClose={() => setChatDocked(false)}
              onApply={(specJson) => { try { void inspect({ spec: JSON.parse(specJson) as ModelDocument }); } catch { /* ignore malformed */ } }}
              onApplyModel={(modelId) => void inspect({ model: modelId })}
            />
          )}
        </div>

        {/* Load dialog */}
        <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">Load a model</DialogTitle>
              <DialogDescription>Start from a built-in example, or reopen something you saved.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5">
              <section>
                <h3 className="mb-2 font-heading text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Starting points</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DEMO_MODEL_CARDS.map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      className="grid gap-1.5 rounded-lg border border-border bg-background p-2.5 text-left transition-colors hover:border-[var(--accent-tool)] hover:bg-[var(--accent-tool-soft)]"
                      onClick={() => loadDemo(demo.id)}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        {demo.family === "simulation"
                          ? <Droplets size={13} className="shrink-0" />
                          : demo.family === "place"
                            ? <MapPin size={13} className="shrink-0" />
                            : <Box size={13} className="shrink-0" />}
                        {demo.name}
                      </span>
                      <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{demo.description}</span>
                    </button>
                  ))}
                </div>
              </section>
              {authAvailable && (
                <section>
                  <h3 className="mb-2 font-heading text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {account ? "Your projects" : "Your projects, anywhere"}
                  </h3>
                  {!account ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1">Sign in and your projects follow you to any browser.</span>
                      <Button size="xs" onClick={() => { window.location.href = "/sign-in?next=/editor"; }}><UserRound /> Sign in</Button>
                    </div>
                  ) : cloudProjects.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                      Nothing saved to your account yet — <strong>Save</strong> keeps the current model against {account.email}.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      {cloudProjects.map((project) => (
                        <div key={project.key} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setLoadOpen(false); sfx("droplet"); void inspect({ model: project.key }); }}>
                            <span className="block truncate text-xs font-semibold">{project.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              Saved {new Date(project.updatedAt).toLocaleDateString()} · {(project.bytes / 1024).toFixed(0)} KB
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive"
                            aria-label={`Delete ${project.name}`}
                            onClick={() => { sfx("whisper"); void deleteCloudProject(project.key).then(refreshProjects).catch(() => undefined); }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
              <section>
                <h3 className="mb-2 font-heading text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Saved in this browser</h3>
                {savedModels.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                    Nothing saved yet — use <strong>Save</strong> in the top bar to keep a copy of the current model in this browser.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    {savedModels.map((model) => (
                      <div key={model.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadSaved(model)}>
                          <span className="block truncate text-xs font-semibold">{model.name}</span>
                          <span className="text-[10px] text-muted-foreground">Saved {new Date(model.savedAt).toLocaleDateString()}</span>
                        </button>
                        <Button variant="ghost" size="xs" onClick={() => loadSaved(model)}>Open</Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive"
                          aria-label={`Delete ${model.name}`}
                          onClick={() => { sfx("whisper"); deleteSavedModel(model.id); setSavedModels(listSavedModels()); }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </DialogContent>
        </Dialog>

        {/* Raw spec dialog */}
        <Dialog open={specOpen} onOpenChange={setSpecOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-heading">Raw model spec</DialogTitle>
              <DialogDescription>The whole model as editable JSON or YAML — for power users and agents.</DialogDescription>
            </DialogHeader>
            <Textarea
              value={spec}
              onChange={(event) => setSpec(event.target.value)}
              spellCheck={false}
              rows={20}
              aria-label="Procedural model YAML or JSON spec"
              className="max-h-[55dvh] resize-y bg-[#152724] font-mono text-[11px] leading-relaxed text-[#f4eee2] caret-[#ff4d8b] dark:bg-[#152724]"
            />
            {error && <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-2.5 py-2 font-mono text-[10px] text-destructive">{error}</div>}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSpecOpen(false)}>Close</Button>
              <Button size="sm" disabled={loading || !spec.trim()} onClick={() => { sfx("press"); void inspect({ spec }); }}>
                {loading ? <LoaderCircle className="animate-spin" /> : <Play fill="currentColor" />} Apply spec
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Save dialog */}
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-heading">Save model</DialogTitle>
              <DialogDescription>
                {account
                  ? `Saves to ${account.email}, so you can open it from any browser.`
                  : "Keeps a copy in this browser. Sign in to save it to your account instead."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="save-name" className="text-[10px] font-semibold text-muted-foreground">Name</Label>
              <Input
                id="save-name"
                value={saveName}
                autoFocus
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void handleSave(); }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={!saveName.trim() || saving}>
                {saving ? <LoaderCircle className="animate-spin" /> : <Save />} Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
