import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/education",
  outputFileTracingIncludes: {
    "/api/**": ["src/content/skills/**/*"],
  },
};

export default nextConfig;
