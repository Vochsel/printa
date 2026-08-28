import { currentAccount, authConfigured } from "@/lib/account";

/**
 * Who the browser is signed in as.
 *
 * The editor is a client component and needs this to decide between "Sign in"
 * and a name; `authAvailable` lets it hide the control entirely on a
 * deployment with no WorkOS keys rather than offer a button that cannot work.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  return Response.json({ authAvailable: authConfigured(), account }, {
    headers: { "Cache-Control": "no-store" },
  });
}
