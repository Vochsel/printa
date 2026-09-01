"use client";

import { say, useWebMcpTools } from "@/lib/webmcp";
import { stashDocument } from "@/lib/model-handoff";
import { capturePlace, placeCaptureDocument, searchPlaces, MAX_CAPTURE_RADIUS_M } from "@/lib/place-capture";

/**
 * Printa's tools, on every page.
 *
 * WebMCP lets a page hand the browser's own agent a list of things it can do
 * (`document.modelContext.registerTool`). The editor registers tools for the
 * document on screen; these are the ones that make sense anywhere — find a
 * starting point, make something from a sentence, capture a real place — so
 * an agent can begin a model from the landing page, or from a template page,
 * without anyone first having to find the editor.
 *
 * Everything here is conditional on the API existing: where it does not, this
 * component renders nothing and registers nothing.
 *
 * The catalogue is fetched at call time rather than imported, because a
 * hundred documents in every page's bundle is a high price for a list of
 * names nobody may ask for.
 */

type Card = { id: string; name: string; description: string; family: string };

async function catalogue(): Promise<Card[]> {
  const response = await fetch("/api/models", { cache: "force-cache" });
  if (!response.ok) throw new Error("The catalogue could not be read.");
  const body = (await response.json()) as { models?: Card[]; cards?: Card[] };
  return body.models ?? body.cards ?? [];
}

function scoreCard(card: Card, needle: string): number {
  const haystack = `${card.name} ${card.description} ${card.family}`.toLowerCase();
  if (!needle) return 1;
  if (card.name.toLowerCase() === needle) return 100;
  if (card.name.toLowerCase().includes(needle)) return 50;
  return haystack.includes(needle) ? 10 : 0;
}

export function SiteTools() {
  useWebMcpTools(() => [
    {
      name: "printa_find_starting_point",
      description:
        "Search Printa's catalogue of ready models — a hundred print templates plus real cities — by name, category or what it is for. Returns ids that printa_open_model opens in the editor.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What the person is after, e.g. \"vase\", \"desk tray\", \"lattice\", \"London\"." },
        },
        required: ["query"],
      },
      execute: async (input) => {
        const query = String((input as unknown as { query?: string }).query ?? "").trim().toLowerCase();
        try {
          const matches = (await catalogue())
            .map((card) => ({ card, score: scoreCard(card, query) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
          if (matches.length === 0) return say(`Nothing in the catalogue matches "${query}". printa_make_text and printa_capture_place build from scratch.`);
          return say(matches.map(({ card }) => `${card.id} — ${card.name}: ${card.description}`).join("\n"));
        } catch (error) {
          return say(error instanceof Error ? error.message : "The catalogue could not be read.");
        }
      },
    },
    {
      name: "printa_open_model",
      description:
        "Open one of the catalogue's models in Printa's editor, ready to change and download. Takes an id from printa_find_starting_point.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "A catalogue id, e.g. \"template-hex-trivet\" or \"place-london-city\"." } },
        required: ["id"],
      },
      execute: async (input) => {
        const id = String((input as unknown as { id?: string }).id ?? "").trim();
        if (!id) return say("Which model? Pass an id from printa_find_starting_point.");
        window.location.href = `/editor?demo=${encodeURIComponent(id)}`;
        return say(`Opening ${id} in the editor.`);
      },
    },
    {
      name: "printa_make_text",
      description:
        "Make a printable 3D word or name — any Google font, extruded to a real thickness — and open it in Printa's editor.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The word or short phrase, up to 24 characters." },
          font: { type: "string", description: "Any Google Fonts family, e.g. \"Poppins\", \"Bebas Neue\". Defaults to Poppins." },
          heightMm: { type: "number", description: "Letter height in millimetres. Defaults to 32." },
          depthMm: { type: "number", description: "How far the letters stand off the bed, in millimetres. Defaults to 14." },
        },
        required: ["text"],
      },
      execute: async (input) => {
        const { text, font, heightMm, depthMm } = input as unknown as { text?: string; font?: string; heightMm?: number; depthMm?: number };
        const word = String(text ?? "").slice(0, 24).trim();
        if (!word) return say("Give me a word to build.");
        const size = heightMm ?? 32;
        const depth = depthMm ?? 14;
        stashDocument({
          version: "1.0",
          name: word,
          units: "mm",
          root: {
            kind: "shape",
            id: "text",
            source: {
              type: "text",
              text: word,
              font: font || "Poppins",
              size,
              height: size,
              depth,
              bevel: Math.min(depth * 0.14, 1.4),
              bevelSide: "top",
            },
            modifiers: [],
          },
        });
        window.location.href = "/editor?handoff=1";
        return say(`Building “${word}” at ${size} mm tall and ${depth} mm deep, and opening it in the editor.`);
      },
    },
    {
      name: "printa_capture_place",
      description:
        "Turn a real place — an address, a suburb, a landmark — into a printable model of its buildings and streets, and open it in Printa's editor.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "An address, suburb, city or landmark." },
          radiusM: { type: "number", description: "Half-width of ground to capture, in metres. 300–500 suits a city block." },
        },
        required: ["query"],
      },
      execute: async (input) => {
        const { query, radiusM } = input as unknown as { query?: string; radiusM?: number };
        try {
          const hits = await searchPlaces(String(query ?? ""));
          const hit = hits[0];
          if (!hit) return say(`Nothing found for "${query}".`);
          const radius = Math.min(radiusM ?? hit.radiusM, MAX_CAPTURE_RADIUS_M.buildings);
          const captured = await capturePlace({ lat: hit.lat, lng: hit.lng, radiusM: radius, capture: "buildings", label: hit.label });
          stashDocument(placeCaptureDocument({
            name: hit.label.split(",")[0]?.trim() || hit.label,
            lat: hit.lat,
            lng: hit.lng,
            radiusM: radius,
            capture: "buildings",
            baked: captured,
          }));
          window.location.href = "/editor?handoff=1";
          return say(`Captured ${hit.label} at ${radius * 2} m across — ${captured.note} — and opening it in the editor.`);
        } catch (error) {
          return say(error instanceof Error ? error.message : "That place could not be captured.");
        }
      },
    },
    {
      name: "printa_describe_model",
      description:
        "Describe an object in plain words and have Printa's own assistant build it — the widest way in, for anything the other tools do not cover.",
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string", description: "What to make, e.g. \"a hexagonal pencil pot with a twist\"." } },
        required: ["prompt"],
      },
      execute: async (input) => {
        const prompt = String((input as unknown as { prompt?: string }).prompt ?? "").trim();
        if (!prompt) return say("Describe what to build.");
        window.location.href = `/editor?ask=${encodeURIComponent(prompt.slice(0, 400))}`;
        return say(`Asking Printa's assistant for “${prompt}”.`);
      },
    },
  ]);

  return null;
}
