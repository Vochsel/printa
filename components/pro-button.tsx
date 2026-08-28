"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one button that knows where someone is in the Pro story.
 *
 * Signed out, it sends them to sign in. Signed in and not paying, it opens
 * Stripe Checkout. Already paying, it opens the billing portal. And on a
 * deployment with no Stripe keys it says exactly that rather than throwing
 * someone into a checkout that cannot complete.
 */

type Billing = { billingAvailable: boolean; account: { email: string } | null; pro: boolean; status?: string };

export function ProButton({ className }: { className?: string }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void fetch("/api/billing", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Billing) => { if (live) setBilling(data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const go = async () => {
    if (busy) return;
    if (!billing?.account) { window.location.href = "/sign-in?next=/pricing"; return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(billing.pro ? "/api/billing" : "/api/checkout", { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string; signInUrl?: string };
      if (body.signInUrl) { window.location.href = body.signInUrl; return; }
      if (!response.ok || !body.url) throw new Error(body.error ?? "Checkout could not start.");
      window.location.href = body.url;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Checkout could not start.");
      setBusy(false);
    }
  };

  const label = !billing
    ? "Go Pro — $10/mo"
    : !billing.billingAvailable
      ? "Pro is coming soon"
      : billing.pro
        ? "Manage billing"
        : billing.account
          ? "Go Pro — $10/mo"
          : "Sign in to go Pro";

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy || (billing ? !billing.billingAvailable : false)}
        className={cn(
          "flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70",
          className,
        )}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : billing?.pro ? <Check size={15} /> : <Sparkles size={15} />}
        {label}
      </button>
      {error && <p className="text-center text-[11px] text-destructive">{error}</p>}
      {billing && !billing.billingAvailable && (
        <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
          <Lock size={11} /> Billing launches soon — early makers lock in this price.
        </p>
      )}
      {billing?.pro && (
        <p className="text-center text-[11px] text-muted-foreground">
          Pro is active on {billing.account?.email}.
        </p>
      )}
    </div>
  );
}
