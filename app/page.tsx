import type { Metadata } from "next";
import { HomePage } from "./HomePage";
import { templateShots } from "@/lib/template-shots";

export const metadata: Metadata = {
  title: "Printa — Ideas into printable objects",
  description: "Create, inspect, and download print-ready 3D models from your browser or ChatGPT.",
};

export default async function Home() {
  // Read once on the server: the landing page shows eight of the hundred
  // captured template shots, and the client has no business talking to the
  // store to find them.
  return <HomePage shots={await templateShots()} />;
}
