import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acceptClassroomEnvelope, newClassroomExchangeStore, queueClassroomEnvelope } from "@/lib/capabilities/personal-state";
import { PersonalStorageService } from "@/lib/personal-storage";
import { createReportEnvelope } from "@/lib/lessons/progress";
import { lessonAssignmentSchema, lessonReportSchema } from "@/lib/lessons/schemas";

function reportEnvelope() {
  const assignment = lessonAssignmentSchema.parse({
    schemaVersion: "0.1", id: "urn:test:assignment", lessonId: "urn:test:lesson", lessonVersion: "1.0.0",
    sharePolicy: { includeObjectiveSummary: true, includeEvidenceSummaries: true, includeRawTelemetry: false, includeArtifacts: false }, createdAt: new Date().toISOString(),
  });
  const report = lessonReportSchema.parse({
    schemaVersion: "0.1", id: "urn:test:report", lessonRunId: "urn:test:run", lessonId: "urn:test:lesson", lessonVersion: "1.0.0", learnerId: "private-learner", status: "completed", generatedAt: new Date().toISOString(), activitySummary: [], objectiveSummary: [], artifactRefs: [], nextSteps: [], caveats: [],
  });
  return createReportEnvelope(assignment, report, "class-pseudonym");
}

describe("personal storage MCP companion", () => {
  it("atomically saves and verifies portable local documents with conflict detection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-personal-storage-"));
    try {
      const storage = new PersonalStorageService(directory);
      const loaded = await storage.load("learner");
      expect(loaded.verified).toBe(true);
      const profile = { ...(loaded.value as Record<string, unknown>), updatedAt: new Date(Date.now() + 1000).toISOString() };
      const saved = await storage.save("learner", profile, loaded.digest);
      expect(saved).toMatchObject({ verified: true, mode: "local" });
      await expect(storage.save("learner", profile, "0".repeat(64))).rejects.toThrow("changed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("signs portable classroom envelopes and rejects replay on receipt", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-personal-storage-"));
    try {
      const storage = new PersonalStorageService(directory);
      const envelope = reportEnvelope();
      const signature = await storage.sign(envelope);
      const signed = { envelope, signature: signature.signature, publicKeyPem: signature.publicKeyPem, signerFingerprint: signature.signerFingerprint };
      const learnerStore = newClassroomExchangeStore("learner", "learner-1");
      expect(queueClassroomEnvelope(learnerStore, signed)).toMatchObject({ duplicate: false });
      const teacherStore = newClassroomExchangeStore("teacher", "teacher-1");
      const accepted = acceptClassroomEnvelope(teacherStore, signed);
      expect(accepted).toMatchObject({ duplicate: false, verified: { integrityValid: true, signatureValid: true } });
      expect(acceptClassroomEnvelope(accepted.store, signed)).toMatchObject({ duplicate: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
