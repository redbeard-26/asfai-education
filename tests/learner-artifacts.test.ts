import { describe, expect, it } from "vitest";
import {
  INLINE_EVIDENCE_TRANSCRIPT_MAX_BYTES,
  evidenceArtifactSchema,
  learnerProfileSchema,
  migrateLearnerProfile,
  newLearnerProfile,
} from "@/lib/learner-workflow";

function classroomArtifact(text: string) {
  return {
    id: "urn:test:artifact:machu-picchu",
    createdAt: "2026-08-24T08:00:00Z",
    kind: "image" as const,
    title: "The mystery of Machu Picchu",
    mediaType: "image/jpeg",
    provenance: {
      system: "google-classroom",
      externalId: "course/assignment/submission/attachment",
    },
    transcript: {
      text,
      method: "ai-transcribed" as const,
      reviewStatus: "unreviewed" as const,
      confidence: 0.84,
      complete: false,
    },
  };
}

describe("learner-owned evidence artifacts", () => {
  it("keeps a small Classroom transcript in the portable learner schema", () => {
    const artifact = classroomArtifact("In the 1400s, the Incas began building Machu Picchu.");
    const profile = newLearnerProfile("urn:test:learner");
    profile.artifacts[artifact.id] = evidenceArtifactSchema.parse(artifact);
    profile.evidence.push({
      id: "urn:test:evidence",
      learnerId: profile.learnerId,
      objectiveId: "mt__MDiDU9Vck",
      occurredAt: "2026-08-24T08:01:00Z",
      verb: "demonstrated",
      artifactIds: [artifact.id],
    });

    expect(learnerProfileSchema.parse(profile).artifacts[artifact.id].transcript?.text).toContain("Machu Picchu");
  });

  it("limits inline transcripts by UTF-8 bytes", () => {
    expect(evidenceArtifactSchema.safeParse(classroomArtifact("a".repeat(INLINE_EVIDENCE_TRANSCRIPT_MAX_BYTES))).success).toBe(true);
    const tooLarge = evidenceArtifactSchema.safeParse(classroomArtifact("a".repeat(INLINE_EVIDENCE_TRANSCRIPT_MAX_BYTES + 1)));
    expect(tooLarge.success).toBe(false);
    expect(tooLarge.error?.issues[0]?.message).toMatch(/8192 UTF-8 bytes/i);
  });

  it("migrates older profiles with empty artifact collections and evidence links", () => {
    const legacy = newLearnerProfile("urn:test:legacy");
    const withoutArtifacts = {
      ...legacy,
      artifacts: undefined,
      evidence: [{
        id: "urn:test:evidence",
        learnerId: legacy.learnerId,
        objectiveId: "mt__MDiDU9Vck",
        occurredAt: legacy.createdAt,
        verb: "demonstrated",
      }],
    };
    const migrated = migrateLearnerProfile(learnerProfileSchema.parse(withoutArtifacts));
    expect(migrated.artifacts).toEqual({});
    expect(migrated.evidence[0].artifactIds).toEqual([]);
  });
});
