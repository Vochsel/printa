import { getDemoModel } from "@/lib/demo-models";
import { decodeModelDocument, parseModelDocument } from "@/lib/model-spec";
import { createProceduralStl, makeProceduralFilename, proceduralCacheMetrics } from "@/lib/procedural-mesh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function inputFromRequest(request: Request) {
  const url = new URL(request.url);
  const demo = getDemoModel(url.searchParams.get("demo"));
  if (demo) return demo;
  const encoded = url.searchParams.get("spec");
  if (encoded) return decodeModelDocument(encoded);
  if (request.method === "POST") {
    const text = await request.text();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = JSON.parse(text) as { spec?: string | unknown; preview?: boolean };
      return { input: parseModelDocument(body.spec ?? body), preview: body.preview === true };
    }
    return { input: parseModelDocument(text), preview: false };
  }
  throw new Error("Provide a demo id or encoded model spec.");
}

async function createResponse(request: Request) {
  try {
    const requestInput = await inputFromRequest(request);
    const normalized = "input" in requestInput ? requestInput : { input: requestInput, preview: false };
    const startedAt = performance.now();
    const cacheBefore = proceduralCacheMetrics();
    const { document, stats, bytes } = await createProceduralStl(normalized.input, { quality: normalized.preview ? "preview" : "full" });
    const cacheAfter = proceduralCacheMetrics();
    const material = (() => {
      const first = (node: typeof document.root): string => node.kind === "shape" ? node.material ?? "pla-orange" : node.kind === "repeat" ? first(node.child) : first(node.children[0]);
      return first(document.root);
    })();
    const exceeds = stats.widthMm > document.print.buildVolume[0] || stats.depthMm > document.print.buildVolume[1] || stats.heightMm > document.print.buildVolume[2];
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "model/stl",
        "Content-Disposition": `attachment; filename="${makeProceduralFilename(document.name)}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": request.method === "GET" ? "public, max-age=3600, s-maxage=86400" : "no-store",
        "X-Printa-Dimensions": `${stats.widthMm.toFixed(2)},${stats.depthMm.toFixed(2)},${stats.heightMm.toFixed(2)}`,
        "X-Printa-Triangles": String(stats.triangles),
        "X-Printa-Volume": stats.volumeEstimateMm3.toFixed(2),
        "X-Printa-Material": material,
        "X-Printa-Exceeds": String(exceeds),
        "X-Printa-Preview": String(normalized.preview),
        "X-Printa-Cache": `hit=${cacheAfter.hits - cacheBefore.hits}; miss=${cacheAfter.misses - cacheBefore.misses}; coalesced=${cacheAfter.coalesced - cacheBefore.coalesced}`,
        "Server-Timing": `compile;dur=${(performance.now() - startedAt).toFixed(1)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid model spec." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  return createResponse(request);
}

export async function POST(request: Request) {
  return createResponse(request);
}
