import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["manifold-3d"],
  images: {
    // Template screenshots live in Convex storage, so they are resized and
    // served as webp from there rather than shipping a 1704px PNG per card.
    remotePatterns: [{ protocol: "https", hostname: "*.convex.cloud", pathname: "/api/storage/**" }],
  },
  outputFileTracingIncludes: {
    "/api/model/*": ["./node_modules/manifold-3d/manifold.wasm"],
    "/mcp": ["./node_modules/manifold-3d/manifold.wasm"],
    "/skills": ["./skills/printa-modeling/SKILL.md"],
    "/skills/[document]": ["./skills/printa-modeling/references/*.md"],
  },
};

export default nextConfig;
