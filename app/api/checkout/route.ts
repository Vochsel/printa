import { currentAccount } from "@/lib/account";
import { billingConfigured, stripeClient } from "@/lib/billing";

/**
 * Start a Pro checkout.
 *
 * Signing in first is deliberate: the subscription has to belong to someone
 * the app can recognise on the next request, and an email typed into Stripe
 * is not that.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!billingConfigured()) {
    return Response.json({ error: "Payments are not configured on this deployment yet." }, { status: 501 });
  }

  const account = await currentAccount();
  if (!account) {
    return Response.json({ error: "Sign in first.", signInUrl: "/sign-in?next=/pricing" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_PRO!, quantity: 1 }],
      customer_email: account.email,
      // The webhook has only Stripe's objects to work from, so who this is
      // for travels with the session and comes back on the event.
      client_reference_id: account.id,
      subscription_data: { metadata: { workosUserId: account.id, email: account.email } },
      metadata: { workosUserId: account.id, email: account.email },
      success_url: `${origin}/pricing?upgraded=1`,
      cancel_url: `${origin}/pricing?cancelled=1`,
      allow_promotion_codes: true,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stripe could not start that checkout." },
      { status: 502 },
    );
  }
}
