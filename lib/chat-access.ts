import "server-only";

// Early-access gate for /chat. The password lives in the CHAT_SIGNUP_PASSWORD
// env var; the fallback lets a fresh deploy work before the var is set in Vercel.
export const CHAT_ACCESS_COOKIE = "printa_chat_access";

export function chatPassword(): string {
  return process.env.CHAT_SIGNUP_PASSWORD || "printa-early-2026";
}

export function hasChatAccess(cookieValue: string | undefined): boolean {
  return !!cookieValue && cookieValue === chatPassword();
}
