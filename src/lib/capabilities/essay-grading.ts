import { z } from "zod";

// A passage is a highlightable span of the student's text. The text itself stays
// with the assistant, so the server can check only that each span is well formed;
// the assistant must confirm text.slice(start, end) === quote before presenting.
const passageSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  quote: z.string().min(1),
});

const essayRubricSchema = z.object({
  title: z.string().min(1),
  levels: z.array(z.object({ id: z.string(), label: z.string().min(1), score: z.number() })).min(2).max(8),
  criteria: z.array(z.object({
    id: z.string(),
    criterion: z.string().min(1),
    standardIds: z.array(z.string()).default([]),
    descriptors: z.record(z.string(), z.string().min(1)),
  })).min(1),
  bands: z.array(z.object({ label: z.string().min(1), min: z.number(), max: z.number() })).default([]),
});

const feedbackItemSchema = z.object({
  id: z.string(),
  criterionId: z.string(),
  comment: z.string().min(1),
  passages: z.array(passageSchema).min(1),
});

export const essayGradeSchema = z.object({
  rubric: essayRubricSchema,
  criterionScores: z.array(z.object({
    criterionId: z.string(),
    levelId: z.string(),
    score: z.number(),
    rationale: z.string().min(1),
    passages: z.array(passageSchema).default([]),
  })).min(1),
  totalScore: z.number(),
  maxScore: z.number(),
  band: z.string().optional(),
  glows: z.array(feedbackItemSchema).min(1),
  grows: z.array(feedbackItemSchema.extend({ action: z.string().min(1) })),
  comprehensionFlags: z.array(z.object({
    id: z.string(),
    concern: z.enum(["vocabulary", "concept", "copied-language", "factual", "other"]),
    note: z.string().min(1),
    teacherCheck: z.string().min(1),
    passages: z.array(passageSchema).min(1),
  })).default([]),
  walkthrough: z.array(z.object({ itemId: z.string(), script: z.string().min(1) })).min(1),
  teacherConference: z.object({ questions: z.array(z.string().min(1)).min(1) }),
});

export const essayRevisionSchema = z.object({
  textChanged: z.boolean(),
  grows: z.array(z.object({ id: z.string(), comment: z.string().min(1), action: z.string().min(1) })).min(1),
  revisionChecks: z.array(z.object({
    growId: z.string(),
    status: z.enum(["addressed", "partly-addressed", "not-yet"]),
    comment: z.string().min(1),
    passages: z.array(passageSchema).default([]),
  })),
  newIssues: z.array(z.object({ comment: z.string().min(1), passages: z.array(passageSchema).min(1) })).default([]),
});

// Student text fields that T30 and S17 drop unread; validation schemas omit them too.
export const STUDENT_TEXT_FIELDS = ["essayText", "previousText", "revisedText", "originalText", "content"];

function checkPassages(passages: Array<z.infer<typeof passageSchema>>, label: string, issues: string[]) {
  for (const passage of passages) {
    if (passage.end <= passage.start || passage.end - passage.start !== passage.quote.length) {
      issues.push(`${label} cites '${passage.quote}' at ${passage.start}-${passage.end}, but the span length does not match the quote.`);
    }
  }
}

const overlaps = (a: z.infer<typeof passageSchema>, b: z.infer<typeof passageSchema>) => a.start < b.end && b.start < a.end;

export function validateEssayGrade(candidate: unknown) {
  const value = essayGradeSchema.parse(candidate);
  const issues: string[] = [];
  const { rubric } = value;

  const levelIds = rubric.levels.map((level) => level.id);
  if (new Set(levelIds).size !== levelIds.length) issues.push("Rubric level IDs must be unique.");
  const criterionIds = rubric.criteria.map((criterion) => criterion.id);
  if (new Set(criterionIds).size !== criterionIds.length) issues.push("Rubric criterion IDs must be unique.");
  const topScore = Math.max(...rubric.levels.map((level) => level.score));

  for (const criterionId of criterionIds) {
    const scores = value.criterionScores.filter((entry) => entry.criterionId === criterionId);
    if (scores.length !== 1) issues.push(`Criterion '${criterionId}' must be scored exactly once.`);
  }
  for (const entry of value.criterionScores) {
    if (!criterionIds.includes(entry.criterionId)) issues.push(`Score for unknown criterion '${entry.criterionId}'.`);
    const level = rubric.levels.find((item) => item.id === entry.levelId);
    if (!level) issues.push(`Criterion '${entry.criterionId}' uses unknown level '${entry.levelId}'.`);
    else if (level.score !== entry.score) issues.push(`Criterion '${entry.criterionId}' score ${entry.score} does not match level '${level.id}' (${level.score}).`);
    checkPassages(entry.passages, `Score for '${entry.criterionId}'`, issues);
    if (level && level.score < topScore && !value.grows.some((grow) => grow.criterionId === entry.criterionId)) {
      issues.push(`Criterion '${entry.criterionId}' is below the top level but has no grow explaining how to improve.`);
    }
  }

  const total = value.criterionScores.reduce((sum, entry) => sum + entry.score, 0);
  if (total !== value.totalScore) issues.push(`totalScore is ${value.totalScore}; criterion scores total ${total}.`);
  const max = topScore * rubric.criteria.length;
  if (max !== value.maxScore) issues.push(`maxScore is ${value.maxScore}; the rubric maximum is ${max}.`);
  if (rubric.bands.length) {
    const band = rubric.bands.find((item) => total >= item.min && total <= item.max);
    if (band?.label !== value.band) issues.push(`Band '${value.band ?? ""}' does not match total ${total}; expected '${band?.label ?? "none"}'.`);
  }

  const itemIds = [...value.glows, ...value.grows, ...value.comprehensionFlags].map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) issues.push("Glow, grow, and flag IDs must be unique.");
  for (const item of [...value.glows, ...value.grows]) {
    if (!criterionIds.includes(item.criterionId)) issues.push(`Feedback '${item.id}' cites unknown criterion '${item.criterionId}'.`);
    checkPassages(item.passages, `Feedback '${item.id}'`, issues);
  }
  for (const flag of value.comprehensionFlags) {
    checkPassages(flag.passages, `Flag '${flag.id}'`, issues);
    for (const glow of value.glows) {
      if (glow.passages.some((a) => flag.passages.some((b) => overlaps(a, b)))) {
        issues.push(`Glow '${glow.id}' praises a passage that flag '${flag.id}' marks as not understood.`);
      }
    }
  }

  // The walkthrough covers every glow and grow once, compliments first.
  const glowIds = value.glows.map((item) => item.id);
  const growIds = value.grows.map((item) => item.id);
  const order = value.walkthrough.map((step) => step.itemId);
  for (const id of [...glowIds, ...growIds]) {
    const count = order.filter((itemId) => itemId === id).length;
    if (count !== 1) issues.push(`Walkthrough must include '${id}' exactly once.`);
  }
  for (const id of order) if (!glowIds.includes(id) && !growIds.includes(id)) issues.push(`Walkthrough step '${id}' is not a glow or grow.`);
  const lastGlow = Math.max(-1, ...order.map((id, index) => glowIds.includes(id) ? index : -1));
  const firstGrow = order.findIndex((id) => growIds.includes(id));
  if (firstGrow !== -1 && firstGrow < lastGlow) issues.push("Walkthrough must present every glow before any grow.");

  return { valid: issues.length === 0, issues, candidate: value, totalScore: total, maxScore: max };
}

export function validateEssayRevision(candidate: unknown) {
  const value = essayRevisionSchema.parse(candidate);
  const issues: string[] = [];
  const growIds = value.grows.map((grow) => grow.id);
  for (const id of growIds) {
    if (value.revisionChecks.filter((check) => check.growId === id).length !== 1) issues.push(`Grow '${id}' must be checked exactly once.`);
  }
  for (const check of value.revisionChecks) {
    if (!growIds.includes(check.growId)) issues.push(`Revision check cites unknown grow '${check.growId}'.`);
    checkPassages(check.passages, `Check for '${check.growId}'`, issues);
    if (check.status !== "not-yet" && check.passages.length === 0) issues.push(`Check for '${check.growId}' is '${check.status}' but cites no revised passage.`);
    if (check.status !== "not-yet" && !value.textChanged) issues.push(`Check for '${check.growId}' is '${check.status}' but the text is unchanged.`);
  }
  value.newIssues.forEach((item, index) => checkPassages(item.passages, `New issue ${index + 1}`, issues));
  return { valid: issues.length === 0, issues, candidate: value };
}
