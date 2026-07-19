import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the homepage, advanced editor, MCP widget, icons, and generation routes", async () => {
  const [page, home, editor, playground, widget, stlRoute, mcpRoute, fontRoute, icon] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/HomePage.tsx", root), "utf8"),
    readFile(new URL("app/editor/page.tsx", root), "utf8"),
    readFile(new URL("app/TextPlayground.tsx", root), "utf8"),
    readFile(new URL("lib/mcp-widget.ts", root), "utf8"),
    readFile(new URL("app/api/stl/route.ts", root), "utf8"),
    readFile(new URL("app/mcp/route.ts", root), "utf8"),
    readFile(new URL("app/api/fonts/route.ts", root), "utf8"),
    readFile(new URL("public/printa-icon.svg", root), "utf8"),
  ]);

  assert.match(page, /<HomePage\s*\/>/);
  assert.match(home, /LayerVisualizer/);
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
  assert.match(playground, /Exceeds 256 mm build volume/);
  assert.match(playground, /createGroundDimensions/);
  assert.match(playground, /readEditorQuery/);
  assert.match(playground, /history\.replaceState/);
  assert.match(playground, /bevelSegments/);
  assert.match(widget, /font-menu/);
  assert.match(widget, /ui\/notifications\/tool-input/);
  assert.match(widget, /Measurement units/);
  assert.match(widget, /font-weight/);
  assert.match(widget, /text-case/);
  assert.match(widget, /loadPreviewFont/);
  assert.match(widget, /font-search-wrap/);
  assert.match(widget, /volume-warning/);
  assert.match(widget, /Generation and download remain enabled/);
  assert.match(widget, /groundDimensions/);
  assert.match(stlRoute, /Content-Type.*model\/stl/s);
  assert.match(mcpRoute, /create_extruded_text/);
  assert.match(mcpRoute, /bevel_segments/);
  assert.match(mcpRoute, /smooth_normals/);
  assert.match(mcpRoute, /font_weight/);
  assert.match(mcpRoute, /underline/);
  assert.match(mcpRoute, /exceedsBuildVolume/);
  assert.match(mcpRoute, /buildVolumeLimitMm/);
  assert.match(mcpRoute, /text\/html;profile=mcp-app|RESOURCE_MIME_TYPE/);
  assert.match(fontRoute, /getGoogleFontCatalog/);
  assert.match(icon, /stacked 3D printing layers/);
});

test("production build contains every public route", async () => {
  await Promise.all([
    access(new URL(".next/server/app/page.js", root)),
    access(new URL(".next/server/app/editor/page.js", root)),
    access(new URL(".next/server/app/api/stl/route.js", root)),
    access(new URL(".next/server/app/api/fonts/route.js", root)),
    access(new URL(".next/server/app/api/font/route.js", root)),
    access(new URL(".next/server/app/mcp/route.js", root)),
    access(new URL(".next/server/app/health/route.js", root)),
    access(new URL("public/og.png", root)),
  ]);
});
