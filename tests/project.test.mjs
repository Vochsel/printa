import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the homepage, advanced editors, MCP widgets, skills, icons, and generation routes", async () => {
  const [page, home, editor, playground, studio, inspector, widget, modelWidget, modelSpec, demos, modelStlRoute, skillRoute, stlRoute, mcpRoute, fontRoute, icon] = await Promise.all([
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
  assert.match(studio, /editor-mode-switch/);
  assert.match(studio, /Shape what you see/);
  assert.match(studio, /Full JSON \/ YAML spec/);
  assert.match(studio, /createGroundDimensions/);
  assert.match(studio, /Download STL/);
  assert.match(inspector, /Google font/);
  assert.match(inspector, /loadFontPreview/);
  assert.match(inspector, /Search all Google Fonts/);
  assert.match(inspector, /scroll for all/);
  assert.match(inspector, /Exact width/);
  assert.match(inspector, /Exact height/);
  assert.match(inspector, /Exact depth/);
  assert.match(inspector, /Floor W\/H gizmos/);
  assert.match(inspector, /Add layer/);
  assert.match(inspector, /Add modifier/);
  assert.match(widget, /font-menu/);
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
  assert.match(modelWidget, /Shape in layers/);
  assert.match(modelWidget, /create_procedural_model/);
  assert.match(modelWidget, /JSON \/ YAML spec/);
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
  assert.match(modelSpec, /display: z\.object/);
  assert.match(demos, /type-specimen/);
  assert.match(demos, /contour-spiral-vase/);
  assert.match(demos, /cloth-drape-study/);
  assert.match(modelStlRoute, /createProceduralStl/);
  assert.match(modelStlRoute, /X-Printa-Cache/);
  assert.match(modelStlRoute, /Server-Timing/);
  assert.match(studio, /AbortController/);
  assert.match(studio, /preview: true/);
  assert.match(studio, /PreviewSource/);
  assert.match(studio, /Struts in STL/);
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

test("production build contains every public route", async () => {
  const assets = await Promise.all([
    access(new URL(".next/server/app/page.js", root)),
    access(new URL(".next/server/app/editor/page.js", root)),
    access(new URL(".next/server/app/studio/page.js", root)),
    access(new URL(".next/server/app/api/stl/route.js", root)),
    access(new URL(".next/server/app/api/fonts/route.js", root)),
    access(new URL(".next/server/app/api/font/route.js", root)),
    access(new URL(".next/server/app/api/model/stl/route.js", root)),
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
