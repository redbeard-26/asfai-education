import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSkillFiles } from "@/lib/skill-bundle";
import { listSkills } from "@/lib/skills";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerSkillTools(server: McpServer, siteOrigin: string) {
  server.registerTool(
    "get_skills",
    {
      title: "Get ASFAI skills",
      description:
        "Returns reusable instructions for running ASFAI workflows with this server's tools. Omit name to list all instruction bodies or pass a skill name for one.",
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => {
      const all = listSkills();
      const selected = name ? all.filter((skill) => skill.name === name) : all;
      if (name && selected.length === 0) {
        return err(`No skill '${name}'. Available: ${all.map((skill) => skill.name).join(", ") || "(none)"}.`);
      }
      return json({
        count: selected.length,
        skills: selected.map((skill) => ({
          name: skill.name,
          description: skill.description,
          version: skill.version,
          body: skill.body,
        })),
      });
    },
  );

  server.registerTool(
    "install_asfai_skills",
    {
      title: "Install an ASFAI skill",
      description:
        "Installs a versioned ASFAI workflow skill into an AI chat host. Omit skill for the catalog. With a skill, URL delivery returns a .skill zip and inline delivery returns every file for hosts that install files themselves.",
      inputSchema: {
        skill: z.string().optional(),
        delivery: z.enum(["url", "inline"]).optional(),
      },
    },
    async ({ skill, delivery }) => {
      const all = listSkills();
      if (!skill) {
        return json({
          skills: all.map((item) => ({
            name: item.name,
            description: item.description,
            version: item.version,
          })),
          nextStep: "Call install_asfai_skills again with a skill name.",
        });
      }
      const selected = all.find((item) => item.name === skill);
      if (!selected) {
        return err(`No skill '${skill}'. Available: ${all.map((item) => item.name).join(", ") || "(none)"}.`);
      }
      if (delivery === "inline") {
        const files = readSkillFiles(skill);
        if (!files) return err(`Could not read files for skill '${skill}'.`);
        return json({
          skill,
          version: selected.version,
          delivery: "inline",
          files,
          nextStep:
            "Install each file at its given relative path in the AI host's supported skills directory, then follow SKILL.md.",
        });
      }
      const downloadUrl = `${siteOrigin.replace(/\/$/, "")}/api/skills/${skill}.skill`;
      return json({
        skill,
        version: selected.version,
        delivery: "url",
        downloadUrl,
        nextStep:
          "Download the .skill zip and install its contained folder with the AI host's skill installer. If the host cannot download bundles, request inline delivery.",
      });
    },
  );
}
