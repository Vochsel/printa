"use client";

import type { ModelDocument } from "@/lib/model-spec";

/**
 * Projects, from the browser's side.
 *
 * Saved models used to live only in this browser's localStorage, which is
 * fine until you open the editor on a different machine. A signed-in person
 * gets the same list from the server instead; a signed-out one keeps the
 * local one, and neither has to know about the other.
 */

export type Account = { id: string; email: string; name: string | null };
export type CloudProject = { key: string; name: string; bytes: number; updatedAt: number };

export async function fetchAccount(): Promise<{ authAvailable: boolean; account: Account | null }> {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) return { authAvailable: false, account: null };
    return (await response.json()) as { authAvailable: boolean; account: Account | null };
  } catch {
    return { authAvailable: false, account: null };
  }
}

export async function listCloudProjects(): Promise<CloudProject[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  if (!response.ok) return [];
  const body = (await response.json()) as { projects?: CloudProject[] };
  return body.projects ?? [];
}

export async function saveCloudProject(name: string, document: ModelDocument, key?: string) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, spec: document, key }),
  });
  const body = (await response.json()) as { key?: string; name?: string; error?: string };
  if (!response.ok || !body.key) throw new Error(body.error ?? "That project could not be saved.");
  return { key: body.key, name: body.name ?? name };
}

export async function deleteCloudProject(key: string) {
  const response = await fetch(`/api/projects?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "That project could not be deleted.");
  }
}
