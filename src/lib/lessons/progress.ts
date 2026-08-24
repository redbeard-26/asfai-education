import { createHash } from "node:crypto";
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
