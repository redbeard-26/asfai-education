import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/education",
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingIncludes: {
    "/api/**": ["src/content/skills/**/*"],
  },
};

export default nextConfig;
