import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const markdown = await readFile(join(process.cwd(), "skills", "printa-modeling", "SKILL.md"), "utf8");
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "inline; filename=SKILL.md",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Link": "</api/model/schema>; rel=describedby; type=application/schema+json",
    },
  });
}
