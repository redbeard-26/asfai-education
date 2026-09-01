import { describe, expect, it } from "vitest";
import { getCapability } from "@/lib/capabilities/catalog";
import { prepareCapabilityRun } from "@/lib/capabilities/execution";
import { validatePriorityCapability } from "@/lib/capabilities/priority-capabilities";

describe("priority teaching capability slices", () => {
  it("publishes specialized, versioned MCP contracts for all five slices", () => {
    for (const id of ["P18", "T01", "T18", "T24", "T41", "T48", "S03", "S06", "S25"]) {
      const capability = getCapability(id);
      expect(capability?.version).toBe("1.1.0");
      expect(capability?.evaluators.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("validates a proofreader edit list against exact offsets and revised text", () => {
    const candidate = {
      originalText: "This are clear.",
      revisedText: "This is clear.",
      edits: [{ start: 5, end: 8, original: "are", replacement: "is", reason: "Subject-verb agreement", category: "grammar" }],
      unresolved: [],
      voicePreservationNotes: ["No stylistic rewrite."],
    };
    expect(validatePriorityCapability("T18", candidate)).toMatchObject({ valid: true });
    expect(validatePriorityCapability("T18", { ...candidate, revisedText: "Different" })).toMatchObject({ valid: false });
  });

  it("checks rubric coverage, descriptors, and a 100-point weight total", () => {
    const candidate = {
      title: "Explanation rubric",
      objectiveIds: ["obj-1"],
      levels: [{ id: "developing", label: "Developing", score: 1 }, { id: "proficient", label: "Proficient", score: 2 }],
      criteria: [{ id: "reasoning", criterion: "Explains the reasoning", objectiveIds: ["obj-1"], weight: 100, descriptors: { developing: "Names one relevant step", proficient: "Explains each step with accurate relationships" } }],
      scoringNotes: [],
      accessibilityNotes: [],
    };
    expect(validatePriorityCapability("T24", candidate)).toMatchObject({ valid: true, weightTotal: 100 });
  });

  it("returns a required validation continuation from asfai_run", () => {
    const prepared = prepareCapabilityRun({ capabilityId: "T41", input: { request: "Create practice", objectiveIds: ["obj-1"] }, phase: "prepare" });
    if (!prepared.execution) throw new Error("Expected a prepared capability run.");
    expect(prepared.execution.specializedWorkflow).toHaveLength(5);
    expect(prepared.execution.validation).toMatchObject({ requiredBeforeSave: true });
  });
});
