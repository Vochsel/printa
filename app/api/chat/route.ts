import {
  convertToModelMessages,
  isStepCount,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { encodeModelDocument, modelSpecJsonSchema, parseModelDocument, stringifyModelDocument, type ModelDocument } from "@/lib/model-spec";

export const runtime = "nodejs";
export const maxDuration = 60;

// "gpt 5.5 lunar" isn't a literal entry in the AI Gateway catalog; the closest
// matches are openai/gpt-5.5 (used here) and openai/gpt-5.6-luna (the "lunar"
// codename line). Override with PRINTA_CHAT_MODEL if you want a different one.
const CHAT_MODEL = process.env.PRINTA_CHAT_MODEL ?? "openai/gpt-5.5";

const EXAMPLE_TWIST = `{
  "version": "1.0",
  "name": "Twisted planter",
  "root": {
    "kind": "shape",
    "id": "body",
    "source": { "type": "primitive", "shape": "box", "width": 60, "depth": 60, "height": 90, "segments": 4 },
    "material": "pla-silk",
    "modifiers": [ { "type": "twist", "angleDeg": 120, "start": 0, "end": 1 }, { "type": "taper", "from": 1, "to": 0.7 } ]
  }
}`;

const EXAMPLE_VASE = `{
  "version": "1.0",
  "name": "Rippled vase",
  "root": {
    "kind": "shape",
    "id": "vessel",
    "source": {
      "type": "revolve",
      "profile": [[26, 0], [34, 40], [30, 90], [24, 130]],
      "wall": 2.2, "bottomCap": true, "interpolation": "catmull-rom"
    },
    "material": "petg",
    "modifiers": [ { "type": "radialWave", "amplitude": 2.5, "count": 12, "axialTurns": 0.5 } ]
  }
}`;

const SYSTEM_PROMPT = `You are Printa's modeling assistant. You turn a person's description (and any reference images) into a printable 3D model by authoring a "Printa Spec 1.0" document and calling the build_model tool with it. The user is usually a hobbyist 3D-print or 2D-design person, not an engineer — keep your prose short, friendly, and free of jargon.

A document is JSON with at least: version "1.0", a name, and a root node. Everything else has sensible defaults. Nodes are one of:
- shape: { kind:"shape", id, source, modifiers?, material?, transform? }
- assembly: { kind:"assembly", id, operation:"merge", children:[…], modifiers?, transform? }  — fuse several shapes
- repeat: { kind:"repeat", id, count, child, step, modifiers? }  — array copies with a per-copy transform step

source types: primitive (box|cylinder|cone|sphere|torus), revolve (a [radius,height] profile spun into a vase/bowl), extrude (a 2D path pulled up), text (any Google font, extruded), cellular (a seeded lightweight Voronoi-style strut lattice), organic (iteratively grown coral branches unified through a smooth volume remesh), water (ripple sim), fluid (an SPH liquid poured from above that pools over the other shapes in the scene), cloth (fabric draped over the other shapes). fluid and cloth are simulations: put them in an assembly alongside the solid shape(s) they should collide with, and the person runs them with the Simulate button.
modifiers (applied top→bottom, may stack): twist, taper, radialWave (flutes), axialWave (ripples up the height), bend, noise (roughen), voronoi (cell centers, raised ridges, or "wire" mode that replaces the input with a smooth open cellular shell), vine (seeded branching rounded tendrils that climb the host surface as one watertight relief mesh), subdivide (Catmull-Clark, Loop, or linear topology refinement), array (incrementally transformed copies), step (constant inset contour layers), smooth. In Voronoi wire mode, amplitude is the wire radius and scale is the average cell size. Place subdivide before displacement modifiers when those modifiers need denser topology, or after them to round the resulting form. Place vine after broad shape deformation so its growth follows the final host surface. Two simulation modifiers turn a shape's own geometry into a sim (run on the Simulate button, and collide with the other shapes in the scene): drape (settle the shape like cloth — great for draping text/shapes over another shape) and melt (melt the shape into a puddle). Both take a "frames" count that controls how far the sim runs.
materials: pla-orange, pla-matte, pla-silk, petg, resin. Units default to mm; keep models roughly within a 256×256×256 mm build volume.

Example — twisted tapered box:
${EXAMPLE_TWIST}

Example — rippled revolved vase:
${EXAMPLE_VASE}

Full JSON Schema for reference:
${JSON.stringify(modelSpecJsonSchema())}

Rules:
1. To create or change the model, ALWAYS call build_model with the complete document (not a diff). When editing, start from the "Current model" the user provides and modify it.
2. If build_model returns an error, read it and call build_model again with a corrected document.
3. After a successful build, reply with one short sentence describing what you made — do not paste the JSON.
4. Prefer forms that print well: closed vase bottoms, sensible wall thickness (≥1.5 mm), no impossibly thin features.
5. Favour a single expressive source over assembling many parts. For prisms and faceted pots use one primitive with a low segment count (e.g. cylinder segments:6 for a hexagon) or an extrude with a closed path; for round vessels use revolve. Only use assembly/repeat when the form genuinely needs multiple distinct pieces, and give each child an explicit transform so nothing floats apart.`;

function documentMaterial(node: ModelDocument["root"]): string {
  if (node.kind === "shape") return node.material ?? "pla-orange";
  if (node.kind === "repeat") return documentMaterial(node.child);
  return documentMaterial(node.children[0]);
}

const buildModel = tool({
  description: "Realize a Printa Spec 1.0 model. Pass the complete model document as a JSON string. Returns the validated model or a validation error to fix.",
  inputSchema: z.object({
    summary: z.string().describe("One short, friendly sentence describing the shape for the user."),
    spec: z.string().describe("The complete Printa model document as a JSON string."),
  }),
  execute: async ({ spec }) => {
    try {
      const document = parseModelDocument(spec);
      const encoded = encodeModelDocument(document);
      return {
        ok: true as const,
        name: document.name,
        spec: stringifyModelDocument(document, "json"),
        material: documentMaterial(document.root),
        previewUrl: `/api/model/stl?spec=${encoded}&preview=true`,
        stlUrl: `/api/model/stl?spec=${encoded}`,
        studioUrl: `/editor?spec=${encoded}`,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "The spec was not a valid Printa document.",
      };
    }
  },
});

export async function POST(req: Request) {
  const { messages, currentSpec }: { messages: UIMessage[]; currentSpec?: string } = await req.json();

  const systemParts = [SYSTEM_PROMPT];
  if (currentSpec && currentSpec.trim()) {
    systemParts.push(`Current model the user is looking at:\n${currentSpec}`);
  }

  const result = streamText({
    model: CHAT_MODEL,
    system: systemParts.join("\n\n"),
    messages: await convertToModelMessages(messages),
    tools: { build_model: buildModel },
    stopWhen: isStepCount(4),
  });

  return result.toUIMessageStreamResponse();
}
