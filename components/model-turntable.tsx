"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

/**
 * A turntable preview of one real model.
 *
 * The mesh is fetched from `/api/model/stl` — the same endpoint the editor and
 * the MCP tools use — so what a visitor sees is genuinely the file they would
 * download, not a picture of one.
 */
export function ModelTurntable({
  specUrl,
  className = "",
  spin = true,
}: {
  specUrl: string;
  className?: string;
  spin?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 8000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 0.7, 1.3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc4d4ff, 0.7);
    fill.position.set(-1.1, -0.5, 0.5);
    scene.add(fill);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let raf = 0;
    let disposed = false;
    let radius = 60;
    const controller = new AbortController();

    const frame = () => {
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.35, camera.aspect));
      const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.12;
      camera.position.set(0, -distance * 0.82, distance * 0.57);
      camera.up.set(0, 0, 1);
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.05, radius / 200);
      camera.far = radius * 60;
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      frame();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    (async () => {
      try {
        const response = await fetch(specUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const geometry = new STLLoader().parse(await response.arrayBuffer());
        if (disposed) return;

        geometry.computeBoundingBox();
        geometry.computeVertexNormals();
        const box = geometry.boundingBox!;
        geometry.translate(
          -(box.min.x + box.max.x) / 2,
          -(box.min.y + box.max.y) / 2,
          -(box.min.z + box.max.z) / 2,
        );
        geometry.computeBoundingSphere();
        radius = geometry.boundingSphere?.radius ?? 60;

        pivot.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: 0xd8dce2,
          roughness: 0.68,
          metalness: 0.02,
        })));
        frame();
        setState("ready");

        const loop = () => {
          if (spin) pivot.rotation.z += 0.0035;
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (error) {
        if (!disposed && (error as Error).name !== "AbortError") setState("error");
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [specUrl, spin]);

  return (
    <div className={`relative ${className}`}>
      <div ref={hostRef} className="h-full w-full" />
      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground">
            {state === "error" ? "Preview unavailable" : "Building model…"}
          </span>
        </div>
      )}
    </div>
  );
}
