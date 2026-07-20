import { cookies } from "next/headers";
import { CHAT_ACCESS_COOKIE, chatPassword } from "@/lib/chat-access";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || password !== chatPassword()) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const store = await cookies();
  store.set(CHAT_ACCESS_COOKIE, chatPassword(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
  });
  return Response.json({ ok: true });
}
