import { getDemoModel } from "@/lib/demo-registry";
import { decodeModelDocument, encodeModelDocument, parseModelDocument, stringifyModelDocument } from "@/lib/model-spec";
import { inspectProceduralModel } from "@/lib/procedural-mesh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The MCP widget runs on a host-controlled sandbox origin, so it needs CORS to
// self-bootstrap a starting model when no tool result reaches it.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { spec?: string | unknown; encoded?: string; demo?: string; format?: "json" | "yaml" };
    const demo = getDemoModel(body.demo);
    const input = demo ?? (body.encoded ? decodeModelDocument(body.encoded) : body.spec);
    if (!input) throw new Error("Provide a model spec or demo id.");
    const parsed = parseModelDocument(input);
    const result = await inspectProceduralModel(parsed);
    const encoded = encodeModelDocument(result.document);
    const origin = new URL(request.url).origin;
    return Response.json({
      ...result,
      spec: stringifyModelDocument(result.document, body.format ?? "yaml"),
      encoded,
      stlUrl: `${origin}/make/model.stl?spec=${encoded}`,
      studioUrl: `${origin}/editor?spec=${encoded}`,
    }, { headers: CORS });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid model spec." },
      { status: 400, headers: CORS },
    );
  }
}
