import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { createWidgetHtml } from "@/lib/mcp-widget";
import { BUILD_VOLUME_WARNING_MM } from "@/lib/text-geometry";
import {
  getTextModelStats,
  makeStlFilename,
  normalizeTextModelOptions,
} from "@/lib/text-mesh";
import { resolveGoogleFont } from "@/lib/google-fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_URI = "ui://widget/printa-extruded-text-v8.html";

function createServer(origin: string) {
  const server = new McpServer(
    { name: "printa", version: "0.2.0" },
    {
      instructions:
        "Create ready-to-print extruded text with create_extruded_text. Dimensions are expressed in millimetres. Convert centimetres to millimetres when needed. Google Font family names are supported. Keep text at 24 characters or fewer.",
    },
  );

  registerAppResource(server, "printa-extruded-text", TEMPLATE_URI, {}, async () => ({
    contents: [
      {
        uri: TEMPLATE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: createWidgetHtml(origin),
        _meta: {
          ui: {
            prefersBorder: false,
            domain: origin,
            csp: {
              connectDomains: [origin, "https://cdn.jsdelivr.net"],
              resourceDomains: [origin, "https://cdn.jsdelivr.net"],
            },
          },
          "openai/widgetDescription": "A full 3D text editor with searchable live Google Font previews, print-material presets, progressive path tracing, unit-aware controls, and STL download.",
          "openai/widgetPrefersBorder": false,
          "openai/widgetCSP": {
            connect_domains: [origin, "https://cdn.jsdelivr.net"],
            resource_domains: [origin, "https://cdn.jsdelivr.net"],
          },
        },
      },
    ],
  }));

  registerAppTool(
    server,
    "create_extruded_text",
    {
      title: "Create extruded text STL",
      description:
        "Create a print-ready binary STL from short extruded text using any Google Font, configurable dimensions, smoothing, curve resolution, and top/bottom bevels. Show an interactive 3D editor.",
      inputSchema: {
        text: z.string().min(1).max(24).describe("Text to turn into a 3D solid"),
        font: z.string().min(1).max(80).default("Roboto").describe("Any Google Fonts family name, such as Roboto, Lobster, or Space Grotesk"),
        size_mm: z.number().min(0.1).default(36).describe("Letter height in millimetres. Any positive size is allowed; models over 256 mm on any axis receive a warning"),
        depth_mm: z.number().min(0.1).default(4).describe("Extrusion depth in millimetres. Any positive size is allowed; models over 256 mm on any axis receive a warning"),
        bevel_mm: z.number().min(0).default(0.6).describe("Edge bevel size in millimetres with no hard maximum"),
        bevel_segments: z.number().int().min(1).max(12).default(3).describe("Number of bevel subdivisions; higher values make round bevels smoother"),
        curve_segments: z.number().int().min(2).max(24).default(10).describe("Outline curve resolution; higher values increase curved-letter detail"),
        bevel_side: z.enum(["both", "top", "bottom"]).default("both").describe("Apply the bevel to both faces, only the top face, or only the bottom face"),
        smooth_normals: z.boolean().default(true).describe("Use smooth vertex normals for softer preview shading"),
        text_case: z.enum(["original", "uppercase", "lowercase", "titlecase"]).default("original").describe("Keep text as typed or transform it to upper, lower, or title case"),
        font_weight: z.enum(["regular", "bold"]).default("regular").describe("Use the nearest available regular or bold Google Font weight"),
        italic: z.boolean().default(false).describe("Use the italic Google Font variant, with a synthetic slant fallback when unavailable"),
        underline: z.boolean().default(false).describe("Add a printable underline beneath the text"),
        material_preset: z.enum(["pla-orange", "pla-matte", "pla-silk", "petg", "resin"]).default("pla-orange").describe("Preview the model with a common printable material appearance"),
        high_quality: z.boolean().default(false).describe("Opt into progressive GPU path tracing; the MCP UI uses realtime Three.js by default"),
      },
      outputSchema: {
        text: z.string(),
        font: z.string(),
        fontId: z.string(),
        sizeMm: z.number(),
        depthMm: z.number(),
        bevelMm: z.number(),
        bevelSegments: z.number(),
        curveSegments: z.number(),
        bevelSide: z.enum(["both", "top", "bottom"]),
        smoothNormals: z.boolean(),
        textCase: z.enum(["original", "uppercase", "lowercase", "titlecase"]),
        fontWeight: z.enum(["regular", "bold"]),
        italic: z.boolean(),
        underline: z.boolean(),
        widthMm: z.number(),
        heightMm: z.number(),
        modelDepthMm: z.number(),
        triangles: z.number(),
        filename: z.string(),
        stlUrl: z.string().url(),
        exceedsBuildVolume: z.boolean(),
        buildVolumeLimitMm: z.number(),
        warnings: z.array(z.string()),
        materialPreset: z.enum(["pla-orange", "pla-matte", "pla-silk", "petg", "resin"]),
        highQuality: z.boolean(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: TEMPLATE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Building the text mesh…",
        "openai/toolInvocation/invoked": "STL ready.",
      },
    },
    async ({
      text,
      font,
      size_mm,
      depth_mm,
      bevel_mm,
      bevel_segments,
      curve_segments,
      bevel_side,
      smooth_normals,
      text_case,
      font_weight,
      italic,
      underline,
      material_preset,
      high_quality,
    }) => {
      const selectedFont = await resolveGoogleFont(font);
      const options = normalizeTextModelOptions({
        text,
        font: selectedFont.id,
        sizeMm: size_mm,
        depthMm: depth_mm,
        bevelMm: bevel_mm,
        bevelSegments: bevel_segments,
        curveSegments: curve_segments,
        bevelSide: bevel_side,
        smoothNormals: smooth_normals,
        textCase: text_case,
        fontWeight: font_weight,
        italic,
        underline,
      });
      const stats = await getTextModelStats(options);
      const params = new URLSearchParams({
        text: options.text,
        font: options.font,
        size: String(options.sizeMm),
        depth: String(options.depthMm),
        bevel: String(options.bevelMm),
        bevelSegments: String(options.bevelSegments),
        curveSegments: String(options.curveSegments),
        bevelSide: options.bevelSide,
        smoothNormals: String(options.smoothNormals),
        textCase: options.textCase,
        fontWeight: options.fontWeight,
        italic: String(options.italic),
        underline: String(options.underline),
      });
      const stlUrl = `${origin}/api/stl?${params.toString()}`;
      const exceedsBuildVolume = stats.widthMm > BUILD_VOLUME_WARNING_MM || stats.heightMm > BUILD_VOLUME_WARNING_MM || stats.depthMm > BUILD_VOLUME_WARNING_MM;
      const warnings = exceedsBuildVolume
        ? [`Model dimensions exceed the ${BUILD_VOLUME_WARNING_MM} × ${BUILD_VOLUME_WARNING_MM} × ${BUILD_VOLUME_WARNING_MM} mm reference build volume.`]
        : [];
      const result = {
        ...options,
        font: selectedFont.family,
        fontId: selectedFont.id,
        widthMm: Number(stats.widthMm.toFixed(2)),
        heightMm: Number(stats.heightMm.toFixed(2)),
        modelDepthMm: Number(stats.depthMm.toFixed(2)),
        triangles: stats.triangles,
        filename: makeStlFilename(options.text),
        stlUrl,
        exceedsBuildVolume,
        buildVolumeLimitMm: BUILD_VOLUME_WARNING_MM,
        warnings,
        materialPreset: material_preset,
        highQuality: high_quality,
      };
      return {
        structuredContent: result,
        content: [
          {
            type: "text" as const,
            text: `Created ${result.filename}: ${result.widthMm} × ${result.heightMm} × ${result.modelDepthMm} mm.${exceedsBuildVolume ? ` Warning: this exceeds the ${BUILD_VOLUME_WARNING_MM} × ${BUILD_VOLUME_WARNING_MM} × ${BUILD_VOLUME_WARNING_MM} mm reference build volume.` : ""} [Download the binary STL](${stlUrl}).`,
          },
        ],
        _meta: { generatedAt: new Date().toISOString() },
      };
    },
  );

  return server;
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleMcpRequest(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createServer(new URL(request.url).origin);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return withCors(response);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, mcp-session-id, mcp-protocol-version, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}
