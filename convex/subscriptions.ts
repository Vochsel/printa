import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Pro, as far as the app is concerned.
 *
 * Stripe knows the truth; these rows are the copy the site reads. Only the
 * webhook writes them, and it writes the whole state each time rather than
 * patching fields, so a row can never drift into a combination Stripe never
 * sent.
 */

const status = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("canceled"),
);

export const record = mutation({
  args: {
    owner: v.string(),
    email: v.string(),
    status,
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_owner", (q) => q.eq("owner", args.owner))
      .unique();
    const row = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert("subscriptions", row);
  },
});

export const forOwner = query({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const row = await ctx.db
      .query("subscriptions")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .unique();
    if (!row) return null;
    return {
      status: row.status,
      pro: row.status === "active" || row.status === "trialing",
      currentPeriodEnd: row.currentPeriodEnd,
      stripeCustomerId: row.stripeCustomerId,
    };
  },
});

/** The webhook only knows the customer, so cancellations look it up that way. */
export const forCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    const row = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("stripeCustomerId", stripeCustomerId))
      .unique();
    return row ? { owner: row.owner, email: row.email } : null;
  },
});
