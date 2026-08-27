import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Storing a model document so a key can stand in for it.
 *
 * Used for two things that look the same from here: a place captured by the
 * assistant or the landing page, which needs a link that works but not a
 * home; and a project someone saved, which does.
 */

/** A capture nobody saved is kept a month, then swept by the cron. */
export const CAPTURE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A model document is large, but a megabyte and a half is not a model. */
const MAX_DOCUMENT_BYTES = 1_500_000;

export const store = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    document: v.string(),
    kind: v.union(v.literal("capture"), v.literal("project")),
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // This mutation is reachable from anywhere the deployment URL is known,
    // so it checks its own shape rather than trusting the caller: keys are
    // generated, and a document has a size beyond which it is not one.
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(args.key)) throw new Error("Bad document key.");
    if (args.document.length > MAX_DOCUMENT_BYTES) throw new Error("Document is too large to store.");

    const now = Date.now();
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    const row = {
      ...args,
      bytes: args.document.length,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      // Only the owner may overwrite a saved project; a capture has no owner
      // and is addressed by an unguessable key.
      if (existing.owner && existing.owner !== args.owner) throw new Error("Not yours to change.");
      await ctx.db.patch(existing._id, row);
      return args.key;
    }
    await ctx.db.insert("documents", row);
    return args.key;
  },
});

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("documents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) return null;
    return { key: row.key, name: row.name, document: row.document, kind: row.kind, owner: row.owner, updatedAt: row.updatedAt };
  },
});

/** Everything one person has saved, newest first. */
export const listForOwner = query({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .order("desc")
      .take(100);
    return rows
      .filter((row) => row.kind === "project")
      .map((row) => ({ key: row.key, name: row.name, bytes: row.bytes, updatedAt: row.updatedAt }));
  },
});

export const remove = mutation({
  args: { key: v.string(), owner: v.string() },
  handler: async (ctx, { key, owner }) => {
    const row = await ctx.db
      .query("documents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) return false;
    if (row.owner !== owner) throw new Error("Not yours to delete.");
    await ctx.db.delete(row._id);
    return true;
  },
});

/** Sweep captures nobody kept, so the table does not grow without bound. */
export const sweepCaptures = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CAPTURE_TTL_MS;
    const stale = await ctx.db
      .query("documents")
      .withIndex("by_kind", (q) => q.eq("kind", "capture").lt("createdAt", cutoff))
      .take(200);
    for (const row of stale) await ctx.db.delete(row._id);
    return stale.length;
  },
});
