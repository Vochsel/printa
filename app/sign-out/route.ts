import { signOut } from "@workos-inc/authkit-nextjs";

/** Clear the session and land back on the page they were on. */
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next") ?? "/";
  await signOut({ returnTo: next });
}
