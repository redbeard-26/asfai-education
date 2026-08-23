import { z } from "zod";

export const ASSESSMENT_POLICY_VERSION = "asfai-assessment-0.2";

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
  schemaVersion: z.literal("0.1"),
  learnerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  evidence: z.array(evidenceEventSchema),
  assessmentClaims: z.array(assessmentClaimSchema),
  objectiveStates: z.record(z.string(), learnerObjectiveStateSchema),
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
  mode: z.enum(["local_file", "solid_pod"]).default("local_file"),
  location: z
    .string()
    .optional()
    .describe("Local profile path, or the learner's HTTPS Pod root/profile URL for solid_pod"),
});

export type MasteryLevel = z.infer<typeof masteryLevelSchema>;
export type LearnerProfile = z.infer<typeof learnerProfileSchema>;
export type LearningInteraction = z.infer<typeof learningInteractionSchema>;
export type StorageTarget = z.infer<typeof storageTargetSchema>;

export interface RecordEvidenceInput {
  profile?: LearnerProfile;
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
    schemaVersion: "0.1",
    learnerId,
    createdAt: now,
    updatedAt: now,
    evidence: [],
    assessmentClaims: [],
    objectiveStates: {},
  };
}

export function masteredIds(profile?: LearnerProfile): string[] {
  if (!profile) return [];
  return Object.values(profile.objectiveStates)
    .filter((state) => state.level === "mastered")
    .map((state) => state.objectiveId);
}

export function resolveMasteredIds(profile?: LearnerProfile, explicitIds: string[] = []): string[] {
  return [...new Set([...masteredIds(profile), ...explicitIds])];
}

export function summarizeLearnerProfile(profile?: LearnerProfile) {
  const current = profile ?? newLearnerProfile();
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
    assessmentClaimCount: current.assessmentClaims.length,
    objectiveCount: Object.keys(current.objectiveStates).length,
    byLevel,
    masteredIds: masteredIds(current),
  };
}

function persistenceFor(storage?: StorageTarget) {
  const target = storage ?? { mode: "local_file" as const, location: "asfai/learner.json" };
  if (target.mode === "solid_pod") {
    if (!target.location) {
      throw new Error("A Solid Pod root or learner profile URL is required for solid_pod storage.");
    }
    const location = target.location.endsWith("learner.json")
      ? target.location
      : `${target.location.replace(/\/$/, "")}/asfai/learner.json`;
    const url = new URL(location);
    if (url.protocol !== "https:") throw new Error("Solid Pod storage requires an HTTPS URL.");
    return {
      mode: target.mode,
      location: url.toString(),
      contentType: "application/json",
      serverRetained: false,
      writeRequired: true,
      instruction:
        "Write the returned profile JSON with the learner's own authenticated Solid fetch. Never send Solid access tokens, passwords, or session cookies to the ASFAI MCP server.",
    };
  }
  return {
    mode: target.mode,
    location: target.location || "asfai/learner.json",
    contentType: "application/json",
    serverRetained: false,
    writeRequired: true,
    instruction:
      "Atomically replace the local learner profile file with the returned profile JSON. The MCP server does not retain a copy.",
  };
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
  const profile = input.profile ?? newLearnerProfile();
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
