import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["manifold-3d"],
  outputFileTracingIncludes: {
    "/api/model/*": ["./node_modules/manifold-3d/manifold.wasm"],
    "/mcp": ["./node_modules/manifold-3d/manifold.wasm"],
    "/skills": ["./skills/printa-modeling/SKILL.md"],
    "/skills/[document]": ["./skills/printa-modeling/references/*.md"],
  },
  async headers() {
    return [
      {
        // The MCP widget runs on a host-controlled sandbox origin, so importing
        // the renderer bundle is a cross-origin module fetch — which the browser
        // refuses without CORS, exactly like a cross-origin `fetch`. (This is
        // why the CDN path worked: jsdelivr sends `Access-Control-Allow-Origin`.)
        source: "/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
