import { NextResponse, type NextRequest } from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

/**
 * Signing in is optional, everywhere.
 *
 * The editor, the templates, the places and the STL endpoints are all public
 * and stay that way: an account only adds somewhere to keep your projects.
 * So AuthKit runs in the "read the session if there is one" mode rather than
 * guarding paths.
 *
 * When WorkOS is not configured the proxy steps aside entirely, so a fresh
 * clone still runs. AuthKit throws at construction time when its keys are
 * missing, which is why this is checked before the middleware is built.
 */
const configured = Boolean(process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID);

const withAuthkit = configured ? authkitMiddleware() : null;

export default function proxy(request: NextRequest, event: unknown) {
  if (!withAuthkit) return NextResponse.next();
  return (withAuthkit as (r: NextRequest, e: unknown) => unknown)(request, event) as ReturnType<typeof NextResponse.next>;
}

export const config = {
  // Everything except static assets and the machine-facing endpoints: an MCP
  // client or a slicer fetching an STL has no session and needs no cookie.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/model|api/stl|api/place|make|mcp|skills|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
