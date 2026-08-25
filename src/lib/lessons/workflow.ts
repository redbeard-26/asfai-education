import type {
  LessonActivityResult,
} from "./workflow-types";
import {
  lessonRunSchema,
  type LessonAssignment,
  type LessonDefinition,
  type LessonReport,
  type LessonRun,
} from "@/lib/lessons/schemas";
import type { LearnerProfile } from "@/lib/learner-workflow";

function uuidUrn() {
  return `urn:uuid:${crypto.randomUUID()}`;
}

export function startLessonRun(
  lesson: LessonDefinition,
  learnerId: string,
  assignment?: LessonAssignment,
): LessonRun {
  if (assignment && (assignment.lessonId !== lesson.id || assignment.lessonVersion !== lesson.version)) {
    throw new Error("Assignment does not identify this lesson version.");
  }
  const now = new Date().toISOString();
  return lessonRunSchema.parse({
    schemaVersion: "0.1",
    id: uuidUrn(),
    learnerId,
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    assignmentId: assignment?.id,
    status: "in-progress",
    currentActivityId: lesson.activities[0]?.id,
    completedActivityIds: [],
    activityResults: {},
    artifactSessions: [],
    evidenceIds: [],
    claimIds: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function getNextActivity(lesson: LessonDefinition, run: LessonRun) {
  if (run.lessonId !== lesson.id || run.lessonVersion !== lesson.version) {
    throw new Error("Lesson run belongs to a different lesson version.");
  }
  if (run.status === "completed" || run.status === "abandoned") return null;
  return lesson.activities.find((activity) => !run.completedActivityIds.includes(activity.id)) ?? null;
}

export function recordActivityResult(
  lesson: LessonDefinition,
  run: LessonRun,
  result: LessonActivityResult,
): LessonRun {
  const activity = lesson.activities.find((item) => item.id === result.activityId);
  if (!activity) throw new Error(`Unknown lesson activity '${result.activityId}'.`);
  const now = new Date().toISOString();
  const activityResults = { ...run.activityResults, [result.activityId]: result };
  const completedActivityIds = result.status === "completed" || result.status === "skipped"
    ? [...new Set([...run.completedActivityIds, result.activityId])]
    : run.completedActivityIds;
  const candidate = { ...run, activityResults, completedActivityIds, updatedAt: now };
  const next = getNextActivity(lesson, candidate);
  return lessonRunSchema.parse({
    ...candidate,
    status: next ? "in-progress" : "completed",
    currentActivityId: next?.id,
    completedAt: next ? undefined : now,
  });
}

export function buildLessonReport(
  lesson: LessonDefinition,
  run: LessonRun,
  profile: LearnerProfile,
): LessonReport {
  if (run.learnerId !== profile.learnerId) throw new Error("Lesson run and profile identify different learners.");
  const runEvidence = new Set(run.evidenceIds);
  const runClaims = new Set(run.claimIds);
  return {
    schemaVersion: "0.1",
    id: `urn:asfai:lesson-report:${encodeURIComponent(run.id)}`,
    lessonRunId: run.id,
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    learnerId: profile.learnerId,
    status: run.status === "completed" ? "completed" : "in-progress",
    generatedAt: new Date().toISOString(),
    activitySummary: lesson.activities.map((activity) => ({
      activityId: activity.id,
      title: activity.title,
      status: run.activityResults[activity.id]?.status ?? (run.currentActivityId === activity.id ? "in-progress" : "not-started"),
      summary: run.activityResults[activity.id]?.summary,
    })),
    objectiveSummary: lesson.objectives.map((objective) => {
      const state = profile.objectiveStates[objective.objectiveId];
      return {
        objectiveId: objective.objectiveId,
        name: objective.name,
        evidenceIds: profile.evidence.filter((event) => event.objectiveId === objective.objectiveId && runEvidence.has(event.id)).map((event) => event.id),
        claimIds: profile.assessmentClaims.filter((claim) => claim.objectiveId === objective.objectiveId && runClaims.has(claim.id)).map((claim) => claim.id),
        level: state?.level ?? "not_observed",
        confidence: state?.confidence,
        caveats: [],
      };
    }),
    artifactRefs: run.artifactSessions.flatMap((session) => session.resultRef ? [session.resultRef] : []),
    nextSteps: [],
    caveats: lesson.assessmentMethods.some((method) => method.policy?.calibrationStatus === "pilot")
      ? ["This lesson uses provisional pilot thresholds that are not validated for consequential decisions."]
      : [],
  };
}
