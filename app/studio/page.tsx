import type { Metadata } from "next";
import { ProceduralStudio } from "@/app/ProceduralStudio";

export const metadata: Metadata = {
  title: "Procedural studio",
  description: "Compose, simulate, inspect, and export printable forms from the Printa model spec.",
};

export default function StudioPage() {
  return <ProceduralStudio />;
}
