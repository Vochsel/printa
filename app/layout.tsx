import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://printa-orcin.vercel.app"),
  title: { default: "Printa — Ideas into printable objects", template: "%s · Printa" },
  description: "Create, inspect, and download print-ready 3D models from your browser or ChatGPT.",
  applicationName: "Printa",
  keywords: ["3D printing", "STL", "MCP", "extruded text", "Three.js"],
  openGraph: {
    title: "Printa — Ideas into printable objects",
    description: "Shape a model in conversation or by hand, then download a print-ready STL.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Printa — Ideas in. Objects out." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Printa — Ideas into printable objects",
    description: "Shape a model in conversation or by hand, then download a print-ready STL.",
    images: ["/og.png"],
  },
  icons: { icon: "/printa-icon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
