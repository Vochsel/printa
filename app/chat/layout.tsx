import { cookies } from "next/headers";
import { CHAT_ACCESS_COOKIE, hasChatAccess } from "@/lib/chat-access";
import { ChatGate } from "@/components/chat/ChatGate";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!hasChatAccess(store.get(CHAT_ACCESS_COOKIE)?.value)) return <ChatGate />;
  return <>{children}</>;
}
