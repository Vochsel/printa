import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

/**
 * Hand off to AuthKit's hosted sign-in, which returns to /callback.
 *
 * Where to land afterwards travels in AuthKit's own state (`returnTo`) rather
 * than on the redirect URI: WorkOS matches redirect URIs exactly, so a query
 * string on one is simply a URI nobody registered.
 */
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next") ?? "/editor";
  const safe = next.startsWith("/") ? next : "/editor";
  redirect(await getSignInUrl({ returnTo: safe }));
}
