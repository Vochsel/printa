import { getDemoModel } from "@/lib/demo-models";
import { decodeModelDocument, parseModelDocument } from "@/lib/model-spec";
import { createProceduralStl, makeProceduralFilename } from "@/lib/procedural-mesh";

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
      const body = JSON.parse(text) as { spec?: string | unknown };
      return parseModelDocument(body.spec ?? body);
    }
    return parseModelDocument(text);
  }
  throw new Error("Provide a demo id or encoded model spec.");
}

async function createResponse(request: Request) {
  try {
    const { document, stats, bytes } = await createProceduralStl(await inputFromRequest(request));
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "model/stl",
        "Content-Disposition": `attachment; filename="${makeProceduralFilename(document.name)}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": request.method === "GET" ? "public, max-age=3600, s-maxage=86400" : "no-store",
        "X-Printa-Dimensions": `${stats.widthMm.toFixed(2)},${stats.depthMm.toFixed(2)},${stats.heightMm.toFixed(2)}`,
        "X-Printa-Triangles": String(stats.triangles),
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
