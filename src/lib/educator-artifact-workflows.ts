import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const text = z.string().trim().min(1).max(8000);
const shortText = z.string().trim().min(1).max(1000);
const sourceRefSchema = z.string().trim().min(1).max(2000);
const timestampSchema = z.string().datetime({ offset: true });

export const workflowQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  kind: z.enum(["open", "single-choice", "multiple-choice"]),
  options: z.array(z.string()).optional(),
  reason: z.string(),
});

const artifactBase = {
  schemaVersion: z.literal("0.1"),
  id: shortText,
  version: z.number().int().positive(),
  status: z.enum(["draft", "reviewed"]),
  sourceRefs: z.array(sourceRefSchema).max(50).default([]),
  decisionTrace: z.array(z.object({
    stage: z.enum(["intake", "clarification", "draft", "review"]),
    decision: shortText,
    basis: z.enum(["teacher", "source", "assistant-suggestion"]),
    sourceRef: sourceRefSchema.optional(),
  })).max(100).default([]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};

export const lessonOutlineSchema = z.object({
  ...artifactBase,
  kind: z.literal("lesson-outline"),
  course: shortText,
  topic: shortText,
  audience: shortText,
  learningOutcomes: z.array(shortText).min(1).max(30),
  draftAuthorization: z.string().min(1).max(4000).optional(),
  sections: z.array(z.object({
    id: shortText,
    title: shortText,
    purpose: shortText,
    suggestedActivities: z.array(shortText).max(15).default([]),
    estimatedMinutes: z.number().int().positive().max(600).optional(),
  })).min(1).max(40),
  unresolvedDecisions: z.array(shortText).max(30).default([]),
});

export const evaluationDesignSchema = z.object({
  ...artifactBase,
  kind: z.literal("evaluation"),
  lessonPlanRef: sourceRefSchema,
  lessonPlanVersion: shortText.optional(),
  audience: shortText,
  learningOutcomes: z.array(z.object({ id: shortText, description: shortText })).min(1).max(30),
  purpose: z.enum(["formative", "summative", "diagnostic"]),
  modality: z.enum(["writing", "problem-set", "conversation", "performance", "project", "collaboration", "mixed"]),
  teacherTimeBudgetMinutes: z.number().int().nonnegative().max(10000),
  requiredResources: z.array(shortText).max(30).default([]),
  tasks: z.array(z.object({
    id: shortText,
    directions: text,
    outcomeIds: z.array(shortText).min(1).max(30),
    evidenceToCollect: z.array(shortText).min(1).max(20),
    estimatedStudentMinutes: z.number().int().positive().max(1000),
    estimatedTeacherMinutes: z.number().int().nonnegative().max(10000),
  })).min(1).max(30),
  criteria: z.array(z.object({ outcomeId: shortText, description: shortText })).min(1).max(60),
  aiUsePolicy: shortText,
  accessibilityAlternative: shortText,
  reviewNotes: z.array(shortText).max(30).default([]),
});

export const transformArtifactSchema = z.object({
  ...artifactBase,
  kind: z.literal("transform"),
  sourceRef: sourceRefSchema,
  operation: z.enum(["translate", "adapt-reading-level", "slides", "audio-script", "task-list", "convert", "other"]),
  targetRepresentation: shortText,
  targetLanguage: shortText.optional(),
  targetAudience: shortText.optional(),
  outputRef: sourceRefSchema.optional(),
  outputText: text.optional(),
  fidelityNotes: z.array(shortText).max(30).default([]),
  accessibilityNotes: z.array(shortText).max(30).default([]),
}).refine((artifact) => artifact.outputRef || artifact.outputText, {
  path: ["outputRef"],
  message: "A transformation must reference or include a generated output.",
});

export const lessonIntakeSchema = z.object({
  mode: z.enum(["new", "polish", "expand"]).default("new"),
  topic: shortText.optional(),
  course: shortText.optional(),
  audience: shortText.optional(),
  learningOutcomes: z.array(shortText).max(30).optional(),
  clarificationReceipt: z.string().min(1).max(4000).optional(),
  draftRef: sourceRefSchema.optional(),
  outline: lessonOutlineSchema.optional(),
  polishGoals: z.array(z.enum(["clarity", "gaps", "objective-mapping", "formatting", "full-review"])).max(5).optional(),
  expansionGoals: z.array(shortText).max(15).optional(),
  assumptions: z.array(z.object({ field: shortText, value: shortText, sourceRef: sourceRefSchema })).max(30).optional(),
}).strict();

export const evaluationIntakeSchema = z.object({
  lessonPlan: z.object({
    ref: sourceRefSchema,
    title: shortText,
    stage: z.enum(["outline", "complete"]),
    activities: z.array(shortText).max(100),
    audience: shortText.optional(),
    learningOutcomes: z.array(z.object({ id: shortText, description: shortText })).max(30).optional(),
  }).optional(),
  lessonPlanVersion: shortText.optional(),
  audience: shortText.optional(),
  learningOutcomes: z.array(z.object({ id: shortText, description: shortText })).max(30).optional(),
  purpose: z.enum(["formative", "summative", "diagnostic"]).optional(),
  preferredModality: z.enum(["writing", "problem-set", "conversation", "performance", "project", "collaboration", "mixed", "recommend"] ).optional(),
  teacherTimeBudgetMinutes: z.number().int().nonnegative().max(10000).optional(),
  availableResources: z.array(shortText).max(30).optional(),
  priorAssignmentRefs: z.array(sourceRefSchema).max(20).optional(),
  assumptions: z.array(z.object({ field: shortText, value: shortText, sourceRef: sourceRefSchema })).max(30).optional(),
}).strict();

export const transformIntakeSchema = z.object({
  sourceRef: sourceRefSchema.optional(),
  operation: transformArtifactSchema.shape.operation.optional(),
  targetRepresentation: shortText.optional(),
  targetLanguage: shortText.optional(),
  targetAudience: shortText.optional(),
  requirements: z.array(shortText).max(30).optional(),
}).strict();

function question(id: string, prompt: string, reason: string, options?: string[], multiple = false) {
  return workflowQuestionSchema.parse({ id, prompt, reason, kind: options ? multiple ? "multiple-choice" : "single-choice" : "open", options });
}

const INTAKE_QUESTION_IDS = ["topic", "course", "audience", "learning_outcomes"] as const;
const INTAKE_RECEIPT_PAYLOAD = `q:${INTAKE_QUESTION_IDS.join(",")}`;
const RECEIPT_TTL_MS = 30 * 60 * 1000;

let clarificationSecret: string | null = process.env.ASFAI_CLARIFICATION_SECRET ?? null;

/** Tests inject a secret. Production must set ASFAI_CLARIFICATION_SECRET. Missing secret fails closed. */
export function setClarificationSecretForTests(secret: string | null) {
  clarificationSecret = secret;
}

function issueReceipt(payload: string, now = Date.now()): string | null {
  const key = clarificationSecret;
  if (!key) return null;
  const exp = now + RECEIPT_TTL_MS;
  const body = `${exp}.${payload}`;
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

function verifyReceipt(token: string | undefined, payload: string, now = Date.now()): boolean {
  const key = clarificationSecret;
  if (!key || !token) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const parts = decoded.split(".");
  if (parts.length < 3) return false;
  const sig = parts.pop()!;
  const exp = Number(parts[0]);
  const bodyPayload = parts.slice(1).join(".");
  if (!Number.isFinite(exp) || exp < now || bodyPayload !== payload) return false;
  const expected = createHmac("sha256", key).update(`${exp}.${payload}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function draftPayload(fields: { topic: string; course: string; audience: string; learningOutcomes: string[] }) {
  return `draft:${fields.topic}|${fields.course}|${fields.audience}|${fields.learningOutcomes.join("\n")}`;
}

function intakeQuestions(brief: { topic?: string; course?: string; audience?: string; learningOutcomes?: string[] }) {
  const questions: z.infer<typeof workflowQuestionSchema>[] = [];
  if (!brief.topic) questions.push(question("topic", "What topic should this lesson cover?", "The outline needs a subject."));
  if (!brief.course) questions.push(question("course", "Which course is this part of?", "Course context sets scope and sequencing."));
  if (!brief.audience) questions.push(question("audience", "Who are the learners (level, age range, or prior knowledge)?", "Activities and language depend on the audience."));
  if (!brief.learningOutcomes?.length) questions.push(question("learning_outcomes", "What should learners be able to do by the end?", "An observable outcome anchors the outline."));
  return questions;
}

function response(primitive: "Lesson" | "Evaluation" | "Transform", phase: string, questions: z.infer<typeof workflowQuestionSchema>[], context: unknown, next: string) {
  return {
    primitive,
    phase,
    state: questions.length ? "clarifying" as const : "ready_to_draft" as const,
    questions,
    context,
    next,
    storage: "Caller-owned draft. Save a reviewed version through asfai_resource and verify persistence with asfai_storage; this call retains nothing.",
  };
}

export function prepareLessonOutline(input: unknown) {
  const brief = lessonIntakeSchema.parse(input);
  const questions: z.infer<typeof workflowQuestionSchema>[] = [];
  if (brief.mode === "new") {
    const missing = intakeQuestions(brief);
    const receiptOk = verifyReceipt(brief.clarificationReceipt, INTAKE_RECEIPT_PAYLOAD);
    if (!receiptOk) {
      const asked = missing.length ? missing : [question(
        "confirm_intake",
        "The topic, course, audience, and outcomes in this call were supplied by the assistant, not confirmed by you. Confirm or replace them before any draft.",
        "Field presence is not a teacher answer. A host can invent these in one call.",
        ["Confirm these values", "I will replace them"],
      )];
      return {
        ...response("Lesson", brief.mode, asked, { ...brief, unconfirmedSuggestions: true }, "Ask these questions in ordinary teacher-facing language. Do not invent answers. Call prepare_outline again with the clarificationReceipt and the teacher's answers."),
        clarificationReceipt: issueReceipt(INTAKE_RECEIPT_PAYLOAD),
      };
    }
    if (missing.length) {
      return {
        ...response("Lesson", brief.mode, missing, brief, "Ask the unresolved questions, then call prepare_outline again with the same clarificationReceipt and the teacher's answers."),
        clarificationReceipt: brief.clarificationReceipt,
      };
    }
    const accepted = {
      topic: brief.topic!,
      course: brief.course!,
      audience: brief.audience!,
      learningOutcomes: brief.learningOutcomes!,
    };
    return {
      ...response("Lesson", brief.mode, [], brief, "Draft or revise a lesson-outline artifact, copy draftAuthorization onto it, then call asfai_lesson validate_outline. Do not publish or claim it is saved yet."),
      draftAuthorization: issueReceipt(draftPayload(accepted)),
    };
  } else if (brief.mode === "polish") {
    if (!brief.draftRef) questions.push(question("draft", "Please attach or identify the draft outline.", "Polishing requires an existing artifact."));
    if (!brief.polishGoals?.length) questions.push(question("polish_goal", "What kind of polish would help most?", "Formatting, gaps, and objective mapping require different reviews.", ["Clearer wording and structure", "Find gaps", "Map to learning objectives", "Formatting only", "Full instructional review"], true));
    const needsPedagogy = brief.polishGoals?.some((goal) => ["gaps", "objective-mapping", "full-review"].includes(goal));
    if (needsPedagogy && !brief.audience) questions.push(question("audience", "Who is this lesson for?", "A gap review needs the learner level."));
    if (needsPedagogy && !brief.learningOutcomes?.length) questions.push(question("learning_outcomes", "Which learning outcomes should this outline support?", "A gap or alignment review needs a target."));
  } else {
    if (!brief.outline) questions.push(question("outline", "Please provide the outline to expand.", "Expansion must be grounded in an existing outline."));
    else if (brief.outline.status !== "reviewed") questions.push(question("outline_review", "Would you like to review this outline before we build the full lesson plan?", "Expansion should use an outline the teacher has accepted."));
    if (!brief.expansionGoals?.length) questions.push(question("expansion_goal", "What would you like to add to the outline?", "Delivery plans, reading lists, artifacts, and gap analysis have different inputs.", ["Full lesson plan", "Delivery ideas", "Knowledge gaps", "Teaching artifacts", "Something else"], true));
  }
  return response("Lesson", brief.mode, questions, brief, questions.length
    ? "Ask the unresolved questions, then call prepare_outline again with the answers and source-backed inferences."
    : brief.mode === "expand"
      ? "Expand the reviewed outline toward a full lessonDefinition; use asfai_lesson validate and review before publication."
      : "Draft or revise a lesson-outline artifact, then call asfai_lesson validate_outline. Do not publish or claim it is saved yet.");
}

export function prepareEvaluationDesign(input: unknown) {
  const brief = evaluationIntakeSchema.parse(input);
  const questions: z.infer<typeof workflowQuestionSchema>[] = [];
  if (!brief.lessonPlan) questions.push(question("lesson_plan", "Please attach the completed lesson plan so I can review its activities and outcomes.", "Evaluation design must be grounded in the lesson, not generic advice."));
  else if (brief.lessonPlan.stage !== "complete" || !brief.lessonPlan.activities.length) questions.push(question("complete_plan", "Can we complete the lesson activities before designing the evaluation?", "An outline alone cannot establish what students will do or what resources are available."));
  if (!brief.audience && !brief.lessonPlan?.audience) questions.push(question("audience", "What is the learners' age or educational level?", "The task and evidence standard depend on the audience."));
  if (!brief.learningOutcomes?.length && !brief.lessonPlan?.learningOutcomes?.length) questions.push(question("learning_outcomes", "Which outcomes in the lesson plan should this evaluation measure?", "Every task and criterion must map to a defined outcome."));
  if (!brief.purpose) questions.push(question("purpose", "Is this mainly to guide teaching, diagnose prior knowledge, or make a final judgment?", "Stakes and feedback differ by purpose.", ["Formative", "Diagnostic", "Summative"]));
  if (brief.teacherTimeBudgetMinutes === undefined) questions.push(question("teacher_effort", "About how many minutes per student can you spend reviewing the work?", "The plan must be feasible for the teacher."));
  return response("Evaluation", "design", questions, brief, questions.length
    ? "Ask only unresolved questions. Infer from the lesson or prior assignments only when the source supports it, and record each inference."
    : "Propose one or two feasible modalities, then draft an evaluation artifact with tasks, evidence, criteria, AI-use policy, and effort estimates. If no resources were supplied, assume only ordinary paper/chat materials. Call asfai_evidence validate_evaluation before saving.");
}

export function prepareTransform(input: unknown) {
  const brief = transformIntakeSchema.parse(input);
  const questions: z.infer<typeof workflowQuestionSchema>[] = [];
  if (!brief.sourceRef) questions.push(question("source", "Which existing document or asset should I use?", "A transformation needs a source artifact."));
  if (!brief.operation) questions.push(question("operation", "What should change about it?", "The transformation must have a defined operation.", ["Translate", "Adapt reading level", "Design slides", "Create audio or podcast script", "Create a task list", "Convert format", "Other"]));
  if (!brief.targetRepresentation) questions.push(question("target", "What output format would you like?", "The deliverable must have an explicit representation."));
  if (brief.operation === "translate" && !brief.targetLanguage) questions.push(question("language", "Which language and locale should I translate into?", "Translation requires a target language."));
  if (brief.operation === "adapt-reading-level" && !brief.targetAudience) questions.push(question("audience", "Who should the adapted version be written for?", "Reading-level adaptation depends on the reader."));
  return response("Transform", "prepare", questions, brief, questions.length
    ? "Ask the unresolved questions and inspect the existing source before generating anything."
    : "Use the host's available document, presentation, audio, or writing capability; preserve source fidelity, attribution, accessibility, and an output reference. Call asfai_resource validate_transform before saving. If the host cannot produce the requested media, provide a truthful editable plan or script instead.");
}

export function validateLessonOutline(input: unknown) {
  const outline = lessonOutlineSchema.parse(input);
  const sectionIds = outline.sections.map((item) => item.id);
  const authorized = verifyReceipt(outline.draftAuthorization, draftPayload(outline));
  const errors = [
    ...(!authorized ? ["Outline is not authorized by a completed clarification round. Surface prepare_outline questions, then submit the teacher's answers with the clarification receipt before drafting."] : []),
    ...(new Set(sectionIds).size !== sectionIds.length ? ["Section IDs must be unique."] : []),
    ...(outline.status === "reviewed" && outline.unresolvedDecisions.length ? ["Resolve open decisions before marking the outline reviewed."] : []),
  ];
  return { valid: errors.length === 0, outline, errors, nextState: outline.status === "draft" ? "reviewed" : "lesson-plan-draft" };
}

export function validateEvaluationDesign(input: unknown) {
  const evaluation = evaluationDesignSchema.parse(input);
  const outcomes = new Set(evaluation.learningOutcomes.map((item) => item.id));
  const unknown = evaluation.tasks.flatMap((task) => task.outcomeIds.filter((id) => !outcomes.has(id)));
  const unassessed = evaluation.learningOutcomes.filter((outcome) => !evaluation.tasks.some((task) => task.outcomeIds.includes(outcome.id)));
  const missingCriteria = evaluation.learningOutcomes.filter((outcome) => !evaluation.criteria.some((criterion) => criterion.outcomeId === outcome.id));
  const teacherMinutes = evaluation.tasks.reduce((total, task) => total + task.estimatedTeacherMinutes, 0);
  const invalidCriteria = evaluation.criteria.filter((criterion) => !outcomes.has(criterion.outcomeId));
  const errors = [
    ...unknown.map((id) => `Task refers to unknown outcome '${id}'.`),
    ...unassessed.map((item) => `Outcome '${item.id}' has no evaluation task.`),
    ...missingCriteria.map((item) => `Outcome '${item.id}' has no evaluation criterion.`),
    ...invalidCriteria.map((item) => `Criterion refers to unknown outcome '${item.outcomeId}'.`),
    ...(teacherMinutes > evaluation.teacherTimeBudgetMinutes ? ["Estimated teacher review time exceeds the stated budget."] : []),
    ...(!evaluation.sourceRefs.includes(evaluation.lessonPlanRef) ? ["The evaluation must cite its source lesson plan."] : []),
  ];
  return { valid: errors.length === 0, evaluation, errors, teacherMinutes, unassessedOutcomeIds: unassessed.map((item) => item.id) };
}

export function validateTransformArtifact(input: unknown) {
  const artifact = transformArtifactSchema.parse(input);
  const errors = [
    ...(artifact.operation === "translate" && !artifact.targetLanguage ? ["Translation requires a target language."] : []),
    ...(artifact.operation === "adapt-reading-level" && !artifact.targetAudience ? ["Reading-level adaptation requires a target audience."] : []),
    ...(artifact.outputRef && artifact.outputRef === artifact.sourceRef ? ["A transformation must not overwrite its source asset."] : []),
    ...(!artifact.sourceRefs.includes(artifact.sourceRef) ? ["The transformation must cite its source asset."] : []),
  ];
  return { valid: errors.length === 0, artifact, errors };
}
