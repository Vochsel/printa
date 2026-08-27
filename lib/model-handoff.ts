"use client";

import type { ModelDocumentInput } from "@/lib/model-spec";

/**
 * Handing a document to the editor when a URL will not carry it.
 *
 * A captured place holds its ground inline and runs to a couple of hundred
 * kilobytes; a query string that size is refused with a 431 before the
 * compiler sees it. The document is left in this tab's own storage instead
 * and the editor picks it up on the next page — same origin, no server, and
 * nothing left behind afterwards.
 */

const KEY = "printa:handoff";

export const HANDOFF_EDITOR_URL = "/editor?handoff=1";

export function stashDocument(document: ModelDocumentInput | unknown): string {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(document));
  } catch {
    // A full or blocked store is not worth failing the click over: the editor
    // opens on its default model instead of on this one.
  }
  return HANDOFF_EDITOR_URL;
}

/** Read the stashed document, clearing it so a refresh does not reload it. */
export function takeHandoff(): unknown | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
