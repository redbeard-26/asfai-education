import { z } from "zod";

export const LESSON_SCHEMA_VERSION = "0.1" as const;
export const LESSON_RUN_SCHEMA_VERSION = "0.1" as const;
export const PROGRESS_ENVELOPE_SCHEMA_VERSION = "0.1" as const;

const timestampSchema = z.string().datetime({ offset: true });
const identifierSchema = z.string().min(1).max(300);

export const objectiveAlignmentSchema = z.object({
  objectiveId: identifierSchema,
  name: z.string().min(1).max(300),
  description: z.string().min(1).max(2000).optional(),
  alignmentType: z.enum(["teaches", "practices", "elicits"]),
  source: z.string().min(1).max(200).optional(),
  externalAlignments: z
    .array(
      z.object({
        objectiveId: identifierSchema,
        relationship: z.enum(["exactMatch", "closeMatch", "broaderThan", "narrowerThan", "relatedTo"]),
        source: z.string().min(1).max(300),
      }),
    )
    .max(20)
    .optional(),
});

export const artifactManifestSchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(300),
  type: z.enum(["game", "reading", "video", "worksheet", "prompt", "submission-template", "external-link"]),
  version: z.string().min(1).max(100),
  url: z.string().min(1).refine((value) => value.startsWith("/") || URL.canParse(value), {
    message: "Artifact URL must be absolute or root-relative",
  }),
  mediaType: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  telemetrySchema: z.string().min(1).max(200).optional(),
  evidenceAdapter: z.string().min(1).max(200).optional(),
  sandbox: z
    .object({
      allowScripts: z.boolean().default(false),
      allowForms: z.boolean().default(false),
      allowPopups: z.boolean().default(false),
      allowedOrigin: z.string().url(),
    })
    .optional(),
  accessibility: z.object({
    keyboardSupported: z.boolean(),
    touchSupported: z.boolean(),
    fallback: z.string().min(1).max(2000).optional(),
  }),
  license: z.string().min(1).max(300),
});

export const assessmentMethodSchema = z.object({
  id: identifierSchema,
  type: z.enum(["conversation", "game-telemetry", "writing", "performance", "collaboration", "project", "self-reflection"]),
  title: z.string().min(1).max(300),
  objectiveIds: z.array(identifierSchema).min(1).max(30),
  rubricVersion: z.string().min(1).max(100),
  criteria: z
    .array(
      z.object({
        id: identifierSchema,
        description: z.string().min(1).max(2000),
        evidenceDescriptors: z.array(z.string().min(1).max(1000)).min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  policy: z.record(z.string(), z.unknown()).optional(),
  consequential: z.boolean().default(false),
});

export const lessonActivitySchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(4000).optional(),
  type: z.enum(["conversation", "game", "reading", "writing", "performance", "project", "group-work", "reflection"]),
  mode: z.enum(["self-guided", "teacher-led", "collaborative", "hybrid"]),
  objectiveIds: z.array(identifierSchema).min(1).max(30),
  artifactId: identifierSchema.optional(),
  launchParameters: z.record(z.string(), z.string()).optional(),
  instructions: z.object({
    student: z.string().min(1).max(8000),
    assistant: z.string().min(1).max(8000),
    teacher: z.string().min(1).max(8000).optional(),
  }),
  assessmentMethodIds: z.array(identifierSchema).max(20).default([]),
  completion: z.object({
    type: z.enum(["assistant-confirmed", "artifact-result", "teacher-confirmed", "submission", "reflection"]),
    minimumEvidence: z.number().int().min(0).max(100).default(1),
  }),
  estimatedMinutes: z.number().int().min(1).max(600).optional(),
  optional: z.boolean().default(false),
});

export const lessonDefinitionSchema = z.object({
  schemaVersion: z.literal(LESSON_SCHEMA_VERSION),
  id: identifierSchema,
  version: z.string().min(1).max(100),
  status: z.enum(["draft", "published", "retired"]),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(8000),
  audience: z.object({
    ageRangeStart: z.number().int().min(0).max(100).optional(),
    ageRangeEnd: z.number().int().min(0).max(100).optional(),
    description: z.string().min(1).max(1000).optional(),
  }),
  estimatedMinutes: z.number().int().min(1).max(2000),
  interactionModes: z.array(z.enum(["self-guided", "teacher-led", "collaborative", "hybrid"])).min(1),
  objectives: z.array(objectiveAlignmentSchema).min(1).max(100),
  prerequisites: z.array(identifierSchema).max(100).default([]),
  artifacts: z.array(artifactManifestSchema).max(100).default([]),
  assessmentMethods: z.array(assessmentMethodSchema).min(1).max(100),
  activities: z.array(lessonActivitySchema).min(1).max(200),
  report: z.object({
    title: z.string().min(1).max(300),
    includeActivityTimeline: z.boolean().default(true),
    includeObjectiveEvidence: z.boolean().default(true),
    includeArtifacts: z.boolean().default(true),
    includeNextSteps: z.boolean().default(true),
  }),
  provenance: z.object({
    author: z.string().min(1).max(300),
    license: z.string().min(1).max(300),
    sourceUrls: z.array(z.string().url()).max(30).default([]),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  }),
});

export const lessonAssignmentSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: identifierSchema,
  lessonId: identifierSchema,
  lessonVersion: z.string().min(1).max(100),
  title: z.string().min(1).max(300).optional(),
  teacherId: identifierSchema.optional(),
  participantId: identifierSchema.optional(),
  opensAt: timestampSchema.optional(),
  dueAt: timestampSchema.optional(),
  sharePolicy: z.object({
    includeObjectiveSummary: z.boolean().default(true),
    includeEvidenceSummaries: z.boolean().default(true),
    includeRawTelemetry: z.boolean().default(false),
    includeArtifacts: z.boolean().default(false),
  }),
  createdAt: timestampSchema,
});

export const artifactSessionSchema = z.object({
  id: identifierSchema,
  artifactId: identifierSchema,
  activityId: identifierSchema,
  status: z.enum(["created", "started", "completed", "abandoned"]),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  resultRef: z.string().max(2000).optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
});

export const lessonActivityResultSchema = z.object({
  activityId: identifierSchema,
  status: z.enum(["in-progress", "completed", "skipped"]),
  completedAt: timestampSchema.optional(),
  evidenceIds: z.array(identifierSchema).default([]),
  artifactIds: z.array(identifierSchema).default([]),
  summary: z.string().max(4000).optional(),
});

export const lessonRunSchema = z.object({
  schemaVersion: z.literal(LESSON_RUN_SCHEMA_VERSION),
  id: identifierSchema,
  learnerId: identifierSchema,
  lessonId: identifierSchema,
  lessonVersion: z.string().min(1).max(100),
  assignmentId: identifierSchema.optional(),
  status: z.enum(["not-started", "in-progress", "completed", "abandoned"]),
  currentActivityId: identifierSchema.optional(),
  completedActivityIds: z.array(identifierSchema),
  activityResults: z.record(z.string(), lessonActivityResultSchema),
  artifactSessions: z.array(artifactSessionSchema),
  evidenceIds: z.array(identifierSchema),
  claimIds: z.array(identifierSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
});

export const evidenceObservationSchema = z.object({
  id: identifierSchema.optional(),
  objectiveId: identifierSchema,
  activityId: identifierSchema,
  evidenceType: z.enum(["conversation", "game-telemetry", "writing", "performance", "collaboration", "project", "self-reflection"]),
  summary: z.string().min(1).max(4000),
  observedEvidence: z.array(z.string().min(1).max(1000)).min(1).max(30),
  result: z.record(z.string(), z.unknown()).optional(),
  assistance: z.enum(["none", "light", "substantial", "unknown"]).default("unknown"),
  observer: z.object({
    type: z.enum(["ai", "teacher", "peer", "learner", "deterministic"]),
    system: z.string().max(300).optional(),
    version: z.string().max(100).optional(),
  }),
  validityFlags: z.array(z.string().min(1).max(300)).max(30).default([]),
  rawEvidenceRef: z.string().max(2000).optional(),
  occurredAt: timestampSchema,
});

export const lessonReportSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: identifierSchema,
  lessonRunId: identifierSchema,
  lessonId: identifierSchema,
  lessonVersion: z.string().min(1).max(100),
  learnerId: identifierSchema,
  status: z.enum(["in-progress", "completed"]),
  generatedAt: timestampSchema,
  activitySummary: z.array(
    z.object({
      activityId: identifierSchema,
      title: z.string().min(1).max(300),
      status: z.enum(["not-started", "in-progress", "completed", "skipped"]),
      summary: z.string().max(4000).optional(),
    }),
  ),
  objectiveSummary: z.array(
    z.object({
      objectiveId: identifierSchema,
      name: z.string().min(1).max(300),
      evidenceIds: z.array(identifierSchema),
      claimIds: z.array(identifierSchema),
      level: z.enum(["not_observed", "emerging", "developing", "proficient", "mastered"]),
      confidence: z.number().min(0).max(1).optional(),
      caveats: z.array(z.string().max(1000)).default([]),
    }),
  ),
  artifactRefs: z.array(z.string().max(2000)).default([]),
  nextSteps: z.array(z.string().min(1).max(1000)).default([]),
  caveats: z.array(z.string().min(1).max(1000)).default([]),
});

export const progressEnvelopeSchema = z.object({
  schemaVersion: z.literal(PROGRESS_ENVELOPE_SCHEMA_VERSION),
  id: identifierSchema,
  kind: z.enum(["assignment", "progress-update", "submission", "feedback", "report", "receipt"]),
  assignmentId: identifierSchema,
  lessonId: identifierSchema,
  lessonVersion: z.string().min(1).max(100),
  participantId: identifierSchema,
  senderRole: z.enum(["learner", "teacher", "assistant", "peer"]),
  recipientRole: z.enum(["learner", "teacher", "assistant", "peer"]),
  createdAt: timestampSchema,
  consent: z.object({
    objectiveSummary: z.boolean(),
    evidenceSummaries: z.boolean(),
    rawTelemetry: z.boolean(),
    artifacts: z.boolean(),
  }),
  payload: z.record(z.string(), z.unknown()),
  integrity: z.object({
    algorithm: z.literal("sha-256"),
    digest: z.string().regex(/^[a-f0-9]{64}$/i),
  }).optional(),
});

export type LessonDefinition = z.infer<typeof lessonDefinitionSchema>;
export type LessonAssignment = z.infer<typeof lessonAssignmentSchema>;
export type LessonRun = z.infer<typeof lessonRunSchema>;
export type EvidenceObservation = z.infer<typeof evidenceObservationSchema>;
export type LessonReport = z.infer<typeof lessonReportSchema>;
export type ProgressEnvelope = z.infer<typeof progressEnvelopeSchema>;
