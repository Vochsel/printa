import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { ModelDocumentInput } from "@/lib/model-spec";

/**
 * Model documents addressed by a key.
 *
 * Everything on the site travels as a spec in a URL until it cannot: a
 * captured place is a couple of hundred kilobytes, and a query string that
 * size comes back 431 before the compiler sees it. Those are stored here and
 * addressed by `?model=<key>` instead — a preview, an STL, an editor session
 * and a link someone sends a friend all resolve the same way.
 *
 * The store is optional. Without a Convex URL configured, everything else on
 * the site works exactly as before and only the oversized paths report that
 * they have nowhere to put a document.
 */

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function newDocumentKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join("");
}

export function documentStoreConfigured(): boolean {
  return Boolean(process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL);
}

function client(): ConvexHttpClient {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("This deployment has nowhere to store large models: set CONVEX_URL.");
  return new ConvexHttpClient(url);
}

export async function storeDocument(
  document: ModelDocumentInput | unknown,
  options: { name: string; kind?: "capture" | "project"; owner?: string; key?: string } = { name: "Model" },
): Promise<string> {
  const key = options.key ?? newDocumentKey();
  await client().mutation(api.documents.store, {
    key,
    name: options.name.slice(0, 100),
    document: JSON.stringify(document),
    kind: options.kind ?? "capture",
    ...(options.owner ? { owner: options.owner } : {}),
  });
  return key;
}

export async function loadDocument(key: string | null | undefined): Promise<ModelDocumentInput | null> {
  if (!key || !documentStoreConfigured()) return null;
  const row = await client().query(api.documents.get, { key });
  if (!row) return null;
  return JSON.parse(row.document) as ModelDocumentInput;
}

export async function listProjects(owner: string) {
  if (!documentStoreConfigured()) return [];
  return client().query(api.documents.listForOwner, { owner });
}

export async function deleteProject(key: string, owner: string) {
  return client().mutation(api.documents.remove, { key, owner });
}
