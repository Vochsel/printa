"use client";

import { useEffect, useState } from "react";
import { Box, Clock, Droplets, FolderOpen, Save, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEMO_MODEL_CARDS, type DemoModelId } from "@/lib/demo-models";
import type { ModelDocument } from "@/lib/model-spec";
import { deleteSavedModel, loadSavedModels, saveModel, type SavedModel } from "@/lib/saved-models";
import { sfxClose, sfxError, sfxOpen, sfxSuccess, sfxTap } from "@/lib/sfx";
import { cn } from "@/lib/utils";

function familyIcon(family: string) {
  if (family === "text") return <Type className="size-4" />;
  if (family === "simulation") return <Droplets className="size-4" />;
  return <Box className="size-4" />;
}

function timeAgo(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function LoadSaveDialog({
  open,
  onOpenChange,
  document,
  activeDemo,
  onLoadDemo,
  onLoadDocument,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ModelDocument | null;
  activeDemo: DemoModelId | null;
  onLoadDemo: (id: DemoModelId) => void;
  onLoadDocument: (document: ModelDocument) => void;
}) {
  const [saved, setSaved] = useState<SavedModel[]>([]);
  const [saveName, setSaveName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    // Refresh the saved list and reset the save name each time the dialog opens.
    setSaved(loadSavedModels());
    setSaveName(document?.name ?? "");
    setSavedFlash(false);
  }, [open, document]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = () => {
    if (!document) return;
    const entry = saveModel(saveName, document);
    if (entry) {
      sfxSuccess();
      setSaved(loadSavedModels());
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } else {
      sfxError();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) sfxOpen();
        else sfxClose();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="size-4.5" /> Open a model
          </DialogTitle>
          <DialogDescription>Start from a ready-made model, or come back to one you saved.</DialogDescription>
        </DialogHeader>

        {document && (
          <div className="flex items-center gap-2 border-b border-border bg-card/60 px-6 py-3.5">
            <Input
              value={saveName}
              placeholder="Name this model…"
              className="h-9 flex-1"
              onChange={(event) => setSaveName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") handleSave(); }}
            />
            <Button onClick={handleSave} className="shrink-0">
              <Save className="size-4" /> {savedFlash ? "Saved!" : "Save current"}
            </Button>
          </div>
        )}

        {saved.length > 0 && (
          <div className="border-b border-border px-6 py-4">
            <p className="mb-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Your saved models</p>
            <div className="grid gap-1">
              {saved.map((item) => (
                <div key={item.id} className="group flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-secondary/60">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 text-left"
                    onClick={() => {
                      sfxTap();
                      onLoadDocument(structuredClone(item.document));
                      onOpenChange(false);
                    }}
                  >
                    <Clock className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(item.savedAt)}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete ${item.name}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => {
                      sfxTap();
                      deleteSavedModel(item.id);
                      setSaved(loadSavedModels());
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-6 py-4">
          <p className="mb-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Starter models</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_MODEL_CARDS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  demo.id === activeDemo
                    ? "border-accent/50 bg-accent/5"
                    : "border-border bg-background hover:border-ring/70 hover:bg-secondary/40",
                )}
                onClick={() => {
                  sfxTap();
                  onLoadDemo(demo.id);
                  onOpenChange(false);
                }}
              >
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", demo.id === activeDemo ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground/70")}>
                  {familyIcon(demo.family)}
                </span>
                <span className="grid gap-0.5">
                  <span className="text-sm leading-tight font-semibold">{demo.name}</span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{demo.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
