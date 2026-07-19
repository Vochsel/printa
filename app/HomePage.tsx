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
  MessageSquareText,
  MousePointer2,
  Pause,
  Play,
  Rotate3D,
  Sparkles,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const LAYER_COUNT = 60;
const LAYER_HEIGHT_MM = 0.28;

// Every study is a word the platform can actually make — extruded 3D text.
const WORDS = ["PRINTA", "HELLO", "MAKER", "TYPE"] as const;

// Claymation-warm brand tones, one per study, tying the print to the palette.
const STUDY_PALETTE = [
  { base: "#ff4d8b", line: "#e23f7c", hi: "#ffd7e6" }, // pink
  { base: "#b8a4ed", line: "#a690e4", hi: "#ece5ff" }, // lavender
  { base: "#ffb084", line: "#f59d6d", hi: "#ffe7d6" }, // peach
  { base: "#e8b94a", line: "#d8a836", hi: "#f9e7b2" }, // ochre
];

// 5×7 pixel font covering the demo words.
const PIXEL_FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

type LayerMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type PrintStudy = { root: THREE.Group; layers: LayerMesh[] };

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link className={`home-brand${footer ? " home-brand-footer" : ""}`} href="/" aria-label="Printa home">
      <Image src="/printa-logo.png" alt="" width={32} height={32} priority={!footer} />
      <span>Printa</span>
      {!footer && <em>alpha</em>}
    </Link>
  );
}

function layerMaterial(studyIndex: number, index: number) {
  const palette = STUDY_PALETTE[studyIndex];
  return new THREE.MeshStandardMaterial({
    color: index % 2 ? palette.base : palette.line,
    roughness: 0.52,
    metalness: 0,
    emissive: palette.base,
    emissiveIntensity: 0.06,
  });
}

function textGeometryFor(word: string) {
  const cell = 2.2;
  const px = cell * 0.86;
  const letterGap = cell * 0.7;
  const glyphWidth = 5 * cell;
  const shapes: THREE.Shape[] = [];
  let cursor = 0;
  for (const character of word) {
    const rows = PIXEL_FONT[character] ?? PIXEL_FONT[" "];
    rows.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel !== "1") return;
        const x = cursor + columnIndex * cell;
        const y = (rows.length - 1 - rowIndex) * cell;
        const shape = new THREE.Shape();
        shape.moveTo(x, y);
        shape.lineTo(x + px, y);
        shape.lineTo(x + px, y + px);
        shape.lineTo(x, y + px);
        shape.closePath();
        shapes.push(shape);
      });
    });
    cursor += glyphWidth + letterGap;
  }
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: LAYER_HEIGHT_MM * 0.86, bevelEnabled: false, curveSegments: 1 });
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, 0);
  return geometry;
}

function buildPrintStudies() {
  return WORDS.map((word, studyIndex) => {
    const root = new THREE.Group();
    const layers: LayerMesh[] = [];
    const geometry = textGeometryFor(word); // one silhouette, grown layer by layer in Z
    for (let index = 0; index < LAYER_COUNT; index += 1) {
      const mesh = new THREE.Mesh(geometry, layerMaterial(studyIndex, index));
      mesh.position.z = index * LAYER_HEIGHT_MM;
      mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      layers.push(mesh);
      root.add(mesh);
    }
    return { root, layers } satisfies PrintStudy;
  });
}

function LayerVisualizer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const studiesRef = useRef<PrintStudy[]>([]);
  const holdRef = useRef(0);
  const [layer, setLayer] = useState(0);
  const [studyIndex, setStudyIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    camera.up.set(0, 0, 1);
    camera.position.set(58, -70, 44);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.target.set(0, 0, 7);
    controls.minDistance = 50;
    controls.maxDistance = 150;
    controls.maxPolarAngle = Math.PI * 0.49;

    const bed = new THREE.Mesh(
      new THREE.CylinderGeometry(43, 43, 1.2, 96),
      new THREE.MeshStandardMaterial({ color: "#e7ddc6", roughness: 0.94, metalness: 0 }),
    );
    bed.rotation.x = Math.PI / 2;
    bed.position.z = -1;
    bed.receiveShadow = true;
    scene.add(bed);

    const bedRing = new THREE.Mesh(
      new THREE.TorusGeometry(38, 0.18, 4, 96),
      new THREE.MeshBasicMaterial({ color: "#d8b24a", transparent: true, opacity: 0.5 }),
    );
    bedRing.position.z = -0.34;
    scene.add(bedRing);

    const studies = buildPrintStudies();
    studies.forEach((study, index) => {
      study.root.visible = index === 0;
      scene.add(study.root);
    });
    studiesRef.current = studies;

    scene.add(new THREE.HemisphereLight("#fff7ea", "#d8ccb2", 2.4));
    const key = new THREE.DirectionalLight("#fff2d6", 3.6);
    key.position.set(-40, -54, 82);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#b8a4ed", 1.6);
    rim.position.set(58, 40, 44);
    scene.add(rim);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      studies.forEach((study) => study.layers.forEach((printLayer) => {
        geometries.add(printLayer.geometry);
        printLayer.material.dispose();
      }));
      geometries.forEach((geometry) => geometry.dispose());
      bed.geometry.dispose();
      (bed.material as THREE.Material).dispose();
      bedRing.geometry.dispose();
      (bedRing.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      studiesRef.current = [];
    };
  }, []);

  useEffect(() => {
    studiesRef.current.forEach((study, index) => {
      study.root.visible = index === studyIndex;
      const palette = STUDY_PALETTE[index];
      study.layers.forEach((printLayer, layerIndex) => {
        printLayer.visible = layerIndex <= layer;
        const active = layerIndex === layer;
        printLayer.material.emissiveIntensity = active ? 0.85 : 0.06;
        printLayer.material.color.set(active ? palette.hi : layerIndex % 2 ? palette.base : palette.line);
      });
    });
  }, [layer, studyIndex]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setLayer((current) => {
        if (current < LAYER_COUNT - 1) return current + 1;
        if (holdRef.current < 14) {
          holdRef.current += 1;
          return current;
        }
        holdRef.current = 0;
        setStudyIndex((active) => (active + 1) % WORDS.length);
        return 0;
      });
    }, 82);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div className="layer-card">
      <div className="layer-card-head">
        <div>
          <span className="home-kicker"><Layers3 size={13} /> Live print lab</span>
          <strong>&ldquo;{WORDS[studyIndex]}&rdquo;</strong>
        </div>
        <div className="layer-live-group">
          <span className="layer-study-count">0{studyIndex + 1} / 0{WORDS.length}</span>
          <span className="layer-live"><i /> {playing ? "Printing" : "Paused"}</span>
        </div>
      </div>
      <div className="layer-canvas-wrap">
        <div ref={mountRef} className="layer-canvas" aria-label="Interactive 3D printing layer visualizer" />
        <span className="orbit-hint"><MousePointer2 size={13} /> Drag to orbit</span>
        <div className="layer-readout">
          <small>Layer</small>
          <strong>{String(layer + 1).padStart(2, "0")}</strong>
          <span>/ {LAYER_COUNT}</span>
        </div>
      </div>
      <div className="layer-controls">
        <button type="button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause layer animation" : "Play layer animation"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <input
          type="range"
          min={0}
          max={LAYER_COUNT - 1}
          value={layer}
          style={{ "--layer-progress": `${(layer / (LAYER_COUNT - 1)) * 100}%` } as React.CSSProperties}
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

type McpModel = { text: string; height: number; depth: number; font: string; bevel: boolean };
type McpStep =
  | { role: "user"; text: string }
  | { role: "tool"; name: string; args: string; result: string; model: McpModel; changed: (keyof McpModel)[] };

const CONVERSATION: McpStep[] = [
  { role: "user", text: "Make “SYDNEY” in Space Grotesk, 42 mm tall and 5 mm deep." },
  {
    role: "tool",
    name: "create_extruded_text",
    args: "text: SYDNEY · 42 × 5 mm",
    result: "Solid ready",
    model: { text: "SYDNEY", height: 42, depth: 5, font: "Space Grotesk", bevel: false },
    changed: ["text", "height", "depth", "font"],
  },
  { role: "user", text: "Bump it to 60 mm and add a soft bevel." },
  {
    role: "tool",
    name: "update_extruded_text",
    args: "height: 60 mm · bevel: 0.8 mm",
    result: "Model updated",
    model: { text: "SYDNEY", height: 60, depth: 5, font: "Space Grotesk", bevel: true },
    changed: ["height", "bevel"],
  },
  { role: "user", text: "Swap the font to Poppins." },
  {
    role: "tool",
    name: "update_extruded_text",
    args: "font: Poppins",
    result: "Model updated",
    model: { text: "SYDNEY", height: 60, depth: 5, font: "Poppins", bevel: true },
    changed: ["font"],
  },
];

type Frame = { count: number; running: boolean; dwell: number };

const FRAMES: Frame[] = (() => {
  const frames: Frame[] = [];
  CONVERSATION.forEach((step, index) => {
    if (step.role === "user") {
      frames.push({ count: index + 1, running: false, dwell: 1500 });
    } else {
      frames.push({ count: index + 1, running: true, dwell: 1050 });
      frames.push({ count: index + 1, running: false, dwell: 1750 });
    }
  });
  frames.push({ count: CONVERSATION.length, running: false, dwell: 2900 });
  frames.push({ count: 0, running: false, dwell: 480 });
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
    if (isLast && frame.running) return; // spec updates only once the tool call finishes
    model = step.model;
    changed = step.changed;
  });

  const active = model as McpModel | null;
  const spec: { key: keyof McpModel; label: string; value: string }[] = active
    ? [
        { key: "height", label: "Height", value: `${active.height} mm` },
        { key: "depth", label: "Depth", value: `${active.depth} mm` },
        { key: "font", label: "Font", value: active.font },
        { key: "bevel", label: "Bevel", value: active.bevel ? "On" : "Off" },
      ]
    : [
        { key: "height", label: "Height", value: "—" },
        { key: "depth", label: "Depth", value: "—" },
        { key: "font", label: "Font", value: "—" },
        { key: "bevel", label: "Bevel", value: "—" },
      ];

  const modelText = active?.text ?? "solid";

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
        <div className="mcp-model" data-bevel={active?.bevel ? "true" : "false"} data-empty={active ? "false" : "true"}>
          {[...modelText].map((character, index) => (
            <span key={index}>{character}</span>
          ))}
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
    label: "Prompt",
    title: "Built for conversation",
    body: "Generate printable geometry straight from ChatGPT through a native MCP tool and embedded UI.",
    fragment: "create_extruded_text()",
  },
  {
    tone: "teal",
    icon: Rotate3D,
    label: "Inspect",
    title: "See every angle",
    body: "Orbit, measure, and refine your solid in the browser before it ever reaches the build plate.",
    fragment: "orbit · measure · refine",
  },
  {
    tone: "peach",
    icon: Download,
    label: "Print",
    title: "Slicer-ready output",
    body: "Download a watertight binary STL in millimetres, designed to print flat without supports.",
    fragment: "model.stl · binary",
  },
] as const;

export function HomePage() {
  return (
    <main className="home-shell">
      <nav className="home-nav" aria-label="Main navigation">
        <Brand />
        <div className="home-nav-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">How it works</a>
          <a href="/mcp" target="_blank" rel="noreferrer">MCP</a>
        </div>
        <Link className="home-nav-cta" href="/editor">Open editor <ArrowRight size={16} /></Link>
      </nav>

      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-pill"><Sparkles size={14} /> Browser + MCP 3D creation</span>
          <h1>Turn ideas into<br /><em>printable objects.</em></h1>
          <p>Shape a model in conversation or build it by hand. Printa turns intent into clean, inspectable geometry &mdash; and a file your slicer understands.</p>
          <div className="hero-actions">
            <Link className="home-primary" href="/editor">Create 3D text <ArrowRight size={17} /></Link>
            <a className="home-secondary" href="#workflow"><Play size={14} fill="currentColor" /> See how it works</a>
          </div>
          <div className="hero-proof">
            <span><Check size={14} /> Watertight solids</span>
            <span><Check size={14} /> 1,942 Google Fonts</span>
            <span><Check size={14} /> No sign-up</span>
          </div>
        </div>
        <LayerVisualizer />
      </section>

      <section className="home-capabilities" id="capabilities">
        <div className="section-heading">
          <span className="home-kicker">One path from idea to object</span>
          <h2>A small, precise toolchain.</h2>
          <p>No CAD ceremony. Just the controls that make a model printable.</p>
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
          <span className="home-kicker"><Braces size={13} /> Open protocol, useful output</span>
          <h2>Made for the way<br />you already work.</h2>
          <p>Describe the result and watch the model take shape &mdash; then keep editing in plain language. Every change is a real tool call with a real file behind it.</p>
          <Link href="/editor">Start with extruded text <ArrowRight size={16} /></Link>
        </div>
        <McpConversation />
      </section>

      <section className="home-cta">
        <Image src="/printa-logo.png" alt="" width={56} height={56} />
        <span className="home-kicker">Your build plate is empty</span>
        <h2>Make something tangible.</h2>
        <p>From a sentence to a slicer-ready solid in a couple of minutes.</p>
        <Link className="home-primary" href="/editor">Open the editor <ArrowRight size={17} /></Link>
      </section>

      <footer className="home-footer">
        <Brand footer />
        <p>Ideas in. Objects out.</p>
        <div><Link href="/editor">Editor</Link><a href="/mcp">MCP endpoint</a><span>&copy; 2026</span></div>
      </footer>
    </main>
  );
}
