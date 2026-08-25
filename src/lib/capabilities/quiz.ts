import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });

export const quizItemSchema = z.object({
  id: z.string(),
  objectiveIds: z.array(z.string()).min(1).max(20),
  prompt: z.string().min(1).max(8000),
  type: z.enum(["multiple-choice", "short-response", "extended-response"]),
  options: z.array(z.string()).min(2).max(10).optional(),
  correctOption: z.number().int().min(0).optional(),
  criteria: z.array(z.string()).min(1).max(20),
  explanation: z.string().max(4000).optional(),
});

export const quizDefinitionSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  instructions: z.string().max(4000),
  status: z.enum(["draft", "published", "retired"]),
  items: z.array(quizItemSchema).min(1).max(200),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const quizAttemptSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  quizId: z.string(),
  quizVersion: z.number().int().positive(),
  participantId: z.string(),
  status: z.enum(["active", "completed", "abandoned"]),
  itemIndex: z.number().int().min(0),
  responses: z.array(z.object({ itemId: z.string(), response: z.unknown(), assistance: z.enum(["none", "light", "substantial", "unknown"]), answeredAt: timestampSchema })),
  startedAt: timestampSchema,
  updatedAt: timestampSchema,
});

export function createQuiz(input: { title: string; instructions?: string; items: unknown[] }) {
  const now = new Date().toISOString();
  const quiz = quizDefinitionSchema.parse({ schemaVersion: "0.1", id: `urn:uuid:${crypto.randomUUID()}`, version: 1, title: input.title, instructions: input.instructions ?? "Answer each question and explain your thinking when asked.", status: "draft", items: input.items.map((item, index) => ({ id: `item-${index + 1}`, ...(item as object) })), createdAt: now, updatedAt: now });
  for (const item of quiz.items) {
    if (item.type === "multiple-choice" && (item.correctOption === undefined || !item.options?.[item.correctOption])) throw new Error(`Multiple-choice item '${item.id}' requires a valid correctOption.`);
  }
  return { quiz };
}

export function publishQuiz(quizInput: unknown) {
  const quiz = quizDefinitionSchema.parse(quizInput);
  if (quiz.status !== "draft") throw new Error("Only a draft quiz can be published.");
  return { quiz: quizDefinitionSchema.parse({ ...quiz, status: "published", updatedAt: new Date().toISOString() }) };
}

export function updateQuiz(quizInput: unknown, patch: Record<string, unknown>) {
  const quiz = quizDefinitionSchema.parse(quizInput);
  if (quiz.status !== "draft") throw new Error("Published or retired quizzes are immutable; fork a new draft.");
  return { quiz: quizDefinitionSchema.parse({ ...quiz, ...patch, id: quiz.id, version: quiz.version + 1, status: "draft", createdAt: quiz.createdAt, updatedAt: new Date().toISOString() }), supersedesVersion: quiz.version };
}

export function retireQuiz(quizInput: unknown) {
  const quiz = quizDefinitionSchema.parse(quizInput);
  if (quiz.status !== "published") throw new Error("Only a published quiz can be retired.");
  return { quiz: quizDefinitionSchema.parse({ ...quiz, status: "retired", updatedAt: new Date().toISOString() }) };
}

export function startQuizAttempt(quizInput: unknown, participantId?: string) {
  const quiz = quizDefinitionSchema.parse(quizInput);
  if (quiz.status !== "published") throw new Error("The quiz must be published before a learner can start it.");
  const now = new Date().toISOString();
  const attempt = quizAttemptSchema.parse({ schemaVersion: "0.1", id: `urn:uuid:${crypto.randomUUID()}`, quizId: quiz.id, quizVersion: quiz.version, participantId: participantId ?? `urn:uuid:${crypto.randomUUID()}`, status: "active", itemIndex: 0, responses: [], startedAt: now, updatedAt: now });
  return { attempt, item: learnerItem(quiz.items[0]), totalItems: quiz.items.length, deliveryRule: "Ask the question directly. Do not mention scoring, tools, rubrics, evidence, or session machinery." };
}

function learnerItem(item: z.infer<typeof quizItemSchema> | undefined) {
  if (!item) return undefined;
  return { id: item.id, objectiveIds: item.objectiveIds, prompt: item.prompt, type: item.type, options: item.options };
}

export function answerQuizItem(input: { quiz: unknown; attempt: unknown; response: unknown; assistance?: "none" | "light" | "substantial" | "unknown" }) {
  const quiz = quizDefinitionSchema.parse(input.quiz);
  const attempt = quizAttemptSchema.parse(input.attempt);
  if (attempt.status !== "active") throw new Error(`Attempt '${attempt.id}' is ${attempt.status}.`);
  if (quiz.id !== attempt.quizId || quiz.version !== attempt.quizVersion) throw new Error("The quiz and attempt versions do not match.");
  const item = quiz.items[attempt.itemIndex];
  if (!item) throw new Error("There is no active quiz item.");
  const response = { itemId: item.id, response: input.response, assistance: input.assistance ?? "unknown" as const, answeredAt: new Date().toISOString() };
  const nextIndex = attempt.itemIndex + 1;
  const updated = quizAttemptSchema.parse({ ...attempt, itemIndex: nextIndex, responses: [...attempt.responses, response], updatedAt: new Date().toISOString() });
  const deterministic = item.type === "multiple-choice" ? { correct: input.response === item.correctOption, explanation: item.explanation } : undefined;
  return { attempt: updated, feedback: deterministic, nextItem: learnerItem(quiz.items[nextIndex]), readyToFinish: nextIndex >= quiz.items.length };
}

export function finishQuizAttempt(input: { quiz: unknown; attempt: unknown; abandon?: boolean }) {
  const quiz = quizDefinitionSchema.parse(input.quiz);
  const attempt = quizAttemptSchema.parse(input.attempt);
  if (quiz.id !== attempt.quizId || quiz.version !== attempt.quizVersion) throw new Error("The quiz and attempt versions do not match.");
  if (!input.abandon && attempt.responses.length !== quiz.items.length) throw new Error("Every quiz item must have a response before finalization.");
  const updated = quizAttemptSchema.parse({ ...attempt, status: input.abandon ? "abandoned" : "completed", updatedAt: new Date().toISOString() });
  const observations = updated.responses.map((response) => {
    const item = quiz.items.find((candidate) => candidate.id === response.itemId)!;
    return { objectiveIds: item.objectiveIds, itemId: item.id, assistance: response.assistance, response: response.response, deterministicCorrect: item.type === "multiple-choice" ? response.response === item.correctOption : undefined, criteria: item.criteria };
  });
  return { attempt: updated, observations, rule: "These are evidence candidates, not mastery. Open responses require criterion-based review, and all evidence must preserve assistance and limitations." };
}
