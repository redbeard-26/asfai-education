import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { asfaiMcpResource, asfaiOAuthIssuer } from "@/lib/remote-oauth";

export function GET() {
  return Response.json(generateProtectedResourceMetadata({
    authServerUrls: [asfaiOAuthIssuer()],
    resourceUrl: asfaiMcpResource(),
    additionalMetadata: {
      scopes_supported: ["asfai"],
      resource_documentation: `${asfaiMcpResource().replace(/\/api\/mcp$/, "")}/privacy`,
    },
  }), { headers: { "access-control-allow-origin": "*" } });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

