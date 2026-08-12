import { importVectorDocument } from "@/lib/vector-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

// Same permissive policy as the other model endpoints so the MCP widget and the
// editor can both parse artwork from their own origins.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

type JsonBody = { name?: string; data?: string; page?: number; tolerance?: number };

async function readUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Attach an SVG or PDF file as the `file` field.");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
    return {
      data: new Uint8Array(await file.arrayBuffer()),
      name: file.name || "artwork",
      page: Number(form.get("page") ?? 1),
      tolerance: form.get("tolerance") === null ? undefined : Number(form.get("tolerance")),
    };
  }
  const body = await request.json() as JsonBody;
  if (typeof body.data !== "string" || !body.data) throw new Error("Provide the file as base64 in `data`, or post multipart/form-data.");
  const data = new Uint8Array(Buffer.from(body.data, "base64"));
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new Error(`The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  return { data, name: body.name ?? "artwork", page: body.page ?? 1, tolerance: body.tolerance };
}

export async function POST(request: Request) {
  try {
    const upload = await readUpload(request);
    const document = importVectorDocument(upload.data, {
      name: upload.name,
      page: Number.isFinite(upload.page) ? upload.page : 1,
      tolerance: Number.isFinite(upload.tolerance) ? upload.tolerance : undefined,
    });
    return Response.json(document, { headers: CORS });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "This file could not be imported." },
      { status: 400, headers: CORS },
    );
  }
}
