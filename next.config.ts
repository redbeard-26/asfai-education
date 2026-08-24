import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: "/education",
  turbopack: { root: process.cwd() },
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingIncludes: {
    "/api/**": ["src/content/skills/**/*"],
  },
  async headers() {
    return [
      {
        source: "/artifacts/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://education.asfai.org https://constitution.asfai.org",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
