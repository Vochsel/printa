import type { Metadata } from "next";
import { ChatExperience } from "@/components/chat/ChatExperience";

export const metadata: Metadata = {
  title: "Chat — build printable models by describing them",
  description: "Describe an object (or drop in a reference image) and Printa builds a print-ready 3D model you can preview and download as an STL.",
};

export default function ChatPage() {
  return <ChatExperience />;
}
