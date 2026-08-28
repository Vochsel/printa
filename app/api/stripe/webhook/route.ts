import type Stripe from "stripe";
import { normalizeStatus, ownerForCustomer, recordSubscription, stripeClient } from "@/lib/billing";

/**
 * What Stripe tells us, written down.
 *
 * The signature check is the whole security model here: this endpoint is
 * public, and without verification anyone could grant themselves Pro with a
 * curl. Events are handled idempotently — each one writes the full state
 * rather than incrementing anything — so Stripe's retries are harmless.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return Response.json({ error: "This deployment is not set up to receive Stripe events." }, { status: 501 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(body, signature, secret);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Bad signature." },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const owner = session.client_reference_id ?? session.metadata?.workosUserId;
        const email = session.customer_details?.email ?? session.metadata?.email ?? "";
        if (owner && typeof session.customer === "string") {
          await recordSubscription({
            owner,
            email,
            status: "active",
            stripeCustomerId: session.customer,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        // Metadata is set at checkout, but a subscription edited in the
        // dashboard may arrive without it; the existing row knows the owner.
        const known = await ownerForCustomer(customerId);
        const owner = subscription.metadata?.workosUserId ?? known?.owner;
        const email = subscription.metadata?.email ?? known?.email ?? "";
        if (owner) {
          const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
          await recordSubscription({
            owner,
            email,
            status: event.type === "customer.subscription.deleted" ? "canceled" : normalizeStatus(subscription.status),
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: periodEnd ? periodEnd * 1000 : undefined,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    // Answer 500 so Stripe retries: losing an upgrade is worse than a repeat.
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not record that event." },
      { status: 500 },
    );
  }

  return Response.json({ received: true });
}
