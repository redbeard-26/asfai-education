import { createMcpHandler } from "mcp-handler";
import { registerEducationTools } from "@/lib/register-education-tools";
import { registerSkillTools } from "@/lib/register-skill-tools";
import { registerLessonTools } from "@/lib/register-lesson-tools";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerEducationTools(server);
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://education.asfai.org";
    registerLessonTools(server, siteOrigin);
    registerSkillTools(server, siteOrigin);
  },
  { serverInfo: { name: "asfai-education", version: "0.3.0" } },
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

export { handler as GET, handler as POST, handler as DELETE };
