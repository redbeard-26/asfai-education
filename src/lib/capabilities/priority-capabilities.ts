import { z } from "zod";
import { quizDefinitionSchema } from "@/lib/capabilities/quiz";
import { validateLesson } from "@/lib/lessons/validation";

const jsonSchema = "https://json-schema.org/draft/2020-12/schema";

const proofreaderSchema = z.object({
  originalText: z.string(),
  revisedText: z.string(),
  edits: z.array(z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    original: z.string(),
    replacement: z.string(),
    reason: z.string().min(1),
    category: z.enum(["grammar", "spelling", "punctuation", "clarity", "consistency"]),
  })),
  unresolved: z.array(z.string()).default([]),
  voicePreservationNotes: z.array(z.string()).default([]),
});

const rubricSchema = z.object({
  title: z.string().min(1),
  objectiveIds: z.array(z.string()).min(1),
  levels: z.array(z.object({ id: z.string(), label: z.string().min(1), score: z.number() })).min(2).max(8),
  criteria: z.array(z.object({
    id: z.string(),
    criterion: z.string().min(1),
    objectiveIds: z.array(z.string()).min(1),
    weight: z.number().positive(),
    descriptors: z.record(z.string(), z.string().min(1)),
  })).min(1),
  scoringNotes: z.array(z.string()).default([]),
  accessibilityNotes: z.array(z.string()).default([]),
});

const worksheetSchema = z.object({
  title: z.string().min(1),
  directions: z.string().min(1),
  objectiveIds: z.array(z.string()).min(1),
  sections: z.array(z.object({
    heading: z.string().min(1),
    items: z.array(z.object({
      id: z.string(),
      prompt: z.string().min(1),
      responseType: z.enum(["short-response", "extended-response", "multiple-choice", "performance", "drawing"]),
      objectiveIds: z.array(z.string()).min(1),
      options: z.array(z.string()).optional(),
      accessibilityAlternative: z.string().optional(),
    })).min(1),
  })).min(1),
  answerKey: z.array(z.object({ itemId: z.string(), answer: z.unknown(), explanation: z.string().min(1) })),
  accessibilityNotes: z.array(z.string()).default([]),
});

type PrioritySpec = {
  guidance: string;
  workflow: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  evaluators: string[];
};

const commonOutput = (resultProperties: Record<string, unknown>, required: string[]) => ({
  $schema: jsonSchema,
  type: "object",
  additionalProperties: false,
  required: ["result", "assumptions", "provenance", "reviewStatus"],
  properties: {
    result: { type: "object", additionalProperties: false, required, properties: resultProperties },
    assumptions: { type: "array", items: { type: "string" } },
    sourceLimitations: { type: "array", items: { type: "string" } },
    accessibilityNotes: { type: "array", items: { type: "string" } },
    provenance: { type: "object" },
    reviewStatus: { type: "string", enum: ["draft", "human-review-required", "ready-for-confirmation"] },
  },
});

export const PRIORITY_CAPABILITIES: Record<string, PrioritySpec> = {
  T18: {
    guidance: "Proofread without replacing the author's voice. Return offset-addressed, individually accept-or-reject edits; distinguish correctness fixes from optional clarity suggestions; never invent facts or silently rewrite the whole passage.",
    workflow: ["Preserve the exact original text.", "Identify the smallest justified edits.", "Build revisedText only by applying the ordered edit list.", "Flag ambiguity instead of guessing.", "Validate offsets and read the revision for changed meaning."],
    inputSchema: { $schema: jsonSchema, type: "object", additionalProperties: false, required: ["request"], properties: { request: { type: "string", minLength: 1 }, originalText: { type: "string", minLength: 1, maxLength: 120000 }, content: { type: "string", minLength: 1, maxLength: 120000, description: "Compatibility alias for originalText" }, goals: { type: "array", items: { type: "string" } }, preserveVoice: { type: "boolean", default: true }, locale: { type: "string" } } },
    outputSchema: commonOutput({ originalText: { type: "string" }, revisedText: { type: "string" }, edits: { type: "array", items: { type: "object" } }, unresolved: { type: "array", items: { type: "string" } }, voicePreservationNotes: { type: "array", items: { type: "string" } } }, ["originalText", "revisedText", "edits"]),
    evaluators: ["proofreader-offsets", "minimal-edit-fidelity", "voice-preservation", "meaning-change-check", "editable-output-and-human-control"],
  },
  T24: {
    guidance: "Create an editable analytic rubric aligned to the supplied learning objectives. Use observable, modality-appropriate descriptors at every level, non-overlapping criteria, transparent weights, and accessible alternatives. The educator retains final scoring authority.",
    workflow: ["Translate each objective into observable evidence.", "Choose distinct criteria and a clearly ordered scale.", "Write parallel descriptors that describe evidence rather than student character.", "Check objective coverage and weights.", "Return an editable draft for teacher review."],
    inputSchema: { $schema: jsonSchema, type: "object", additionalProperties: false, required: ["request", "objectiveIds"], properties: { request: { type: "string", minLength: 1 }, objectiveIds: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } }, taskDescription: { type: "string" }, levelCount: { type: "integer", minimum: 2, maximum: 8 }, constraints: { type: "array", items: { type: "string" } }, locale: { type: "string" } } },
    outputSchema: commonOutput({ title: { type: "string" }, objectiveIds: { type: "array", items: { type: "string" } }, levels: { type: "array", items: { type: "object" } }, criteria: { type: "array", items: { type: "object" } }, scoringNotes: { type: "array", items: { type: "string" } }, accessibilityNotes: { type: "array", items: { type: "string" } } }, ["title", "objectiveIds", "levels", "criteria"]),
    evaluators: ["rubric-schema", "objective-coverage", "descriptor-observability", "weight-total", "bias-and-accessibility-review"],
  },
  T41: {
    guidance: "Create an editable, accessible worksheet aligned to supplied objectives. Keep answers out of learner prompts, include a complete answer key with explanations, validate every item, and provide equivalent nonvisual or nonprint alternatives where needed.",
    workflow: ["Plan item coverage and difficulty.", "Write concise directions and uniquely identified items.", "Solve or verify every item independently.", "Build the separate answer key.", "Check accessibility, objective coverage, and answer-key completeness."],
    inputSchema: { $schema: jsonSchema, type: "object", additionalProperties: false, required: ["request", "objectiveIds"], properties: { request: { type: "string", minLength: 1 }, objectiveIds: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } }, itemCount: { type: "integer", minimum: 1, maximum: 100 }, gradeBand: { type: "string" }, constraints: { type: "array", items: { type: "string" } }, representation: { type: "string", enum: ["structured", "html", "markdown"] } } },
    outputSchema: commonOutput({ title: { type: "string" }, directions: { type: "string" }, objectiveIds: { type: "array", items: { type: "string" } }, sections: { type: "array", items: { type: "object" } }, answerKey: { type: "array", items: { type: "object" } }, accessibilityNotes: { type: "array", items: { type: "string" } } }, ["title", "directions", "objectiveIds", "sections", "answerKey"]),
    evaluators: ["worksheet-schema", "objective-coverage", "answer-key-completeness", "independent-solution-check", "accessibility-and-editability"],
  },
  T48: {
    guidance: "Create a complete evidence-centered ASFAI lesson package: versioned public objectives, learner-facing outcomes, activities and artifacts, modality-appropriate assessment methods, assistance/provenance rules, accessibility fallbacks, and a lesson-specific reporting plan. Validate before publication.",
    workflow: ["Select observable public objectives.", "Define acceptable evidence and assessment methods.", "Design activities, hosted artifacts, and accessible fallbacks.", "Specify facilitation modes and learner-language directions.", "Validate, review, version, and save the complete lesson package."],
    inputSchema: { $schema: jsonSchema, type: "object", additionalProperties: false, required: ["request", "idea", "audience"], properties: { request: { type: "string", minLength: 1 }, idea: { type: "string", minLength: 1 }, audience: { type: "string", minLength: 1 }, objectiveIds: { type: "array", items: { type: "string" }, maxItems: 50 }, constraints: { type: "array", items: { type: "string" } }, preferredModes: { type: "array", items: { type: "string" } }, sourceRefs: { type: "array", items: { type: "string" } } } },
    outputSchema: commonOutput({ lesson: { type: "object" }, publicationReview: { type: "object" } }, ["lesson", "publicationReview"]),
    evaluators: ["lesson-schema", "objective-and-evidence-alignment", "artifact-integrity", "assessment-validity", "learner-language", "accessibility-and-publication-review"],
  },
  S25: {
    guidance: "Quiz the learner one question at a time in natural language. Adapt the next question or explanation to what the learner demonstrated, keep answer keys private, record assistance, explain feedback, and treat all results as evidence candidates rather than mastery.",
    workflow: ["Load a teacher-approved published quiz or create an objective-aligned draft for teacher publication.", "Start a pseudonymous attempt.", "Ask only the current learner item.", "Record the response and assistance, then give explanatory feedback.", "Finish only after all items and offer learner-approved evidence persistence."],
    inputSchema: { $schema: jsonSchema, type: "object", additionalProperties: false, required: ["request"], properties: { request: { type: "string", minLength: 1 }, objectiveIds: { type: "array", items: { type: "string" } }, quiz: { type: "object" }, gradeBand: { type: "string" }, constraints: { type: "array", items: { type: "string" } } } },
    outputSchema: commonOutput({ attempt: { type: "object" }, currentItem: { type: "object" }, feedback: { type: "object" }, evidenceCandidates: { type: "array", items: { type: "object" } } }, ["attempt"]),
    evaluators: ["quiz-schema", "answer-key-isolation", "one-item-at-a-time", "feedback-quality", "assistance-attribution", "natural-learner-language"],
  },
};

export function getPriorityCapabilitySpec(id: string) {
  return PRIORITY_CAPABILITIES[id];
}

function validateProofreader(candidate: unknown) {
  const value = proofreaderSchema.parse(candidate);
  const issues: string[] = [];
  const edits = [...value.edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0;
  let revised = "";
  for (const edit of edits) {
    if (edit.end < edit.start) issues.push(`Edit at ${edit.start} ends before it starts.`);
    if (edit.start < cursor) issues.push(`Edit at ${edit.start} overlaps a prior edit.`);
    if (value.originalText.slice(edit.start, edit.end) !== edit.original) issues.push(`Edit at ${edit.start} does not match the original text.`);
    revised += value.originalText.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  revised += value.originalText.slice(cursor);
  if (revised !== value.revisedText) issues.push("revisedText is not the exact result of applying the edit list.");
  return { valid: issues.length === 0, issues, candidate: value };
}

function validateRubric(candidate: unknown) {
  const value = rubricSchema.parse(candidate);
  const issues: string[] = [];
  const levelIds = value.levels.map((level) => level.id);
  if (new Set(levelIds).size !== levelIds.length) issues.push("Rubric level IDs must be unique.");
  const criterionIds = value.criteria.map((criterion) => criterion.id);
  if (new Set(criterionIds).size !== criterionIds.length) issues.push("Rubric criterion IDs must be unique.");
  const total = value.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (Math.abs(total - 100) > 0.001) issues.push(`Criterion weights total ${total}; they must total 100.`);
  for (const objectiveId of value.objectiveIds) if (!value.criteria.some((criterion) => criterion.objectiveIds.includes(objectiveId))) issues.push(`Objective '${objectiveId}' is not covered by a criterion.`);
  for (const criterion of value.criteria) for (const levelId of levelIds) if (!criterion.descriptors[levelId]) issues.push(`Criterion '${criterion.id}' lacks a descriptor for level '${levelId}'.`);
  return { valid: issues.length === 0, issues, candidate: value, weightTotal: total };
}

function validateWorksheet(candidate: unknown) {
  const value = worksheetSchema.parse(candidate);
  const issues: string[] = [];
  const items = value.sections.flatMap((section) => section.items);
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) issues.push("Worksheet item IDs must be unique.");
  const keyIds = value.answerKey.map((entry) => entry.itemId);
  for (const id of ids) if (!keyIds.includes(id)) issues.push(`Worksheet item '${id}' has no answer-key entry.`);
  for (const id of keyIds) if (!ids.includes(id)) issues.push(`Answer-key entry '${id}' has no worksheet item.`);
  for (const objectiveId of value.objectiveIds) if (!items.some((item) => item.objectiveIds.includes(objectiveId))) issues.push(`Objective '${objectiveId}' is not assessed by an item.`);
  for (const item of items) if (item.responseType === "multiple-choice" && (!item.options || item.options.length < 2)) issues.push(`Multiple-choice item '${item.id}' needs at least two options.`);
  return { valid: issues.length === 0, issues, candidate: value, itemCount: items.length };
}

export function validatePriorityCapability(id: string, candidate: unknown) {
  if (id === "T18") return validateProofreader(candidate);
  if (id === "T24") return validateRubric(candidate);
  if (id === "T41") return validateWorksheet(candidate);
  if (id === "T48") return validateLesson((candidate as { lesson?: unknown })?.lesson ?? candidate);
  if (id === "S25") {
    const quiz = quizDefinitionSchema.parse((candidate as { quiz?: unknown })?.quiz ?? candidate);
    const issues = quiz.items.flatMap((item) => item.type === "multiple-choice" && (item.correctOption === undefined || !item.options?.[item.correctOption]) ? [`Multiple-choice item '${item.id}' has no valid answer.`] : []);
    return { valid: issues.length === 0, issues, candidate: quiz };
  }
  throw new Error(`Capability '${id}' does not have a specialized validation contract.`);
}
