import "server-only";
import { withAuth } from "@workos-inc/authkit-nextjs";

/**
 * Who is asking, if anyone.
 *
 * Every account-shaped feature on the site is additive — projects are saved
 * against a person, everything else works signed out — so this answers "no
 * one" rather than throwing when WorkOS is not configured or the visitor has
 * never signed in.
 */

export type Account = { id: string; email: string; name: string | null };

export function authConfigured(): boolean {
  return Boolean(process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID);
}

export async function currentAccount(): Promise<Account | null> {
  if (!authConfigured()) return null;
  try {
    const { user } = await withAuth();
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return { id: user.id, email: user.email, name: name || null };
  } catch {
    // No session cookie, or a session this deployment's key cannot read.
    return null;
  }
}
