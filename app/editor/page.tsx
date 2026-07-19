import type { Metadata } from "next";
import { ProceduralStudio } from "../ProceduralStudio";

export const metadata: Metadata = {
  title: "3D model editor",
  description: "Create extruded text or compose procedural, simulated, print-ready forms and download STL files.",
};

export default function EditorPage() {
  return <ProceduralStudio />;
}
