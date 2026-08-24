import { describe, expect, it } from "vitest";
import { createReportEnvelope, verifyProgressEnvelope } from "@/lib/lessons/progress";
import { lessonAssignmentSchema, lessonReportSchema } from "@/lib/lessons/schemas";

const assignment = lessonAssignmentSchema.parse({
  schemaVersion: "0.1",
  id: "urn:test:assignment",
  lessonId: "urn:test:lesson",
  lessonVersion: "1.0.0",
  sharePolicy: {
    includeObjectiveSummary: true,
    includeEvidenceSummaries: true,
    includeRawTelemetry: false,
    includeArtifacts: false,
  },
  createdAt: new Date().toISOString(),
});

const report = lessonReportSchema.parse({
  schemaVersion: "0.1",
  id: "urn:test:report",
  lessonRunId: "urn:test:run",
  lessonId: "urn:test:lesson",
  lessonVersion: "1.0.0",
  learnerId: "urn:private:learner",
  status: "completed",
  generatedAt: new Date().toISOString(),
  activitySummary: [],
  objectiveSummary: [],
  artifactRefs: [],
  nextSteps: [],
  caveats: [],
});

describe("progress envelopes", () => {
  it("excludes the learner's private global identifier and verifies integrity", () => {
    const envelope = createReportEnvelope(assignment, report, "assignment-pseudonym-7");
    expect(JSON.stringify(envelope)).not.toContain(report.learnerId);
    expect(verifyProgressEnvelope(envelope).integrityValid).toBe(true);
  });

  it("detects a changed payload", () => {
    const envelope = createReportEnvelope(assignment, report, "assignment-pseudonym-7");
    const changed = { ...envelope, payload: { ...envelope.payload, status: "changed" } };
    expect(verifyProgressEnvelope(changed).integrityValid).toBe(false);
  });
});
