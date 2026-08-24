import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerLessonTools } from "@/lib/register-lesson-tools";
import { registerEducationTools } from "@/lib/register-education-tools";
import { registerSkillTools } from "@/lib/register-skill-tools";
import { listSkills } from "@/lib/skills";

describe("lesson MCP surface", () => {
  it("registers the authoring, learner, artifact, report, and exchange tools", () => {
    const server = new McpServer({ name: "test", version: "1" });
    registerEducationTools(server);
    registerLessonTools(server, "https://education.asfai.org");
    registerSkillTools(server, "https://education.asfai.org");
    const tools = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);
    expect(tools).toEqual(expect.arrayContaining([
      "prepare_lesson_authoring",
      "get_learner_storage_instructions",
      "validate_lesson",
      "review_lesson_plan",
      "search_lessons",
      "get_lesson",
      "start_lesson_run",
      "get_next_lesson_step",
      "create_artifact_launch",
      "claim_artifact_result",
      "record_lesson_evidence",
      "generate_lesson_report",
      "export_progress_update",
      "import_progress_update",
      "install_asfai_skills",
    ]));
  });

  it("discovers both lesson skills through the existing installer catalog", () => {
    expect(listSkills().map((skill) => skill.name)).toEqual(expect.arrayContaining([
      "education-concept-assessment",
      "education-lesson-authoring",
      "education-lesson-facilitation",
    ]));
  });
});
