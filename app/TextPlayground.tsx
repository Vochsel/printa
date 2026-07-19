"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Box,
  Check,
  ChevronDown,
  Download,
  Focus,
  Grid3X3,
  Layers3,
  MousePointer2,
  Rotate3D,
  Search,
  Settings2,
  Sparkles,
  TriangleAlert,
  Type,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { WebGLPathTracer } from "three-gpu-pathtracer";
import {
  PRINT_MATERIAL_PRESETS,
  printMaterialPreset,
  type PrintMaterialPreset,
} from "@/lib/material-presets";
import {
  createTextGeometry,
  BUILD_VOLUME_WARNING_MM,
  geometryStats,
  normalizeTextModelOptions,
  parseOpenTypeFont,
  type TextModelStats,
} from "@/lib/text-geometry";

type ModelState = {
  text: string;
  font: string;
  sizeMm: number;
  depthMm: number;
  bevelMm: number;
  bevelSegments: number;
  curveSegments: number;
  bevelSide: "both" | "top" | "bottom";
  smoothNormals: boolean;
  textCase: "original" | "uppercase" | "lowercase" | "titlecase";
  fontWeight: "regular" | "bold";
  italic: boolean;
  underline: boolean;
};

const INITIAL_MODEL: ModelState = {
  text: "HELLO",
  font: "roboto",
  sizeMm: 36,
  depthMm: 4,
  bevelMm: 0.6,
  bevelSegments: 3,
  curveSegments: 10,
  bevelSide: "both",
  smoothNormals: true,
  textCase: "original",
  fontWeight: "regular",
  italic: false,
  underline: false,
};

function queryNumber(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function queryBoolean(params: URLSearchParams, key: string, fallback: boolean) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  return raw === "true" ? true : raw === "false" ? false : fallback;
}

function readEditorQuery() {
  const params = new URLSearchParams(window.location.search);
  const rawText = (params.get("text") ?? INITIAL_MODEL.text).slice(0, 24);
  const textCase = ["original", "uppercase", "lowercase", "titlecase"].includes(params.get("textCase") ?? "")
    ? params.get("textCase") as ModelState["textCase"]
    : INITIAL_MODEL.textCase;
  const fontWeight = params.get("fontWeight") === "bold" ? "bold" : "regular";
  const bevelSide = ["both", "top", "bottom"].includes(params.get("bevelSide") ?? "")
    ? params.get("bevelSide") as ModelState["bevelSide"]
    : INITIAL_MODEL.bevelSide;
  const normalized = normalizeTextModelOptions({
    text: rawText,
    font: params.get("font") ?? INITIAL_MODEL.font,
    sizeMm: queryNumber(params, "size", INITIAL_MODEL.sizeMm),
    depthMm: queryNumber(params, "depth", INITIAL_MODEL.depthMm),
    bevelMm: queryNumber(params, "bevel", INITIAL_MODEL.bevelMm),
    bevelSegments: queryNumber(params, "bevelSegments", INITIAL_MODEL.bevelSegments),
    curveSegments: queryNumber(params, "curveSegments", INITIAL_MODEL.curveSegments),
    bevelSide,
    smoothNormals: queryBoolean(params, "smoothNormals", INITIAL_MODEL.smoothNormals),
    textCase,
    fontWeight,
    italic: queryBoolean(params, "italic", INITIAL_MODEL.italic),
    underline: queryBoolean(params, "underline", INITIAL_MODEL.underline),
  });
  return {
    model: { ...normalized, text: rawText } satisfies ModelState,
    units: params.get("units") === "cm" ? "cm" as const : "mm" as const,
    materialPreset: printMaterialPreset(params.get("material") ?? "pla-orange").id,
    highQuality: queryBoolean(params, "highQuality", false),
  };
}

function editorQuery(model: ModelState, units: "mm" | "cm", materialPreset: PrintMaterialPreset, highQuality: boolean) {
  return new URLSearchParams({
    text: model.text,
    font: model.font,
    size: String(model.sizeMm),
    depth: String(model.depthMm),
    bevel: String(model.bevelMm),
    bevelSegments: String(model.bevelSegments),
    curveSegments: String(model.curveSegments),
    bevelSide: model.bevelSide,
    smoothNormals: String(model.smoothNormals),
    textCase: model.textCase,
    fontWeight: model.fontWeight,
    italic: String(model.italic),
    underline: String(model.underline),
    units,
    material: materialPreset,
    highQuality: String(highQuality),
  });
}

type FontSummary = { id: string; family: string; category: string };

const clientFontCache = new Map<string, Promise<{ font: ReturnType<typeof parseOpenTypeFont>; syntheticItalic: boolean }>>();
const previewFontCache = new Map<string, Promise<void>>();

function previewFontFamily(id: string) {
  return `Printa Preview ${id}`;
}

function loadFontPreview(font: FontSummary) {
  if (typeof window === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  if (!previewFontCache.has(font.id)) {
    const family = previewFontFamily(font.id);
    const text = `${font.family} Aa`;
    const url = `/api/font?id=${encodeURIComponent(font.id)}&text=${encodeURIComponent(text)}&weight=regular&italic=false`;
    previewFontCache.set(
      font.id,
      new FontFace(family, `url("${url}")`).load().then((face) => {
        document.fonts.add(face);
      }).catch(() => undefined),
    );
  }
  return previewFontCache.get(font.id)!;
}

function loadClientFont(id: string, text: string, fontWeight: "regular" | "bold", italic: boolean) {
  const cacheKey = `${id}:${fontWeight}:${italic}:${text}`;
  if (!clientFontCache.has(cacheKey)) {
    clientFontCache.set(
      cacheKey,
      fetch(`/api/font?id=${encodeURIComponent(id)}&text=${encodeURIComponent(text)}&weight=${fontWeight}&italic=${italic}`)
        .then((response) => {
          if (!response.ok) throw new Error("Font unavailable");
          const syntheticItalic = response.headers.get("X-Printa-Synthetic-Italic") === "true";
          return response.arrayBuffer().then((buffer) => ({ font: parseOpenTypeFont(buffer), syntheticItalic }));
        })
    );
  }
  return clientFontCache.get(cacheKey)!;
}

function formatMm(value: number) {
  return `${value.toFixed(value < 10 ? 1 : 0)} mm`;
}

function buildDownloadUrl(model: ModelState) {
  const params = new URLSearchParams({
    text: model.text,
    font: model.font,
    size: String(model.sizeMm),
    depth: String(model.depthMm),
    bevel: String(model.bevelMm),
    bevelSegments: String(model.bevelSegments),
    curveSegments: String(model.curveSegments),
    bevelSide: model.bevelSide,
    smoothNormals: String(model.smoothNormals),
    textCase: model.textCase,
    fontWeight: model.fontWeight,
    italic: String(model.italic),
    underline: String(model.underline),
  });
  return `/api/stl?${params.toString()}`;
}

function createPreviewMaterial(id: PrintMaterialPreset) {
  const preset = printMaterialPreset(id);
  return new THREE.MeshPhysicalMaterial({
    color: preset.color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: Math.min(0.5, preset.roughness + 0.08),
    transmission: preset.transmission,
    thickness: preset.transmission > 0 ? 1.4 : 0,
    ior: 1.46,
  });
}

function createDimensionLabel(text: string, color: string, worldSize: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(17, 17, 16, 0.9)";
  context.beginPath();
  context.roundRect(3, 3, 506, 122, 24);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = "#f7f3e9";
  context.font = "700 48px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldSize * 4, worldSize), material);
  mesh.renderOrder = 12;
  return mesh;
}

function createGroundDimensions(box: THREE.Box3) {
  const group = new THREE.Group();
  group.name = "ground-dimensions";
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;
  const largest = Math.max(width, height);
  const margin = THREE.MathUtils.clamp(largest * 0.09, 7, 34);
  const arrow = THREE.MathUtils.clamp(largest * 0.025, 2.5, 9);
  const labelSize = THREE.MathUtils.clamp(largest * 0.035, 4, 10);
  const z = 0.32;
  const widthY = box.min.y - margin;
  const heightX = box.min.x - margin;
  const widthColor = "#ff8258";
  const heightColor = "#8294ff";

  const addSegments = (points: THREE.Vector3[], color: string, opacity = 1) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 10;
    group.add(lines);
  };

  addSegments([
    new THREE.Vector3(box.min.x, widthY, z), new THREE.Vector3(box.max.x, widthY, z),
    new THREE.Vector3(box.min.x, widthY, z), new THREE.Vector3(box.min.x + arrow, widthY + arrow * 0.52, z),
    new THREE.Vector3(box.min.x, widthY, z), new THREE.Vector3(box.min.x + arrow, widthY - arrow * 0.52, z),
    new THREE.Vector3(box.max.x, widthY, z), new THREE.Vector3(box.max.x - arrow, widthY + arrow * 0.52, z),
    new THREE.Vector3(box.max.x, widthY, z), new THREE.Vector3(box.max.x - arrow, widthY - arrow * 0.52, z),
  ], widthColor);
  addSegments([
    new THREE.Vector3(heightX, box.min.y, z), new THREE.Vector3(heightX, box.max.y, z),
    new THREE.Vector3(heightX, box.min.y, z), new THREE.Vector3(heightX + arrow * 0.52, box.min.y + arrow, z),
    new THREE.Vector3(heightX, box.min.y, z), new THREE.Vector3(heightX - arrow * 0.52, box.min.y + arrow, z),
    new THREE.Vector3(heightX, box.max.y, z), new THREE.Vector3(heightX + arrow * 0.52, box.max.y - arrow, z),
    new THREE.Vector3(heightX, box.max.y, z), new THREE.Vector3(heightX - arrow * 0.52, box.max.y - arrow, z),
  ], heightColor);
  addSegments([
    new THREE.Vector3(box.min.x, box.min.y, z), new THREE.Vector3(box.min.x, widthY - arrow, z),
    new THREE.Vector3(box.max.x, box.min.y, z), new THREE.Vector3(box.max.x, widthY - arrow, z),
    new THREE.Vector3(box.min.x, box.min.y, z), new THREE.Vector3(heightX - arrow, box.min.y, z),
    new THREE.Vector3(box.min.x, box.max.y, z), new THREE.Vector3(heightX - arrow, box.max.y, z),
  ], "#817d74", 0.58);

  const widthLabel = createDimensionLabel(`W  ${width.toFixed(1)} mm`, widthColor, labelSize);
  widthLabel.position.set((box.min.x + box.max.x) / 2, widthY - labelSize * 1.05, z + 0.03);
  group.add(widthLabel);
  const heightLabel = createDimensionLabel(`H  ${height.toFixed(1)} mm`, heightColor, labelSize);
  heightLabel.rotation.z = Math.PI / 2;
  heightLabel.position.set(heightX - labelSize * 1.05, (box.min.y + box.max.y) / 2, z + 0.03);
  group.add(heightLabel);
  return group;
}

function disposeObject(group: THREE.Object3D) {
  group.traverse((child) => {
    const object = child as THREE.Mesh | THREE.LineSegments;
    object.geometry?.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach((material) => {
      if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    });
  });
}

function createPathTraceScene(mesh: THREE.Mesh) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111315");
  const tracedModel = new THREE.Mesh(mesh.geometry, (mesh.material as THREE.MeshPhysicalMaterial).clone());
  tracedModel.castShadow = true;
  tracedModel.receiveShadow = true;
  tracedModel.name = "path-model";
  scene.add(tracedModel);

  const bounds = new THREE.Box3().setFromObject(mesh);
  const span = Math.max(180, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 2.4, span * 2),
    new THREE.MeshStandardMaterial({ color: "#171714", roughness: 0.82, metalness: 0.04 }),
  );
  floor.position.z = -0.08;
  floor.receiveShadow = true;
  floor.name = "path-floor";
  scene.add(floor);

  const key = new THREE.DirectionalLight("#fff1d5", 4.5);
  key.position.set(-90, -120, 180);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#9caeff", 2.2);
  fill.position.set(110, 70, 100);
  scene.add(fill);
  const front = new THREE.PointLight("#ffffff", 1100, span * 4, 1.8);
  front.position.set(0, -span, span * 0.8);
  scene.add(front);
  return scene;
}

function disposePathTraceScene(scene: THREE.Scene | null) {
  scene?.environment?.dispose();
  scene?.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name === "path-floor") child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function Viewer({
  model,
  materialPreset,
  highQuality,
  onStats,
  onSamples,
}: {
  model: ModelState;
  materialPreset: PrintMaterialPreset;
  highQuality: boolean;
  onStats: (stats: TextModelStats) => void;
  onSamples: (samples: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dimensionsRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pathTracerRef = useRef<WebGLPathTracer | null>(null);
  const pathSceneRef = useRef<THREE.Scene | null>(null);
  const pathTraceTokenRef = useRef(0);
  const highQualityRef = useRef(highQuality);
  const restartPathTracingRef = useRef<() => void>(() => undefined);
  const onSamplesRef = useRef(onSamples);
  const hasFramedRef = useRef(false);

  useEffect(() => {
    highQualityRef.current = highQuality;
  }, [highQuality]);

  useEffect(() => {
    onSamplesRef.current = onSamples;
  }, [onSamples]);

  const frameModel = useCallback(() => {
    const mesh = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!mesh || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (dimensionsRef.current) box.expandByObject(dimensionsRef.current);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(28, sphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.04);
    camera.position.set(sphere.center.x + distance * 0.72, sphere.center.y - distance, sphere.center.z + distance * 0.68);
    camera.near = Math.max(0.1, distance / 100);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10100f");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 24;
    controls.maxDistance = 500;
    controlsRef.current = controls;

    const grid = new THREE.GridHelper(320, 32, "#565650", "#292926");
    grid.rotateX(Math.PI / 2);
    grid.position.z = -0.02;
    scene.add(grid);

    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 220),
      new THREE.MeshStandardMaterial({ color: "#171714", roughness: 0.92, metalness: 0.05 }),
    );
    bed.receiveShadow = true;
    scene.add(bed);

    scene.add(new THREE.HemisphereLight("#f7efe0", "#313a54", 2.2));
    const key = new THREE.DirectionalLight("#fff4dc", 5.2);
    key.position.set(-80, -110, 160);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -160;
    key.shadow.camera.right = 160;
    key.shadow.camera.top = 160;
    key.shadow.camera.bottom = -160;
    scene.add(key);

    const rim = new THREE.DirectionalLight("#5577ff", 3.4);
    rim.position.set(100, 80, 90);
    scene.add(rim);

    const disposePathTracer = () => {
      pathTracerRef.current?.dispose();
      pathTracerRef.current = null;
      disposePathTraceScene(pathSceneRef.current);
      pathSceneRef.current = null;
    };
    restartPathTracingRef.current = () => {
      const token = ++pathTraceTokenRef.current;
      disposePathTracer();
      onSamplesRef.current(0);
      const currentMesh = modelRef.current;
      if (!highQualityRef.current || !currentMesh) return;
      void import("three-gpu-pathtracer").then(({ GradientEquirectTexture, WebGLPathTracer }) => {
        if (token !== pathTraceTokenRef.current || !highQualityRef.current || !modelRef.current) return;
        const pathScene = createPathTraceScene(modelRef.current);
        const environment = new GradientEquirectTexture(64);
        environment.topColor.set("#fff4dc");
        environment.bottomColor.set("#35415b");
        environment.exponent = 1.4;
        environment.update();
        pathScene.environment = environment;
        pathScene.environmentIntensity = 0.72;
        const tracer = new WebGLPathTracer(renderer);
        tracer.tiles.set(4, 4);
        tracer.bounces = 4;
        tracer.filterGlossyFactor = 0.22;
        tracer.renderDelay = 0;
        tracer.fadeDuration = 220;
        tracer.minSamples = 2;
        tracer.renderScale = Math.min(0.75, 1 / renderer.getPixelRatio());
        tracer.dynamicLowRes = false;
        tracer.rasterizeScene = true;
        tracer.rasterizeSceneCallback = () => renderer.render(scene, camera);
        tracer.setScene(pathScene, camera);
        pathSceneRef.current = pathScene;
        pathTracerRef.current = tracer;
      }).catch(() => {
        if (token === pathTraceTokenRef.current) {
          disposePathTracer();
          onSamplesRef.current(-1);
        }
      });
    };
    const updatePathCamera = () => {
      if (!pathTracerRef.current) return;
      pathTracerRef.current.updateCamera();
      onSamplesRef.current(0);
    };
    controls.addEventListener("change", updatePathCamera);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      updatePathCamera();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    let reportedSamples = -1;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      const tracer = pathTracerRef.current;
      if (highQualityRef.current && tracer) {
        try {
          if (tracer.samples < 96) tracer.renderSample();
          const samples = Math.floor(tracer.samples);
          if (samples !== reportedSamples) {
            reportedSamples = samples;
            onSamplesRef.current(samples);
          }
        } catch {
          disposePathTracer();
          onSamplesRef.current(-1);
          renderer.render(scene, camera);
        }
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      pathTraceTokenRef.current += 1;
      controls.removeEventListener("change", updatePathCamera);
      disposePathTracer();
      if (dimensionsRef.current) disposeObject(dimensionsRef.current);
      dimensionsRef.current = null;
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let active = true;
    const normalizedModel = normalizeTextModelOptions(model);
    void loadClientFont(model.font, normalizedModel.text, model.fontWeight, model.italic).then((loaded) => {
      if (!active || !sceneRef.current) return;
      const { geometry } = createTextGeometry(loaded.font, normalizedModel, { syntheticItalic: loaded.syntheticItalic });
      const material = createPreviewMaterial(materialPreset);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (modelRef.current) {
        sceneRef.current.remove(modelRef.current);
        modelRef.current.geometry.dispose();
        (modelRef.current.material as THREE.Material).dispose();
      }
      if (dimensionsRef.current) {
        sceneRef.current.remove(dimensionsRef.current);
        disposeObject(dimensionsRef.current);
      }
      sceneRef.current.add(mesh);
      modelRef.current = mesh;
      geometry.computeBoundingBox();
      dimensionsRef.current = createGroundDimensions(geometry.boundingBox!);
      sceneRef.current.add(dimensionsRef.current);
      onStats(geometryStats(geometry));
      restartPathTracingRef.current();

      if (!hasFramedRef.current) {
        hasFramedRef.current = true;
        frameModel();
      }
    });

    return () => {
      active = false;
    };
  }, [model, materialPreset, highQuality, frameModel, onStats]);

  return (
    <div className="viewer-shell">
      <div ref={mountRef} className="viewer-canvas" aria-label="Interactive 3D preview of extruded text" />
      <div className="viewer-toolbar" aria-hidden="true">
        <span><MousePointer2 size={14} /> Orbit</span>
        <span><Rotate3D size={14} /> Drag to inspect</span>
        {highQuality && <span className="quality-badge">Path tracing</span>}
      </div>
      <button className="icon-button focus-button" type="button" onClick={frameModel} aria-label="Frame model">
        <Focus size={18} />
      </button>
      <div className="axis-indicator" aria-hidden="true">
        <i className="axis-z" /> Z
        <i className="axis-y" /> Y
        <i className="axis-x" /> X
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  numberValue,
  numberStep,
  numberMin = 0,
  numberSuffix,
  onNumberChange,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue?: (value: number) => string;
  numberValue?: number;
  numberStep?: number;
  numberMin?: number;
  numberSuffix?: string;
  onNumberChange?: (value: number) => void;
  onChange: (value: number) => void;
}) {
  const sliderValue = Math.min(max, Math.max(min, value));
  const progress = ((sliderValue - min) / (max - min)) * 100;
  return (
    <label className="range-control">
      <span className="control-label"><span>{label}</span><output>{formatValue ? formatValue(value) : `${value.toFixed(step < 1 ? 1 : 0)} mm`}</output></span>
      <span className="range-input-row">
        <input type="range" min={min} max={max} step={step} value={sliderValue} style={{ "--range-progress": `${progress}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />
        <span className="range-number"><input type="number" min={numberMin} step={numberStep ?? step} value={numberValue ?? value} onChange={(event) => (onNumberChange ?? onChange)(Number(event.target.value))} />{numberSuffix && <small>{numberSuffix}</small>}</span>
      </span>
    </label>
  );
}

export function TextPlayground() {
  const [model, setModel] = useState<ModelState>(INITIAL_MODEL);
  const [queryReady, setQueryReady] = useState(false);
  const [fonts, setFonts] = useState<FontSummary[]>([]);
  const [fontQuery, setFontQuery] = useState("");
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [activeFontIndex, setActiveFontIndex] = useState(0);
  const [fontVisibleCount, setFontVisibleCount] = useState(40);
  const [stats, setStats] = useState<TextModelStats>({ widthMm: 0, heightMm: 0, depthMm: 0, triangles: 0 });
  const [downloading, setDownloading] = useState(false);
  const [units, setUnits] = useState<"mm" | "cm">("mm");
  const [materialPreset, setMaterialPreset] = useState<PrintMaterialPreset>("pla-orange");
  const [highQuality, setHighQuality] = useState(false);
  const [pathSamples, setPathSamples] = useState(0);
  const fontPickerRef = useRef<HTMLDivElement>(null);
  const fontSearchRef = useRef<HTMLInputElement>(null);
  const stableSetStats = useCallback((next: TextModelStats) => setStats(next), []);
  const stableSetPathSamples = useCallback((samples: number) => setPathSamples(samples), []);
  const downloadUrl = useMemo(() => buildDownloadUrl(model), [model]);
  const displayText = useMemo(() => normalizeTextModelOptions(model).text, [model]);
  const exceedsBuildVolume = stats.widthMm > BUILD_VOLUME_WARNING_MM || stats.heightMm > BUILD_VOLUME_WARNING_MM || stats.depthMm > BUILD_VOLUME_WARNING_MM;

  const selectedFont = useMemo(
    () => fonts.find((font) => font.id === model.font),
    [fonts, model.font],
  );

  const matchingFonts = useMemo(() => {
    const query = fontQuery.trim().toLocaleLowerCase();
    const matches = !query
      ? fonts
      : fonts.filter((font) =>
          font.family.toLocaleLowerCase().includes(query) ||
          font.category.toLocaleLowerCase().includes(query),
        );

    if (query || !selectedFont) return matches;
    return [selectedFont, ...matches.filter((font) => font.id !== selectedFont.id)];
  }, [fontQuery, fonts, selectedFont]);

  const visibleFonts = useMemo(() => matchingFonts.slice(0, fontVisibleCount), [fontVisibleCount, matchingFonts]);
  const formatUnit = useCallback((value: number) => (
    units === "cm" ? `${(value / 10).toFixed(value < 10 ? 2 : 1)} cm` : `${value.toFixed(value < 10 ? 1 : 0)} mm`
  ), [units]);
  const toDisplayUnit = useCallback((value: number) => units === "cm" ? value / 10 : value, [units]);
  const fromDisplayUnit = useCallback((value: number) => units === "cm" ? value * 10 : value, [units]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const restored = readEditorQuery();
      setModel(restored.model);
      setUnits(restored.units);
      setMaterialPreset(restored.materialPreset);
      setHighQuality(restored.highQuality);
      setQueryReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!queryReady) return;
    const params = editorQuery(model, units, materialPreset, highQuality);
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [model, queryReady, units, materialPreset, highQuality]);

  useEffect(() => {
    void fetch("/api/fonts")
      .then((response) => response.json())
      .then((data: { fonts: FontSummary[] }) => setFonts(data.fonts));
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!fontPickerRef.current?.contains(event.target as Node)) {
        setFontPickerOpen(false);
        setFontQuery("");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [selectedFont]);

  useEffect(() => {
    if (selectedFont) void loadFontPreview(selectedFont);
    if (!fontPickerOpen) return;
    visibleFonts.forEach((font) => void loadFontPreview(font));
    window.requestAnimationFrame(() => fontSearchRef.current?.focus());
  }, [fontPickerOpen, selectedFont, visibleFonts]);

  const update = <K extends keyof ModelState>(key: K, value: ModelState[K]) => {
    setModel((current) => ({ ...current, [key]: value }));
  };

  const chooseFont = (font: FontSummary) => {
    setFontQuery("");
    setFontVisibleCount(40);
    update("font", font.id);
    setFontPickerOpen(false);
    setActiveFontIndex(0);
  };

  const handleFontKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFontPickerOpen(true);
      const nextIndex = Math.min(activeFontIndex + 1, matchingFonts.length - 1);
      if (nextIndex >= visibleFonts.length - 3) {
        setFontVisibleCount((count) => Math.min(count + 40, matchingFonts.length));
      }
      setActiveFontIndex(nextIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveFontIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && fontPickerOpen && visibleFonts[activeFontIndex]) {
      event.preventDefault();
      chooseFont(visibleFonts[activeFontIndex]);
    } else if (event.key === "Escape") {
      setFontPickerOpen(false);
      setFontQuery("");
    }
  };

  const loadMoreFontsOnScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 100) return;
    setFontVisibleCount((count) => Math.min(count + 40, matchingFonts.length));
  };

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("STL generation failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "printa-text.stl";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Printa home">
          <span className="brand-mark"><Layers3 size={18} strokeWidth={2.4} /></span>
          <span>PRINTA</span>
          <em>ALPHA</em>
        </Link>
        <div className="topbar-center">
          <span className="mode-pill"><Box size={14} /> Extruded text</span>
          <span className="autosave"><i /> Live geometry</span>
        </div>
        <a className="mcp-link" href="/mcp" target="_blank" rel="noreferrer">
          <span>MCP</span> /mcp
        </a>
      </header>

      <section className="workspace" id="top">
        <aside className="control-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow"><Sparkles size={13} /> Model setup</span>
              <h1>Extruded text</h1>
            </div>
            <span className="step-count">01</span>
          </div>

          <div className="control-group">
            <label className="text-control">
              <span className="control-label"><span>Text</span><small>{model.text.length}/24</small></span>
              <span className="input-wrap"><Type size={16} /><input value={model.text} maxLength={24} onChange={(event) => update("text", event.target.value)} aria-label="Text to extrude" /></span>
            </label>

            <div className="font-control" ref={fontPickerRef}>
              <span className="control-label"><span>Google font</span><small>{fonts.length ? `${fonts.length.toLocaleString()} families` : "Loading…"}</small></span>
              <button type="button" className={`font-picker-trigger${fontPickerOpen ? " is-open" : ""}`} onClick={() => { setFontVisibleCount(40); setFontPickerOpen((open) => !open); }} aria-haspopup="listbox" aria-expanded={fontPickerOpen}>
                <span style={{ fontFamily: selectedFont ? `"${previewFontFamily(selectedFont.id)}", sans-serif` : undefined }}>{selectedFont?.family ?? "Roboto"}</span>
                <small>{selectedFont?.category ?? "Google Font"}</small>
                <ChevronDown size={16} />
              </button>
              {fontPickerOpen && (
                <div className="font-results" id="google-font-results" role="listbox" aria-label="Google Fonts">
                  <div className="font-popover-search"><Search size={15} /><input ref={fontSearchRef} id="google-font-search" value={fontQuery} onChange={(event) => { setFontQuery(event.target.value); setFontVisibleCount(40); setActiveFontIndex(0); }} onKeyDown={handleFontKeyDown} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="google-font-results" aria-activedescendant={visibleFonts[activeFontIndex] ? `font-${visibleFonts[activeFontIndex].id}` : undefined} aria-label="Search all Google Fonts" placeholder="Search Google Fonts…" autoComplete="off" /></div>
                  <div className="font-results-summary">
                    <span>{matchingFonts.length.toLocaleString()} {matchingFonts.length === 1 ? "font" : "fonts"}</span>
                    <small>{visibleFonts.length.toLocaleString()} shown{matchingFonts.length > visibleFonts.length ? " · scroll for all" : ""}</small>
                  </div>
                  <div className="font-results-list" onScroll={loadMoreFontsOnScroll}>
                    {visibleFonts.map((font, index) => (
                      <button
                        key={font.id}
                        id={`font-${font.id}`}
                        type="button"
                        role="option"
                        aria-selected={font.id === model.font}
                        className={`${index === activeFontIndex ? "is-active" : ""}${font.id === model.font ? " is-selected" : ""}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveFontIndex(index)}
                        onClick={() => chooseFont(font)}
                      >
                        <span className="font-option-name" style={{ fontFamily: `"${previewFontFamily(font.id)}", sans-serif` }}>{font.family}</span>
                        <small>{font.category}</small>
                        {font.id === model.font && <Check size={15} />}
                      </button>
                    ))}
                    {!visibleFonts.length && (
                      <div className="font-empty">No Google Fonts match “{fontQuery}”</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="type-grid">
              <label className="select-control"><span className="control-label"><span>Text case</span></span><select value={model.textCase} onChange={(event) => update("textCase", event.target.value as ModelState["textCase"])}><option value="original">As typed</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="titlecase">Title Case</option></select></label>
              <label className="select-control"><span className="control-label"><span>Weight</span></span><select value={model.fontWeight} onChange={(event) => update("fontWeight", event.target.value as ModelState["fontWeight"])}><option value="regular">Regular</option><option value="bold">Bold</option></select></label>
            </div>
            <div className="type-grid type-toggles">
              <label className="toggle-control"><span><strong>Italic</strong><small>Font or synthetic slant</small></span><input type="checkbox" checked={model.italic} onChange={(event) => update("italic", event.target.checked)} /><i /></label>
              <label className="toggle-control"><span><strong>Underline</strong><small>Printable underline bar</small></span><input type="checkbox" checked={model.underline} onChange={(event) => update("underline", event.target.checked)} /><i /></label>
            </div>
          </div>

          <div className="control-group measurements">
            <div className="advanced-heading"><span><Settings2 size={13} /> Dimensions</span><select value={units} onChange={(event) => setUnits(event.target.value as "mm" | "cm")} aria-label="Measurement units"><option value="mm">mm</option><option value="cm">cm</option></select></div>
            <RangeControl label="Letter height" value={model.sizeMm} min={0.1} max={256} step={1} formatValue={formatUnit} numberValue={toDisplayUnit(model.sizeMm)} numberStep={units === "cm" ? 0.1 : 1} numberMin={units === "cm" ? 0.01 : 0.1} numberSuffix={units} onNumberChange={(value) => update("sizeMm", Math.max(0.1, fromDisplayUnit(value)))} onChange={(value) => update("sizeMm", value)} />
            <RangeControl label="Extrusion" value={model.depthMm} min={0.1} max={256} step={0.5} formatValue={formatUnit} numberValue={toDisplayUnit(model.depthMm)} numberStep={units === "cm" ? 0.05 : 0.5} numberMin={units === "cm" ? 0.01 : 0.1} numberSuffix={units} onNumberChange={(value) => update("depthMm", Math.max(0.1, fromDisplayUnit(value)))} onChange={(value) => update("depthMm", value)} />
            <RangeControl label="Edge bevel" value={model.bevelMm} min={0} max={64} step={0.1} formatValue={formatUnit} numberValue={toDisplayUnit(model.bevelMm)} numberStep={units === "cm" ? 0.01 : 0.1} numberMin={0} numberSuffix={units} onNumberChange={(value) => update("bevelMm", Math.max(0, fromDisplayUnit(value)))} onChange={(value) => update("bevelMm", value)} />
            <label className="select-control"><span className="control-label"><span>Bevel faces</span></span><select value={model.bevelSide} onChange={(event) => update("bevelSide", event.target.value as ModelState["bevelSide"])}><option value="both">Top + bottom</option><option value="top">Top only</option><option value="bottom">Bottom only</option></select></label>
            <RangeControl label="Bevel resolution" value={model.bevelSegments} min={1} max={12} step={1} formatValue={(value) => `${value} segments`} onChange={(value) => update("bevelSegments", value)} />
            <RangeControl label="Curve resolution" value={model.curveSegments} min={2} max={24} step={1} formatValue={(value) => `${value} segments`} onChange={(value) => update("curveSegments", value)} />
            <label className="toggle-control"><span><strong>Smooth normals</strong><small>Soft preview shading</small></span><input type="checkbox" checked={model.smoothNormals} onChange={(event) => update("smoothNormals", event.target.checked)} /><i /></label>
          </div>

          <div className="control-group preview-controls">
            <div className="advanced-heading"><span><Sparkles size={13} /> Preview</span>{highQuality && <em>{pathSamples < 0 ? "Unavailable" : `${pathSamples} spp`}</em>}</div>
            <label className="select-control">
              <span className="control-label"><span>Print material</span></span>
              <select value={materialPreset} onChange={(event) => setMaterialPreset(event.target.value as PrintMaterialPreset)}>
                {PRINT_MATERIAL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>
            <label className="toggle-control quality-toggle">
              <span><strong>High quality</strong><small>Progressive GPU path tracing</small></span>
              <input type="checkbox" checked={highQuality} onChange={(event) => setHighQuality(event.target.checked)} />
              <i />
            </label>
            {highQuality && <div className="quality-progress"><i /><span>{pathSamples < 0 ? "Path tracing needs WebGL 2" : pathSamples === 0 ? "Preparing path tracer…" : pathSamples >= 96 ? "Path trace complete" : "Rendering progressively—leave it running for a cleaner image"}</span></div>}
          </div>

          <div className={`print-check${exceedsBuildVolume ? " is-warning" : ""}`}>
            <div className="check-icon">{exceedsBuildVolume ? <TriangleAlert size={17} /> : <Check size={17} />}</div>
            <div>
              <strong>{exceedsBuildVolume ? "Exceeds 256 mm build volume" : "Print-ready solid"}</strong>
              <span>{exceedsBuildVolume ? `${stats.widthMm.toFixed(1)} × ${stats.heightMm.toFixed(1)} × ${stats.depthMm.toFixed(1)} mm · STL generation remains enabled` : "Flat base · no supports required"}</span>
            </div>
          </div>

          <button className="download-button" type="button" onClick={download} disabled={downloading || !model.text.trim()}>
            <Download size={18} />
            <span>{downloading ? "Generating STL…" : "Download STL"}</span>
            <kbd>↓</kbd>
          </button>
          <p className="download-note">Binary STL · millimetres · ready for your slicer</p>
        </aside>

        <section className="stage-panel" aria-label="3D model workspace">
          <div className="stage-heading">
            <div>
              <span className="eyebrow"><Grid3X3 size={13} /> Build plate</span>
              <h2>{displayText || "UNTITLED"}</h2>
            </div>
            <div className="dimensions" aria-label="Model dimensions">
              <span><small>W</small>{formatMm(stats.widthMm)}</span>
              <i>×</i>
              <span><small>H</small>{formatMm(stats.heightMm)}</span>
              <i>×</i>
              <span><small>D</small>{formatMm(stats.depthMm)}</span>
            </div>
          </div>
          <Viewer model={model} materialPreset={materialPreset} highQuality={highQuality} onStats={stableSetStats} onSamples={stableSetPathSamples} />
          <footer className="stage-footer">
            <span><i className={`status-dot${highQuality && pathSamples >= 0 && pathSamples < 96 ? " is-rendering" : ""}`} /> {highQuality ? pathSamples < 0 ? "Realtime fallback" : pathSamples > 0 ? `Path tracing · ${pathSamples} spp` : "Starting path tracer" : "Geometry compiled"}</span>
            <span>{stats.triangles.toLocaleString()} triangles</span>
            <span>Units: mm</span>
            <span className="stage-file">{downloadUrl.includes("?") ? "printa-text.stl" : "STL"}</span>
          </footer>
        </section>
      </section>
    </main>
  );
}
