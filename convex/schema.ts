import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * What Convex holds for Printa.
 *
 * Only rendered artefacts: the models themselves are documents in the repo
 * and compile on request, so nothing here is a source of truth for geometry.
 * A template shot is a picture of what one of those documents builds, taken
 * by the capture script and kept so a card, a share preview or a search
 * result can show the real model without spinning up a WebGL context.
 */
export default defineSchema({
  templateShots: defineTable({
    /** The template's slug, as it appears in /templates/<slug>. */
    slug: v.string(),
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    /** Milliseconds since the epoch, stamped by the capture script. */
    capturedAt: v.number(),
    /** Bytes, so a run can be compared with the last one without fetching. */
    bytes: v.number(),
  }).index("by_slug", ["slug"]),
});
