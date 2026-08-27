import { DEMO_MODELS, type DemoModelId } from "@/lib/demo-models";
import type { ModelDocumentInput } from "@/lib/model-spec";
import { PLACES } from "@/lib/place-library";
import { placeDocument } from "@/lib/place-document";
import { TEMPLATES, templateDemoId } from "@/lib/templates";

/**
 * Every model addressable by `?demo=`, places included.
 *
 * Kept apart from `demo-models` because a place document carries its captured
 * ground — a megabyte across the roster — and the editor only ever needs the
 * card list. Resolving ids here keeps that weight on the server, where the
 * documents are compiled, instead of in every browser that opens `/editor`.
 *
 * Places are generated from the same roster that drives the landing pages, so
 * adding one there makes it a preset, a gallery card and a `?demo=` id at
 * once, with no second list to keep in step.
 */

export const PLACE_DEMOS: Record<string, ModelDocumentInput> = Object.fromEntries(
  PLACES.map((place) => [`place-${place.slug}`, placeDocument(place)]),
);

/** Every catalogue template, addressable the same way. */
export const TEMPLATE_DEMOS: Record<string, ModelDocumentInput> = Object.fromEntries(
  TEMPLATES.map((entry) => [templateDemoId(entry.slug), entry.document]),
);

export function getDemoModel(id: string | null | undefined): ModelDocumentInput | null {
  if (!id) return null;
  if (id in DEMO_MODELS) return DEMO_MODELS[id as DemoModelId];
  return PLACE_DEMOS[id] ?? TEMPLATE_DEMOS[id] ?? null;
}
