// Bundles the MCP widget's 3D renderer into a single self-hosted ES module.
//
// Runs before `next build` so `public/widget/renderer.js` exists when Next
// copies the public directory. The output is deliberately not committed —
// the widget falls back to the CDN import map if this file is missing, so a
// skipped build step degrades instead of breaking.
import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "public/widget/renderer.js");

await mkdir(path.dirname(outfile), { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, "lib/widget-renderer.entry.js")],
  outfile,
  bundle: true,
  format: "esm",
  minify: true,
  legalComments: "none",
  // Conservative target: the widget runs inside whatever engine the MCP host
  // embeds, including older WKWebView builds on iOS.
  target: ["safari15", "chrome100", "firefox100", "edge100"],
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`widget renderer: ${(bytes / 1024).toFixed(0)} KB → public/widget/renderer.js`);
