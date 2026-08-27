"use client";

import { useEffect, useRef } from "react";

/**
 * WebMCP: the page as a set of tools.
 *
 * Chrome is shipping an API that lets a page hand the browser's own agent a
 * list of tools — `document.modelContext.registerTool(...)` — so an assistant
 * can drive the app the person is looking at instead of a copy of it running
 * somewhere else. Printa already speaks MCP over HTTP for ChatGPT; this is
 * the same capability offered to whoever is standing in front of the editor.
 *
 * The feature is behind a flag and an origin trial, so everything here is
 * conditional: where `document.modelContext` does not exist, registering is a
 * no-op and nothing about the page changes.
 *
 * https://developer.chrome.com/docs/ai/webmcp
 */

export type WebMcpContent = { type: "text"; text: string };

export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, never>) => Promise<{ content: WebMcpContent[] }>;
};

type ModelContext = {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<unknown>;
};

function modelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  const context = (document as unknown as { modelContext?: ModelContext }).modelContext;
  return context && typeof context.registerTool === "function" ? context : null;
}

export const webMcpAvailable = () => modelContext() !== null;

/** One text part, which is all any of these tools needs to answer with. */
export const say = (text: string) => ({ content: [{ type: "text" as const, text }] });

/**
 * Register tools for as long as the component is mounted.
 *
 * The tools are read from a ref on every call rather than captured, so a tool
 * registered once still sees the current document — re-registering on every
 * edit would churn the browser's tool list on every keystroke.
 */
export function useWebMcpTools(build: () => WebMcpTool[]) {
  const buildRef = useRef(build);
  // Written in an effect rather than during render: the registration effect
  // below runs after this one on every commit, so a tool called by an agent
  // always sees the build from the latest render.
  useEffect(() => { buildRef.current = build; });

  useEffect(() => {
    const context = modelContext();
    if (!context) return;

    const controller = new AbortController();
    const tools = buildRef.current().map((tool) => ({
      ...tool,
      // Late binding: the closure the page registered may be stale by the
      // time an agent calls it, so look the tool up again on each call.
      execute: async (input: Record<string, never>) => {
        const current = buildRef.current().find((candidate) => candidate.name === tool.name);
        return (current ?? tool).execute(input);
      },
    }));

    for (const tool of tools) {
      // A browser that knows the API may still refuse a tool (a permissions
      // policy, an origin trial that lapsed); none of that should surface.
      void context.registerTool(tool, { signal: controller.signal }).catch(() => undefined);
    }
    return () => controller.abort();
  }, []);
}
