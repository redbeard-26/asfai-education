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
  result?: unknown;
  assistance?: unknown;
  source?: { system: string; version?: string };
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
  schemaVersion: "0.1";
  learnerId: string;
  createdAt: string;
  updatedAt: string;
  evidence: EvidenceEvent[];
  assessmentClaims: AssessmentClaim[];
  objectiveStates: Record<string, LearnerObjectiveState>;
  preferences?: Record<string, unknown>;
}

export interface LearnerStore {
  readonly kind: "indexeddb" | "solid";
  load(): Promise<LearnerProfile>;
  save(profile: LearnerProfile): Promise<void>;
  appendEvidence(event: EvidenceEvent): Promise<LearnerProfile>;
  appendAssessmentClaim(claim: AssessmentClaim): Promise<LearnerProfile>;
  putObjectiveState(state: LearnerObjectiveState): Promise<LearnerProfile>;
}

export function newLearnerProfile(learnerId = `urn:uuid:${crypto.randomUUID()}`): LearnerProfile {
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

export function masteredIds(profile: LearnerProfile): string[] {
  return Object.values(profile.objectiveStates)
    .filter((state) => state.level === "mastered")
    .map((state) => state.objectiveId);
}
