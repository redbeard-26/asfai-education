import { createHash, createPublicKey, verify } from "node:crypto";
import {
  progressEnvelopeSchema,
  type LessonAssignment,
  type LessonReport,
  type ProgressEnvelope,
} from "@/lib/lessons/schemas";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(payload: unknown) {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

export function createReportEnvelope(
  assignment: LessonAssignment,
  report: LessonReport,
  participantId: string,
): ProgressEnvelope {
  if (assignment.lessonId !== report.lessonId || assignment.lessonVersion !== report.lessonVersion) {
    throw new Error("Assignment and report identify different lesson versions.");
  }
  const consent = {
    objectiveSummary: assignment.sharePolicy.includeObjectiveSummary,
    evidenceSummaries: assignment.sharePolicy.includeEvidenceSummaries,
    rawTelemetry: assignment.sharePolicy.includeRawTelemetry,
    artifacts: assignment.sharePolicy.includeArtifacts,
  };
  const payload: Record<string, unknown> = {
    reportId: report.id,
    status: report.status,
    generatedAt: report.generatedAt,
    caveats: report.caveats,
    nextSteps: report.nextSteps,
  };
  if (consent.evidenceSummaries) payload.activitySummary = report.activitySummary;
  if (consent.objectiveSummary) payload.objectiveSummary = report.objectiveSummary;
  if (consent.artifacts) payload.artifactRefs = report.artifactRefs;
  const unsigned = {
    schemaVersion: "0.1" as const,
    id: `urn:uuid:${crypto.randomUUID()}`,
    kind: "report" as const,
    assignmentId: assignment.id,
    lessonId: assignment.lessonId,
    lessonVersion: assignment.lessonVersion,
    participantId,
    senderRole: "learner" as const,
    recipientRole: "teacher" as const,
    createdAt: new Date().toISOString(),
    consent,
    payload,
  };
  return progressEnvelopeSchema.parse({
    ...unsigned,
    integrity: { algorithm: "sha-256", digest: digest(unsigned) },
  });
}

export function verifyProgressEnvelope(input: unknown) {
  const envelope = progressEnvelopeSchema.parse(input);
  if (!envelope.integrity) return { envelope, integrityValid: false };
  const { integrity, ...unsigned } = envelope;
  return { envelope, integrityValid: digest(unsigned) === integrity.digest };
}

export function prepareProgressEnvelopeSignature(input: unknown) {
  const verified = verifyProgressEnvelope(input);
  if (!verified.integrityValid) throw new Error("The envelope integrity digest must be valid before signing.");
  const message = canonical(verified.envelope);
  return {
    envelope: verified.envelope,
    signatureRequest: {
      algorithm: "ed25519",
      messageEncoding: "utf8",
      message,
      messageDigest: digest(message),
    },
    instruction:
      "Sign the exact UTF-8 message with an owner-controlled Ed25519 private key outside the public MCP. Send back only the base64 signature and public verification key; never send the private key.",
  };
}

export function verifySignedProgressEnvelope(input: { envelope: unknown; signature: string; publicKeyPem: string }) {
  const verified = verifyProgressEnvelope(input.envelope);
  if (!verified.integrityValid) return { ...verified, signatureValid: false, reason: "invalid-envelope-integrity" };
  try {
    const publicKey = createPublicKey(input.publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") return { ...verified, signatureValid: false, reason: "unsupported-public-key" };
    const signatureValid = verify(null, Buffer.from(canonical(verified.envelope), "utf8"), publicKey, Buffer.from(input.signature, "base64"));
    return { ...verified, signatureValid, reason: signatureValid ? undefined : "signature-mismatch", signerFingerprint: createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex") };
  } catch {
    return { ...verified, signatureValid: false, reason: "invalid-signature-or-public-key" };
  }
}
