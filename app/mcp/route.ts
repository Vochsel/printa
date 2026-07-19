import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { createWidgetHtml } from "@/lib/mcp-widget";
import { createModelWidgetHtml } from "@/lib/mcp-model-widget";
import { BUILD_VOLUME_WARNING_MM } from "@/lib/text-geometry";
import {
  getTextModelStats,
  makeStlFilename,
  normalizeTextModelOptions,
} from "@/lib/text-mesh";
import { resolveGoogleFont } from "@/lib/google-fonts";
import { getDemoModel } from "@/lib/demo-models";
import { encodeModelDocument, parseModelDocument, stringifyModelDocument } from "@/lib/model-spec";
import { inspectProceduralModel, makeProceduralFilename } from "@/lib/procedural-mesh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_URI = "ui://widget/printa-extruded-text-v8.html";
const MODEL_TEMPLATE_URI = "ui://widget/printa-procedural-model-v4.html";

function createServer(origin: string) {
  const server = new McpServer(
    { name: "printa", version: "0.5.0" },
    {
      instructions:
        `Create ready-to-print geometry with create_procedural_model or use create_extruded_text for the focused text workflow. Printa Spec 1.0 composes primitive, custom-curve extrusion, revolve, text, water, and cloth sources with ordered modifiers, assemblies, repeats, and transforms. Revolved vases support wall thickness, solid bases, and optional solid top caps. JSON and YAML are accepted. Read the modeling skill at ${origin}/skills and the JSON Schema at ${origin}/api/model/schema.`,
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

  registerAppResource(server, "printa-procedural-model", MODEL_TEMPLATE_URI, {}, async () => ({
    contents: [{
      uri: MODEL_TEMPLATE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: createModelWidgetHtml(origin),
      _meta: {
        ui: {
          prefersBorder: false,
          domain: origin,
          csp: {
            connectDomains: [origin, "https://cdn.jsdelivr.net"],
            resourceDomains: [origin, "https://cdn.jsdelivr.net"],
          },
        },
        "openai/widgetDescription": "A complete spec-driven modeling workbench with Google Font text, editable JSON/YAML, form and simulation demos, live 3D preview, spec-controlled floor dimensions, mesh warnings, editor handoff, and STL download.",
        "openai/widgetPrefersBorder": false,
        "openai/widgetCSP": {
          connect_domains: [origin, "https://cdn.jsdelivr.net"],
          resource_domains: [origin, "https://cdn.jsdelivr.net"],
        },
      },
    }],
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
        width_mm: z.number().min(0.1).optional().describe("Optional exact outer text width in millimetres; preserve the font's natural width when omitted"),
        size_mm: z.number().min(0.1).default(36).describe("Exact outer visible letter height in millimetres. Any positive size is allowed; models over 256 mm on any axis receive a warning"),
        depth_mm: z.number().min(0.1).default(4).describe("Exact outer extrusion depth including bevels in millimetres. Any positive size is allowed; models over 256 mm on any axis receive a warning"),
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
      width_mm,
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
        widthMm: width_mm,
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
        ...(options.widthMm ? { width: String(options.widthMm) } : {}),
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

  registerAppTool(
    server,
    "create_procedural_model",
    {
      title: "Create a procedural printable model",
      description: "Validate and build a Printa Spec 1.0 document supplied as JSON or YAML, then show the result as an interactive 3D model with STL download. Use sources for primitives, custom Bézier extrusion, profile revolution, text, water simulation, or cloth simulation. Revolved vessels support wall thickness, solid bottom bases, optional top caps, and independent base/cap thickness. Compose ordered twist, taper, radialWave, axialWave, bend, noise, and smooth modifiers; merge assemblies; or repeat transformed nodes. For a quick start, choose one of the built-in demos.",
      inputSchema: {
        spec: z.string().min(20).max(6_000).optional().describe("Complete Printa Spec 1.0 document as JSON or YAML. Prefer YAML for readability. Omit only when using a built-in demo."),
        demo: z.enum(["type-specimen", "contour-spiral-vase", "zenith-twist", "fluted-bud-vase", "ripple-column-vase", "spline-petal-dish", "primitive-totem", "water-ripple-tile", "cloth-drape-study"]).default("type-specimen").describe("Built-in starting model used when spec is omitted"),
      },
      outputSchema: {
        name: z.string(),
        description: z.string(),
        spec: z.string(),
        units: z.enum(["mm", "cm", "in"]),
        widthMm: z.number(),
        depthMm: z.number(),
        heightMm: z.number(),
        triangles: z.number(),
        volumeEstimateMm3: z.number(),
        materialPreset: z.enum(["pla-orange", "pla-matte", "pla-silk", "petg", "resin"]),
        filename: z.string(),
        stlUrl: z.string().url(),
        previewUrl: z.string().url(),
        studioUrl: z.string().url(),
        exceedsBuildVolume: z.boolean(),
        warnings: z.array(z.string()),
        interiorStruts: z.object({
          enabled: z.boolean(),
          pattern: z.enum(["cross", "diamond", "radial"]),
          spacing: z.number(),
          diameter: z.number(),
          boundaryInset: z.number(),
          wallOverlap: z.number(),
          radialSegments: z.number(),
        }),
        display: z.object({
          floor: z.boolean(),
          grid: z.boolean(),
          dimensions: z.object({ visible: z.boolean(), width: z.boolean(), height: z.boolean(), offset: z.number(), precision: z.number() }),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: MODEL_TEMPLATE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": MODEL_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Evaluating the model graph…",
        "openai/toolInvocation/invoked": "Printable model ready.",
      },
    },
    async ({ spec, demo }) => {
      const input = spec ? parseModelDocument(spec) : getDemoModel(demo);
      if (!input) throw new Error(`Unknown demo: ${demo}`);
      const result = await inspectProceduralModel(input);
      const encoded = encodeModelDocument(result.document);
      const stlUrl = `${origin}/api/model/stl?spec=${encoded}`;
      const previewUrl = `${origin}/api/model/stl?spec=${encoded}&preview=true`;
      const studioUrl = `${origin}/editor?spec=${encoded}`;
      const structuredContent = {
        name: result.document.name,
        description: result.document.description,
        spec: stringifyModelDocument(result.document, "yaml"),
        units: result.document.units,
        widthMm: Number(result.stats.widthMm.toFixed(2)),
        depthMm: Number(result.stats.depthMm.toFixed(2)),
        heightMm: Number(result.stats.heightMm.toFixed(2)),
        triangles: result.stats.triangles,
        volumeEstimateMm3: Number(result.stats.volumeEstimateMm3.toFixed(2)),
        materialPreset: result.materialPreset,
        filename: makeProceduralFilename(result.document.name),
        stlUrl,
        previewUrl,
        studioUrl,
        exceedsBuildVolume: result.exceedsBuildVolume,
        warnings: result.warnings,
        interiorStruts: result.document.print.interiorStruts,
        display: result.document.display,
      };
      return {
        structuredContent,
        content: [{
          type: "text" as const,
          text: `Created ${structuredContent.filename}: ${structuredContent.widthMm} × ${structuredContent.depthMm} × ${structuredContent.heightMm} mm, ${structuredContent.triangles.toLocaleString()} triangles.${structuredContent.warnings.length ? ` ${structuredContent.warnings.join(" ")}` : ""} [Download STL](${stlUrl}) or [continue editing in Printa](${studioUrl}).`,
        }],
        _meta: { specVersion: "1.0", generatedAt: new Date().toISOString() },
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
