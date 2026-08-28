/**
 * Provision Printa Pro in Stripe.
 *
 * One command, run once per Stripe account (test and live are separate
 * accounts as far as this is concerned): it creates the product and the
 * monthly price if they are not already there, and prints the environment
 * variables the app needs. Re-running is safe — it looks the product up by
 * its lookup key rather than creating a second one.
 *
 *   STRIPE_SECRET_KEY=sk_test_… npm run setup:stripe
 *
 * The webhook secret comes from wherever the events are pointed:
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 *   stripe webhooks create --url https://…/api/stripe/webhook \
 *     --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted
 */
import Stripe from "stripe";

const LOOKUP_KEY = "printa_pro_monthly";
const PRICE_CENTS = 1000;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Set STRIPE_SECRET_KEY to the account to provision.");
  const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion });

  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, expand: ["data.product"] });
  let price = existing.data[0];

  if (price) {
    console.log(`Found existing price ${price.id} (${LOOKUP_KEY}).`);
  } else {
    const product = await stripe.products.create({
      name: "Printa Pro",
      description: "Cloud projects, simulations, high-resolution export and priority model generation.",
      metadata: { app: "printa" },
    });
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICE_CENTS,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: LOOKUP_KEY,
      metadata: { app: "printa" },
    });
    console.log(`Created product ${product.id} and price ${price.id}.`);
  }

  console.log("\nAdd to .env.local and to Vercel:\n");
  console.log(`STRIPE_SECRET_KEY=${key.slice(0, 12)}…`);
  console.log(`STRIPE_PRICE_PRO=${price.id}`);
  console.log("STRIPE_WEBHOOK_SECRET=whsec_…   (from `stripe listen` or the webhook you create)");
}

await main();
