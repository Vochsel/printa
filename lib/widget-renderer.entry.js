// Entry point for the self-hosted MCP widget renderer bundle.
//
// The widget used to pull three.js and seven addons straight from a CDN via an
// import map. Those addons transitively import 15 more files, and a module
// graph is discovered as it is parsed — so the browser waterfalls ~16 sequential
// cross-origin requests before a single triangle can be drawn. Inside the
// ChatGPT iOS webview that is slow at best and fails outright at worst, and it
// also assumes import-map support in whatever engine the host embeds.
//
// esbuild flattens all of it into one file served from our own origin (see
// scripts/build-widget-renderer.mjs). One request, no bare specifiers, no
// import map. The widget keeps the CDN path as a fallback.
// Both widgets share one bundle so the second one a user opens is a cache hit.
// The optional path-tracing modules stay on the CDN: they are large, lazily
// imported, and already non-fatal when they fail.
export * as THREE from "three";
export { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
export { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
export { toCreasedNormals, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
export { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
export { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
export { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
export { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
export { parse as parseOpenType } from "opentype.js";
