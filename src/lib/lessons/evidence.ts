import { z } from "zod";
import {
  evidenceObservationSchema,
  type EvidenceObservation,
  type LessonDefinition,
  type LessonRun,
} from "@/lib/lessons/schemas";
import {
  learnerProfileSchema,
  masteryLevelSchema,
  migrateLearnerProfile,
  persistenceFor,
  type LearnerProfile,
  type LearnerProfileInput,
  type StorageTarget,
} from "@/lib/learner-workflow";
import { recordActivityResult } from "@/lib/lessons/workflow";

export const LESSON_ASSESSMENT_POLICY_VERSION = "asfai-lesson-assessment-0.1";

export const lessonJudgementSchema = z.object({
  objectiveId: z.string().min(1),
  observationIndexes: z.array(z.number().int().min(0)).min(1),
  level: masteryLevelSchema.exclude(["not_observed"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(4000),
});

export interface RecordLessonEvidenceInput {
  profile?: LearnerProfileInput;
  lesson: LessonDefinition;
  run: LessonRun;
  activityId: string;
  observations: EvidenceObservation[];
  judgements: z.infer<typeof lessonJudgementSchema>[];
  completeActivity: boolean;
  activitySummary?: string;
  storage?: StorageTarget;
}

function uuidUrn() {
  return `urn:uuid:${crypto.randomUUID()}`;
}

function assistanceLevel(event: LearnerProfile["evidence"][number]) {
  if (!event.assistance || typeof event.assistance !== "object") return "unknown";
  return (event.assistance as { level?: string }).level ?? "unknown";
}

function evidenceType(event: LearnerProfile["evidence"][number]) {
  if (!event.result || typeof event.result !== "object") return "unknown";
  return (event.result as { evidenceType?: string }).evidenceType ?? "unknown";
}

function assessorType(observer: EvidenceObservation["observer"]) {
  if (observer.type === "ai") return "ai" as const;
  if (observer.type === "deterministic") return "deterministic" as const;
  return "human" as const;
}

function assertJudgementPolicy(
  judgement: z.infer<typeof lessonJudgementSchema>,
  objectiveEvents: LearnerProfile["evidence"],
) {
  if (judgement.level === "proficient" && objectiveEvents.length < 2) {
    throw new Error(`Proficient for '${judgement.objectiveId}' requires at least two evidence observations.`);
  }
  if (judgement.level !== "mastered") return;
  const types = new Set(objectiveEvents.map(evidenceType));
  const independent = objectiveEvents.filter((event) => assistanceLevel(event) === "none");
  if (objectiveEvents.length < 3 || types.size < 2) {
    throw new Error(`Mastery for '${judgement.objectiveId}' requires at least three observations across two evidence types.`);
  }
  if (independent.length < 1) {
    throw new Error(`Mastery for '${judgement.objectiveId}' requires at least one independent observation.`);
  }
  if (judgement.confidence < 0.7) {
    throw new Error(`Mastery for '${judgement.objectiveId}' requires confidence of at least 0.7.`);
  }
  if ([...types].every((type) => type === "self-reflection" || type === "collaboration")) {
    throw new Error(`Self-reflection or group evidence alone cannot establish mastery for '${judgement.objectiveId}'.`);
  }
}

export function recordLessonEvidence(input: RecordLessonEvidenceInput) {
  const profile = migrateLearnerProfile(input.profile);
  const parsedRun = input.run;
  const parsedObservations = input.observations.map((observation) => evidenceObservationSchema.parse(observation));
  const parsedJudgements = input.judgements.map((judgement) => lessonJudgementSchema.parse(judgement));
  if (parsedRun.learnerId !== profile.learnerId) throw new Error("Lesson run and profile identify different learners.");
  if (parsedRun.lessonId !== input.lesson.id || parsedRun.lessonVersion !== input.lesson.version) {
    throw new Error("Lesson run belongs to a different lesson version.");
  }
  const activity = input.lesson.activities.find((item) => item.id === input.activityId);
  if (!activity) throw new Error(`Unknown lesson activity '${input.activityId}'.`);
  const lessonObjectiveIds = new Set(input.lesson.objectives.map((item) => item.objectiveId));
  const now = new Date().toISOString();

  const evidenceEvents = parsedObservations.map((observation) => {
    if (!lessonObjectiveIds.has(observation.objectiveId)) {
      throw new Error(`Observation references objective '${observation.objectiveId}' outside this lesson.`);
    }
    if (observation.activityId !== input.activityId) {
      throw new Error(`Observation activity '${observation.activityId}' does not match '${input.activityId}'.`);
    }
    return {
      id: observation.id ?? uuidUrn(),
      learnerId: profile.learnerId,
      objectiveId: observation.objectiveId,
      occurredAt: observation.occurredAt,
      activityId: `${input.lesson.id}:${input.lesson.version}:${input.activityId}`,
      verb: "demonstrated",
      artifactIds: [],
      result: {
        lessonRunId: parsedRun.id,
        evidenceType: observation.evidenceType,
        summary: observation.summary,
        observedEvidence: observation.observedEvidence,
        details: observation.result,
        validityFlags: observation.validityFlags,
        rawEvidenceRef: observation.rawEvidenceRef,
      },
      assistance: { level: observation.assistance },
      source: {
        system: observation.observer.system ?? `asfai-${observation.observer.type}-observation`,
        version: observation.observer.version,
      },
    } satisfies LearnerProfile["evidence"][number];
  });

  const evidence = [...profile.evidence, ...evidenceEvents];
  const assessmentClaims = [...profile.assessmentClaims];
  const objectiveStates = { ...profile.objectiveStates };
  const newClaimIds: string[] = [];

  for (const judgement of parsedJudgements) {
    if (!lessonObjectiveIds.has(judgement.objectiveId)) {
      throw new Error(`Judgement references objective '${judgement.objectiveId}' outside this lesson.`);
    }
    const selectedEvents = judgement.observationIndexes.map((index) => {
      const event = evidenceEvents[index];
      if (!event) throw new Error(`Judgement observation index '${index}' is out of range.`);
      if (event.objectiveId !== judgement.objectiveId) {
        throw new Error(`Judgement for '${judgement.objectiveId}' includes evidence for '${event.objectiveId}'.`);
      }
      return event;
    });
    const runEvidenceIds = new Set([...parsedRun.evidenceIds, ...evidenceEvents.map((event) => event.id)]);
    const objectiveRunEvidence = evidence.filter(
      (event) => event.objectiveId === judgement.objectiveId && runEvidenceIds.has(event.id),
    );
    assertJudgementPolicy(judgement, objectiveRunEvidence);
    const priorClaims = assessmentClaims.filter((claim) => claim.objectiveId === judgement.objectiveId);
    const firstObservation = parsedObservations[judgement.observationIndexes[0]];
    const claimId = uuidUrn();
    const claim = {
      id: claimId,
      learnerId: profile.learnerId,
      objectiveId: judgement.objectiveId,
      evidenceIds: selectedEvents.map((event) => event.id),
      level: judgement.level,
      confidence: judgement.confidence,
      rationale: judgement.rationale,
      assessor: {
        type: assessorType(firstObservation.observer),
        system: firstObservation.observer.system,
        version: firstObservation.observer.version,
      },
      createdAt: now,
      supersedes: priorClaims.at(-1)?.id ?? null,
    } satisfies LearnerProfile["assessmentClaims"][number];
    assessmentClaims.push(claim);
    newClaimIds.push(claimId);
    const objectiveEvidence = evidence.filter((event) => event.objectiveId === judgement.objectiveId);
    const objectiveClaims = assessmentClaims.filter((item) => item.objectiveId === judgement.objectiveId);
    objectiveStates[judgement.objectiveId] = {
      objectiveId: judgement.objectiveId,
      level: judgement.level,
      confidence: judgement.confidence,
      supportingEvidenceCount: objectiveEvidence.length,
      independentEvidenceCount: objectiveEvidence.filter((event) => assistanceLevel(event) === "none").length,
      lastObservedAt: now,
      claimIds: objectiveClaims.map((item) => item.id),
      policyVersion: LESSON_ASSESSMENT_POLICY_VERSION,
    };
  }

  let run: LessonRun = {
    ...parsedRun,
    evidenceIds: [...new Set([...parsedRun.evidenceIds, ...evidenceEvents.map((event) => event.id)])],
    claimIds: [...new Set([...parsedRun.claimIds, ...newClaimIds])],
    updatedAt: now,
  };
  run = recordActivityResult(input.lesson, run, {
    activityId: input.activityId,
    status: input.completeActivity ? "completed" : "in-progress",
    completedAt: input.completeActivity ? now : undefined,
    evidenceIds: evidenceEvents.map((event) => event.id),
    artifactIds: [],
    summary: input.activitySummary,
  });

  const updatedProfile = learnerProfileSchema.parse({
    ...profile,
    schemaVersion: "0.2",
    updatedAt: now,
    evidence,
    assessmentClaims,
    objectiveStates,
    lessonRuns: { ...profile.lessonRuns, [run.id]: run },
  }) as LearnerProfile;

  return {
    profile: updatedProfile,
    lessonRun: run,
    evidenceEvents,
    assessmentClaims: newClaimIds.map((id) => assessmentClaims.find((claim) => claim.id === id)),
    persistence: persistenceFor(input.storage),
    serverRetainedLearnerData: false,
  };
}
