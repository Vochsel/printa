import { currentAccount } from "@/lib/account";
import { billingConfigured, proStatus, stripeClient } from "@/lib/billing";

/**
 * What this person is paying for, and where to change it.
 *
 * One endpoint for both questions the UI asks: is this account on Pro, and
 * what happens when they press "manage" — which is a Stripe billing portal
 * session, created on demand rather than stored.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  const status = await proStatus(account?.id);
  return Response.json(
    { billingAvailable: billingConfigured(), account, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!billingConfigured()) return Response.json({ error: "Payments are not configured here." }, { status: 501 });

  const status = await proStatus(account.id);
  if (!status.pro) return Response.json({ error: "No subscription to manage yet." }, { status: 400 });

  try {
    const stripe = stripeClient();
    const customers = await stripe.customers.list({ email: account.email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) return Response.json({ error: "No Stripe customer for this account." }, { status: 400 });

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${new URL(request.url).origin}/pricing`,
    });
    return Response.json({ url: portal.url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stripe could not open the billing portal." },
      { status: 502 },
    );
  }
}
