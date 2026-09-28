import { describe, expect, it } from "vitest";
import { getCapability } from "@/lib/capabilities/catalog";
import { prepareCapabilityRun } from "@/lib/capabilities/execution";
import { validateEssayGrade, validateEssayRevision } from "@/lib/capabilities/essay-grading";
import { validatePriorityCapability } from "@/lib/capabilities/priority-capabilities";

const essayText = "Bees are important. They carry pollen between flowers so plants can make seeds. Farmers rent hives in the spring. The bees are pollinators of mutualistic symbiosis.";

const at = (text: string, quote: string) => {
  const start = text.indexOf(quote);
  return { start, end: start + quote.length, quote };
};

const rubric = {
  title: "Informational writing",
  levels: [{ id: "beginning", label: "Beginning", score: 1 }, { id: "developing", label: "Developing", score: 2 }, { id: "excellent", label: "Excellent", score: 3 }],
  criteria: [
    { id: "organization", criterion: "Organization", standardIds: ["W.7.2.A"], descriptors: { beginning: "No structure", developing: "Some structure", excellent: "Clear structure" } },
    { id: "evidence", criterion: "Evidence & Support", standardIds: ["W.7.2.B"], descriptors: { beginning: "Little evidence", developing: "Some evidence", excellent: "Strong evidence" } },
  ],
  bands: [{ label: "Beginning", min: 2, max: 2 }, { label: "Developing", min: 3, max: 4 }, { label: "Proficient", min: 5, max: 6 }],
};

function grade() {
  return {
    essayText,
    rubric,
    criterionScores: [
      { criterionId: "organization", levelId: "excellent", score: 3, rationale: "Opens with the topic and keeps one idea per sentence.", passages: [at(essayText, "Bees are important.")] },
      { criterionId: "evidence", levelId: "developing", score: 2, rationale: "One concrete fact; no source named.", passages: [at(essayText, "Farmers rent hives in the spring.")] },
    ],
    totalScore: 5,
    maxScore: 6,
    band: "Proficient",
    glows: [{ id: "glow-1", criterionId: "evidence", comment: "You explain how pollen moves.", passages: [at(essayText, "They carry pollen between flowers so plants can make seeds.")] }],
    grows: [{ id: "grow-1", criterionId: "evidence", comment: "Readers do not know where the hive fact came from.", action: "Name the article you read.", passages: [at(essayText, "Farmers rent hives in the spring.")] }],
    comprehensionFlags: [{ id: "flag-1", concern: "copied-language", note: "Phrase may be copied without understanding.", teacherCheck: "Ask what 'mutualistic' means.", passages: [at(essayText, "mutualistic symbiosis")] }],
    walkthrough: [{ itemId: "glow-1", script: "Here you explain how pollen moves." }, { itemId: "grow-1", script: "Tell your reader where you learned this." }],
    teacherConference: { questions: ["Which suggestion was hardest to act on?"] },
  };
}

describe("T30 essay grading", () => {
  it("publishes a specialized contract that requires the essay and rubric", () => {
    const capability = getCapability("T30");
    expect(capability).toMatchObject({ name: "Essay Grading & Feedback", version: "1.1.0", risk: "high" });
    expect(capability?.inputSchema.required).toEqual(["request", "essayText", "rubric"]);
    const prepared = prepareCapabilityRun({ capabilityId: "T30", input: { request: "Grade this essay", essayText, rubric }, phase: "prepare" });
    expect(prepared.execution?.validation).toMatchObject({ requiredBeforeSave: true });
  });

  it("accepts a consistent, passage-anchored grade", () => {
    expect(validatePriorityCapability("T30", grade())).toMatchObject({ valid: true, totalScore: 5, maxScore: 6 });
  });

  it("rejects a wrong total, band, or passage", () => {
    const wrongTotal = { ...grade(), totalScore: 6 };
    expect(validateEssayGrade(wrongTotal).issues).toEqual(expect.arrayContaining([expect.stringContaining("totalScore is 6")]));
    const wrongBand = { ...grade(), band: "Developing" };
    expect(validatePriorityCapability("T30", wrongBand).valid).toBe(false);
    const badPassage = grade();
    badPassage.glows[0].passages[0].quote = "Bees are pollinators.";
    expect(validatePriorityCapability("T30", badPassage).valid).toBe(false);
  });

  it("requires a grow for every criterion below the top level", () => {
    expect(validateEssayGrade({ ...grade(), grows: [], walkthrough: [{ itemId: "glow-1", script: "Nice." }] }).issues)
      .toEqual(expect.arrayContaining([expect.stringContaining("'evidence' is below the top level")]));
  });

  it("rejects praise for a passage flagged as not understood", () => {
    const praised = grade();
    praised.glows[0].passages = [at(essayText, "The bees are pollinators of mutualistic symbiosis.")];
    expect(validateEssayGrade(praised).issues).toEqual(expect.arrayContaining([expect.stringContaining("marks as not understood")]));
  });

  it("requires the walkthrough to cover every item with glows first", () => {
    const reordered = { ...grade(), walkthrough: [...grade().walkthrough].reverse() };
    expect(validateEssayGrade(reordered).issues).toContain("Walkthrough must present every glow before any grow.");
  });
});

describe("S17 revision check", () => {
  const revisedText = essayText.replace("Farmers rent hives in the spring.", "According to Bee Facts, farmers rent hives in the spring.");
  const check = () => ({
    previousText: essayText,
    revisedText,
    grows: [{ id: "grow-1", comment: "Name the source.", action: "Name the article you read." }],
    revisionChecks: [{ growId: "grow-1", status: "addressed", comment: "You named your source.", passages: [at(revisedText, "According to Bee Facts")] }],
    newIssues: [],
  });

  it("accepts a passage-cited check of each suggestion", () => {
    expect(getCapability("S17")?.version).toBe("1.1.0");
    expect(validatePriorityCapability("S17", check())).toMatchObject({ valid: true });
  });

  it("rejects an 'addressed' status when nothing changed", () => {
    const unchanged = { ...check(), revisedText: essayText, revisionChecks: [{ growId: "grow-1", status: "addressed", comment: "Done.", passages: [at(essayText, "Farmers")] }] };
    expect(validateEssayRevision(unchanged).issues).toEqual(expect.arrayContaining([expect.stringContaining("text is unchanged")]));
  });

  it("requires every suggestion to be checked", () => {
    expect(validateEssayRevision({ ...check(), revisionChecks: [] }).issues).toContain("Grow 'grow-1' must be checked exactly once.");
  });
});
