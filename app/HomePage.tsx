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

const LAYER_COUNT = 84;
const LAYER_HEIGHT_MM = 0.28;

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link className={`home-brand${footer ? " home-brand-footer" : ""}`} href="/" aria-label="Printa home">
      <Image src="/printa-icon.svg" alt="" width={34} height={34} priority={!footer} />
      <span>PRINTA</span>
      {!footer && <em>ALPHA</em>}
    </Link>
  );
}

function LayerVisualizer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const ringsRef = useRef<THREE.Mesh[]>([]);
  const [layer, setLayer] = useState(58);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    camera.up.set(0, 0, 1);
    camera.position.set(64, -76, 58);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.target.set(0, 0, 11);
    controls.minDistance = 56;
    controls.maxDistance = 150;
    controls.maxPolarAngle = Math.PI * 0.48;

    const bed = new THREE.Mesh(
      new THREE.CylinderGeometry(43, 43, 1.2, 96),
      new THREE.MeshStandardMaterial({ color: "#171714", roughness: 0.78, metalness: 0.18 }),
    );
    bed.rotation.x = Math.PI / 2;
    bed.position.z = -1;
    bed.receiveShadow = true;
    scene.add(bed);

    const bedRing = new THREE.Mesh(
      new THREE.TorusGeometry(38, 0.16, 4, 96),
      new THREE.MeshBasicMaterial({ color: "#5b5a55", transparent: true, opacity: 0.55 }),
    );
    bedRing.position.z = -0.34;
    scene.add(bedRing);

    const rings: THREE.Mesh[] = [];
    for (let index = 0; index < LAYER_COUNT; index += 1) {
      const t = index / (LAYER_COUNT - 1);
      const radius = 18.4 + Math.sin(t * Math.PI) * 5.2 + Math.sin(t * Math.PI * 5) * 1.15;
      const geometry = new THREE.TorusGeometry(radius, 0.22, 5, 80);
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 ? "#ff6a37" : "#f45124",
        roughness: 0.42,
        metalness: 0.03,
        emissive: "#4b1004",
        emissiveIntensity: 0.15,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.z = index * 0.285;
      ring.castShadow = true;
      ring.receiveShadow = true;
      rings.push(ring);
      scene.add(ring);
    }
    ringsRef.current = rings;

    scene.add(new THREE.HemisphereLight("#fff7e8", "#1d2440", 2.8));
    const key = new THREE.DirectionalLight("#fff4dd", 5.8);
    key.position.set(-48, -60, 92);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#6880ff", 4.2);
    rim.position.set(62, 42, 50);
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
      rings.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });
      bed.geometry.dispose();
      (bed.material as THREE.Material).dispose();
      bedRing.geometry.dispose();
      (bedRing.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      ringsRef.current = [];
    };
  }, []);

  useEffect(() => {
    ringsRef.current.forEach((ring, index) => {
      ring.visible = index <= layer;
      const material = ring.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = index === layer ? 1.8 : 0.15;
      material.color.set(index === layer ? "#ffbc56" : index % 2 ? "#ff6a37" : "#f45124");
    });
  }, [layer]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setLayer((current) => current >= LAYER_COUNT - 1 ? 0 : current + 1);
    }, 72);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div className="layer-card">
      <div className="layer-card-head">
        <div>
          <span className="home-kicker"><Layers3 size={13} /> Live layer lab</span>
          <strong>Vase study 01</strong>
        </div>
        <span className="layer-live"><i /> Printing</span>
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

const capabilities = [
  { icon: MessageSquareText, label: "Prompt", title: "Built for conversation", body: "Generate printable geometry directly from ChatGPT through a native MCP tool and embedded UI." },
  { icon: Rotate3D, label: "Inspect", title: "See every angle", body: "Orbit, measure, and refine your solid in the browser before it reaches the build plate." },
  { icon: Download, label: "Print", title: "Slicer-ready output", body: "Download a watertight binary STL in millimetres, designed to print flat without supports." },
];

export function HomePage() {
  return (
    <main className="home-shell">
      <nav className="home-nav" aria-label="Main navigation">
        <Brand />
        <div className="home-nav-links">
          <a href="#workflow">How it works</a>
          <a href="#capabilities">Capabilities</a>
          <a href="/mcp" target="_blank" rel="noreferrer">MCP</a>
        </div>
        <Link className="home-nav-cta" href="/editor">Open editor <ArrowRight size={15} /></Link>
      </nav>

      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-pill"><Sparkles size={13} /> Browser + MCP 3D creation</span>
          <h1>Turn ideas into<br /><em>printable objects.</em></h1>
          <p>Shape a model in conversation or build it by hand. Printa turns intent into clean, inspectable geometry—and a file your slicer understands.</p>
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
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, label, title, body }, index) => (
            <article key={title}>
              <div className="capability-top"><span><Icon size={18} /></span><small>0{index + 1} · {label}</small></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="workflow-copy">
          <span className="home-kicker"><Braces size={13} /> Open protocol, useful output</span>
          <h2>Made for the way<br />you already work.</h2>
          <p>Use the visual editor when you want your hands on the model. Use MCP when you want to describe the result and let the interface come to you.</p>
          <Link href="/editor">Start with extruded text <ArrowRight size={16} /></Link>
        </div>
        <div className="workflow-window" aria-label="Example MCP conversation">
          <div className="workflow-window-bar"><i /><i /><i /><span>Printa · MCP</span></div>
          <div className="workflow-message user-message">Make “SYDNEY” in Space Grotesk, 42 mm high and 5 mm deep.</div>
          <div className="workflow-message tool-message">
            <span className="tool-badge"><Box size={14} /> create_extruded_text</span>
            <strong>SYDNEY.stl</strong>
            <div className="mini-model" aria-hidden="true"><span>S</span><span>Y</span><span>D</span><span>N</span><span>E</span><span>Y</span></div>
            <div className="tool-result"><span><Check size={13} /> Solid ready</span><small>42 × 5 mm · Binary STL</small></div>
          </div>
        </div>
      </section>

      <section className="home-cta">
        <Image src="/printa-icon.svg" alt="" width={56} height={56} />
        <span className="home-kicker">Your build plate is empty</span>
        <h2>Make something tangible.</h2>
        <Link className="home-primary" href="/editor">Open the editor <ArrowRight size={17} /></Link>
      </section>

      <footer className="home-footer">
        <Brand footer />
        <p>Ideas in. Objects out.</p>
        <div><Link href="/editor">Editor</Link><a href="/mcp">MCP endpoint</a><span>© 2026</span></div>
      </footer>
    </main>
  );
}
