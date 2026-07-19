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

type InspectResult = {
  document: { name: string; description: string; metadata: Record<string, string | number | boolean> };
  spec: string;
  stlUrl: string;
  studioUrl: string;
  stats: { widthMm: number; depthMm: number; heightMm: number; triangles: number; volumeEstimateMm3: number };
  exceedsBuildVolume: boolean;
  warnings: string[];
  materialPreset: PrintMaterialPreset;
};

function ModelViewport({ stlUrl, materialPreset, onReady }: { stlUrl: string; materialPreset: PrintMaterialPreset; onReady?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<() => void>(() => undefined);
  const cameraPoseRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#11110f");
    scene.fog = new THREE.Fog("#11110f", 440, 900);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);
    camera.up.set(0, 0, 1);
    camera.position.set(170, -210, 150);
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
    controls.dampingFactor = 0.065;
    controls.target.set(0, 0, 55);

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
    const grid = new THREE.GridHelper(420, 42, "#363631", "#272724");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.05;
    scene.add(grid);

    let model: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    let disposed = false;
    const frame = () => {
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const distance = Math.max(45, sphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.22);
      camera.position.set(sphere.center.x + distance * 0.78, sphere.center.y - distance, sphere.center.z + distance * 0.66);
      camera.near = Math.max(0.1, distance / 150);
      camera.far = distance * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(sphere.center);
      controls.update();
    };
    frameRef.current = frame;

    fetch(stlUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Model could not be loaded.");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed) return;
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const preset = printMaterialPreset(materialPreset);
        model = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
          color: preset.color,
          roughness: preset.roughness,
          metalness: preset.metalness,
          clearcoat: preset.clearcoat,
          transmission: preset.transmission,
          thickness: preset.transmission ? 2.2 : 0,
          emissive: preset.id === "pla-orange" ? "#401006" : "#000000",
          emissiveIntensity: preset.id === "pla-orange" ? 0.12 : 0,
        }));
        model.castShadow = true;
        model.receiveShadow = true;
        scene.add(model);
        const savedPose = cameraPoseRef.current;
        if (savedPose) {
          camera.position.copy(savedPose.position);
          controls.target.copy(savedPose.target);
          controls.update();
        } else {
          frame();
        }
        onReady?.();
      });

    const resize = () => {
      const bounds = mount.getBoundingClientRect();
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / Math.max(bounds.height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    let animation = 0;
    const render = () => {
      animation = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();
    return () => {
      disposed = true;
      cameraPoseRef.current = { position: camera.position.clone(), target: controls.target.clone() };
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      model?.geometry.dispose();
      model?.material.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, [materialPreset, onReady, stlUrl]);

  return (
    <div className="studio-viewer">
      <div ref={mountRef} className="studio-viewer-canvas" aria-label="Interactive procedural model preview" />
      <span className="studio-orbit-hint"><Rotate3D size={13} /> Drag to orbit · scroll to zoom</span>
      <button className="studio-focus" type="button" onClick={() => frameRef.current()} aria-label="Frame model"><Focus size={16} /></button>
    </div>
  );
}

export function ProceduralStudio() {
  const [activeDemo, setActiveDemo] = useState<DemoModelId>("contour-spiral-vase");
  const [spec, setSpec] = useState("");
  const [result, setResult] = useState<InspectResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modelReady, setModelReady] = useState(false);
  const handleModelReady = useCallback(() => setModelReady(true), []);

  const inspect = useCallback(async (payload: { demo?: string; spec?: string }) => {
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
      setSpec(data.spec);
      if (data.studioUrl) window.history.replaceState(window.history.state, "", data.studioUrl.replace(window.location.origin, ""));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Model spec is invalid.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("spec");
    if (encoded) {
      void fetch("/api/model/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encoded, format: "yaml" }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResult(data);
        setSpec(data.spec);
        setLoading(false);
      }).catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Could not decode model spec.");
        setLoading(false);
      });
      return;
    }
    const demo = params.get("demo") as DemoModelId | null;
    const nextDemo = DEMO_MODEL_CARDS.some((card) => card.id === demo) ? demo! : "contour-spiral-vase";
    setActiveDemo(nextDemo);
    void inspect({ demo: nextDemo });
  }, [inspect]);

  const selectDemo = (id: DemoModelId) => {
    setActiveDemo(id);
    void inspect({ demo: id });
  };

  return (
    <main className="studio-shell">
      <header className="studio-topbar">
        <Link className="brand" href="/" aria-label="Printa home"><span className="brand-mark"><Layers3 size={18} /></span><span>PRINTA</span><em>SPEC 1.0</em></Link>
        <div className="studio-topbar-center editor-mode-switch" aria-label="Editor mode">
          <Link className="mode-pill" href="/editor?mode=text"><span>Text</span></Link>
          <Link className="mode-pill is-active" href="/editor?mode=procedural"><Waves size={14} /> Procedural</Link>
          <i />
        </div>
        <nav><a href="/skills" target="_blank"><ScrollText size={14} /> Skill</a><a href="/api/model/schema" target="_blank"><Braces size={14} /> Schema</a></nav>
      </header>

      <div className="studio-workspace">
        <aside className="studio-sidebar">
          <section className="studio-intro">
            <span className="eyebrow"><Waves size={13} /> Composable form graph</span>
            <h1>Model in layers.</h1>
            <p>Start from a source, apply ordered modifiers, then assemble or repeat it. Every number is expressed in the document&apos;s units.</p>
          </section>

          <section className="studio-demo-section">
            <div className="studio-section-head"><strong>Demo forms</strong><small>{DEMO_MODEL_CARDS.length} specs</small></div>
            <div className="studio-demo-grid">
              {DEMO_MODEL_CARDS.map((demo) => (
                <button key={demo.id} type="button" className={activeDemo === demo.id ? "is-active" : ""} onClick={() => selectDemo(demo.id)}>
                  <span>{demo.family === "simulation" ? <Droplets size={14} /> : <Layers3 size={14} />}{demo.name}</span>
                  <small>{demo.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="studio-spec-section">
            <div className="studio-section-head"><strong>JSON / YAML spec</strong><small>Editable</small></div>
            <textarea value={spec} onChange={(event) => setSpec(event.target.value)} spellCheck={false} aria-label="Procedural model YAML or JSON spec" />
            {error && <div className="studio-error">{error}</div>}
            <button className="studio-apply" type="button" onClick={() => void inspect({ spec })} disabled={loading || !spec.trim()}>
              {loading ? <LoaderCircle className="is-spinning" size={15} /> : <Play size={15} fill="currentColor" />} Apply spec
            </button>
          </section>
        </aside>

        <section className="studio-stage">
          <div className="studio-stage-head">
            <div><span className="eyebrow"><Sparkles size={13} /> Generated solid</span><h2>{result?.document.name ?? "Building form…"}</h2></div>
            {result && <a className="studio-download" href={result.stlUrl}><Download size={15} /> Download STL</a>}
          </div>
          <div className="studio-stage-body">
            {result && <ModelViewport stlUrl={result.stlUrl} materialPreset={result.materialPreset} onReady={handleModelReady} />}
            {(loading || !modelReady) && <div className="studio-loading"><LoaderCircle className="is-spinning" size={19} /> {loading ? "Evaluating model graph…" : "Loading printable mesh…"}</div>}
          </div>
          <div className="studio-stage-foot">
            {result ? (
              <>
                <span><small>Bounds</small><strong>{result.stats.widthMm.toFixed(1)} × {result.stats.depthMm.toFixed(1)} × {result.stats.heightMm.toFixed(1)} mm</strong></span>
                <span><small>Mesh</small><strong>{result.stats.triangles.toLocaleString()} triangles</strong></span>
                <span><small>Volume est.</small><strong>{(result.stats.volumeEstimateMm3 / 1000).toFixed(1)} cm³</strong></span>
                <span className={result.exceedsBuildVolume ? "is-warning" : "is-ready"}><Check size={13} /> {result.exceedsBuildVolume ? "Check build volume" : "Ready for slicer"}</span>
              </>
            ) : <span>Waiting for a valid model spec.</span>}
          </div>
        </section>
      </div>
    </main>
  );
}
