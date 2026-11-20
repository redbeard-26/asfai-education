import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAsfaiTools } from "@/lib/register-asfai-tools";
import { asfaiEducationBaseUrl, verifyMcpAccessToken } from "@/lib/remote-oauth";
import { corsPreflight, withCors } from "@/lib/cors";

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

const corsHandler = (request: Request) => withCors(request, handler(request));

export { corsHandler as GET, corsHandler as POST, corsHandler as DELETE };

export function OPTIONS(request: Request) {
  return corsPreflight(request, "DELETE, GET, HEAD, OPTIONS, POST");
}
