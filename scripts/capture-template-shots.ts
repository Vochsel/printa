/**
 * Photograph every template and put the pictures in Convex storage.
 *
 * The models are compiled by the running site and rendered by the same
 * turntable a visitor sees, so a shot is a picture of the real STL rather
 * than an illustration of one. Each PNG is posted straight to Convex storage
 * and recorded against its slug, replacing whatever was there before.
 *
 *   npm run shots               # against http://localhost:3000
 *   PRINTA_URL=https://… npm run shots
 *
 * Needs a Convex URL — CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL from .env.local
 * — and a browser Playwright can drive (Chrome, by channel).
 */
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { chromium, type Browser, type Page } from "playwright-core";
import { api } from "../convex/_generated/api";
import { TEMPLATES } from "../lib/templates";

const SITE = process.env.PRINTA_URL ?? "http://localhost:3000";
const SHOT = { width: 900, height: 900 };
/** Long enough for the STL to compile, load and settle at this size. */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 5000);

function convexUrl(): string {
  const fromEnv = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (fromEnv) return fromEnv;
  try {
    const local = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const match = /^NEXT_PUBLIC_CONVEX_URL=(.+)$/m.exec(local);
    if (match) return match[1].trim();
  } catch {
    // No .env.local: fall through to the error below.
  }
  throw new Error("Set CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) to the deployment to upload to.");
}

/** Pixel size straight from the PNG header, since the shot is retina. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function shoot(page: Page, slug: string): Promise<Buffer> {
  await page.goto(`${SITE}/templates/${slug}`, { waitUntil: "networkidle", timeout: 120_000 });
  // The dev server floats its own badge over the corner of the page, and an
  // element screenshot takes whatever is on top of the element.
  await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important; }" });
  // The turntable reports its own state through the DOM: waiting for the
  // canvas alone catches an empty frame before the mesh has arrived.
  await page.waitForSelector("div.aspect-square canvas", { timeout: 120_000 });
  await page.waitForTimeout(SETTLE_MS);
  return page.locator("div.aspect-square").first().screenshot({ type: "png" });
}

async function upload(convex: ConvexHttpClient, slug: string, png: Buffer) {
  const { width, height } = pngSize(png);
  const uploadUrl = await convex.mutation(api.templateShots.generateUploadUrl, {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(png),
  });
  if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`);
  const { storageId } = (await response.json()) as { storageId: string };

  await convex.mutation(api.templateShots.record, {
    slug,
    storageId: storageId as never,
    width,
    height,
    bytes: png.byteLength,
    capturedAt: Date.now(),
  });
}

async function main() {
  const convex = new ConvexHttpClient(convexUrl());
  const only = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
  const templates = only.length > 0 ? TEMPLATES.filter((entry) => only.includes(entry.slug)) : TEMPLATES;

  console.log(`Capturing ${templates.length} templates from ${SITE}`);
  let browser: Browser | null = null;
  let failures = 0;

  try {
    browser = await chromium.launch({ channel: "chrome" });
    const page = await browser.newPage({ viewport: SHOT, deviceScaleFactor: 2 });

    for (const [index, template] of templates.entries()) {
      const started = Date.now();
      try {
        const png = await shoot(page, template.slug);
        await upload(convex, template.slug, png);
        const progress = `${String(index + 1).padStart(3)}/${templates.length}`;
        console.log(`${progress}  ${template.slug.padEnd(26)} ${(png.byteLength / 1024).toFixed(0).padStart(4)} KB  ${Date.now() - started}ms`);
      } catch (error) {
        failures += 1;
        console.log(`     ${template.slug.padEnd(26)} FAILED: ${(error as Error).message.split("\n")[0].slice(0, 120)}`);
      }
    }
  } finally {
    await browser?.close();
  }

  const stored = await convex.query(api.templateShots.list, {});
  console.log(`\n${stored.length} shots in Convex storage · ${failures} failures`);
  if (failures > 0) process.exitCode = 1;
}

await main();
