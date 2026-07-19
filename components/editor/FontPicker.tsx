"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sfxTap } from "@/lib/sfx";

export type FontSummary = { id: string; family: string; category: string };

const fontPreviewCache = new Map<string, Promise<void>>();

function loadFontPreview(font: FontSummary) {
  if (typeof FontFace === "undefined") return Promise.resolve();
  if (!fontPreviewCache.has(font.id)) {
    const family = `Printa Spec ${font.id}`;
    const url = `/api/font?id=${encodeURIComponent(font.id)}&text=${encodeURIComponent(`${font.family} Aa`)}&weight=regular&italic=false`;
    fontPreviewCache.set(
      font.id,
      new FontFace(family, `url("${url}")`).load().then((face) => {
        document.fonts.add(face);
      }).catch(() => undefined),
    );
  }
  return fontPreviewCache.get(font.id)!;
}

export function FontPicker({ value, fonts, onChange }: { value: string; fonts: FontSummary[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const selected = fonts.find((font) => font.family.toLocaleLowerCase() === value.toLocaleLowerCase());
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const list = needle
      ? fonts.filter((font) => font.family.toLocaleLowerCase().includes(needle) || font.category.toLocaleLowerCase().includes(needle))
      : fonts;
    if (needle || !selected) return list;
    return [selected, ...list.filter((font) => font.id !== selected.id)];
  }, [fonts, query, selected]);
  const visible = matches.slice(0, visibleCount);
  useEffect(() => {
    if (selected) void loadFontPreview(selected);
  }, [selected]);
  useEffect(() => {
    if (open) visible.forEach((font) => void loadFontPreview(font));
  }, [open, visible]);

  return (
    <div className="grid gap-1.5">
      <Label>
        Font
        <span className="ml-auto font-mono text-[10px] font-medium normal-case text-muted-foreground">
          {fonts.length ? `${fonts.length.toLocaleString()} Google families` : "Loading…"}
        </span>
      </Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setVisibleCount(50);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-field px-3 text-left shadow-xs transition-[color,box-shadow] outline-none hover:border-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40">
          <span
            className="min-w-0 truncate text-base font-medium"
            style={{ fontFamily: selected ? `"Printa Spec ${selected.id}", sans-serif` : undefined }}
          >
            {selected?.family ?? value}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{selected?.category ?? "Google Font"}</span>
            <ChevronDown className="size-4 opacity-50" />
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
          <label className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-muted-foreground">
            <Search className="size-4 shrink-0" />
            <input
              autoFocus
              value={query}
              placeholder="Search all Google Fonts…"
              className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(50);
              }}
            />
            <span className="shrink-0 font-mono text-[10px] font-medium text-muted-foreground">{matches.length.toLocaleString()}</span>
          </label>
          <div
            className="max-h-72 overflow-y-auto p-1"
            onScroll={(event) => {
              const list = event.currentTarget;
              if (list.scrollTop + list.clientHeight >= list.scrollHeight - 80) {
                setVisibleCount((count) => Math.min(matches.length, count + 50));
              }
            }}
          >
            {visible.map((font) => (
              <button
                key={font.id}
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-secondary"
                onClick={() => {
                  sfxTap();
                  onChange(font.family);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="min-w-0 truncate text-base font-medium" style={{ fontFamily: `"Printa Spec ${font.id}", sans-serif` }}>
                  {font.family}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{font.category}</span>
                  {font.family === value && <Check className="size-4 text-accent" />}
                </span>
              </button>
            ))}
            {!visible.length && <div className="px-3 py-8 text-center text-xs text-muted-foreground">No fonts match this search.</div>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
