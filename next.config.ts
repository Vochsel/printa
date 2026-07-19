import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["manifold-3d"],
  outputFileTracingIncludes: {
    "/api/model/*": ["./node_modules/manifold-3d/manifold.wasm"],
    "/mcp": ["./node_modules/manifold-3d/manifold.wasm"],
    "/skills": ["./skills/printa-modeling/SKILL.md"],
    "/skills/[document]": ["./skills/printa-modeling/references/*.md"],
  },
};

export default nextConfig;
