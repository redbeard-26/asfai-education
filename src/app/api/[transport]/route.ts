import { createMcpHandler } from "mcp-handler";
import { registerAsfaiTools } from "@/lib/register-asfai-tools";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    const siteOrigin = process.env.ASFAI_SITE_ORIGIN ?? "https://education.asfai.org";
    registerAsfaiTools(server, siteOrigin);
  },
  { serverInfo: { name: "asfai-education", version: "1.1.0" } },
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

export { handler as GET, handler as POST, handler as DELETE };
