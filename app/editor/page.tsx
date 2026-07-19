import type { Metadata } from "next";
import { TextPlayground } from "../TextPlayground";
import { ProceduralStudio } from "../ProceduralStudio";

export const metadata: Metadata = {
  title: "3D model editor",
  description: "Create extruded text or compose procedural, simulated, print-ready forms and download STL files.",
};

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return mode === "procedural" ? <ProceduralStudio /> : <TextPlayground />;
}
