"use client";

import type { ModelDocument } from "@/lib/model-spec";

const STORAGE_KEY = "printa:saved-models";

export type SavedModel = {
  id: string;
  name: string;
  savedAt: string;
  document: ModelDocument;
};

function read(): SavedModel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedModel[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(models: SavedModel[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function listSavedModels(): SavedModel[] {
  return read().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveModel(name: string, document: ModelDocument): SavedModel {
  const models = read();
  const trimmed = name.trim() || document.name || "Untitled model";
  const existing = models.find((model) => model.name === trimmed);
  const entry: SavedModel = {
    id: existing?.id ?? `saved-${Date.now().toString(36)}`,
    name: trimmed,
    savedAt: new Date().toISOString(),
    document: structuredClone(document),
  };
  write([entry, ...models.filter((model) => model.id !== entry.id)]);
  return entry;
}

export function deleteSavedModel(id: string) {
  write(read().filter((model) => model.id !== id));
}
