"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { LoaderCircle, Rotate3D } from "lucide-react";
import { printMaterialPreset } from "@/lib/material-presets";
import { cn } from "@/lib/utils";

/**
 * A small, self-contained orbitable 3D preview of a printable STL. Loads the
 * mesh from `url`, fits shadows to the model bounds (works at any size), and
 * reports the printed dimensions it reads from the response headers.
 */
export function ModelPreview({
  url,
  material = "pla-orange",
  className,
  onStats,
}: {
  url: string;
  material?: string;
  className?: string;
  onStats?: (stats: { widthMm: number; depthMm: number; heightMm: number; triangles: number }) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const invalidateRef = useRef<(frames?: number) => void>(() => undefined);
  const addModelRef = useRef<(geometry: THREE.BufferGeometry, materialId: string) => void>(() => undefined);
  const materialRef = useRef(material);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const loading = loadedUrl !== url && errorUrl !== url;
  const error = errorUrl === url;

  useEffect(() => { materialRef.current = material; }, [material]);

  // Scene setup — runs once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#11110f");
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 4000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, -190, 130);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;

    scene.add(new THREE.HemisphereLight("#fff7e8", "#182241", 2.6));
    const key = new THREE.DirectionalLight("#fff0d5", 5.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight("#748cff", 3.4);
    rim.position.set(150, 100, 150);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(240, 96),
      new THREE.MeshStandardMaterial({ color: "#191916", roughness: 0.9, metalness: 0.05 }),
    );
    floor.receiveShadow = true;
    floor.position.z = -0.3;
    scene.add(floor);

    // Ambient occlusion for soft crevice darkening.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 8, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 16, screenSpaceRadius: false });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());

    let model: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null = null;
    let animationFrame = 0;
    let remainingFrames = 0;
    let hovering = false;
    const render = () => {
      controls.update();
      composer.render();
      if (controls.autoRotate || hovering || remainingFrames > 0) {
        remainingFrames = Math.max(0, remainingFrames - 1);
        animationFrame = requestAnimationFrame(render);
      } else animationFrame = 0;
    };
    const invalidate = (frames = 2) => {
      remainingFrames = Math.max(remainingFrames, frames);
      if (!animationFrame) animationFrame = requestAnimationFrame(render);
    };
    invalidateRef.current = invalidate;
    const stopAuto = () => { controls.autoRotate = false; };
    controls.addEventListener("start", stopAuto);
    controls.addEventListener("change", () => invalidate(2));
    const onEnter = () => { hovering = true; invalidate(2); };
    const onLeave = () => { hovering = false; };
    renderer.domElement.addEventListener("pointerenter", onEnter);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    const frame = () => {
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 12);
      const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.5;
      camera.position.set(sphere.center.x + distance * 0.7, sphere.center.y - distance, sphere.center.z + distance * 0.6);
      camera.near = Math.max(0.1, distance / 200);
      camera.far = distance * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(sphere.center);
      // shadow frustum fit to model
      key.position.copy(sphere.center).add(new THREE.Vector3(-0.42, -0.52, 0.84).normalize().multiplyScalar(radius * 3));
      key.target.position.copy(sphere.center);
      key.target.updateMatrixWorld();
      const cam = key.shadow.camera;
      const extent = radius * 1.5;
      cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
      cam.near = radius * 0.4; cam.far = radius * 7;
      cam.updateProjectionMatrix();
      key.shadow.normalBias = Math.max(0.02, radius * 0.0015);
      gtao.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(radius * 0.22, 2, 40) });
      floor.scale.setScalar(Math.max(1, (radius * 1.8) / 240));
      controls.update();
      invalidate(2);
    };

    addModelRef.current = (geometry, materialId) => {
      if (model) {
        scene.remove(model);
        model.geometry.dispose();
        model.material.dispose();
      }
      const preset = printMaterialPreset(materialId);
      const smooth = toCreasedNormals(geometry, THREE.MathUtils.degToRad(50));
      const mesh = new THREE.Mesh(smooth, new THREE.MeshPhysicalMaterial({
        color: preset.color, roughness: preset.roughness, metalness: preset.metalness,
        clearcoat: preset.clearcoat, transmission: preset.transmission,
        thickness: preset.transmission ? 2.2 : 0,
      }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model = mesh;
      scene.add(mesh);
      frame();
    };

    const resize = () => {
      const bounds = mount.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      renderer.setSize(bounds.width, bounds.height, false);
      composer.setSize(bounds.width, bounds.height);
      gtao.setSize(bounds.width, bounds.height);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
      invalidate(2);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    invalidate(60);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerenter", onEnter);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      model?.geometry.dispose();
      model?.material.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, []);

  // Load / reload the STL whenever the url changes.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("preview failed");
        const dims = (response.headers.get("X-Printa-Dimensions") ?? "").split(",").map(Number);
        const triangles = Number(response.headers.get("X-Printa-Triangles") ?? 0);
        if (dims.length === 3 && onStats) onStats({ widthMm: dims[0], depthMm: dims[1], heightMm: dims[2], triangles });
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!active) return;
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        addModelRef.current(geometry, materialRef.current);
        setLoadedUrl(url);
      })
      .catch((err) => {
        if (err?.name === "AbortError" || !active) return;
        setErrorUrl(url);
      });
    return () => { active = false; controller.abort(); };
  }, [url, onStats]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-[#11110f]", className)}>
      <div ref={mountRef} className="absolute inset-0 [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full" />
      {!loading && !error && (
        <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-white/60 backdrop-blur">
          <Rotate3D size={11} /> drag to spin
        </span>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] text-white/70">
          <LoaderCircle size={14} className="animate-spin" /> Rendering…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-white/60">
          Couldn&apos;t render this preview — the STL download still works.
        </div>
      )}
    </div>
  );
}
