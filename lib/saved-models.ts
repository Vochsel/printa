"use client";

import type { ModelDocument } from "@/lib/model-spec";

export type SavedModel = { id: string; name: string; savedAt: number; document: ModelDocument };

const STORAGE_KEY = "printa.saved-models";

export function loadSavedModels(): SavedModel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedModel[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && item.document)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function persist(models: SavedModel[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
    return true;
  } catch {
    return false;
  }
}

export function saveModel(name: string, document: ModelDocument): SavedModel | null {
  const models = loadSavedModels();
  const trimmed = name.trim() || document.name || "Untitled model";
  const entry: SavedModel = {
    id: `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    savedAt: Date.now(),
    document: structuredClone(document),
  };
  // Saving under an existing name replaces it, so "Save" acts like overwrite.
  const next = [entry, ...models.filter((item) => item.name !== trimmed)];
  return persist(next.slice(0, 60)) ? entry : null;
}

export function deleteSavedModel(id: string) {
  persist(loadSavedModels().filter((item) => item.id !== id));
}
