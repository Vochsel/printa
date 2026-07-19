"use client";

import Link from "next/link";
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
  Play,
  Rotate3D,
  Save,
  Scan,
  ScrollText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { bind } from "cuelume";
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
import { DEMO_MODEL_CARDS, type DemoModelId } from "@/lib/demo-models";
import { printMaterialPreset, type PrintMaterialPreset } from "@/lib/material-presets";
import type { ModelDocument } from "@/lib/model-spec";
import { initSfx, isSfxEnabled, setSfxEnabled, sfx, sfxThrottled } from "@/lib/sfx";
import { deleteSavedModel, listSavedModels, saveModel, type SavedModel } from "@/lib/user-models";
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

function encodeDocument(document: ModelDocument) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
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

function ModelViewport({ source, materialPreset, display, units, buildVolume, shading, slice, onReady }: {
  source: PreviewSource;
  materialPreset: PrintMaterialPreset;
  display: ModelDocument["display"];
  units: ModelDocument["units"];
  buildVolume: [number, number, number];
  shading: ShadingMode;
  slice: number;
  onReady?: () => void;
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
  const hasFramedRef = useRef(false);
  const displayRef = useRef(display);
  const unitsRef = useRef(units);
  const buildVolumeRef = useRef(buildVolume);
  const materialPresetRef = useRef(materialPreset);
  const shadingRef = useRef(shading);
  const sliceRef = useRef(slice);
  const slicePlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));

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
    const next = mode === "smooth" ? toCreasedNormals(base, THREE.MathUtils.degToRad(32)) : base;
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
    camera.position.set(170, -210, 150);
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
      if (buildPlateRef.current?.visible) box.expandByObject(buildPlateRef.current);
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
      if (modelRef.current) {
        if (modelRef.current.geometry !== baseGeometryRef.current) modelRef.current.geometry.dispose();
        modelRef.current.material.dispose();
      }
      baseGeometryRef.current?.dispose();
      disposeObject(dimensionsRef.current);
      disposeObject(buildPlateRef.current);
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
    invalidateRef.current(3);
  }, [applySlice, materialPreset]);

  useEffect(() => { applyShading(shading); }, [applyShading, shading]);
  useEffect(() => { applySlice(slice); }, [applySlice, slice]);

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
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0 [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full" aria-label="Interactive procedural model preview" />
      <button
        className="absolute right-3.5 top-3.5 z-10 grid size-9 place-items-center rounded-lg border border-white/15 bg-black/45 text-white/75 backdrop-blur transition-colors hover:text-white"
        type="button"
        onClick={() => { sfx("tick"); frameRef.current(); }}
        aria-label="Frame model"
        title="Fit the model in view"
      >
        <Scan size={15} />
      </button>
    </div>
  );
}

function statChip(label: string, value: string) {
  return (
    <span className="pointer-events-none flex items-baseline gap-1.5 rounded-full border border-white/12 bg-black/45 px-3 py-1.5 font-mono text-[10px] text-white/80 backdrop-blur">
      <span className="uppercase tracking-wide text-white/45">{label}</span>
      {value}
    </span>
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
  const [soundOn, setSoundOn] = useState(() => typeof window === "undefined" || isSfxEnabled());
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveSequenceRef = useRef(0);
  const compiledGeometryKeyRef = useRef("");
  const modelWasReadyRef = useRef(false);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

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
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const inspect = useCallback(async (payload: { demo?: string; spec?: string | ModelDocument; encoded?: string }) => {
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
      setResult(data);
      setDocument(data.document);
      setSpec(data.spec);
      setPreview({
        key: data.stlUrl,
        url: `/api/model/stl?spec=${data.encoded}&preview=true`,
      });
      compiledGeometryKeyRef.current = geometryKey(data.document);
      setPreviewQuality(false);
      setSlice(1);
      if (data.encoded) window.history.replaceState(window.history.state, "", `/editor?spec=${data.encoded}`);
    } catch (nextError) {
      sfx("error");
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
      const stlUrl = `/make/model.stl?spec=${encoded}`;
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
        stlUrl: `/make/model.stl?spec=${encoded}`,
        studioUrl,
        materialPreset: documentMaterial(next.root),
        exceedsBuildVolume: previous.stats.widthMm > next.print.buildVolume[0]
          || previous.stats.depthMm > next.print.buildVolume[1]
          || previous.stats.heightMm > next.print.buildVolume[2],
      } : previous);
      window.history.replaceState(window.history.state, "", studioUrl);
      return;
    }
    setLiveUpdating(true);
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

  const openLoad = () => {
    setSavedModels(listSavedModels());
    setLoadOpen(true);
    sfx("page");
  };

  const openSave = () => {
    setSaveName(document?.name ?? "");
    setSaveOpen(true);
    sfx("page");
  };

  const handleSave = () => {
    if (!document) return;
    saveModel(saveName, document);
    setSaveOpen(false);
    sfx("success");
  };

  const loadDemo = (id: DemoModelId) => {
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
        <header className="z-20 flex h-12 shrink-0 items-center gap-2.5 border-b border-border bg-background px-3">
          <Link className="flex items-center gap-2 font-heading text-[13px] font-bold tracking-[0.14em]" href="/" aria-label="Printa home">
            <span className="grid size-6 place-items-center rounded-[5px] bg-foreground text-background"><Layers3 size={13} /></span>
            PRINTA
          </Link>
          <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
          <span className="hidden truncate text-[13px] font-medium text-foreground sm:block">
            {result?.document.name ?? "Building form…"}
          </span>
          <span className={cn("hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70 md:flex", liveUpdating && "text-[#c92f69]")}>
            {liveUpdating ? <LoaderCircle className="animate-spin" size={11} /> : <Check size={11} />}
            {liveUpdating ? "Compiling…" : "Ready"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={openLoad} data-cuelume-press><FolderOpen /> Load</Button>
            <Button variant="ghost" size="sm" onClick={openSave} disabled={!document} data-cuelume-press><Save /> Save</Button>
            <Button
              size="sm"
              disabled={!result || liveUpdating}
              onClick={() => { if (result) { sfx("chime"); window.open(result.stlUrl, "_blank"); } }}
              data-cuelume-press
            >
              <Download /> {liveUpdating ? "Updating…" : "Download STL"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More"><Ellipsis /></Button>} />
              <DropdownMenuContent align="end">
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
            className="flex min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-background px-3 py-3 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]"
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
          <section className="relative min-w-0 flex-1 bg-[#11110f]">
            {result && preview && document && (
              <ModelViewport
                source={preview}
                materialPreset={result.materialPreset}
                display={document.display}
                units={document.units}
                buildVolume={document.print.buildVolume}
                shading={shading}
                slice={slice}
                onReady={handleModelReady}
              />
            )}
            {!modelReady && (
              <div className="absolute inset-0 z-30 flex items-center justify-center gap-2.5 bg-black/60 font-mono text-[11px] text-white/70 backdrop-blur-sm">
                <LoaderCircle className="animate-spin" size={17} /> {loading ? "Evaluating model graph…" : "Loading printable mesh…"}
              </div>
            )}

            {/* Orbit hint */}
            <span className="pointer-events-none absolute left-3.5 top-3.5 z-10 flex items-center gap-1.5 rounded-full border border-white/12 bg-black/45 px-2.5 py-1.5 font-mono text-[9px] text-white/60 backdrop-blur">
              <Rotate3D size={12} /> Drag to orbit · scroll to zoom
            </span>

            {/* View settings */}
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="absolute right-3.5 top-[60px] z-10 grid size-9 place-items-center rounded-lg border border-white/15 bg-black/45 text-white/75 backdrop-blur transition-colors hover:text-white"
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

            {/* Z slice */}
            <div className="absolute right-3.5 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-xl border border-white/12 bg-black/45 px-2 py-3 backdrop-blur">
              <Layers3 size={13} className="text-white/55" />
              <div className="h-36">
                <Slider
                  orientation="vertical"
                  min={0.02}
                  max={1}
                  step={0.005}
                  value={[slice]}
                  aria-label="Slice height"
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (next !== slice) sfxThrottled("tick", 80);
                    setSlice(next);
                  }}
                />
              </div>
              <span className="font-mono text-[9px] text-white/60">{slice > 0.998 ? "Full" : `${sliceMm.toFixed(1)}mm`}</span>
            </div>

            {/* Stats */}
            <div className="absolute bottom-3.5 left-3.5 right-16 z-10 flex flex-wrap items-center gap-1.5">
              {result && <>
                {statChip("Size", `${result.stats.widthMm.toFixed(1)} × ${result.stats.depthMm.toFixed(1)} × ${result.stats.heightMm.toFixed(1)} mm`)}
                {statChip("Mesh", `${result.stats.triangles.toLocaleString()} tris${previewQuality ? " · preview" : ""}`)}
                {!previewQuality && statChip("Volume", `${(result.stats.volumeEstimateMm3 / 1000).toFixed(1)} cm³`)}
                <span className={cn(
                  "pointer-events-none flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] backdrop-blur",
                  result.exceedsBuildVolume ? "border border-amber-300/40 bg-amber-950/60 text-amber-200" : "border border-emerald-300/25 bg-emerald-950/50 text-emerald-200",
                )}>
                  {result.exceedsBuildVolume ? <TriangleAlert size={12} /> : <Check size={12} />}
                  {result.exceedsBuildVolume ? "Too big for printer" : "Ready to print"}
                </span>
              </>}
              {error && !loading && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-300/40 bg-red-950/70 px-3 py-1.5 font-mono text-[10px] text-red-200 backdrop-blur">
                  <TriangleAlert size={12} /> {error}
                </span>
              )}
            </div>
          </section>
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
                        {demo.family === "simulation" ? <Droplets size={13} className="shrink-0" /> : <Box size={13} className="shrink-0" />}
                        {demo.name}
                      </span>
                      <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{demo.description}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-heading text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Your saved models</h3>
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
              <DialogDescription>Keeps a copy in this browser. Use Download STL for a printable file.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="save-name" className="text-[10px] font-semibold text-muted-foreground">Name</Label>
              <Input
                id="save-name"
                value={saveName}
                autoFocus
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") handleSave(); }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={!saveName.trim()}><Save /> Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
