import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { claimArtifactResult, createArtifactLaunch } from "@/lib/lessons/artifact-relay";
import { normalizeBlockAlgebraResult } from "@/lib/lessons/adapters/block-algebra";
import { getLesson, searchLessons } from "@/lib/lessons/catalog";
import { lessonJudgementSchema, recordLessonEvidence } from "@/lib/lessons/evidence";
import { createReportEnvelope, verifyProgressEnvelope } from "@/lib/lessons/progress";
import {
  evidenceObservationSchema,
  lessonAssignmentSchema,
  lessonDefinitionSchema,
  lessonReportSchema,
  lessonRunSchema,
  progressEnvelopeSchema,
} from "@/lib/lessons/schemas";
import { lessonContentDigest, validateLesson } from "@/lib/lessons/validation";
import { buildLessonReport, getNextActivity, startLessonRun } from "@/lib/lessons/workflow";
import {
  learnerProfileSchema,
  migrateLearnerProfile,
  persistenceFor,
  storageTargetSchema,
} from "@/lib/learner-workflow";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function reviewLesson(input: unknown) {
  const validation = validateLesson(input);
  if (!validation.lesson) return validation;
  const lesson = validation.lesson;
  const coveredObjectives = new Set(lesson.activities.flatMap((activity) => activity.objectiveIds));
  const assessedObjectives = new Set(lesson.assessmentMethods.flatMap((method) => method.objectiveIds));
  const modes = new Set(lesson.activities.map((activity) => activity.type));
  const findings = [...validation.warnings];
  for (const objective of lesson.objectives) {
    if (!coveredObjectives.has(objective.objectiveId)) findings.push(`Objective '${objective.name}' is not covered by an activity.`);
    if (!assessedObjectives.has(objective.objectiveId)) findings.push(`Objective '${objective.name}' has no assessment method.`);
  }
  if (modes.size === 1) findings.push("The lesson uses only one activity type; confirm that this is intentional.");
  if (!lesson.assessmentMethods.some((method) => method.type === "conversation" || method.type === "writing")) {
    findings.push("No explanation or transfer method is present; product or telemetry evidence may be difficult to interpret.");
  }
  return {
    ...validation,
    review: {
      objectiveCount: lesson.objectives.length,
      activityCount: lesson.activities.length,
      artifactCount: lesson.artifacts.length,
      assessmentMethodCount: lesson.assessmentMethods.length,
      activityTypes: [...modes],
      findings,
      publishable: validation.valid && findings.every((item) => !/not covered|no assessment/i.test(item)),
    },
  };
}

export function registerLessonTools(server: McpServer, siteOrigin: string) {
  server.registerTool(
    "prepare_lesson_authoring",
    {
      title: "Prepare a lesson-authoring workflow",
      description:
        "Returns the evidence-centered structure and authoring decisions an AI teacher assistant should use to turn a lesson idea into a validated ASFAI lesson package. It does not publish or retain a draft.",
      inputSchema: {
        idea: z.string().min(1).max(8000),
        audience: z.string().min(1).max(2000),
        constraints: z.array(z.string().min(1).max(1000)).max(30).optional(),
        preferredModes: z.array(z.enum(["self-guided", "teacher-led", "collaborative", "hybrid"])).optional(),
      },
    },
    async ({ idea, audience, constraints, preferredModes }) => json({
      brief: { idea, audience, constraints: constraints ?? [], preferredModes: preferredModes ?? [] },
      workflow: [
        "Use the public objective tools to find or align observable objectives.",
        "Define what observable evidence would support each objective before selecting activities.",
        "Create activities with separate student, teacher, and assistant instructions.",
        "Choose assessment methods appropriate to conversation, telemetry, writing, performance, collaboration, or projects.",
        "Record assistance, provenance, validity limitations, accessibility fallbacks, and licensing.",
        "Call validate_lesson and review_lesson_plan before preparing publication.",
      ],
      learnerLanguage: {
        rule:
          "Student instructions and suggested learner dialogue must say what will be learned or done and ask the actual question in age-appropriate language. Do not mention an interaction, skill, workflow, tool call, MCP, rubric, evidence event, assessment claim, telemetry, or orchestration machinery unless that technology is itself the lesson topic.",
        review:
          "Keep technical orchestration in assistant or teacher fields and verify that every student instruction is usable verbatim.",
      },
      requiredSchema: lessonDefinitionSchema.toJSONSchema(),
      retention: "The MCP server does not retain this authoring brief or draft.",
    }),
  );

  server.registerTool(
    "search_lessons",
    {
      title: "Search published lessons",
      description: "Searches public, versioned ASFAI lessons by text and optional objective identifiers.",
      inputSchema: {
        query: z.string().max(1000).default(""),
        objectiveIds: z.array(z.string()).max(50).optional(),
      },
    },
    async ({ query, objectiveIds }) => json(searchLessons(query, siteOrigin, objectiveIds)),
  );

  server.registerTool(
    "get_lesson",
    {
      title: "Get a published lesson",
      description: "Returns one immutable lesson version with activities, artifacts, assessment methods, and role-specific instructions.",
      inputSchema: { id: z.string(), version: z.string().optional() },
    },
    async ({ id, version }) => {
      const lesson = getLesson(id, siteOrigin, version);
      return lesson ? json(lesson) : err(`No published lesson '${id}'${version ? ` version '${version}'` : ""}.`);
    },
  );

  server.registerTool(
    "validate_lesson",
    {
      title: "Validate a lesson package",
      description: "Validates a complete lesson schema and all internal objective, artifact, assessment-method, and activity references. Nothing is retained.",
      inputSchema: { lesson: z.unknown() },
    },
    async ({ lesson }) => json(validateLesson(lesson)),
  );

  server.registerTool(
    "review_lesson_plan",
    {
      title: "Review a lesson plan",
      description: "Reviews a lesson for objective coverage, assessment coverage, modality breadth, transfer evidence, accessibility, and publication readiness.",
      inputSchema: { lesson: z.unknown() },
    },
    async ({ lesson }) => json(reviewLesson(lesson)),
  );

  server.registerTool(
    "prepare_lesson_publication",
    {
      title: "Prepare an immutable lesson publication",
      description:
        "Validates a lesson and returns its digest and recommended immutable artifact keys. This public MCP does not publish arbitrary teacher HTML; an authenticated publisher must perform the final write.",
      inputSchema: { lesson: z.unknown() },
    },
    async ({ lesson: input }) => {
      const reviewed = reviewLesson(input);
      if (!reviewed.valid || !reviewed.lesson || !("review" in reviewed) || !reviewed.review.publishable) {
        return json(reviewed);
      }
      const digest = lessonContentDigest(reviewed.lesson);
      return json({
        publishable: true,
        digest,
        lessonKey: `lessons/${encodeURIComponent(reviewed.lesson.id)}/${reviewed.lesson.version}/lesson-${digest}.json`,
        artifactKeys: reviewed.lesson.artifacts.map((artifact) =>
          `lessons/${encodeURIComponent(reviewed.lesson!.id)}/${reviewed.lesson!.version}/${artifact.id}/${artifact.sha256 ?? "digest-required"}`,
        ),
        nextStep:
          "Submit this package to the authenticated ASFAI publisher. Publication is intentionally unavailable on the anonymous public MCP endpoint.",
      });
    },
  );

  server.registerTool(
    "create_lesson_assignment",
    {
      title: "Create a portable lesson assignment",
      description: "Creates an assignment envelope for a published lesson. The result is teacher-owned and is not retained by the public server.",
      inputSchema: {
        lessonId: z.string(),
        lessonVersion: z.string().optional(),
        title: z.string().max(300).optional(),
        teacherId: z.string().max(300).optional(),
        opensAt: z.string().datetime({ offset: true }).optional(),
        dueAt: z.string().datetime({ offset: true }).optional(),
        includeObjectiveSummary: z.boolean().default(true),
        includeEvidenceSummaries: z.boolean().default(true),
        includeRawTelemetry: z.boolean().default(false),
        includeArtifacts: z.boolean().default(false),
      },
    },
    async ({ lessonId, lessonVersion, title, teacherId, opensAt, dueAt, ...sharePolicy }) => {
      const lesson = getLesson(lessonId, siteOrigin, lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonId}'.`);
      const assignment = lessonAssignmentSchema.parse({
        schemaVersion: "0.1",
        id: `urn:uuid:${crypto.randomUUID()}`,
        lessonId: lesson.id,
        lessonVersion: lesson.version,
        title,
        teacherId,
        opensAt,
        dueAt,
        sharePolicy,
        createdAt: new Date().toISOString(),
      });
      return json({
        assignment,
        serverRetainedAssignment: false,
        nextStep: "Save this assignment in the teacher-owned store and give each learner a copy or assignment-specific code.",
      });
    },
  );

  server.registerTool(
    "start_lesson_run",
    {
      title: "Start a learner-owned lesson run",
      description: "Creates a lesson run and returns an updated portable learner profile. The MCP server retains neither object.",
      inputSchema: {
        lessonId: z.string(),
        lessonVersion: z.string().optional(),
        learnerProfile: learnerProfileSchema.optional(),
        assignment: lessonAssignmentSchema.optional(),
        storage: storageTargetSchema.optional(),
      },
    },
    async ({ lessonId, lessonVersion, learnerProfile, assignment, storage }) => {
      const lesson = getLesson(lessonId, siteOrigin, lessonVersion ?? assignment?.lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonId}'.`);
      try {
        const profile = migrateLearnerProfile(learnerProfile);
        const run = startLessonRun(lesson, profile.learnerId, assignment);
        const updatedProfile = {
          ...profile,
          updatedAt: new Date().toISOString(),
          lessonRuns: { ...profile.lessonRuns, [run.id]: run },
        };
        return json({
          lessonRun: run,
          nextActivity: getNextActivity(lesson, run),
          profile: updatedProfile,
          persistence: persistenceFor(storage),
          serverRetainedLearnerData: false,
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_next_lesson_step",
    {
      title: "Get the next lesson step",
      description: "Returns the next incomplete activity and its relevant artifacts and assessment methods from a portable lesson run.",
      inputSchema: { lessonRun: lessonRunSchema },
    },
    async ({ lessonRun }) => {
      const lesson = getLesson(lessonRun.lessonId, siteOrigin, lessonRun.lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonRun.lessonId}'.`);
      try {
        const activity = getNextActivity(lesson, lessonRun);
        if (!activity) return json({ complete: true, lessonRun });
        return json({
          complete: false,
          activity,
          artifact: activity.artifactId ? lesson.artifacts.find((item) => item.id === activity.artifactId) : undefined,
          assessmentMethods: lesson.assessmentMethods.filter((method) => activity.assessmentMethodIds.includes(method.id)),
          deliveryRule:
            "Use the student instruction naturally and ask the actual question. Keep assistant instructions, assessment methods, and all orchestration terminology private unless the learner explicitly asks how the system works.",
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "create_artifact_launch",
    {
      title: "Create a short-lived lesson artifact launch",
      description: "Creates a one-hour, pseudonymous, single-result launch for a game artifact. No learner profile or identity is placed in the URL.",
      inputSchema: {
        lessonId: z.string(),
        lessonVersion: z.string().optional(),
        activityId: z.string(),
      },
    },
    async ({ lessonId, lessonVersion, activityId }) => {
      const lesson = getLesson(lessonId, siteOrigin, lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonId}'.`);
      const activity = lesson.activities.find((item) => item.id === activityId);
      if (!activity?.artifactId) return err(`Activity '${activityId}' has no launchable artifact.`);
      const artifact = lesson.artifacts.find((item) => item.id === activity.artifactId);
      if (!artifact) return err(`No artifact '${activity.artifactId}'.`);
      try {
        return json({
          ...createArtifactLaunch(artifact.id, artifact.url, activity.launchParameters),
          privacy: "The relay accepts a minimized summary, retains it for at most one hour, and deletes it after one successful claim.",
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "claim_artifact_result",
    {
      title: "Claim and normalize a lesson artifact result",
      description: "Consumes a completed artifact result once and returns normalized evidence observations and non-binding assessment suggestions.",
      inputSchema: {
        lessonId: z.string(),
        lessonVersion: z.string().optional(),
        activityId: z.string(),
        launchId: z.string(),
        token: z.string(),
      },
    },
    async ({ lessonId, lessonVersion, activityId, launchId, token }) => {
      const lesson = getLesson(lessonId, siteOrigin, lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonId}'.`);
      const activity = lesson.activities.find((item) => item.id === activityId);
      if (!activity) return err(`No activity '${activityId}'.`);
      try {
        const claimed = claimArtifactResult(launchId, token);
        if (!claimed.ready) return json(claimed);
        const normalized = normalizeBlockAlgebraResult(
          claimed.result,
          activityId,
          activity.launchParameters?.evidence === "practice",
        );
        return json({
          ...claimed,
          ...normalized,
          nextStep:
            "Privately review the normalized observations and any caveats, ask the learner a natural reasoning follow-up if needed, then record only justified claims. Do not narrate the telemetry or record-building machinery.",
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "record_lesson_evidence",
    {
      title: "Record lesson evidence and assessment claims",
      description:
        "Adds normalized observations and linked claims to a portable learner profile and lesson run, then returns both for host-side persistence. Nothing is retained by the server.",
      inputSchema: {
        learnerProfile: learnerProfileSchema.optional(),
        lessonRun: lessonRunSchema,
        activityId: z.string(),
        observations: z.array(evidenceObservationSchema).min(1).max(50),
        judgements: z.array(lessonJudgementSchema).max(20).default([]),
        completeActivity: z.boolean().default(true),
        activitySummary: z.string().max(4000).optional(),
        storage: storageTargetSchema.optional(),
      },
    },
    async ({ learnerProfile, lessonRun, activityId, observations, judgements, completeActivity, activitySummary, storage }) => {
      const lesson = getLesson(lessonRun.lessonId, siteOrigin, lessonRun.lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonRun.lessonId}'.`);
      try {
        return json(recordLessonEvidence({
          profile: learnerProfile,
          lesson,
          run: lessonRun,
          activityId,
          observations,
          judgements,
          completeActivity,
          activitySummary,
          storage,
        }));
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "generate_lesson_report",
    {
      title: "Generate a lesson-specific report",
      description: "Builds a report using only evidence and claims linked to one lesson run and returns an updated learner profile for host-side persistence.",
      inputSchema: {
        learnerProfile: learnerProfileSchema,
        lessonRun: lessonRunSchema,
        storage: storageTargetSchema.optional(),
      },
    },
    async ({ learnerProfile, lessonRun, storage }) => {
      const lesson = getLesson(lessonRun.lessonId, siteOrigin, lessonRun.lessonVersion);
      if (!lesson) return err(`No published lesson '${lessonRun.lessonId}'.`);
      try {
        const profile = migrateLearnerProfile(learnerProfile);
        const report = buildLessonReport(lesson, lessonRun, profile);
        const updatedProfile = {
          ...profile,
          updatedAt: new Date().toISOString(),
          lessonRuns: { ...profile.lessonRuns, [lessonRun.id]: lessonRun },
          lessonReports: { ...profile.lessonReports, [report.id]: report },
        };
        return json({ report, profile: updatedProfile, persistence: persistenceFor(storage), serverRetainedLearnerData: false });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "export_progress_update",
    {
      title: "Export a lesson-scoped progress update",
      description: "Creates a pseudonymous, consent-scoped report envelope for a learner to share with a teacher without exposing the full learner profile.",
      inputSchema: {
        assignment: lessonAssignmentSchema,
        report: lessonReportSchema,
        participantId: z.string().min(1).max(300),
      },
    },
    async ({ assignment, report, participantId }) => {
      try {
        return json({ envelope: createReportEnvelope(assignment, report, participantId), serverRetainedProgress: false });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "import_progress_update",
    {
      title: "Verify a lesson progress update",
      description: "Validates a transport-neutral progress or feedback envelope and verifies its content digest before the assistant acts on it.",
      inputSchema: { envelope: progressEnvelopeSchema },
    },
    async ({ envelope }) => {
      try {
        const verified = verifyProgressEnvelope(envelope);
        return json({
          ...verified,
          nextStep: verified.integrityValid
            ? "Review the payload in its stated sender role. Teacher feedback may be recorded as attributed human evidence; it must not silently overwrite prior claims."
            : "Do not import this payload as evidence until its integrity can be established.",
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
