import type { Metadata } from "next";
import { TextPlayground } from "../TextPlayground";

export const metadata: Metadata = {
  title: "3D text editor",
  description: "Create, preview, and download ready-to-print extruded text STL files.",
};

export default function EditorPage() {
  return <TextPlayground />;
}
