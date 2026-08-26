import type { ModelDocumentInput } from "@/lib/model-spec";
import type { PlaceEntry } from "@/lib/place-library";

/**
 * URLs for a place.
 *
 * A shipped place is addressed by its demo id rather than by an inline spec.
 * The document carries its captured ground with it and runs to tens of
 * kilobytes; base64 in a query string overflows what a browser and Node will
 * carry, and the request fails before it reaches the compiler. The id says
 * the same thing in twenty characters.
 */

export const placeDemoId = (place: PlaceEntry) => `place-${place.slug}`;

export const placePreviewUrl = (place: PlaceEntry) =>
  `/api/model/stl?demo=${placeDemoId(place)}&preview=true`;
export const placeDownloadUrl = (place: PlaceEntry) =>
  `/api/model/stl?demo=${placeDemoId(place)}`;
export const placeEditorUrl = (place: PlaceEntry) =>
  `/editor?demo=${placeDemoId(place)}`;

/**
 * Encode a document into a URL.
 *
 * Only safe for specs without baked capture data — a hand-built model, or a
 * place whose ground has been stripped.
 */
export function encodeSpec(document: ModelDocumentInput): string {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
