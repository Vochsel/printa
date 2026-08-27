import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the homepage, advanced editors, MCP widgets, skills, icons, and generation routes", async () => {
  const [page, home, editor, studio, inspector, widget, modelSpec, proceduralGeometry, demos, modelStlRoute, publicStlRoute, skill, skillRoute, stlRoute, mcpRoute, fontRoute, icon] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/HomePage.tsx", root), "utf8"),
    readFile(new URL("app/editor/page.tsx", root), "utf8"),
    readFile(new URL("app/ProceduralStudio.tsx", root), "utf8"),
    readFile(new URL("app/SpecInspector.tsx", root), "utf8"),
    readFile(new URL("lib/mcp-widget.ts", root), "utf8"),
    readFile(new URL("lib/model-spec.ts", root), "utf8"),
    readFile(new URL("lib/procedural-geometry.ts", root), "utf8"),
    readFile(new URL("lib/demo-models.ts", root), "utf8"),
    readFile(new URL("app/api/model/stl/route.ts", root), "utf8"),
    readFile(new URL("app/make/model.stl/route.ts", root), "utf8"),
    readFile(new URL("skills/printa-modeling/SKILL.md", root), "utf8"),
    readFile(new URL("app/skills/route.ts", root), "utf8"),
    readFile(new URL("app/api/stl/route.ts", root), "utf8"),
    readFile(new URL("app/mcp/route.ts", root), "utf8"),
    readFile(new URL("app/api/fonts/route.ts", root), "utf8"),
    readFile(new URL("public/printa-icon.svg", root), "utf8"),
  ]);

  assert.match(page, /<HomePage\s*\/>/);
  // Landing: one live-compiled workbench (gallery + editable text) then pricing.
  assert.match(home, /function Workbench/);
  assert.match(home, /function ModelStage/);
  assert.match(home, /function FontPicker/);
  assert.match(home, /Download STL/);
  assert.match(home, /Open in editor/);
  assert.match(home, /\/api\/model\/stl\?spec=/);
  assert.match(home, /Go Pro — \$10\/mo/);
  assert.match(home, /Cloth & water sim/);
  assert.match(home, /href="\/editor"/);
  // The catalogue is linked from the landing page, and its cards open in the
  // editor rather than only downloading.
  assert.match(home, /href="\/templates"/);
  assert.match(home, /Use this/);
  // Browsers kill the oldest context once a page holds more than a handful,
  // so the landing page keeps its live viewports countable: one workbench
  // that swaps its document, plus the gallery cards.
  const stages = home.match(/<ModelStage\b/g)?.length ?? 0;
  assert.ok(stages >= 1 && stages <= 2, `landing should mount few WebGL viewports, found ${stages}`);
  const galleryCards = home.match(/^\s+demo: "/gm)?.length ?? 0;
  assert.ok(galleryCards <= 6, `landing gallery should stay small, found ${galleryCards} cards`);
  assert.match(home, /const EXAMPLES: Example\[\]/);
  assert.match(editor, /<ProceduralStudio\s*\/>/);
  assert.match(studio, /View settings/);
  assert.match(studio, /toCreasedNormals/);
  assert.match(studio, /Raw model spec/);
  assert.match(studio, /localClippingEnabled/);
  assert.match(studio, /listSavedModels/);
  assert.match(studio, /Size labels/);
  assert.match(studio, /createGroundDimensions/);
  assert.match(studio, /createBuildPlate/);
  assert.match(studio, /Download STL/);
  assert.match(inspector, /Google Fonts/);
  assert.match(inspector, /loadFontPreview/);
  assert.match(inspector, /Search .* Google Fonts/);
  assert.match(inspector, /PointListField/);
  // A revolved profile is a curve: the panel draws it as one, mirrored about
  // the axis, rather than only listing its points.
  assert.match(inspector, /ProfileCurveEditor/);
  // Places are editable in the inspector, not only shipped as demos.
  assert.match(inspector, /PlaceSourceFields/);
  assert.match(inspector, /Global radius offset/);
  assert.match(inspector, /Vary amount over shape/);
  assert.match(inspector, /Preview build plate/);
  assert.match(inspector, /Advanced shape data/);
  assert.match(inspector, /Structural lattice inside/);
  assert.match(inspector, /New layer/);
  assert.match(inspector, /Add modifier/);
  assert.match(inspector, /Drag .* to reorder/);
  assert.match(inspector, /onDragStart/);
  assert.match(inspector, /onDrop/);
  // The MCP app is deliberately one screen: the computed geometry, its printed
  // size, and a way into the editor. Anything that reads like a second editor
  // living inside a chat message does not belong here.
  assert.match(widget, /importmap/);
  assert.match(widget, /STLLoader/);
  assert.match(widget, /Open in Printa/);
  assert.match(widget, /openStudio/);
  assert.match(widget, /previewUrl/);
  assert.match(widget, /studioUrl/);
  assert.match(widget, /new App\(/);
  assert.match(widget, /app\.ontoolresult/);
  assert.match(widget, /export function createWidgetHtml/);
  assert.match(widget, /export function createModelWidgetHtml/);
  assert.doesNotMatch(widget, /GTAOPass|pathtracer|font-picker/);
  assert.match(modelSpec, /MODEL_SPEC_VERSION/);
  assert.match(modelSpec, /radialWave/);
  assert.match(modelSpec, /waterSourceSchema/);
  assert.match(modelSpec, /clothSourceSchema/);
  assert.match(modelSpec, /bevelSide/);
  assert.match(modelSpec, /bottomThickness/);
  assert.match(modelSpec, /topThickness/);
  assert.match(modelSpec, /radiusOffset/);
  assert.match(modelSpec, /extrudeSegments/);
  assert.match(modelSpec, /modifierModulationSchema/);
  assert.match(modelSpec, /subdivideModifierSchema/);
  assert.match(modelSpec, /vineModifierSchema/);
  assert.match(proceduralGeometry, /vineGeometry/);
  assert.match(modelSpec, /display: z\.object/);
  assert.match(demos, /type-specimen/);
  assert.match(demos, /contour-spiral-vase/);
  assert.match(demos, /cloth-drape-study/);
  assert.match(modelStlRoute, /createProceduralStl/);
  assert.match(modelStlRoute, /URL-encoded JSON/);
  assert.match(publicStlRoute, /api\/model\/stl\/route/);
  assert.match(skill, /Direct STL fallback/);
  assert.match(skill, /make\/model\.stl\?spec=/);
  assert.match(modelStlRoute, /X-Printa-Cache/);
  assert.match(modelStlRoute, /MODEL_STL_CORS_HEADERS/);
  assert.match(publicStlRoute, /GET, OPTIONS/);
  assert.match(modelStlRoute, /Server-Timing/);
  assert.match(studio, /AbortController/);
  assert.match(studio, /preview: true/);
  assert.match(studio, /PreviewSource/);
  // Viewport render + modifier features
  assert.match(studio, /Path traced/);
  assert.match(studio, /three-gpu-pathtracer/);
  assert.match(studio, /WebGLPathTracer/);
  assert.match(studio, /toCreasedNormals\(base, THREE\.MathUtils\.degToRad\(50\)\)/);
  assert.match(inspector, /Disable modifier/);
  assert.match(inspector, /EyeOff/);
  // Ambient occlusion in every editor viewport + shared brand logo
  assert.match(studio, /GTAOPass/);
  assert.match(studio, /BrandLink/);
  assert.match(modelSpec, /disabledField/);
  assert.match(modelSpec, /disabled: z\.boolean\(\)\.optional/);
  // Simulations: SPH fluid, scene collision, on-command bake
  assert.match(modelSpec, /fluidSourceSchema/);
  assert.match(modelSpec, /bakeField/);
  assert.match(studio, /documentHasSim/);
  assert.match(studio, /Simulate/);
  assert.match(inspector, /Fluid \(SPH\)/);
  assert.match(modelSpec, /interiorStrutsSchema/);
  assert.match(modelStlRoute, /X-Printa-Interior-Struts/);
  assert.match(skillRoute, /text\/markdown/);
  assert.match(stlRoute, /Content-Type.*model\/stl/s);
  assert.match(mcpRoute, /create_extruded_text/);
  assert.match(mcpRoute, /width_mm/);
  assert.match(mcpRoute, /create_procedural_model/);
  assert.match(mcpRoute, /previewUrl/);
  assert.match(mcpRoute, /bevel_segments/);
  assert.match(mcpRoute, /smooth_normals/);
  assert.match(mcpRoute, /font_weight/);
  assert.match(mcpRoute, /underline/);
  assert.match(mcpRoute, /exceedsBuildVolume/);
  assert.match(mcpRoute, /buildVolumeLimitMm/);
  assert.match(mcpRoute, /material_preset/);
  assert.match(mcpRoute, /high_quality/);
  assert.match(mcpRoute, /text\/html;profile=mcp-app|RESOURCE_MIME_TYPE/);
  assert.match(fontRoute, /getGoogleFontCatalog/);
  assert.match(icon, /stacked 3D printing layers/);
});

// These are the failure modes that left the ChatGPT widget rendering nothing:
// tool output that arrives after the module evaluates, an unreported frame
// height, and a single CDN or SDK failure taking the whole module down.
test("MCP widgets survive every way a host can hand them data", async () => {
  const [widget, mcpRoute, inspectRoute] = await Promise.all([
    readFile(new URL("lib/mcp-widget.ts", root), "utf8"),
    readFile(new URL("app/mcp/route.ts", root), "utf8"),
    readFile(new URL("app/api/model/inspect/route.ts", root), "utf8"),
  ]);

  for (const [name, source] of [["widget", widget]]) {
    // Late-arriving globals: ChatGPT does not guarantee toolOutput exists at
    // module-evaluation time, so both widgets must keep listening.
    assert.match(source, /openai:set_globals/, `${name} widget listens for late globals`);
    assert.match(source, /toolOutput/, `${name} widget reads toolOutput`);
    assert.match(source, /setInterval/, `${name} widget polls for globals`);
    // A host sizes the iframe from what the widget reports; silence collapses it.
    assert.match(source, /notifyIntrinsicHeight/, `${name} widget reports its height`);
    assert.match(source, /size-changed/, `${name} widget posts a size notification`);
  }

  // The SDK handshake must never be fatal: ChatGPT uses its own window.openai
  // bridge and rejects the ext-apps connect() call.
  assert.doesNotMatch(widget, /Could not connect to the MCP host/);
  assert.match(widget, /import\("https:\/\/cdn\.jsdelivr\.net\/npm\/@modelcontextprotocol\/ext-apps[^)]*\)/);
  assert.match(widget, /notifications\/initialized/);
  // three.js loads dynamically so a blocked CDN degrades to a download link.
  assert.match(widget, /async function bootRenderer/);
  assert.match(widget, /rendererReady/);
  assert.match(widget, /The 3D preview could not load/);
  // Last-resort self-bootstrap needs a CORS-enabled inspect endpoint.
  assert.match(widget, /\/api\/model\/inspect/);
  assert.match(inspectRoute, /Access-Control-Allow-Origin/);
  assert.match(inspectRoute, /export function OPTIONS/);
  // Widget HTML is cached by resource URI, so the version must move with it.
  assert.match(mcpRoute, /printa-procedural-model-v11\.html/);
  assert.match(mcpRoute, /printa-extruded-text-v12\.html/);
  // Hosts render widgets on light and dark chrome.
  assert.match(widget, /prefers-color-scheme:dark/);
});

test("the page offers its tools to the browser's own agent (WebMCP)", async () => {
  const [webmcp, studio] = await Promise.all([
    readFile(new URL("lib/webmcp.ts", root), "utf8"),
    readFile(new URL("app/ProceduralStudio.tsx", root), "utf8"),
  ]);

  // Chrome's API, and nothing more: where it is missing, registering must be
  // a no-op rather than a crash on every page load.
  assert.match(webmcp, /document\.modelContext/);
  assert.match(webmcp, /registerTool/);
  assert.match(webmcp, /AbortController/);
  assert.match(webmcp, /if \(!context\) return/);

  // The editor exposes what the HTTP MCP server does, pointed at the document
  // on screen.
  for (const tool of ["printa_get_model", "printa_set_model", "printa_capture_place", "printa_download_stl"]) {
    assert.match(studio, new RegExp(tool), `editor registers ${tool}`);
  }
});

// A syntax error inside a widget's inline module is invisible to tsc and to the
// Next build — the string still compiles, the browser just renders nothing.
test("MCP widget inline scripts parse as ES modules", async () => {
  const vm = await import("node:vm");
  const { createModelWidgetHtml, createWidgetHtml } = await import(new URL("lib/mcp-widget.ts", root).href);

  for (const [name, html] of [
    ["model", createModelWidgetHtml("https://printa.test")],
    ["text", createWidgetHtml("https://printa.test")],
  ]) {
    const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    assert.ok(scripts.length > 0, `${name} widget has an inline module`);
    for (const source of scripts) {
      assert.doesNotThrow(() => new vm.SourceTextModule(source, { identifier: name }), `${name} widget script parses`);
    }
    for (const map of html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(map[1]), `${name} widget importmap is valid JSON`);
    }
    // The origin must be interpolated, never left as a literal placeholder.
    assert.match(html, /https:\/\/printa\.test/, `${name} widget embeds its origin`);
  }
});

test("ships the AI assistant chat that builds models from prompts and images", async () => {
  const [chatRoute, chatPanel, studio] = await Promise.all([
    readFile(new URL("app/api/chat/route.ts", root), "utf8"),
    readFile(new URL("components/editor/ChatPanel.tsx", root), "utf8"),
    readFile(new URL("app/ProceduralStudio.tsx", root), "utf8"),
  ]);
  assert.match(chatRoute, /streamText/);
  assert.match(chatRoute, /PRINTA_CHAT_MODEL/);
  assert.match(chatRoute, /build_model/);
  assert.match(chatRoute, /parseModelDocument/);
  assert.match(chatRoute, /convertToModelMessages/);
  assert.match(chatPanel, /useChat/);
  assert.match(chatPanel, /DefaultChatTransport/);
  assert.match(chatPanel, /tool-build_model/);
  assert.match(chatPanel, /type="file"/);
  assert.match(chatPanel, /currentSpec/);
  assert.match(studio, /ChatPanel/);
  assert.match(studio, /Assistant/);
});

test("ships the /chat beginner page with inline 3D model previews", async () => {
  const [chatPage, chatExperience, preview, chatRoute, home] = await Promise.all([
    readFile(new URL("app/chat/page.tsx", root), "utf8"),
    readFile(new URL("components/chat/ChatExperience.tsx", root), "utf8"),
    readFile(new URL("components/model-preview.tsx", root), "utf8"),
    readFile(new URL("app/api/chat/route.ts", root), "utf8"),
    readFile(new URL("app/HomePage.tsx", root), "utf8"),
  ]);
  assert.match(chatPage, /ChatExperience/);
  assert.match(chatExperience, /useChat/);
  assert.match(chatExperience, /ModelPreview/);
  assert.match(chatExperience, /tool-build_model/);
  assert.match(chatExperience, /download/);
  assert.match(chatExperience, /h-dvh/);
  assert.match(preview, /STLLoader/);
  assert.match(preview, /toCreasedNormals/);
  assert.match(preview, /GTAOPass/);
  const mesh = await readFile(new URL("lib/procedural-mesh.ts", root), "utf8");
  assert.match(mesh, /autoRadialSegments/);
  assert.match(mesh, /autoProfileSegments/);
  assert.match(mesh, /resolveNode/);
  assert.match(mesh, /radialWave.*12|12.*lobe/s);
  assert.match(chatRoute, /previewUrl/);
  assert.match(chatRoute, /stlUrl/);
  assert.match(home, /href="\/chat"/);
});

test("/chat is gated behind an env-var early-access password", async () => {
  const [access, layout, route, gate] = await Promise.all([
    readFile(new URL("lib/chat-access.ts", root), "utf8"),
    readFile(new URL("app/chat/layout.tsx", root), "utf8"),
    readFile(new URL("app/api/chat-access/route.ts", root), "utf8"),
    readFile(new URL("components/chat/ChatGate.tsx", root), "utf8"),
  ]);
  assert.match(access, /CHAT_SIGNUP_PASSWORD/);
  assert.match(access, /CHAT_ACCESS_COOKIE/);
  assert.match(layout, /hasChatAccess/);
  assert.match(layout, /ChatGate/);
  assert.match(route, /cookies\(\)/);
  assert.match(route, /httpOnly: true/);
  assert.match(gate, /\/api\/chat-access/);
});

test("simulations: SPH fluid + scene collision are wired into the geometry pipeline", async () => {
  const [fluid, geometry, mesh, collider] = await Promise.all([
    readFile(new URL("lib/fluid-sim.ts", root), "utf8"),
    readFile(new URL("lib/procedural-geometry.ts", root), "utf8"),
    readFile(new URL("lib/procedural-mesh.ts", root), "utf8"),
    readFile(new URL("lib/scene-collider.ts", root), "utf8"),
  ]);
  assert.match(fluid, /simulateFluid/);
  assert.match(fluid, /MarchingCubes/);
  assert.match(fluid, /SceneCollider/);
  assert.match(geometry, /createFluidGeometry/);
  assert.match(geometry, /sceneCollider/);
  assert.match(mesh, /buildSceneCollider/);
  assert.match(mesh, /pruneSimShapes/);
  assert.match(collider, /MeshBVH/);
});

test("simulations as modifiers: drape (cloth) + melt (fluid) run on a shape's own geometry", async () => {
  const [modelSpec, fluid, geometry, mesh, inspector, studio, specs] = await Promise.all([
    readFile(new URL("lib/model-spec.ts", root), "utf8"),
    readFile(new URL("lib/fluid-sim.ts", root), "utf8"),
    readFile(new URL("lib/procedural-geometry.ts", root), "utf8"),
    readFile(new URL("lib/procedural-mesh.ts", root), "utf8"),
    readFile(new URL("app/SpecInspector.tsx", root), "utf8"),
    readFile(new URL("app/ProceduralStudio.tsx", root), "utf8"),
    readFile(new URL("benchmarks/specs.ts", root), "utf8"),
  ]);
  // schema: drape + melt are modifiers
  assert.match(modelSpec, /drapeModifierSchema/);
  assert.match(modelSpec, /meltModifierSchema/);
  // solver: melt reseeds arbitrary particles; geometry applies both
  assert.match(fluid, /simulateFluidParticles/);
  assert.match(geometry, /drapeGeometry/);
  assert.match(geometry, /meltGeometry/);
  // melt fills the shape's volume (BVH inside-test), not just its vertices
  assert.match(geometry, /fillSolidParticles/);
  assert.match(geometry, /MeshBVH/);
  // drape inflates a closed solid like a balloon so it doesn't collapse flat
  assert.match(modelSpec, /inflate/);
  assert.match(geometry, /signedMeshVolume/);
  assert.match(geometry, /weldByPosition/);
  assert.match(geometry, /applyModifiers\(input: BufferGeometry, modifiers: ModifierSpec\[\], sceneCollider/);
  // pipeline: sim modifiers collide with the scene and force full-quality bakes
  assert.match(mesh, /hasSimModifier/);
  // editor: registered + on-command gating detects sim modifiers
  assert.match(inspector, /Drape \(cloth\)/);
  assert.match(inspector, /Melt \(fluid\)/);
  assert.match(studio, /hasSimModifier/);
  // benchmark coverage
  assert.match(specs, /"drape-modifier"/);
  assert.match(specs, /"melt-modifier"/);
});

test("step-by-step simulation: a frame count control steps and re-bakes sims", async () => {
  const studio = await readFile(new URL("app/ProceduralStudio.tsx", root), "utf8");
  assert.match(studio, /simFrameCount/);
  assert.match(studio, /frameDelta/);
  assert.match(studio, /simulate\(-10\)/);
  assert.match(studio, /simulate\(10\)/);
});

test("production build contains every public route", async () => {
  const assets = await Promise.all([
    access(new URL(".next/server/app/page.js", root)),
    access(new URL(".next/server/app/editor/page.js", root)),
    access(new URL(".next/server/app/studio/page.js", root)),
    access(new URL(".next/server/app/api/stl/route.js", root)),
    access(new URL(".next/server/app/api/fonts/route.js", root)),
    access(new URL(".next/server/app/api/font/route.js", root)),
    access(new URL(".next/server/app/api/model/stl/route.js", root)),
    access(new URL(".next/server/app/make/model.stl/route.js", root)),
    access(new URL(".next/server/app/api/model/inspect/route.js", root)),
    access(new URL(".next/server/app/api/model/schema/route.js", root)),
    access(new URL(".next/server/app/skills/route.js", root)),
    access(new URL(".next/server/app/mcp/route.js", root)),
    access(new URL(".next/server/app/health/route.js", root)),
    access(new URL(".next/server/app/templates/page.js", root)),
    access(new URL(".next/server/app/templates/[slug]/page.js", root)),
    access(new URL(".next/server/app/templates/category/[category]/page.js", root)),
    access(new URL(".next/server/app/api/place/capture/route.js", root)),
    access(new URL(".next/server/app/api/place/search/route.js", root)),
    access(new URL("public/og.png", root)),
    access(new URL("public/printa-logo-square.jpg", root)),
    access(new URL("public/benchmarks/index.html", root)),
    readFile(new URL("public/printa-logo.png", root)),
  ]);
  const logoPng = assets.at(-1);
  assert.ok(logoPng);
  assert.ok(logoPng.byteLength <= 10 * 1024, "PNG logo stays within the 10 KB asset budget");
});

test("tracks benchmark history and mandates compatible baseline comparisons", async () => {
  const [runner, report, readme, agents, claude] = await Promise.all([
    readFile(new URL("benchmarks/model-build.ts", root), "utf8"),
    readFile(new URL("public/benchmarks/index.html", root), "utf8"),
    readFile(new URL("benchmarks/README.md", root), "utf8"),
    readFile(new URL("AGENTS.md", root), "utf8"),
    readFile(new URL("CLAUDE.md", root), "utf8"),
  ]);

  assert.match(runner, /suiteFingerprint/);
  assert.match(runner, /historicalPoints/);
  assert.match(runner, /updateHistory/);
  assert.match(runner, /public\/benchmarks\/history\.js/);
  assert.match(runner, /generatedResultPathspecs/);
  assert.ok(runner.indexOf("const revisionMetadata = currentRevisionMetadata()") < runner.indexOf("await startServer()"), "captures the Git revision before benchmark outputs change the worktree");
  assert.match(report, /PRINTA_BENCHMARK_HISTORY/);
  assert.match(report, /Baseline comparison/);
  assert.match(report, /Workload history/);
  assert.match(report, /15% and 5 ms review threshold/);
  assert.match(readme, /most recent run that has the same suite fingerprint/);
  for (const instructions of [agents, claude]) {
    assert.match(instructions, /npm run benchmark/);
    assert.match(instructions, /compatible/);
    assert.match(instructions, /15% and 5 ms/);
    assert.match(instructions, /npm test/);
    assert.match(instructions, /npm run lint/);
  }
});
