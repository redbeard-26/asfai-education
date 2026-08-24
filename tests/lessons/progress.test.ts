import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createReportEnvelope, prepareProgressEnvelopeSignature, verifyProgressEnvelope, verifySignedProgressEnvelope } from "@/lib/lessons/progress";
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

  it("prepares owner-side signing and verifies an Ed25519 signature", () => {
    const envelope = createReportEnvelope(assignment, report, "assignment-pseudonym-7");
    const prepared = prepareProgressEnvelopeSignature(envelope);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signature = sign(null, Buffer.from(prepared.signatureRequest.message, "utf8"), privateKey).toString("base64");
    const verified = verifySignedProgressEnvelope({ envelope, signature, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() });
    expect(verified).toMatchObject({ integrityValid: true, signatureValid: true });
    expect("signerFingerprint" in verified ? verified.signerFingerprint : undefined).toMatch(/^[a-f0-9]{64}$/);
  });
});
