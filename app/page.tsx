import type { Metadata } from "next";
import { HomePage } from "./HomePage";

export const metadata: Metadata = {
  title: "Printa — Ideas into printable objects",
  description: "Create, inspect, and download print-ready 3D models from your browser or ChatGPT.",
};

export default function Home() {
  return <HomePage />;
}
