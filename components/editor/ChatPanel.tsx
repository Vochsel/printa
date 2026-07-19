"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, ImagePlus, LoaderCircle, Sparkles, TriangleAlert, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sfx";

const SUGGESTIONS = [
  "A hexagonal pencil pot with a twist",
  "A tall rippled vase, 140mm",
  "A nameplate that says HELLO in a bold font",
];

export function ChatPanel({
  currentSpec,
  onApply,
  onClose,
}: {
  currentSpec: string;
  onApply: (specJson: string) => void;
  onClose: () => void;
}) {
  const specRef = useRef(currentSpec);
  useEffect(() => { specRef.current = currentSpec; }, [currentSpec]);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<Set<string>>(new Set());
  const busy = status === "submitted" || status === "streaming";

  // Apply the newest successful build_model tool output to the editor (once each).
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "tool-build_model" || part.state !== "output-available") continue;
        const output = part.output as { ok?: boolean; spec?: string } | undefined;
        const callId = part.toolCallId;
        if (output?.ok && output.spec && !appliedRef.current.has(callId)) {
          appliedRef.current.add(callId);
          sfx("ready");
          onApply(output.spec);
        }
      }
    }
  }, [messages, onApply]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sfx("press");
    sendMessage({ text: trimmed, files }, { body: { currentSpec: specRef.current } });
    setInput("");
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const attachedCount = files?.length ?? 0;

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-border bg-background">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Sparkles size={14} className="text-[var(--accent-tool)]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">Assistant</span>
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Close chat" onClick={() => { sfx("tick"); onClose(); }}><X /></Button>
      </header>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && (
          <div className="grid gap-3 py-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Describe a shape and I&apos;ll build it in the viewport. You can attach a reference image too.
            </p>
            <div className="grid gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-2.5 py-2 text-left text-[11px] text-foreground transition-colors hover:border-[var(--accent-tool)] hover:bg-[var(--accent-tool-soft)]"
                  onClick={() => submit(suggestion)}
                >
                  <Wand2 size={12} className="shrink-0 text-[var(--accent-tool)]" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={cn("flex flex-col gap-1", message.role === "user" ? "items-end" : "items-start")}>
            {message.parts.map((part, index) => {
              if (part.type === "text" && part.text.trim()) {
                return (
                  <div
                    key={index}
                    className={cn(
                      "max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
                      message.role === "user" ? "bg-foreground text-background" : "bg-secondary text-foreground",
                    )}
                  >
                    {part.text}
                  </div>
                );
              }
              if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                // eslint-disable-next-line @next/next/no-img-element -- user-attached data URLs, not optimizable assets
                return <img key={index} src={part.url} alt={part.filename ?? "attachment"} className="max-h-32 max-w-[92%] rounded-lg border border-border object-cover" />;
              }
              if (part.type === "tool-build_model") {
                const output = part.output as { ok?: boolean; name?: string; error?: string } | undefined;
                const done = part.state === "output-available";
                const ok = done && output?.ok;
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
                      ok ? "border-emerald-300/50 bg-emerald-50 text-emerald-700"
                        : done ? "border-amber-300/50 bg-amber-50 text-amber-700"
                        : "border-border bg-secondary text-muted-foreground",
                    )}
                  >
                    {done ? <Sparkles size={11} /> : <LoaderCircle size={11} className="animate-spin" />}
                    {ok ? `Built “${output?.name ?? "model"}”` : done ? "Couldn’t build that — retrying" : "Building model…"}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}

        {busy && !messages.some((m) => m.role === "assistant" && m.id === messages.at(-1)?.id) && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle size={11} className="animate-spin" /> Thinking…</div>
        )}
        {error && (
          <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            {error.message?.includes("AI_GATEWAY") || error.message?.toLowerCase().includes("api key")
              ? "Set AI_GATEWAY_API_KEY (or deploy on Vercel) to enable the assistant."
              : error.message || "Something went wrong."}
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-border p-2"
        onSubmit={(event) => { event.preventDefault(); submit(input); }}
      >
        {attachedCount > 0 && (
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
            <ImagePlus size={11} /> {attachedCount} image{attachedCount > 1 ? "s" : ""} attached
            <button type="button" className="ml-auto hover:text-foreground" onClick={() => { setFiles(undefined); if (fileInputRef.current) fileInputRef.current.value = ""; }}>clear</button>
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-lg border border-border bg-secondary px-1.5 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => setFiles(event.target.files ?? undefined)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label="Attach image"
            onClick={() => { sfx("tick"); fileInputRef.current?.click(); }}
          >
            <ImagePlus />
          </Button>
          <textarea
            value={input}
            rows={1}
            placeholder="Describe a shape…"
            className="max-h-28 min-h-6 flex-1 resize-none bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
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
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(input); }
            }}
          />
          <Button type="submit" size="icon-sm" className="shrink-0" disabled={busy || !input.trim()} aria-label="Send">
            {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </form>
    </aside>
  );
}
