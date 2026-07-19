import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

const documents: Record<string, string> = {
  "spec-reference": "spec-reference.md",
  examples: "examples.md",
};

export async function GET(_: Request, context: { params: Promise<{ document: string }> }) {
  const { document } = await context.params;
  const filename = documents[document];
  if (!filename) return new Response("Not found", { status: 404 });
  const markdown = await readFile(join(process.cwd(), "skills", "printa-modeling", "references", filename), "utf8");
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `inline; filename=${filename}`,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
