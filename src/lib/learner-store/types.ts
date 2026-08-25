import type { LessonReport, LessonRun } from "@/lib/lessons/schemas";

export type MasteryLevel =
  | "not_observed"
  | "emerging"
  | "developing"
  | "proficient"
  | "mastered";

export interface EvidenceEvent {
  id: string;
  learnerId: string;
  objectiveId: string;
  occurredAt: string;
  activityId?: string;
  verb: string;
  artifactIds: string[];
  result?: unknown;
  assistance?: unknown;
  source?: { system: string; version?: string };
}

export interface EvidenceArtifact {
  id: string;
  createdAt: string;
  kind: "document" | "image" | "audio" | "video" | "code" | "performance" | "other";
  title?: string;
  mediaType?: string;
  byteLength?: number;
  sha256?: string;
  provenance: { system: string; externalId?: string; url?: string; retrievedAt?: string };
  transcript?: {
    text?: string;
    summary?: string;
    language?: string;
    method: "learner-authored" | "human-transcribed" | "ai-transcribed" | "provider-extracted";
    reviewStatus: "unreviewed" | "reviewed" | "learner-confirmed";
    confidence?: number;
    complete: boolean;
  };
}

export interface AssessmentClaim {
  id: string;
  learnerId: string;
  objectiveId: string;
  evidenceIds: string[];
  level: MasteryLevel;
  confidence?: number;
  rationale?: string;
  assessor?: { type: "ai" | "human" | "deterministic"; system?: string; version?: string };
  createdAt: string;
  supersedes?: string | null;
}

export interface LearnerObjectiveState {
  objectiveId: string;
  level: MasteryLevel;
  confidence?: number;
  supportingEvidenceCount: number;
  independentEvidenceCount?: number;
  lastObservedAt?: string;
  claimIds: string[];
  policyVersion?: string;
}

export interface LearnerProfile {
  schemaVersion: "0.2";
  learnerId: string;
  createdAt: string;
  updatedAt: string;
  evidence: EvidenceEvent[];
  artifacts: Record<string, EvidenceArtifact>;
  assessmentClaims: AssessmentClaim[];
  objectiveStates: Record<string, LearnerObjectiveState>;
  lessonRuns: Record<string, LessonRun>;
  lessonReports: Record<string, LessonReport>;
  preferences?: Record<string, unknown>;
}

export interface LearnerStore {
  readonly kind: "indexeddb" | "solid";
  load(): Promise<LearnerProfile>;
  save(profile: LearnerProfile): Promise<void>;
  appendEvidence(event: EvidenceEvent): Promise<LearnerProfile>;
  appendAssessmentClaim(claim: AssessmentClaim): Promise<LearnerProfile>;
  putObjectiveState(state: LearnerObjectiveState): Promise<LearnerProfile>;
  putLessonRun(run: LessonRun): Promise<LearnerProfile>;
  putLessonReport(report: LessonReport): Promise<LearnerProfile>;
}

export function assertStoredProfileMatches(expected: LearnerProfile, actual: LearnerProfile | undefined) {
  if (!actual) throw new Error("Learner profile was not found after the write completed.");
  const expectedCounts = [
    expected.evidence.length,
    Object.keys(expected.artifacts).length,
    expected.assessmentClaims.length,
    Object.keys(expected.objectiveStates).length,
    Object.keys(expected.lessonRuns).length,
    Object.keys(expected.lessonReports).length,
  ];
  const actualCounts = [
    actual.evidence.length,
    Object.keys(actual.artifacts).length,
    actual.assessmentClaims.length,
    Object.keys(actual.objectiveStates).length,
    Object.keys(actual.lessonRuns).length,
    Object.keys(actual.lessonReports).length,
  ];
  if (
    actual.learnerId !== expected.learnerId ||
    actual.schemaVersion !== expected.schemaVersion ||
    actual.updatedAt !== expected.updatedAt ||
    actualCounts.some((count, index) => count !== expectedCounts[index])
  ) {
    throw new Error("Learner profile read-back did not match the profile that was written.");
  }
}

export function newLearnerProfile(learnerId = `urn:uuid:${crypto.randomUUID()}`): LearnerProfile {
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

export function migrateLearnerProfile(profile: unknown): LearnerProfile {
  if (!profile || typeof profile !== "object") return newLearnerProfile();
  const value = profile as Partial<LearnerProfile> & { schemaVersion?: string };
  if (!value.learnerId || !value.createdAt || !value.updatedAt) return newLearnerProfile();
  return {
    schemaVersion: "0.2",
    learnerId: value.learnerId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    evidence: Array.isArray(value.evidence) ? value.evidence.map((event) => ({ ...event, artifactIds: event.artifactIds ?? [] })) : [],
    artifacts: value.artifacts ?? {},
    assessmentClaims: Array.isArray(value.assessmentClaims) ? value.assessmentClaims : [],
    objectiveStates: value.objectiveStates ?? {},
    lessonRuns: value.lessonRuns ?? {},
    lessonReports: value.lessonReports ?? {},
    preferences: value.preferences,
  };
}

export function masteredIds(profile: LearnerProfile): string[] {
  return Object.values(profile.objectiveStates)
    .filter((state) => state.level === "mastered")
    .map((state) => state.objectiveId);
}
