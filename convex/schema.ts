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
  /**
   * Model documents too large to travel in a URL.
   *
   * A captured place carries its ground inline and runs to a couple of hundred
   * kilobytes; a query string that size is refused with a 431. Storing the
   * document and passing a key keeps every surface — preview, STL, editor
   * link, a link someone sends a friend — working the same way it does for a
   * small model, and it is the same table a saved project lives in.
   */
  documents: defineTable({
    /** Short, URL-safe id the site addresses the document by. */
    key: v.string(),
    name: v.string(),
    /** The document itself, as JSON — the compiler parses it on the way out. */
    document: v.string(),
    bytes: v.number(),
    /** "capture" is transient; "project" is something a person saved. */
    kind: v.union(v.literal("capture"), v.literal("project")),
    /** WorkOS user id when a project belongs to someone. */
    owner: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_owner", ["owner", "updatedAt"])
    .index("by_kind", ["kind", "createdAt"]),

  /**
   * Who is on Pro.
   *
   * Stripe is the source of truth; this is the copy the app reads on every
   * request, keyed by the WorkOS user the checkout was started by. Written
   * only by the webhook, so a cancelled card downgrades without anyone
   * having to visit the site.
   */
  subscriptions: defineTable({
    /** WorkOS user id. */
    owner: v.string(),
    email: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
    ),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_owner", ["owner"]).index("by_customer", ["stripeCustomerId"]),

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
