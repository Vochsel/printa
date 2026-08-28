import { currentAccount } from "@/lib/account";
import { parseModelDocument } from "@/lib/model-spec";
import { deleteProject, documentStoreConfigured, listProjects, newDocumentKey, storeDocument } from "@/lib/document-store";

/**
 * Saved projects.
 *
 * A project is the same stored document a captured place uses, with an owner
 * on it — so opening one is `?model=<key>`, exactly like everything else, and
 * a project that outgrows a URL (a city, say) needs no special handling.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return Response.json({ error: "This deployment has no project store configured." }, { status: 501 });
}

export async function GET() {
  const account = await currentAccount();
  if (!account) return Response.json({ projects: [] });
  if (!documentStoreConfigured()) return unavailable();
  return Response.json({ projects: await listProjects(account.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Sign in to save a project." }, { status: 401 });
  if (!documentStoreConfigured()) return unavailable();

  try {
    const body = await request.json() as { spec?: unknown; name?: string; key?: string };
    // Parsing before storing means a project in the store is always a
    // document the compiler can build, not whatever the browser posted.
    const document = parseModelDocument(body.spec);
    const name = (body.name ?? document.name).slice(0, 100).trim() || "Untitled model";
    const key = await storeDocument({ ...document, name }, {
      name,
      kind: "project",
      owner: account.id,
      key: body.key || newDocumentKey(),
    });
    return Response.json({ key, name, url: `/editor?model=${key}` });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "That project could not be saved." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Sign in first." }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({ error: "Which project?" }, { status: 400 });

  try {
    await deleteProject(key, account.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "That project could not be deleted." },
      { status: 400 },
    );
  }
}
