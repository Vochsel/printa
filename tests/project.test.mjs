import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the homepage, advanced editors, MCP widgets, skills, icons, and generation routes", async () => {
  const [page, home, editor, playground, studio, inspector, widget, modelWidget, modelSpec, demos, modelStlRoute, publicStlRoute, skill, skillRoute, stlRoute, mcpRoute, fontRoute, icon] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/HomePage.tsx", root), "utf8"),
    readFile(new URL("app/editor/page.tsx", root), "utf8"),
    readFile(new URL("app/TextPlayground.tsx", root), "utf8"),
    readFile(new URL("app/ProceduralStudio.tsx", root), "utf8"),
    readFile(new URL("app/SpecInspector.tsx", root), "utf8"),
    readFile(new URL("lib/mcp-widget.ts", root), "utf8"),
    readFile(new URL("lib/mcp-model-widget.ts", root), "utf8"),
    readFile(new URL("lib/model-spec.ts", root), "utf8"),
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
  assert.match(home, /LayerVisualizer/);
  assert.match(home, /const PRINT_WORDS = \[/);
  assert.match(home, /text: "PRINTA"/);
  assert.match(home, /text: "HELLO"/);
  assert.match(home, /STUDY_PALETTE/);
  assert.match(home, /loadTextGeometry/);
  assert.match(home, /setStudyIndex/);
  assert.match(home, /href="\/editor"/);
  assert.match(editor, /<ProceduralStudio\s*\/>/);
  assert.match(playground, /Download STL/);
  assert.match(playground, /OrbitControls/);
  assert.match(playground, /Smooth normals/);
  assert.match(playground, /Bevel resolution/);
  assert.match(playground, /Extrusion resolution/);
  assert.match(playground, /UPPERCASE/);
  assert.match(playground, /Printable underline bar/);
  assert.match(playground, /loadFontPreview/);
  assert.match(playground, /font-popover-search/);
  assert.match(playground, /loadMoreFontsOnScroll/);
  assert.match(playground, /scroll for all/);
  assert.match(playground, /Exceeds 256 mm build volume/);
  assert.match(playground, /createGroundDimensions/);
  assert.match(playground, /readEditorQuery/);
  assert.match(playground, /history\.replaceState/);
  assert.match(playground, /bevelSegments/);
  assert.match(playground, /three-gpu-pathtracer/);
  assert.match(playground, /High quality/);
  assert.match(playground, /Print material/);
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
  assert.match(inspector, /Global radius offset/);
  assert.match(inspector, /Vary amount over shape/);
  assert.match(inspector, /Preview build plate/);
  assert.match(inspector, /Advanced shape data/);
  assert.match(inspector, /Structural lattice inside/);
  assert.match(inspector, /New layer/);
  assert.match(inspector, /Add modifier/);
  assert.match(widget, /font-menu/);
  assert.match(widget, /extrude-segments/);
  assert.match(widget, /ui\/notifications\/tool-input/);
  assert.match(widget, /Measurement units/);
  assert.match(widget, /font-weight/);
  assert.match(widget, /text-case/);
  assert.match(widget, /loadPreviewFont/);
  assert.match(widget, /font-search-wrap/);
  assert.match(widget, /fontVisibleCount/);
  assert.match(widget, /scroll for all/);
  assert.match(widget, /volume-warning/);
  assert.match(widget, /Generation and download remain enabled/);
  assert.match(widget, /groundDimensions/);
  assert.match(widget, /three-gpu-pathtracer/);
  assert.match(widget, /material-preset/);
  assert.match(widget, /high-quality/);
  assert.match(widget, /app settings-collapsed/);
  assert.match(widget, /requestDisplayMode\(\{mode:target\}\)/);
  assert.match(widget, /Three\.js/);
  assert.match(modelWidget, /View settings/);
  assert.match(modelWidget, /importmap/);
  assert.match(modelWidget, /cuelume/);
  assert.match(modelWidget, /create_procedural_model/);
  assert.match(modelWidget, /JSON \/ YAML/);
  assert.match(modelWidget, /STLLoader/);
  assert.match(modelWidget, /new App\(/);
  assert.match(modelWidget, /app\.ontoolresult/);
  assert.match(modelWidget, /previewUrl/);
  assert.match(modelWidget, /The model result did not arrive/);
  assert.match(modelWidget, /busy\?"grid":"none"/);
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
  assert.match(modelWidget, /GTAOPass/);
  assert.match(modelSpec, /disabledField/);
  assert.match(modelSpec, /disabled: z\.boolean\(\)\.optional/);
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
  assert.match(modelWidget, /spec-hidden/);
  assert.match(modelWidget, /toggleSpec/);
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
