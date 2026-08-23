import { createMcpHandler } from "mcp-handler";
import { registerEducationTools } from "@/lib/register-education-tools";
import { registerSkillTools } from "@/lib/register-skill-tools";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerEducationTools(server);
    registerSkillTools(
      server,
      process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://asfai-education.vercel.app/education",
    );
  },
  { serverInfo: { name: "asfai-education", version: "0.2.0" } },
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

export { handler as GET, handler as POST, handler as DELETE };
