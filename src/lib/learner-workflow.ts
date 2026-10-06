import { z } from "zod";
import { driveDocumentLocation } from "@/lib/drive-storage";
import { STORAGE_HOST_CAPABILITIES, storageResource } from "@/lib/storage-resources";
import { lessonReportSchema, lessonRunSchema } from "@/lib/lessons/schemas";

export const ASSESSMENT_POLICY_VERSION = "asfai-assessment-0.2";
export const INLINE_EVIDENCE_TRANSCRIPT_MAX_BYTES = 8 * 1024;

const inlineTranscriptTextSchema = z.string().min(1).superRefine((value, context) => {
  const byteLength = new TextEncoder().encode(value).byteLength;
  if (byteLength > INLINE_EVIDENCE_TRANSCRIPT_MAX_BYTES) {
    context.addIssue({
      code: "custom",
      message: `Inline evidence transcripts are limited to ${INLINE_EVIDENCE_TRANSCRIPT_MAX_BYTES} UTF-8 bytes. Store a summary and external reference instead.`,
    });
  }
});

export const evidenceArtifactSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  kind: z.enum(["document", "image", "audio", "video", "code", "performance", "other"]),
  title: z.string().max(500).optional(),
  mediaType: z.string().max(200).optional(),
  byteLength: z.number().int().min(0).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  provenance: z.object({
    system: z.string().min(1).max(200),
    externalId: z.string().max(2000).optional(),
    url: z.string().url().max(4000).optional(),
    retrievedAt: z.string().optional(),
  }),
  transcript: z.object({
    text: inlineTranscriptTextSchema.optional(),
    summary: z.string().min(1).max(2000).optional(),
    language: z.string().max(100).optional(),
    method: z.enum(["learner-authored", "human-transcribed", "ai-transcribed", "provider-extracted"]),
    reviewStatus: z.enum(["unreviewed", "reviewed", "learner-confirmed"]),
    confidence: z.number().min(0).max(1).optional(),
    complete: z.boolean(),
  }).refine((value) => value.text || value.summary, {
    message: "A transcript must contain inline text or a summary.",
  }).optional(),
});

export const masteryLevelSchema = z.enum([
  "not_observed",
  "emerging",
  "developing",
  "proficient",
  "mastered",
]);

export const evidenceEventSchema = z.object({
  id: z.string(),
  learnerId: z.string(),
  objectiveId: z.string(),
  occurredAt: z.string(),
  activityId: z.string().optional(),
  verb: z.string(),
  artifactIds: z.array(z.string()).default([]),
  result: z.unknown().optional(),
  assistance: z.unknown().optional(),
  source: z.object({ system: z.string(), version: z.string().optional() }).optional(),
});

export const assessmentClaimSchema = z.object({
  id: z.string(),
  learnerId: z.string(),
  objectiveId: z.string(),
  evidenceIds: z.array(z.string()),
  level: masteryLevelSchema,
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
  assessor: z
    .object({
      type: z.enum(["ai", "human", "deterministic"]),
      system: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
  supersedes: z.string().nullable().optional(),
});

export const learnerObjectiveStateSchema = z.object({
  objectiveId: z.string(),
  level: masteryLevelSchema,
  confidence: z.number().min(0).max(1).optional(),
  supportingEvidenceCount: z.number().int().min(0),
  independentEvidenceCount: z.number().int().min(0).optional(),
  lastObservedAt: z.string().optional(),
  claimIds: z.array(z.string()),
  policyVersion: z.string().optional(),
});

export const learnerProfileSchema = z.object({
  schemaVersion: z.enum(["0.1", "0.2"]),
  learnerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  evidence: z.array(evidenceEventSchema),
  artifacts: z.record(z.string(), evidenceArtifactSchema).default({}),
  assessmentClaims: z.array(assessmentClaimSchema),
  objectiveStates: z.record(z.string(), learnerObjectiveStateSchema),
  lessonRuns: z.record(z.string(), lessonRunSchema).default({}),
  lessonReports: z.record(z.string(), lessonReportSchema).default({}),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export const learningInteractionSchema = z.object({
  prompt: z.string().min(1).max(4000).describe("Question or task presented to the learner"),
  responseSummary: z
    .string()
    .min(1)
    .max(4000)
    .describe("Concise summary of what the learner demonstrated; avoid unnecessary personal data"),
  evaluatorFeedback: z.string().max(2000).optional(),
});

export const storageTargetSchema = z.object({
  mode: z.enum(["indexeddb", "local_file", "solid_pod", "google_drive"]).default("local_file"),
  location: z
    .string()
    .optional()
    .describe("Where the store keeps the profile; the storage resource for the mode says what to put here"),
});

export type MasteryLevel = z.infer<typeof masteryLevelSchema>;
export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;
export type LearnerProfileInput = z.infer<typeof learnerProfileSchema>;
export type LearnerProfile = Omit<LearnerProfileInput, "schemaVersion"> & { schemaVersion: "0.2" };
export type LearningInteraction = z.infer<typeof learningInteractionSchema>;
export type StorageTarget = z.infer<typeof storageTargetSchema>;

export interface RecordEvidenceInput {
  profile?: LearnerProfileInput;
  objectiveId: string;
  interactions: LearningInteraction[];
  observedEvidence: string[];
  level: Exclude<MasteryLevel, "not_observed">;
  confidence: number;
  rationale: string;
  assistance: "none" | "light" | "substantial";
  assessorSystem: string;
  assessorVersion?: string;
  storage?: StorageTarget;
}

function uuidUrn() {
  return `urn:uuid:${crypto.randomUUID()}`;
}

export function newLearnerProfile(learnerId = uuidUrn()): LearnerProfile {
  const now = new Date().toISOString();
  return {
    schemaVersion: "0.2",
    learnerId,
    createdAt: now,
    updatedAt: now,
    evidence: [],
    artifacts: {},
    assessmentClaims: [],
    objectiveStates: {},
    lessonRuns: {},
    lessonReports: {},
  };
}

export function migrateLearnerProfile(profile?: LearnerProfileInput): LearnerProfile {
  if (!profile) return newLearnerProfile();
  return {
    ...profile,
    schemaVersion: "0.2",
    artifacts: profile.artifacts ?? {},
    lessonRuns: profile.lessonRuns ?? {},
    lessonReports: profile.lessonReports ?? {},
  };
}

export function masteredIds(profile?: LearnerProfileInput): string[] {
  if (!profile) return [];
  return Object.values(profile.objectiveStates)
    .filter((state) => state.level === "mastered")
    .map((state) => state.objectiveId);
}

export function resolveMasteredIds(profile?: LearnerProfileInput, explicitIds: string[] = []): string[] {
  return [...new Set([...masteredIds(profile), ...explicitIds])];
}

export function summarizeLearnerProfile(profile?: LearnerProfileInput) {
  const current = migrateLearnerProfile(profile);
  const byLevel = Object.values(current.objectiveStates).reduce<Record<MasteryLevel, number>>(
    (counts, state) => {
      counts[state.level] += 1;
      return counts;
    },
    { not_observed: 0, emerging: 0, developing: 0, proficient: 0, mastered: 0 },
  );
  return {
    learnerId: current.learnerId,
    schemaVersion: current.schemaVersion,
    updatedAt: current.updatedAt,
    evidenceEventCount: current.evidence.length,
    artifactCount: Object.keys(current.artifacts).length,
    assessmentClaimCount: current.assessmentClaims.length,
    objectiveCount: Object.keys(current.objectiveStates).length,
    byLevel,
    masteredIds: masteredIds(current),
  };
}

export function persistenceFor(storage?: StorageTarget) {
  const target = storage ?? { mode: "local_file" as const, location: "asfai/learner.json" };
  const common = {
    mode: target.mode,
    contentType: "application/json",
    requiredCapability: STORAGE_HOST_CAPABILITIES[target.mode],
    serverRetained: false,
    writeRequired: true,
    resource: storageResource(target.mode),
    instruction: "Save the complete returned profile by following the storage resource named here, and say it is saved only after its read-back check succeeds.",
  };
  if (target.mode === "google_drive") return { ...driveDocumentLocation("learner", target.location), ...common };
  if (target.mode === "indexeddb") {
    return {
      ...common,
      location: "indexeddb://asfai-education/learner-profile/current",
      database: "asfai-education",
      databaseVersion: 1,
      objectStore: "learner-profile",
      key: "current",
    };
  }
  if (target.mode === "solid_pod") {
    if (!target.location) throw new Error("A store root or learner profile URL is required for this storage target.");
    const location = target.location.endsWith("learner.json")
      ? target.location
      : `${target.location.replace(/\/$/, "")}/asfai/learner.json`;
    const url = new URL(location);
    if (url.protocol !== "https:") throw new Error("This storage target requires an HTTPS URL.");
    return { ...common, location: url.toString() };
  }
  return { ...common, location: target.location || "asfai/learner.json" };
}

function assertEvidencePolicy(input: RecordEvidenceInput) {
  if (input.level === "mastered") {
    if (input.interactions.length < 3) {
      throw new Error("Mastery requires a seed interaction and at least two follow-up interactions.");
    }
    if (input.observedEvidence.length < 2) {
      throw new Error("Mastery requires at least two distinct observed evidence descriptors.");
    }
    if (input.confidence < 0.7) {
      throw new Error("Mastery requires confidence of at least 0.7.");
    }
    if (input.assistance === "substantial") {
      throw new Error("Substantially assisted work cannot be recorded as mastered; use developing or proficient.");
    }
  }
  if (input.level === "proficient" && input.interactions.length < 2) {
    throw new Error("Proficient requires at least two learning interactions.");
  }
}

function assistanceLevel(event: LearnerProfile["evidence"][number]) {
  if (!event.assistance || typeof event.assistance !== "object") return undefined;
  return (event.assistance as { level?: unknown }).level;
}

export function recordLearningEvidence(input: RecordEvidenceInput) {
  assertEvidencePolicy(input);
  const profile = migrateLearnerProfile(input.profile);
  const now = new Date().toISOString();
  const evidenceId = uuidUrn();
  const claimId = uuidUrn();
  const priorClaims = profile.assessmentClaims.filter((claim) => claim.objectiveId === input.objectiveId);
  const evidenceEvent: LearnerProfile["evidence"][number] = {
    id: evidenceId,
    learnerId: profile.learnerId,
    objectiveId: input.objectiveId,
    occurredAt: now,
    activityId: uuidUrn(),
    verb: "demonstrated",
    artifactIds: [],
    result: {
      level: input.level,
      confidence: input.confidence,
      interactions: input.interactions,
      observedEvidence: input.observedEvidence,
    },
    assistance: { level: input.assistance },
    source: { system: input.assessorSystem, version: input.assessorVersion },
  };
  const assessmentClaim: LearnerProfile["assessmentClaims"][number] = {
    id: claimId,
    learnerId: profile.learnerId,
    objectiveId: input.objectiveId,
    evidenceIds: [evidenceId],
    level: input.level,
    confidence: input.confidence,
    rationale: input.rationale,
    assessor: { type: "ai", system: input.assessorSystem, version: input.assessorVersion },
    createdAt: now,
    supersedes: priorClaims.at(-1)?.id ?? null,
  };
  const evidence = [...profile.evidence, evidenceEvent];
  const assessmentClaims = [...profile.assessmentClaims, assessmentClaim];
  const objectiveEvidence = evidence.filter((event) => event.objectiveId === input.objectiveId);
  const objectiveClaims = assessmentClaims.filter((claim) => claim.objectiveId === input.objectiveId);
  const objectiveState: LearnerProfile["objectiveStates"][string] = {
    objectiveId: input.objectiveId,
    level: input.level,
    confidence: input.confidence,
    supportingEvidenceCount: objectiveEvidence.length,
    independentEvidenceCount: objectiveEvidence.filter((event) => assistanceLevel(event) === "none").length,
    lastObservedAt: now,
    claimIds: objectiveClaims.map((claim) => claim.id),
    policyVersion: ASSESSMENT_POLICY_VERSION,
  };
  const updatedProfile: LearnerProfile = {
    ...profile,
    updatedAt: now,
    evidence,
    assessmentClaims,
    objectiveStates: { ...profile.objectiveStates, [input.objectiveId]: objectiveState },
  };
  return {
    profile: updatedProfile,
    evidenceEvent,
    assessmentClaim,
    objectiveState,
    persistence: persistenceFor(input.storage),
  };
}
