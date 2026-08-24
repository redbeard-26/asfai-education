import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilityCounts } from "@/lib/capabilities/catalog";
import { ASFAI_DEFAULT_TOOL_NAMES, registerAsfaiTools } from "@/lib/register-asfai-tools";
import { listSkills } from "@/lib/skills";
import { toJsonSchemaCompat } from "../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/zod-json-schema-compat.js";

interface RegisteredTool {
  title?: string;
  description?: string;
  inputSchema: unknown;
  handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function registeredServer() {
  const server = new McpServer({ name: "test", version: "1" });
  registerAsfaiTools(server, "https://education.asfai.org");
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
}

function resultJson(result: Awaited<ReturnType<RegisteredTool["handler"]>>) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("compact ASFAI MCP surface", () => {
  it("registers exactly the eight default gateway tools", () => {
    expect(Object.keys(registeredServer())).toEqual(ASFAI_DEFAULT_TOOL_NAMES);
  });

  it("stays within the default serialized context budget", () => {
    const definitions = Object.entries(registeredServer()).map(([name, tool]) => ({
      name,
      title: tool.title,
      description: tool.description,
      inputSchema: toJsonSchemaCompat(tool.inputSchema as never),
    }));
    expect(JSON.stringify(definitions).length).toBeLessThanOrEqual(6000);
  });

  it("publishes all inventoried capabilities through valid gateway entries", async () => {
    expect(capabilityCounts()).toEqual({ total: 172, platform: 33, educator: 88, student: 51 });
    expect(new Set(CAPABILITIES.map((item) => item.id)).size).toBe(172);
    expect(CAPABILITIES.every((item) => ASFAI_DEFAULT_TOOL_NAMES.includes(item.mcp.entryTool))).toBe(true);
    expect(CAPABILITIES.every((item) => item.mcp.inputRepresentations.length > 0 && item.mcp.outputRepresentations.length > 0 && item.mcp.fallback.length > 0)).toBe(true);
    expect(CAPABILITIES.every((item) => item.inputSchema.type === "object" && item.outputSchema.type === "object" && item.evaluators.length >= 5)).toBe(true);

    const result = await registeredServer().asfai_capability.handler({ action: "manifest" });
    expect(result.isError).not.toBe(true);
    expect(resultJson(result)).toMatchObject({ catalog: { counts: { total: 172 } }, contextBudget: { defaultToolCount: 8 } });
  });

  it("validates the selected capability payload after routing", async () => {
    const tool = registeredServer().asfai_run;
    const missing = await tool.handler({ capabilityId: "T18", input: {} });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain("requires a non-empty 'request'");
    const valid = await tool.handler({ capabilityId: "T18", input: { request: "Proofread this", content: "A sentence." } });
    expect(valid.isError).not.toBe(true);
    expect(resultJson(valid)).toMatchObject({ capability: { id: "T18" }, persistence: { owner: "educator-store" } });
  });

  it("keeps custom capabilities in a validate and prepare-publication flow", async () => {
    const capability = {
      schemaVersion: "0.1",
      id: "C:teacher:exit-ticket",
      version: 1,
      title: "Exit ticket",
      description: "Ask one natural student question.",
      audience: "student",
      mode: "interactive",
      risk: "medium",
      guidance: "Address the learner naturally, keep system machinery private, and preserve student control.",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      sourceRefs: ["teacher:local"],
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = await registeredServer().asfai_capability.handler({ action: "prepare_custom_publication", payload: { capability } });
    expect(resultJson(result)).toMatchObject({ valid: true, publishable: true, confirmationRequired: true, preview: { id: capability.id } });
  });

  it("keeps interactive state caller-owned and evidence provisional", async () => {
    const tools = registeredServer();
    const started = await tools.asfai_session.handler({ action: "start", payload: { capabilityId: "S04" } });
    expect(started.isError).not.toBe(true);
    const session = resultJson(started).session as Record<string, unknown>;
    const continued = await tools.asfai_session.handler({
      action: "continue",
      payload: {
        session,
        learnerSummary: "I compared the two examples.",
        assistantSummary: "Asked for a transfer example.",
        evidenceCandidate: { summary: "Compared two examples", assistance: "light" },
      },
    });
    const updated = resultJson(continued).session as { turn: number; evidenceCandidates: unknown[] };
    expect(updated.turn).toBe(1);
    expect(updated.evidenceCandidates).toHaveLength(1);
    expect(JSON.stringify(resultJson(continued))).toContain("verified");
  });

  it("verifies a host read-back semantically before reporting a save", async () => {
    const result = await registeredServer().asfai_storage.handler({
      action: "verify",
      payload: { expected: { learnerId: "one", nested: { a: 1, b: 2 } }, actual: { nested: { b: 2, a: 1 }, learnerId: "one" } },
    });
    expect(resultJson(result)).toMatchObject({ verified: true });
  });

  it("discovers workflow guidance for the complete compact surface", () => {
    expect(listSkills().map((skill) => skill.name)).toEqual(expect.arrayContaining([
      "asfai-capability-router",
      "asfai-district-governance",
      "asfai-educator-workspace",
      "asfai-learning-outcomes",
      "asfai-student-room",
      "education-concept-assessment",
      "education-lesson-authoring",
      "education-lesson-facilitation",
    ]));
  });
});
