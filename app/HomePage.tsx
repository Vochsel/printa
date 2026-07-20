"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  Braces,
  Check,
  Download,
  Layers3,
  Loader2,
  MessageSquareText,
  MousePointer2,
  Pause,
  Play,
  Rotate3D,
  Sparkles,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const LAYER_HEIGHT_MM = 0.28;

// Claymation-warm brand tones tying the print to the palette.
const STUDY_PALETTE = [
  { base: "#ff4d8b", line: "#e23f7c", hi: "#ffd7e6" }, // pink
  { base: "#b8a4ed", line: "#a690e4", hi: "#ece5ff" }, // lavender
  { base: "#ffb084", line: "#f59d6d", hi: "#ffe7d6" }, // peach
];

// ---- Shared: build a model from the platform's own schema, print it server-side ----

type TextParams = { text: string; size: number; depth: number; bevel: number; font: string };

function textDocument({ text, size, depth, bevel, font }: TextParams) {
  return {
    version: "1.0",
    name: text,
    units: "mm",
    root: {
      kind: "shape",
      id: "text",
      source: { type: "text", text, font, size, depth, bevel },
      modifiers: [],
    },
  };
}

function encodeSpec(document: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// One geometry, built by the real /api/model/stl pipeline (same schema the MCP tools use).
async function loadTextGeometry(params: TextParams, signal: AbortSignal) {
  const response = await fetch(`/api/model/stl?spec=${encodeSpec(textDocument(params))}`, { signal });
  if (!response.ok) throw new Error(`model ${response.status}`);
  const geometry = new STLLoader().parse(await response.arrayBuffer());
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  return geometry;
}

// Point the camera at a geometry, keeping the current viewing direction.
function frameGeometry(camera: THREE.PerspectiveCamera, controls: OrbitControls, sphere: THREE.Sphere) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (sphere.radius / Math.sin(fov / 2)) * 1.12;
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-4) direction.set(0.45, -0.75, 0.95);
  direction.normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---- Hero: extruded words, printed layer by layer ----

const PRINT_WORDS = [
  { text: "PRINTA", palette: 0 },
  { text: "HELLO", palette: 1 },
  { text: "MAKER", palette: 2 },
] as const;
const PRINT_FONT = "Poppins";
const PRINT_SIZE = 30;
const PRINT_DEPTH = 24;

type PrintStudy = {
  text: string;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  head: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  plane: THREE.Plane;
  heightZ: number;
  totalLayers: number;
};

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link className={`home-brand${footer ? " home-brand-footer" : ""}`} href="/" aria-label="Printa home">
      <Image src="/printa-logo.png" alt="" width={32} height={32} priority={!footer} />
      <span>Printa</span>
      {!footer && <em>alpha</em>}
    </Link>
  );
}

function LayerVisualizer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const studiesRef = useRef<PrintStudy[]>([]);
  const studyIndexRef = useRef(0);
  const holdRef = useRef(0);
  const [studyIndex, setStudyIndex] = useState(0);
  const [layer, setLayer] = useState(0);
  const [totalLayers, setTotalLayers] = useState(80);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const controller = new AbortController();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 800);
    camera.up.set(0, 0, 1);
    camera.position.set(42, -70, 96);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 40;
    controls.maxDistance = 320;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0, 12);

    const bed = new THREE.Mesh(
      new THREE.CylinderGeometry(78, 78, 1.4, 96),
      new THREE.MeshStandardMaterial({ color: "#e7ddc6", roughness: 0.94, metalness: 0 }),
    );
    bed.rotation.x = Math.PI / 2;
    bed.position.z = -0.9;
    bed.receiveShadow = true;
    scene.add(bed);

    scene.add(new THREE.HemisphereLight("#fff7ea", "#d8ccb2", 2.4));
    const key = new THREE.DirectionalLight("#fff2d6", 3.6);
    key.position.set(-60, -80, 120);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#b8a4ed", 1.6);
    rim.position.set(80, 60, 60);
    scene.add(rim);

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    animate();

    (async () => {
      const results = await Promise.allSettled(
        PRINT_WORDS.map((word) =>
          loadTextGeometry({ text: word.text, size: PRINT_SIZE, depth: PRINT_DEPTH, bevel: 1.2, font: PRINT_FONT }, controller.signal),
        ),
      );
      if (controller.signal.aborted) {
        results.forEach((result) => result.status === "fulfilled" && result.value.dispose());
        return;
      }
      const studies: PrintStudy[] = [];
      let maxRadius = 1;
      let centerZ = 12;
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const geometry = result.value;
        const palette = STUDY_PALETTE[PRINT_WORDS[index].palette];
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
        const material = new THREE.MeshStandardMaterial({
          color: palette.base,
          roughness: 0.5,
          metalness: 0,
          emissive: palette.base,
          emissiveIntensity: 0.08,
          side: THREE.DoubleSide,
          clippingPlanes: [plane],
          clipShadows: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = index === 0;
        const bounds = geometry.boundingBox!;
        const heightZ = bounds.max.z - bounds.min.z;
        geometry.computeBoundingSphere();
        maxRadius = Math.max(maxRadius, geometry.boundingSphere!.radius);
        centerZ = heightZ / 2;
        const head = new THREE.Mesh(
          new THREE.PlaneGeometry((bounds.max.x - bounds.min.x) * 1.08, (bounds.max.y - bounds.min.y) * 1.15),
          new THREE.MeshBasicMaterial({ color: palette.hi, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
        );
        head.position.set((bounds.max.x + bounds.min.x) / 2, (bounds.max.y + bounds.min.y) / 2, 0);
        head.visible = false;
        scene.add(mesh);
        scene.add(head);
        studies.push({ text: PRINT_WORDS[index].text, mesh, head, plane, heightZ, totalLayers: Math.max(1, Math.round(heightZ / LAYER_HEIGHT_MM)) });
      });
      if (!studies.length) return;
      studiesRef.current = studies;
      frameGeometry(camera, controls, new THREE.Sphere(new THREE.Vector3(0, 0, centerZ), maxRadius));
      setTotalLayers(studies[0].totalLayers);
      setReady(true);
    })();

    return () => {
      controller.abort();
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      studiesRef.current.forEach((study) => {
        scene.remove(study.mesh);
        scene.remove(study.head);
        study.mesh.geometry.dispose();
        study.mesh.material.dispose();
        study.head.geometry.dispose();
        study.head.material.dispose();
      });
      studiesRef.current = [];
      bed.geometry.dispose();
      (bed.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, []);

  useEffect(() => {
    studyIndexRef.current = studyIndex;
    const studies = studiesRef.current;
    const current = studies[studyIndex];
    if (!current) return;
    studies.forEach((study, index) => {
      study.mesh.visible = index === studyIndex;
      if (index !== studyIndex) study.head.visible = false;
    });
    const printedTo = Math.min((layer + 1) * LAYER_HEIGHT_MM, current.heightZ);
    current.plane.constant = printedTo;
    current.head.position.z = printedTo;
    current.head.visible = layer < current.totalLayers - 1;
  }, [layer, studyIndex, ready]);

  useEffect(() => {
    if (!playing || !ready) return;
    const timer = window.setInterval(() => {
      setLayer((current) => {
        const study = studiesRef.current[studyIndexRef.current];
        const total = study?.totalLayers ?? 1;
        if (current < total - 1) return current + 1;
        if (holdRef.current < 12) {
          holdRef.current += 1;
          return current;
        }
        holdRef.current = 0;
        const next = (studyIndexRef.current + 1) % studiesRef.current.length;
        const nextTotal = studiesRef.current[next]?.totalLayers ?? total;
        setStudyIndex(next);
        setTotalLayers(nextTotal);
        return 0;
      });
    }, 46);
    return () => window.clearInterval(timer);
  }, [playing, ready]);

  const currentWord = PRINT_WORDS[studyIndex]?.text ?? "";

  return (
    <div className="layer-card">
      <div className="layer-card-head">
        <div>
          <span className="home-kicker"><Layers3 size={13} /> Live print</span>
          <strong>&ldquo;{currentWord}&rdquo;</strong>
        </div>
        <div className="layer-live-group">
          <span className="layer-study-count">0{studyIndex + 1} / 0{PRINT_WORDS.length}</span>
          <span className="layer-live"><i /> {playing ? "Printing" : "Paused"}</span>
        </div>
      </div>
      <div className="layer-canvas-wrap">
        <div ref={mountRef} className="layer-canvas" aria-label="3D print of extruded text, built layer by layer" />
        <span className="orbit-hint"><MousePointer2 size={13} /> Drag to orbit</span>
        {!ready && (
          <div className="layer-loading"><Loader2 size={15} className="spin" /> Warming up the bed…</div>
        )}
        <div className="layer-readout">
          <small>Layer</small>
          <strong>{String(layer + 1).padStart(2, "0")}</strong>
          <span>/ {totalLayers}</span>
        </div>
      </div>
      <div className="layer-controls">
        <button type="button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, totalLayers - 1)}
          value={layer}
          style={{ "--layer-progress": `${(layer / Math.max(1, totalLayers - 1)) * 100}%` } as React.CSSProperties}
          onChange={(event) => {
            setPlaying(false);
            holdRef.current = 0;
            setLayer(Number(event.target.value));
          }}
          aria-label="Visible print layer"
        />
        <span>{((layer + 1) * LAYER_HEIGHT_MM).toFixed(1)} mm</span>
      </div>
      <div className="layer-stats">
        <span><small>Layer height</small><strong>{LAYER_HEIGHT_MM} mm</strong></span>
        <span><small>Material</small><strong>PLA</strong></span>
        <span><small>Supports</small><strong>None</strong></span>
      </div>
    </div>
  );
}

// ---- MCP: SYDNEY, built from the schema and orbited, updating as the chat edits it ----

function SydneyModel({ model }: { model: McpModel | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const refs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
    loader: AbortController | null;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 800);
    camera.up.set(0, 0, 1);
    camera.position.set(18, -58, 56);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.target.set(0, 0, 6);

    scene.add(new THREE.HemisphereLight("#fff7ea", "#d8ccb2", 2.6));
    const key = new THREE.DirectionalLight("#fff2d6", 3.4);
    key.position.set(-30, -60, 80);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#b8a4ed", 1.5);
    rim.position.set(40, 40, 40);
    scene.add(rim);

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    animate();

    refs.current = { scene, camera, controls, mesh: null, loader: null };

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      refs.current?.loader?.abort();
      if (refs.current?.mesh) {
        scene.remove(refs.current.mesh);
        refs.current.mesh.geometry.dispose();
        refs.current.mesh.material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      refs.current = null;
    };
  }, []);

  useEffect(() => {
    const store = refs.current;
    if (!store || !model) return;
    store.loader?.abort();
    const controller = new AbortController();
    store.loader = controller;
    loadTextGeometry(
      {
        text: model.text,
        size: model.height,
        depth: model.depth,
        bevel: model.bevel ? Math.min(model.depth * 0.18, 2) : 0,
        font: model.font,
      },
      controller.signal,
    )
      .then((geometry) => {
        if (controller.signal.aborted) { geometry.dispose(); return; }
        if (store.mesh) {
          store.scene.remove(store.mesh);
          store.mesh.geometry.dispose();
          store.mesh.material.dispose();
        }
        const material = new THREE.MeshStandardMaterial({ color: "#ff4d8b", roughness: 0.5, metalness: 0, emissive: "#ff4d8b", emissiveIntensity: 0.08 });
        const mesh = new THREE.Mesh(geometry, material);
        store.scene.add(mesh);
        store.mesh = mesh;
        geometry.computeBoundingSphere();
        frameGeometry(store.camera, store.controls, geometry.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 40));
      })
      .catch(() => { /* keep the previous model on a failed edit */ });
  }, [model]);

  return <div className="mcp-canvas" ref={mountRef} aria-label="3D preview of the SYDNEY model" />;
}

type McpModel = { text: string; height: number; depth: number; font: string; bevel: boolean };
type McpStep =
  | { role: "user"; text: string }
  | { role: "tool"; name: string; args: string; result: string; model: McpModel; changed: (keyof McpModel)[] };

const CONVERSATION: McpStep[] = [
  { role: "user", text: "Make a sign that says SYDNEY, about 4 cm tall." },
  {
    role: "tool",
    name: "create_extruded_text",
    args: "SYDNEY · 42 mm · Space Grotesk",
    result: "Made it",
    model: { text: "SYDNEY", height: 42, depth: 6, font: "Space Grotesk", bevel: false },
    changed: ["text", "height", "font"],
  },
  { role: "user", text: "Make it taller and round the edges." },
  {
    role: "tool",
    name: "update_extruded_text",
    args: "taller · soft edges",
    result: "Updated",
    model: { text: "SYDNEY", height: 60, depth: 6, font: "Space Grotesk", bevel: true },
    changed: ["height", "bevel"],
  },
  { role: "user", text: "Try a softer font." },
  {
    role: "tool",
    name: "update_extruded_text",
    args: "font → Poppins",
    result: "Updated",
    model: { text: "SYDNEY", height: 60, depth: 6, font: "Poppins", bevel: true },
    changed: ["font"],
  },
];

type Frame = { count: number; running: boolean; dwell: number };

const FRAMES: Frame[] = (() => {
  const frames: Frame[] = [];
  CONVERSATION.forEach((step, index) => {
    if (step.role === "user") {
      frames.push({ count: index + 1, running: false, dwell: 1600 });
    } else {
      frames.push({ count: index + 1, running: true, dwell: 1150 });
      frames.push({ count: index + 1, running: false, dwell: 2100 });
    }
  });
  frames.push({ count: CONVERSATION.length, running: false, dwell: 3200 });
  frames.push({ count: 0, running: false, dwell: 500 });
  return frames;
})();

function McpConversation() {
  const [frameIndex, setFrameIndex] = useState(FRAMES.length - 2);

  useEffect(() => {
    // Initial state already renders the finished thread — honour reduced motion by leaving it there.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const tick = (index: number) => {
      setFrameIndex(index);
      timer = window.setTimeout(() => tick((index + 1) % FRAMES.length), FRAMES[index].dwell);
    };
    tick(0);
    return () => window.clearTimeout(timer);
  }, []);

  const frame = FRAMES[frameIndex];
  const visible = CONVERSATION.slice(0, frame.count);

  let model: McpModel | null = null;
  let changed: (keyof McpModel)[] = [];
  visible.forEach((step, index) => {
    if (step.role !== "tool") return;
    const isLast = index === visible.length - 1;
    if (isLast && frame.running) return; // the model updates only once the tool call finishes
    model = step.model;
    changed = step.changed;
  });

  const active = model as McpModel | null;
  const spec: { key: keyof McpModel; label: string; value: string }[] = active
    ? [
        { key: "height", label: "Height", value: `${active.height} mm` },
        { key: "depth", label: "Depth", value: `${active.depth} mm` },
        { key: "font", label: "Font", value: active.font },
        { key: "bevel", label: "Edges", value: active.bevel ? "Soft" : "Sharp" },
      ]
    : [
        { key: "height", label: "Height", value: "—" },
        { key: "depth", label: "Depth", value: "—" },
        { key: "font", label: "Font", value: "—" },
        { key: "bevel", label: "Edges", value: "—" },
      ];

  return (
    <div className="mcp-window" aria-label="Animated MCP conversation">
      <div className="mcp-bar"><i /><i /><i /><span>Printa · MCP</span><em>live</em></div>
      <div className="mcp-thread">
        {visible.map((step, index) => {
          if (step.role === "user") {
            return <div key={index} className="mcp-msg mcp-user">{step.text}</div>;
          }
          const running = index === visible.length - 1 && frame.running;
          return (
            <div key={index} className="mcp-msg mcp-tool">
              <div className="mcp-tool-head">
                <span className="mcp-tool-badge"><Box size={13} /> {step.name}</span>
                {running ? (
                  <span className="mcp-running"><i /> running</span>
                ) : (
                  <span className="mcp-done"><Check size={13} /> {step.result}</span>
                )}
              </div>
              <div className="mcp-tool-args">{step.args}</div>
            </div>
          );
        })}
      </div>
      <div className="mcp-stage">
        <div className="mcp-model">
          <SydneyModel model={active} />
          <span className="mcp-orbit-hint"><MousePointer2 size={12} /> drag</span>
          {!active && <div className="mcp-building"><Loader2 size={14} className="spin" /> building…</div>}
        </div>
        <div className="mcp-spec">
          {spec.map((item) => (
            <span key={item.key} className={active && changed.includes(item.key) ? "is-changed" : undefined}>
              {item.value}
              <small>{item.label}</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const features = [
  {
    tone: "lavender",
    icon: MessageSquareText,
    label: "Ask",
    title: "Just say it",
    body: "Type what you want — like “a keychain that says MOM” — and Printa builds the 3D model for you.",
    fragment: "“a name tag”",
  },
  {
    tone: "teal",
    icon: Rotate3D,
    label: "Check",
    title: "Spin it around",
    body: "Turn the model right in your browser so you can see it from every side before you print.",
    fragment: "drag to look",
  },
  {
    tone: "peach",
    icon: Download,
    label: "Print",
    title: "Get your file",
    body: "Download a file that works with any 3D printer. Nothing to set up, nothing to tweak.",
    fragment: "one-click file",
  },
] as const;

export function HomePage() {
  return (
    <main className="home-shell">
      <nav className="home-nav" aria-label="Main navigation">
        <Brand />
        <div className="home-nav-links">
          <Link href="/chat">Chat</Link>
          <a href="#capabilities">How it works</a>
          <a href="#workflow">Just ask</a>
          <a href="/mcp" target="_blank" rel="noreferrer">MCP</a>
        </div>
        <Link className="home-nav-cta" href="/editor">Start creating <ArrowRight size={16} /></Link>
      </nav>

      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-pill"><Sparkles size={14} /> Type it. Print it.</span>
          <h1>Turn words into<br /><em>3D prints.</em></h1>
          <p>Tell Printa what you want in plain words. It builds the 3D model and gives you a file that&rsquo;s ready to print.</p>
          <div className="hero-actions">
            <Link className="home-primary" href="/chat">Chat to create <ArrowRight size={17} /></Link>
            <Link className="home-secondary" href="/editor"><Play size={14} fill="currentColor" /> Open the editor</Link>
          </div>
          <div className="hero-proof">
            <span><Check size={14} /> Ready to print</span>
            <span><Check size={14} /> Any font</span>
            <span><Check size={14} /> Free — no sign-up</span>
          </div>
        </div>
        <LayerVisualizer />
      </section>

      <section className="home-capabilities" id="capabilities">
        <div className="section-heading">
          <span className="home-kicker">How it works</span>
          <h2>Three steps. That&rsquo;s it.</h2>
          <p>No software to learn. Just say what you want.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ tone, icon: Icon, label, title, body, fragment }, index) => (
            <article key={title} className={`feature-card feature-card--${tone}`}>
              <div className="feature-top">
                <span className="feature-icon"><Icon size={20} /></span>
                <span className="feature-num">0{index + 1} · {label}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="feature-frag"><i /> {fragment}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="workflow-copy">
          <span className="home-kicker"><Braces size={13} /> Just talk to it</span>
          <h2>Change it<br />by asking.</h2>
          <p>Ask for something, then keep tweaking in plain words — make it taller, round the edges, try another font. Every message updates the real model.</p>
          <Link href="/editor">Try it now <ArrowRight size={16} /></Link>
        </div>
        <McpConversation />
      </section>

      <section className="home-cta">
        <Image src="/printa-logo.png" alt="" width={56} height={56} />
        <span className="home-kicker">Ready when you are</span>
        <h2>Make something real.</h2>
        <p>Go from an idea to a printable file in a couple of minutes.</p>
        <Link className="home-primary" href="/editor">Start creating <ArrowRight size={17} /></Link>
      </section>

      <footer className="home-footer">
        <Brand footer />
        <p>Ideas in. Objects out.</p>
        <div><Link href="/editor">Editor</Link><a href="/mcp">MCP endpoint</a><span>&copy; 2026</span></div>
      </footer>
    </main>
  );
}
