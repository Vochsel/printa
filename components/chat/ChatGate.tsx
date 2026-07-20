"use client";

import { useState } from "react";
import { LoaderCircle, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLink } from "@/components/brand-link";

export function ChatGate() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/chat-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) { window.location.reload(); return; }
      setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <BrandLink />
        <span className="rounded-full bg-[var(--accent-tool-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-tool)]">Chat</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-5 flex flex-col items-center gap-3 text-center">
            <div className="grid size-11 place-items-center rounded-2xl bg-[var(--accent-tool-soft)] text-[var(--accent-tool)]">
              <Lock size={20} />
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">Early access</h1>
              <p className="mt-1 text-sm text-muted-foreground">Printa Chat is invite-only for now. Enter the access password to continue.</p>
            </div>
          </div>

          <form onSubmit={submit} className="grid gap-2.5 rounded-2xl border border-border bg-card p-4">
            <label htmlFor="chat-password" className="text-[11px] font-medium text-muted-foreground">Access password</label>
            <input
              id="chat-password"
              type="password"
              autoFocus
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(false); }}
              placeholder="••••••••••"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {error && <p className="text-xs text-destructive">That password didn&apos;t work. Try again.</p>}
            <Button type="submit" className="mt-1 w-full" disabled={busy || !password.trim()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Enter
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            No password?{" "}
            <a href="/editor" className="font-medium text-foreground underline underline-offset-2">Use the free editor →</a>
          </p>
        </div>
      </div>
    </main>
  );
}
