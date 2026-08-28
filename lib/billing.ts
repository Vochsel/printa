import "server-only";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/**
 * Pro, and how someone gets there.
 *
 * Stripe Checkout does the payment; the webhook writes what happened into
 * Convex against the WorkOS user who started it, and the rest of the site
 * asks `proStatus()`. Everything here is optional: with no Stripe key the
 * site runs exactly as it does today and the Pro button says so, rather than
 * throwing on import and taking the landing page with it.
 */

export const PRO_PRICE_ENV = "STRIPE_PRICE_PRO";

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env[PRO_PRICE_ENV]);
}

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("This deployment has no Stripe key, so it cannot take payments.");
  // Pinning the version means a Stripe upgrade is a decision, not a surprise.
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion });
}

function convex(): ConvexHttpClient | null {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

export type ProStatus = { pro: boolean; status?: string; currentPeriodEnd?: number };

export async function proStatus(owner: string | null | undefined): Promise<ProStatus> {
  const client = convex();
  if (!owner || !client) return { pro: false };
  try {
    const row = await client.query(api.subscriptions.forOwner, { owner });
    return row ? { pro: row.pro, status: row.status, currentPeriodEnd: row.currentPeriodEnd ?? undefined } : { pro: false };
  } catch {
    // A billing lookup that fails should not lock someone out of the editor.
    return { pro: false };
  }
}

type SubscriptionState = {
  owner: string;
  email: string;
  status: "active" | "trialing" | "past_due" | "canceled";
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: number;
};

export async function recordSubscription(state: SubscriptionState) {
  const client = convex();
  if (!client) throw new Error("No Convex deployment configured to record the subscription in.");
  await client.mutation(api.subscriptions.record, state);
}

/** The webhook knows a customer id; the owner is on the row we already wrote. */
export async function ownerForCustomer(stripeCustomerId: string) {
  const client = convex();
  if (!client) return null;
  return client.query(api.subscriptions.forCustomer, { stripeCustomerId });
}

/** Stripe's statuses, narrowed to the four the app distinguishes. */
export function normalizeStatus(status: string): SubscriptionState["status"] {
  if (status === "active" || status === "trialing" || status === "past_due") return status;
  return "canceled";
}
