import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAsfaiTools } from "@/lib/register-asfai-tools";
import { asfaiEducationBaseUrl, verifyMcpAccessToken } from "@/lib/remote-oauth";

export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    const siteOrigin = process.env.ASFAI_SITE_ORIGIN ?? "https://education.asfai.org";
    registerAsfaiTools(server, siteOrigin);
  },
  { serverInfo: { name: "asfai-learning", version: "2.0.0" } },
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

const handler = withMcpAuth(mcpHandler, verifyMcpAccessToken, {
  required: true,
  requiredScopes: ["asfai"],
  resourceMetadataPath: "/education/.well-known/oauth-protected-resource",
  resourceUrl: asfaiEducationBaseUrl().replace(/\/education$/, ""),
});

export { handler as GET, handler as POST, handler as DELETE };
