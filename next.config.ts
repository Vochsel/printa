import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/skills": ["./skills/printa-modeling/SKILL.md"],
    "/skills/[document]": ["./skills/printa-modeling/references/*.md"],
  },
};

export default nextConfig;
