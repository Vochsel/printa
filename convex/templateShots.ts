import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Screenshots of the template catalogue.
 *
 * The capture script asks for an upload URL, posts the PNG straight to
 * Convex's storage, then records where it landed. Recording replaces the row
 * for that slug and deletes the file it displaced, so re-running the capture
 * leaves one image per template rather than a hundred more every time.
 */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const record = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    bytes: v.number(),
    capturedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("templateShots")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      // Delete the displaced file before losing the reference to it, or it
      // stays in storage forever with nothing pointing at it.
      await ctx.storage.delete(existing.storageId);
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("templateShots", args);
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const shot = await ctx.db
      .query("templateShots")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!shot) return null;
    return { ...shot, url: await ctx.storage.getUrl(shot.storageId) };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const shots = await ctx.db.query("templateShots").collect();
    return Promise.all(
      shots.map(async (shot) => ({
        slug: shot.slug,
        width: shot.width,
        height: shot.height,
        bytes: shot.bytes,
        capturedAt: shot.capturedAt,
        url: await ctx.storage.getUrl(shot.storageId),
      })),
    );
  },
});
