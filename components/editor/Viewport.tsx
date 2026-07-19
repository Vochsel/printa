"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Focus, Rotate3D, Scissors } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { printMaterialPreset, type PrintMaterialPreset } from "@/lib/material-presets";
import type { ModelDocument } from "@/lib/model-spec";
import { sfxTap, sfxTick, sfxToggle } from "@/lib/sfx";
import { cn } from "@/lib/utils";

export type PreviewSource = { key: string; url?: string; buffer?: ArrayBuffer };
export type ShadingMode = "smooth" | "flat";
export type ViewportHandle = { frame: () => void };

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

function createPreviewMaterial(materialPreset: PrintMaterialPreset, shading: ShadingMode) {
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
    flatShading: shading === "flat",
  });
}

export const Viewport = forwardRef<ViewportHandle, {
  source: PreviewSource;
  materialPreset: PrintMaterialPreset;
  display: ModelDocument["display"];
  units: ModelDocument["units"];
  shading: ShadingMode;
  onReady?: () => void;
}>(function Viewport({ source, materialPreset, display, units, shading, onReady }, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<() => void>(() => undefined);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const modelRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null>(null);
  const dimensionsRef = useRef<THREE.Group | null>(null);
  const invalidateRef = useRef<(frames?: number) => void>(() => undefined);
  const hasFramedRef = useRef(false);
  const displayRef = useRef(display);
  const unitsRef = useRef(units);
  const materialPresetRef = useRef(materialPreset);
  const shadingRef = useRef(shading);
  const sliceRef = useRef(1);
  const zRangeRef = useRef<[number, number]>([0, 100]);

  // Slice state: 1 means "show everything", anything below cuts the model open.
  const [slice, setSlice] = useState(1);
  const [sliceActive, setSliceActive] = useState(false);

  useEffect(() => {
    displayRef.current = display;
    unitsRef.current = units;
    materialPresetRef.current = materialPreset;
    shadingRef.current = shading;
  }, [display, materialPreset, units, shading]);

  useImperativeHandle(ref, () => ({ frame: () => frameRef.current() }), []);

  const applySlice = (value: number) => {
    sliceRef.current = value;
    const model = modelRef.current;
    if (!model) return;
    const [minZ, maxZ] = zRangeRef.current;
    if (value >= 1) {
      model.material.clippingPlanes = [];
      model.material.side = THREE.FrontSide;
    } else {
      const z = minZ + (maxZ - minZ) * value;
      model.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), z)];
      model.material.clipShadows = true;
      model.material.side = THREE.DoubleSide;
    }
    model.material.needsUpdate = true;
    invalidateRef.current(2);
  };

  /** Fit shadows, floor, grid, and fog to the model so they hold up at any scale. */
  const fitEnvironment = (model: THREE.Mesh) => {
    const scene = sceneRef.current;
    const key = keyLightRef.current;
    if (!scene || !key) return;
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(30, sphere.radius);
    key.position.set(sphere.center.x - radius * 1.1, sphere.center.y - radius * 1.4, sphere.center.z + radius * 2.1);
    key.target.position.copy(sphere.center);
    key.target.updateMatrixWorld();
    const shadowCamera = key.shadow.camera as THREE.OrthographicCamera;
    const extent = radius * 1.75;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = radius * 0.2;
    shadowCamera.far = radius * 8;
    shadowCamera.updateProjectionMatrix();
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = radius * 0.004;
    key.shadow.needsUpdate = true;
    const environmentScale = Math.max(1, radius / 95);
    floorRef.current?.scale.setScalar(environmentScale);
    gridRef.current?.scale.setScalar(environmentScale);
    scene.fog = new THREE.Fog("#11110f", Math.max(440, radius * 7), Math.max(900, radius * 16));
  };

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
      keyLightRef.current = null;
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
      const model = new THREE.Mesh(geometry, createPreviewMaterial(materialPresetRef.current, shadingRef.current));
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
      if (geometry.boundingBox) zRangeRef.current = [geometry.boundingBox.min.z, geometry.boundingBox.max.z];
      applySlice(sliceRef.current);
      fitEnvironment(model);
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
    model.material = createPreviewMaterial(materialPreset, shading);
    previous.dispose();
    applySlice(sliceRef.current);
    invalidateRef.current(3);
  }, [materialPreset, shading]);

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
    <div className="relative h-full w-full overflow-hidden bg-stage">
      <div ref={mountRef} className="absolute inset-0 [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full" aria-label="Interactive 3D model preview" />

      <span className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[10px] font-medium text-white/60 backdrop-blur-md">
        <Rotate3D className="size-3" /> Drag to orbit · scroll to zoom
      </span>

      {/* Slice control: cut the model open along its height. */}
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={sliceActive}
              aria-label="Slice the model open"
              className={cn(
                "border-white/15 bg-black/40 text-white/75 backdrop-blur-md hover:bg-black/60 hover:text-white",
                sliceActive && "border-accent/70 bg-accent/20 text-accent hover:bg-accent/25 hover:text-accent",
              )}
              onClick={() => {
                sfxToggle(!sliceActive);
                setSliceActive((active) => {
                  const next = !active;
                  if (!next) {
                    setSlice(1);
                    applySlice(1);
                  }
                  return next;
                });
              }}
            >
              <Scissors className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Slice view — peek inside the model</TooltipContent>
        </Tooltip>
        {sliceActive && (
          <div className="flex h-44 flex-col items-center rounded-full border border-white/15 bg-black/40 px-1.5 py-3 backdrop-blur-md">
            <Slider
              orientation="vertical"
              value={[slice]}
              min={0.02}
              max={1}
              step={0.005}
              aria-label="Slice height"
              onValueChange={([next]) => {
                sfxTick();
                setSlice(next);
                applySlice(next);
              }}
            />
          </div>
        )}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Frame model"
            className="absolute bottom-3 left-3 border-white/15 bg-black/40 text-white/75 backdrop-blur-md hover:bg-black/60 hover:text-white"
            onClick={() => { sfxTap(); frameRef.current(); }}
          >
            <Focus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Re-center the view on the model</TooltipContent>
      </Tooltip>
    </div>
  );
});
