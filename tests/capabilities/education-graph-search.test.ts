import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchObjectives, type Topic } from "@/lib/education-graph";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAsfaiTools } from "@/lib/register-asfai-tools";

const topic = (id: string, name: string, description: string, standards: string[] = [], domain = "Animals"): Topic => ({
  id, type: "CONCEPTUAL", subject: "Science", domain, name, description,
  ageRangeStart: 5, ageRangeEnd: 7, centrality: 0.5, evidence: [], assessmentPrompt: "Observe.", standards,
});

describe("learning graph search", () => {
  beforeEach(() => {
    (globalThis as { asfaiEducationGraph?: unknown }).asfaiEducationGraph = undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("topics.json")
      ? { topics: [
        topic("snail", "The World of Minibeasts", "Observe a snail and its shell."),
        topic("body", "Animal Body Groups", "Compare animal body parts.", ["ngss-k5:1-LS1-1"]),
        topic("needs", "What Living Things Need", "Investigate animal needs.", ["ngss-k5:K-LS1-1"]),
        topic("unrelated", "Moon phases", "Observe the night sky.", [], "Astronomy"),
      ] }
      : { dependencies: [] }), { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as { asfaiEducationGraph?: unknown }).asfaiEducationGraph = undefined;
  });

  it("uses rare-term OR fallback for a natural multi-word query", async () => {
    const results = await searchObjectives("snail body parts animal needs");
    expect(results.map((item) => item.id)).toEqual(expect.arrayContaining(["snail", "body", "needs"]));
    expect(results.map((item) => item.id)).not.toContain("unrelated");
  });

  it("keeps direct matches ahead of fallback and returns nothing for blank queries", async () => {
    expect((await searchObjectives("snail"))[0].id).toBe("snail");
    expect(await searchObjectives("   ")).toEqual([]);
  });

  it("verifies a standard only against a specific graph objective", async () => {
    const server = new McpServer({ name: "test", version: "1" });
    registerAsfaiTools(server, "https://constitution.asfai.org");
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }> }> })._registeredTools;
    const verify = async (objectiveId: string) => JSON.parse((await tools.asfai_graph.handler({
      action: "verify_standard_alignment", payload: { objectiveId, standardCode: "K-LS1-1" },
    })).content[0].text) as { verified: boolean; matchingStandards: string[] };
    expect(await verify("needs")).toMatchObject({ verified: true, matchingStandards: ["ngss-k5:K-LS1-1"] });
    expect(await verify("snail")).toMatchObject({ verified: false, matchingStandards: [] });
  });
});
