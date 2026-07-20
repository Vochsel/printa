"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { bind } from "cuelume";
import {
  ArrowUp,
  Download,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Sparkles,
  TriangleAlert,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLink } from "@/components/brand-link";
import { ModelPreview } from "@/components/model-preview";
import { cn } from "@/lib/utils";
import { initSfx, sfx } from "@/lib/sfx";

const SUGGESTIONS = [
  "A twisty hexagon pencil pot",
  "A little rippled bud vase, 120mm tall",
  "A keychain tag that says LUCK",
  "A rounded dish with fluted edges",
];

type BuildOutput = {
  ok?: boolean;
  name?: string;
  error?: string;
  material?: string;
  previewUrl?: string;
  stlUrl?: string;
  studioUrl?: string;
};

function ModelCard({ output }: { output: BuildOutput }) {
  const [stats, setStats] = useState<{ widthMm: number; depthMm: number; heightMm: number; triangles: number } | null>(null);
  const onStats = useCallback((next: typeof stats) => setStats(next), []);
  if (!output.previewUrl) return null;
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
      <ModelPreview url={output.previewUrl} material={output.material} className="h-56 w-full sm:h-72" onStats={onStats} />
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">{output.name ?? "Your model"}</p>
          {stats && (
            <p className="font-mono text-[10px] text-muted-foreground">
              {stats.widthMm.toFixed(0)} × {stats.depthMm.toFixed(0)} × {stats.heightMm.toFixed(0)} mm
            </p>
          )}
        </div>
        {output.studioUrl && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={output.studioUrl} target="_blank" />}>
            <Pencil /> Edit
          </Button>
        )}
        {output.stlUrl && (
          <Button size="sm" nativeButton={false} render={<a href={output.stlUrl} download onClick={() => sfx("chime")} />}>
            <Download /> STL
          </Button>
        )}
      </div>
    </div>
  );
}

export function ChatExperience() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<Set<string>>(new Set());
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { initSfx(); bind(); }, []);

  // The most recent successfully-built spec — sent along so follow-ups edit it.
  const lastSpec = useMemo(() => {
    let spec = "";
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool-build_model" && part.state === "output-available") {
          const output = part.output as BuildOutput & { spec?: string };
          if (output?.ok && output.spec) spec = output.spec;
        }
      }
    }
    return spec;
  }, [messages]);

  // Soft chime when a new model finishes.
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool-build_model" && part.state === "output-available") {
          const output = part.output as BuildOutput;
          if (output?.ok && !readyRef.current.has(part.toolCallId)) {
            readyRef.current.add(part.toolCallId);
            sfx("ready");
          }
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sfx("press");
    sendMessage({ text: trimmed, files }, { body: { currentSpec: lastSpec } });
    setInput("");
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const attachedCount = files?.length ?? 0;
  const empty = messages.length === 0;

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3 sm:px-4">
        <BrandLink />
        <span className="rounded-full bg-[var(--accent-tool-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-tool)]">Chat</span>
        <Link href="/editor" className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground">Open editor →</Link>
      </header>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
          {empty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-[var(--accent-tool-soft)] text-[var(--accent-tool)]">
                <Sparkles size={22} />
              </div>
              <div className="grid gap-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Make something printable</h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                  Describe an object in plain words — or drop in a reference picture — and Printa builds a 3D model you can preview and download as an STL.
                </p>
              </div>
              <div className="grid w-full max-w-md gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--accent-tool)] hover:bg-[var(--accent-tool-soft)]"
                    onClick={() => submit(suggestion)}
                  >
                    <Wand2 size={15} className="shrink-0 text-[var(--accent-tool)]" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                {message.parts.map((part, index) => {
                  if (part.type === "text" && part.text.trim()) {
                    return (
                      <div
                        key={index}
                        className={cn(
                          "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          message.role === "user" ? "bg-foreground text-background" : "bg-secondary text-foreground",
                        )}
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                    // eslint-disable-next-line @next/next/no-img-element -- user-attached data URLs
                    return <img key={index} src={part.url} alt={part.filename ?? "attachment"} className="max-h-48 max-w-[70%] rounded-2xl border border-border object-cover" />;
                  }
                  if (part.type === "tool-build_model") {
                    const output = part.state === "output-available" ? (part.output as BuildOutput) : undefined;
                    if (output?.ok) return <div key={index} className="w-full max-w-[92%]"><ModelCard output={output} /></div>;
                    if (output && !output.ok) {
                      return (
                        <div key={index} className="flex items-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
                          <TriangleAlert size={13} /> That didn&apos;t quite work — adjusting…
                        </div>
                      );
                    }
                    return (
                      <div key={index} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                        <LoaderCircle size={13} className="animate-spin" /> Building your model…
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ))
          )}

          {busy && messages.at(-1)?.role === "user" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle size={13} className="animate-spin" /> Thinking…</div>
          )}
          {error && (
            <div className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {error.message?.toLowerCase().includes("api key") || error.message?.includes("AI_GATEWAY")
                ? "The assistant isn't configured yet (missing AI Gateway key)."
                : error.message || "Something went wrong. Try again."}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border pb-[env(safe-area-inset-bottom)]">
        <form
          className="mx-auto w-full max-w-2xl px-3 py-2.5 sm:px-4"
          onSubmit={(event) => { event.preventDefault(); submit(input); }}
        >
          {attachedCount > 0 && (
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
              <ImagePlus size={12} /> {attachedCount} image{attachedCount > 1 ? "s" : ""} attached
              <button type="button" className="ml-auto hover:text-foreground" onClick={() => { setFiles(undefined); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-secondary px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => setFiles(event.target.files ?? undefined)}
            />
            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" aria-label="Attach image" onClick={() => { sfx("tick"); fileInputRef.current?.click(); }}>
              <ImagePlus />
            </Button>
            <textarea
              value={input}
              rows={1}
              placeholder="Describe something to print…"
              className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (imageFiles.length) {
                  const dataTransfer = new DataTransfer();
                  if (files) Array.from(files).forEach((file) => dataTransfer.items.add(file));
                  imageFiles.forEach((file) => dataTransfer.items.add(file));
                  setFiles(dataTransfer.files);
                }
              }}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(input); } }}
            />
            <Button type="submit" size="icon" className="shrink-0 rounded-xl" disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground/70">Printa builds real, printable STLs. Always sanity-check dimensions before printing.</p>
        </form>
      </div>
    </main>
  );
}
