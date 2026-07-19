import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the homepage, advanced editors, MCP widgets, skills, icons, and generation routes", async () => {
  const [page, home, editor, playground, studio, widget, modelWidget, modelSpec, demos, modelStlRoute, skillRoute, stlRoute, mcpRoute, fontRoute, icon] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/HomePage.tsx", root), "utf8"),
    readFile(new URL("app/editor/page.tsx", root), "utf8"),
    readFile(new URL("app/TextPlayground.tsx", root), "utf8"),
    readFile(new URL("app/ProceduralStudio.tsx", root), "utf8"),
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
  assert.match(home, /const WORDS = \["PRINTA", "HELLO", "MAKER", "TYPE"\]/);
  assert.match(home, /buildPrintStudies/);
  assert.match(home, /STUDY_PALETTE/);
  assert.match(home, /textGeometryFor/);
  assert.match(home, /setStudyIndex/);
  assert.match(home, /href="\/editor"/);
  assert.match(editor, /<TextPlayground\s*\/>/);
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
  assert.match(studio, /Procedural studio/);
  assert.match(studio, /JSON \/ YAML spec/);
  assert.match(studio, /Download STL/);
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
  assert.match(modelWidget, /Procedural solid/);
  assert.match(modelWidget, /STLLoader/);
  assert.match(modelSpec, /MODEL_SPEC_VERSION/);
  assert.match(modelSpec, /radialWave/);
  assert.match(modelSpec, /waterSourceSchema/);
  assert.match(modelSpec, /clothSourceSchema/);
  assert.match(demos, /contour-spiral-vase/);
  assert.match(demos, /cloth-drape-study/);
  assert.match(modelStlRoute, /createProceduralStl/);
  assert.match(skillRoute, /text\/markdown/);
  assert.match(stlRoute, /Content-Type.*model\/stl/s);
  assert.match(mcpRoute, /create_extruded_text/);
  assert.match(mcpRoute, /create_procedural_model/);
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
    readFile(new URL("public/printa-logo.png", root)),
  ]);
  const logoPng = assets.at(-1);
  assert.ok(logoPng);
  assert.ok(logoPng.byteLength <= 10 * 1024, "PNG logo stays within the 10 KB asset budget");
});
