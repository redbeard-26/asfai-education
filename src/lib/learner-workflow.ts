import { z } from "zod";
import { lessonReportSchema, lessonRunSchema } from "@/lib/lessons/schemas";

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
  schemaVersion: z.enum(["0.1", "0.2"]),
  learnerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  evidence: z.array(evidenceEventSchema),
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
  mode: z.enum(["indexeddb", "local_file", "solid_pod"]).default("local_file"),
  location: z
    .string()
    .optional()
    .describe("Local profile path, IndexedDB location, or the learner's HTTPS Pod root/profile URL"),
});

export type MasteryLevel = z.infer<typeof masteryLevelSchema>;
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
    assessmentClaimCount: current.assessmentClaims.length,
    objectiveCount: Object.keys(current.objectiveStates).length,
    byLevel,
    masteredIds: masteredIds(current),
  };
}

export function persistenceFor(storage?: StorageTarget) {
  const target = storage ?? { mode: "local_file" as const, location: "asfai/learner.json" };
  if (target.mode === "indexeddb") {
    return {
      mode: target.mode,
      location: "indexeddb://asfai-education/learner-profile/current",
      database: "asfai-education",
      databaseVersion: 1,
      objectStore: "learner-profile",
      key: "current",
      contentType: "application/json",
      requiredCapability: "Browser JavaScript executing on the ASFAI Education origin with IndexedDB access.",
      serverRetained: false,
      writeRequired: true,
      steps: [
        "Open IndexedDB database 'asfai-education' at version 1.",
        "Create object store 'learner-profile' during upgrade if it does not exist.",
        "In a readwrite transaction, put the complete returned profile at key 'current'.",
        "Wait for the transaction complete event; a successful put request alone is not enough.",
        "Read key 'current' back in a new readonly transaction and verify learnerId, schemaVersion, updatedAt, and collection counts match the returned profile.",
      ],
      instruction:
        "Write and verify the complete returned profile in the ASFAI Education origin's IndexedDB. If this host cannot execute browser JavaScript on that origin, do not claim it was saved; offer a local JSON file or authenticated Solid Pod instead.",
    };
  }
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
      requiredCapability:
        "An authenticated Solid fetch owned by the learner, with write access to the selected Pod root.",
      serverRetained: false,
      writeRequired: true,
      steps: [
        "Confirm the host has a logged-in Solid session and authenticated fetch; never ask the learner to paste a password, token, cookie, or DPoP key into chat.",
        "Resolve the resource to '<pod-root>/asfai/learner.json' and create the 'asfai/' container with the authenticated Solid client if it does not exist.",
        "Read the current resource first. Treat 404 as a new profile, but treat 401 or 403 as an authorization failure that requires reconnecting the Pod.",
        "Write the complete returned profile as application/json using the learner's authenticated fetch. Use the prior ETag with If-Match when the host exposes it; on 412, reload and reconcile instead of overwriting silently.",
        "Read the resource back with the authenticated fetch and verify learnerId, schemaVersion, updatedAt, and collection counts match the returned profile.",
      ],
      instruction:
        "Write and verify the returned profile JSON with the learner's own authenticated Solid fetch. Never send Solid access tokens, passwords, DPoP keys, or session cookies to the ASFAI MCP server. If authenticated Solid fetch is unavailable, do not claim Pod storage succeeded.",
    };
  }
  return {
    mode: target.mode,
    location: target.location || "asfai/learner.json",
    contentType: "application/json",
    requiredCapability: "A host filesystem tool with permission to read, replace, and verify the selected file.",
    serverRetained: false,
    writeRequired: true,
    steps: [
      "Read and parse the existing file before calling personalized or evidence-recording tools; omit learnerProfile only when no file exists.",
      "Write the complete returned profile to a temporary file in the same directory.",
      "Atomically replace the selected learner.json with the temporary file.",
      "Read the file back and verify learnerId, schemaVersion, updatedAt, and collection counts match the returned profile.",
    ],
    instruction:
      "Atomically replace and verify the local learner profile file with the complete returned profile JSON. If this host cannot write files, do not claim it was saved; return a downloadable JSON profile instead.",
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
