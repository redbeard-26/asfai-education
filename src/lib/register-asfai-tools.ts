import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CAPABILITY_CATALOG_DIGEST,
  capabilityAudienceSchema,
  capabilityCounts,
  capabilityModeSchema,
  capabilityRiskSchema,
  getCapability,
  searchCapabilities,
} from "@/lib/capabilities/catalog";
import {
  capabilityRunInputSchema,
  continueLearningSession,
  finishLearningSession,
  learningSessionSchema,
  prepareCapabilityRun,
  startLearningSession,
} from "@/lib/capabilities/execution";
import {
  createCollection,
  createResource,
  deleteResource,
  newEducatorWorkspace,
  parseWorkspace,
  searchWorkspace,
  setResourceStatus,
  updateCollection,
  versionResource,
} from "@/lib/capabilities/workspace";
import { cancelCapabilityJob, capabilityJobSchema, startCapabilityJob, updateCapabilityJob } from "@/lib/capabilities/jobs";
import { createStudentRoom, joinStudentRoom, setStudentRoomStatus, studentRoomSchema, updateStudentRoom } from "@/lib/capabilities/classroom";
import {
  acceptClassroomEnvelope,
  classroomExchangeStoreSchema,
  classroomExchangeSummary,
  newClassroomExchangeStore,
  putClassroomMembership,
  putClassroomRoom,
  queueClassroomEnvelope,
  signedProgressEnvelopeSchema,
} from "@/lib/capabilities/personal-state";
import { answerQuizItem, createQuiz, finishQuizAttempt, publishQuiz, quizAttemptSchema, quizDefinitionSchema, retireQuiz, startQuizAttempt, updateQuiz } from "@/lib/capabilities/quiz";
import { advanceWorkflow, cancelWorkflow, createWorkflow, startWorkflow, workflowCheckpointSchema, workflowDefinitionSchema } from "@/lib/capabilities/workflows";
import { prepareCustomCapabilityPublication, validateCustomCapability } from "@/lib/capabilities/custom";
import {
  addMaterialVersion,
  courseAccessGrantSchema,
  courseKnowledgePackageSchema,
  courseMaterialVersionSchema,
  createCourseAccessGrant,
  createCoursePackage,
  groundedAnswerSchema,
  podObjectReferenceSchema,
  retireMaterialVersion,
  revokeCourseAccessGrant,
  validateCourseAccess,
  validateCoursePackage,
  validateGroundedAnswer,
  versionCoursePackage,
} from "@/lib/capabilities/course-knowledge";
import {
  getObjective,
  learningFrontier,
  learningPath,
  listPrograms,
  neighboringObjectives,
  objectivesInProgram,
  searchObjectives,
} from "@/lib/education-graph";
import {
  learnerProfileSchema,
  learningInteractionSchema,
  masteryLevelSchema,
  migrateLearnerProfile,
  persistenceFor,
  recordLearningEvidence,
  storageTargetSchema,
  summarizeLearnerProfile,
} from "@/lib/learner-workflow";
import { normalizeBlockAlgebraResult } from "@/lib/lessons/adapters/block-algebra";
import { claimArtifactResult, createArtifactLaunch } from "@/lib/lessons/artifact-relay";
import { getLesson, searchLessons } from "@/lib/lessons/catalog";
import { lessonJudgementSchema, recordLessonEvidence } from "@/lib/lessons/evidence";
import { createReportEnvelope, prepareProgressEnvelopeSignature, verifyProgressEnvelope, verifySignedProgressEnvelope } from "@/lib/lessons/progress";
import {
  evidenceObservationSchema,
  lessonAssignmentSchema,
  lessonReportSchema,
  lessonRunSchema,
  progressEnvelopeSchema,
} from "@/lib/lessons/schemas";
import { lessonContentDigest, validateLesson } from "@/lib/lessons/validation";
import { buildLessonReport, getNextActivity, startLessonRun } from "@/lib/lessons/workflow";
import { reviewLesson } from "@/lib/register-lesson-tools";
import { readSkillFiles } from "@/lib/skill-bundle";
import { listSkills } from "@/lib/skills";
import {
  classroomActionSchema,
  privateStorageActionSchema,
  remoteClassroomAction,
  remoteStorageAction,
} from "@/lib/remote-private-tools";

export const ASFAI_DEFAULT_TOOL_NAMES = [
  "asfai_capability",
  "asfai_graph",
  "asfai_run",
  "asfai_session",
  "asfai_lesson",
  "asfai_evidence",
  "asfai_resource",
  "asfai_storage",
  "asfai_classroom",
] as const;

const compactPayloadSchema = z.record(z.string(), z.unknown()).optional();

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function data(input?: Record<string, unknown>) {
  return input ?? {};
}

function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
  if (input && typeof input === "object") {
    return `{${Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`).join(",")}}`;
  }
  return JSON.stringify(input) ?? "null";
}

function digest(input: unknown) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function educationBaseUrl(siteOrigin: string) {
  const origin = siteOrigin.replace(/\/$/, "");
  return origin.endsWith("/education") ? origin : `${origin}/education`;
}

const capabilityActionSchema = z.enum([
  "manifest", "list", "search", "get", "recommend", "list_skills", "get_skill", "install_skill", "validate_custom", "prepare_custom_publication",
]);

const graphActionSchema = z.enum([
  "list_programs", "search_objectives", "get_objective", "get_neighbors", "get_program_objectives", "get_frontier", "find_path",
]);

const sessionActionSchema = z.enum(["start", "resume", "continue", "finish", "join_room", "start_quiz", "answer_quiz", "finish_quiz"]);

const lessonActionSchema = z.enum([
  "prepare_authoring", "search", "get", "validate", "review", "prepare_publication", "create_assignment", "start_run", "next_step", "create_artifact_launch", "claim_artifact_result",
]);

const evidenceActionSchema = z.enum([
  "prepare_assessment", "record_learning", "profile_summary", "record_lesson", "generate_report", "export_progress", "import_progress", "prepare_progress_signature", "verify_signed_progress",
]);

const resourceActionSchema = z.enum([
  "initialize", "search", "get", "create", "version", "delete", "publish", "retire", "create_collection", "update_collection", "share_collection", "revoke_collection", "export", "start_job", "get_job", "update_job", "cancel_job", "create_room", "update_room", "publish_room", "close_room", "create_quiz", "update_quiz", "publish_quiz", "retire_quiz", "create_workflow", "start_workflow", "advance_workflow", "cancel_workflow", "initialize_classroom", "store_room", "store_membership", "queue_exchange", "accept_exchange", "classroom_summary",
  "create_course", "version_course", "add_material", "retire_material", "validate_course", "validate_grounded_answer", "prepare_course_share", "revoke_course_share", "validate_course_access",
]);

const storageActionSchema = z.enum([
  "instructions", "verify", "export", "initialize",
  "status", "connect_pod", "forget_pod_authorization", "load", "save", "identity", "sign", "verify_signature",
  "put_object", "get_object", "head_object", "list_objects", "delete_object",
]);

function persistenceNotice(owner: "learner" | "educator") {
  return {
    owner,
    serverRetained: false,
    verified: false,
    rule: "The caller must complete a host-side write and read-back before saying that data was saved.",
    nextTool: "asfai_storage",
  };
}

async function capabilityAction(action: z.infer<typeof capabilityActionSchema>, payload: Record<string, unknown>, siteOrigin: string) {
  if (action === "manifest") {
    return {
      server: { name: "asfai-learning", version: "2.0.0" },
      catalog: { version: "2.0.0", digest: CAPABILITY_CATALOG_DIGEST, counts: capabilityCounts() },
      defaultTools: ASFAI_DEFAULT_TOOL_NAMES,
      contextBudget: { defaultToolCount: 9, maximumToolCount: 12, serializedCharacterTarget: 8000, serializedCharacterMaximum: 10000 },
      state: "Public graph and capability metadata are cacheable. Private education records and course objects are written only to the user's connected Solid Pod; without one, persistence remains pending.",
    };
  }
  if (action === "list" || action === "search" || action === "recommend") {
    const parsed = z.object({
      query: z.string().max(2000).optional(),
      audience: capabilityAudienceSchema.optional(),
      category: z.string().max(200).optional(),
      mode: capabilityModeSchema.optional(),
      risk: capabilityRiskSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).parse(payload);
    const capabilities = searchCapabilities(parsed);
    return action === "recommend"
      ? {
          recommendations: capabilities.slice(0, parsed.limit ?? 5),
          rule: "Present the smallest useful set, explain data and review requirements, and let the user choose when alternatives materially differ.",
        }
      : { count: capabilities.length, capabilities };
  }
  if (action === "get") {
    const parsed = z.object({ id: z.string(), audience: capabilityAudienceSchema.optional() }).parse(payload);
    const capability = getCapability(parsed.id, parsed.audience);
    if (!capability) throw new Error(`No ASFAI capability '${parsed.id}'.`);
    return capability;
  }
  if (action === "validate_custom") return validateCustomCapability(payload.capability);
  if (action === "prepare_custom_publication") return prepareCustomCapabilityPublication(payload.capability);
  const skills = listSkills();
  if (action === "list_skills") {
    return { skills: skills.map((skill) => ({ name: skill.name, description: skill.description, version: skill.version })) };
  }
  const parsed = z.object({ name: z.string().optional(), delivery: z.enum(["url", "inline"]).optional() }).parse(payload);
  const skill = parsed.name ? skills.find((item) => item.name === parsed.name) : undefined;
  if (!parsed.name) return { skills: skills.map((item) => ({ name: item.name, description: item.description, version: item.version })), next: "Choose a skill by name." };
  if (!skill) throw new Error(`No ASFAI skill '${parsed.name}'.`);
  if (action === "get_skill") return skill;
  if (parsed.delivery === "inline") {
    const files = readSkillFiles(skill.name);
    if (!files) throw new Error(`Could not read files for skill '${skill.name}'.`);
    return { name: skill.name, version: skill.version, delivery: "inline", files };
  }
  return { name: skill.name, version: skill.version, delivery: "url", downloadUrl: `${educationBaseUrl(siteOrigin)}/api/skills/${skill.name}.skill` };
}

async function graphAction(action: z.infer<typeof graphActionSchema>, payload: Record<string, unknown>) {
  if (action === "list_programs") return listPrograms();
  if (action === "search_objectives") {
    const input = z.object({ query: z.string(), limit: z.number().int().min(1).max(100).optional() }).parse(payload);
    return searchObjectives(input.query, input.limit ?? 20);
  }
  if (action === "get_objective") {
    const { id } = z.object({ id: z.string() }).parse(payload);
    const objective = await getObjective(id);
    if (!objective) throw new Error(`No objective '${id}'.`);
    return objective;
  }
  if (action === "get_neighbors") {
    const { id } = z.object({ id: z.string() }).parse(payload);
    const result = await neighboringObjectives(id);
    if (!result) throw new Error(`No objective '${id}'.`);
    return result;
  }
  if (action === "get_program_objectives") {
    const input = z.object({ subject: z.string(), domain: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }).parse(payload);
    return objectivesInProgram(input.subject, input.domain, input.limit ?? 100);
  }
  if (action === "get_frontier") {
    const input = z.object({ masteredIds: z.array(z.string()).default([]), subject: z.string().optional(), domain: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }).parse(payload);
    return learningFrontier(input.masteredIds, input.subject, input.domain, input.limit ?? 25);
  }
  const input = z.object({ targetId: z.string(), masteredIds: z.array(z.string()).default([]) }).parse(payload);
  const path = await learningPath(input.targetId, input.masteredIds);
  if (!path) throw new Error(`No objective '${input.targetId}'.`);
  return { targetId: input.targetId, steps: path.length, path };
}

async function lessonAction(action: z.infer<typeof lessonActionSchema>, payload: Record<string, unknown>, siteOrigin: string) {
  if (action === "prepare_authoring") {
    const input = z.object({ idea: z.string().min(1).max(8000), audience: z.string().min(1).max(2000), constraints: z.array(z.string()).max(30).optional(), preferredModes: z.array(z.string()).max(10).optional() }).parse(payload);
    return {
      brief: input,
      workflow: [
        "Align observable public objectives.",
        "Define acceptable evidence before choosing activities.",
        "Create role-specific activities, artifacts, and accessible fallbacks.",
        "Choose assessment methods for the actual modality and preserve assistance and provenance.",
        "Validate, review, and prepare an immutable publication package.",
      ],
      learnerLanguage: "Write student directions for direct use: state what will be learned or done and ask the actual question. Never expose system machinery.",
    };
  }
  if (action === "search") {
    const input = z.object({ query: z.string().max(1000).default(""), objectiveIds: z.array(z.string()).max(50).optional() }).parse(payload);
    return searchLessons(input.query, siteOrigin, input.objectiveIds);
  }
  if (action === "get") {
    const input = z.object({ id: z.string(), version: z.string().optional() }).parse(payload);
    const lesson = getLesson(input.id, siteOrigin, input.version);
    if (!lesson) throw new Error(`No published lesson '${input.id}'.`);
    return lesson;
  }
  if (action === "validate") return validateLesson(payload.lesson);
  if (action === "review") return reviewLesson(payload.lesson);
  if (action === "prepare_publication") {
    const reviewed = reviewLesson(payload.lesson);
    if (!reviewed.valid || !reviewed.lesson || !("review" in reviewed) || !reviewed.review.publishable) return reviewed;
    const contentDigest = lessonContentDigest(reviewed.lesson);
    return {
      publishable: true,
      digest: contentDigest,
      lessonKey: `lessons/${encodeURIComponent(reviewed.lesson.id)}/${reviewed.lesson.version}/lesson-${contentDigest}.json`,
      artifactKeys: reviewed.lesson.artifacts.map((artifact) => `lessons/${encodeURIComponent(reviewed.lesson!.id)}/${reviewed.lesson!.version}/${artifact.id}/${artifact.sha256 ?? "digest-required"}`),
      confirmation: "An authenticated publisher must preview and explicitly commit this immutable package.",
    };
  }
  if (action === "create_assignment") {
    const input = z.object({
      lessonId: z.string(), lessonVersion: z.string().optional(), title: z.string().max(300).optional(), teacherId: z.string().max(300).optional(), opensAt: z.string().datetime({ offset: true }).optional(), dueAt: z.string().datetime({ offset: true }).optional(),
      sharePolicy: z.object({ includeObjectiveSummary: z.boolean().default(true), includeEvidenceSummaries: z.boolean().default(true), includeRawTelemetry: z.boolean().default(false), includeArtifacts: z.boolean().default(false) }).optional(),
    }).parse(payload);
    const lesson = getLesson(input.lessonId, siteOrigin, input.lessonVersion);
    if (!lesson) throw new Error(`No published lesson '${input.lessonId}'.`);
    const assignment = lessonAssignmentSchema.parse({ schemaVersion: "0.1", id: `urn:uuid:${crypto.randomUUID()}`, lessonId: lesson.id, lessonVersion: lesson.version, title: input.title, teacherId: input.teacherId, opensAt: input.opensAt, dueAt: input.dueAt, sharePolicy: input.sharePolicy ?? {}, createdAt: new Date().toISOString() });
    return { assignment, ...persistenceNotice("educator") };
  }
  if (action === "start_run") {
    const input = z.object({ lessonId: z.string(), lessonVersion: z.string().optional(), learnerProfile: learnerProfileSchema.optional(), assignment: lessonAssignmentSchema.optional(), storage: storageTargetSchema.optional() }).parse(payload);
    const lesson = getLesson(input.lessonId, siteOrigin, input.lessonVersion ?? input.assignment?.lessonVersion);
    if (!lesson) throw new Error(`No published lesson '${input.lessonId}'.`);
    const profile = migrateLearnerProfile(input.learnerProfile);
    const lessonRun = startLessonRun(lesson, profile.learnerId, input.assignment);
    const updatedProfile = { ...profile, updatedAt: new Date().toISOString(), lessonRuns: { ...profile.lessonRuns, [lessonRun.id]: lessonRun } };
    return { lessonRun, nextActivity: getNextActivity(lesson, lessonRun), profile: updatedProfile, persistence: persistenceFor(input.storage), serverRetainedLearnerData: false };
  }
  if (action === "next_step") {
    const { lessonRun } = z.object({ lessonRun: lessonRunSchema }).parse(payload);
    const lesson = getLesson(lessonRun.lessonId, siteOrigin, lessonRun.lessonVersion);
    if (!lesson) throw new Error(`No published lesson '${lessonRun.lessonId}'.`);
    const activity = getNextActivity(lesson, lessonRun);
    if (!activity) return { complete: true, lessonRun };
    return { complete: false, activity, artifact: activity.artifactId ? lesson.artifacts.find((item) => item.id === activity.artifactId) : undefined, assessmentMethods: lesson.assessmentMethods.filter((method) => activity.assessmentMethodIds.includes(method.id)), deliveryRule: "Use student directions naturally and keep orchestration and private assessment criteria out of learner-facing messages." };
  }
  if (action === "create_artifact_launch") {
    const input = z.object({ lessonId: z.string(), lessonVersion: z.string().optional(), activityId: z.string() }).parse(payload);
    const lesson = getLesson(input.lessonId, siteOrigin, input.lessonVersion);
    if (!lesson) throw new Error(`No published lesson '${input.lessonId}'.`);
    const activity = lesson.activities.find((item) => item.id === input.activityId);
    if (!activity?.artifactId) throw new Error(`Activity '${input.activityId}' has no launchable artifact.`);
    const artifact = lesson.artifacts.find((item) => item.id === activity.artifactId);
    if (!artifact) throw new Error(`No artifact '${activity.artifactId}'.`);
    return { ...createArtifactLaunch(artifact.id, artifact.url, activity.launchParameters), privacy: "The pseudonymous single-use result relay expires in one hour and never receives a learner profile." };
  }
  const input = z.object({ lessonId: z.string(), lessonVersion: z.string().optional(), activityId: z.string(), launchId: z.string(), token: z.string() }).parse(payload);
  const lesson = getLesson(input.lessonId, siteOrigin, input.lessonVersion);
  if (!lesson) throw new Error(`No published lesson '${input.lessonId}'.`);
  const activity = lesson.activities.find((item) => item.id === input.activityId);
  if (!activity) throw new Error(`No activity '${input.activityId}'.`);
  const claimed = claimArtifactResult(input.launchId, input.token);
  if (!claimed.ready) return claimed;
  return { ...claimed, ...normalizeBlockAlgebraResult(claimed.result, input.activityId, activity.launchParameters?.evidence === "practice"), next: "Review limitations and ask a natural reasoning follow-up before recording justified evidence." };
}

async function evidenceAction(action: z.infer<typeof evidenceActionSchema>, payload: Record<string, unknown>, siteOrigin: string) {
  if (action === "prepare_progress_signature") return prepareProgressEnvelopeSignature(payload.envelope);
  if (action === "verify_signed_progress") {
    const input = z.object({ envelope: progressEnvelopeSchema, signature: z.string().min(1).max(2000), publicKeyPem: z.string().min(1).max(10000) }).parse(payload);
    return verifySignedProgressEnvelope(input);
  }
  if (action === "prepare_assessment") {
    const input = z.object({ objectiveId: z.string(), masteredIds: z.array(z.string()).default([]) }).parse(payload);
    const neighborhood = await neighboringObjectives(input.objectiveId);
    if (!neighborhood) throw new Error(`No objective '${input.objectiveId}'.`);
    const current = new Set(input.masteredIds);
    const unmet = neighborhood.prerequisites.filter((item) => item.strength === "hard" && !current.has(item.id));
    return {
      objective: neighborhood.objective,
      eligible: unmet.length === 0,
      unmetHardPrerequisites: unmet,
      privateRubric: neighborhood.objective.evidence,
      opening: neighborhood.objective.assessmentPrompt.replace(/\{\{name\}\}/g, neighborhood.objective.name),
      plan: ["Ask the open question.", "Use at least two adaptive follow-ups from different angles.", "Distinguish assistance from independent work.", "Record only demonstrated work with limitations."],
      deliveryRule: "Speak about the subject only. Ask the actual questions and give ordinary teaching feedback; keep rubrics and record-building private.",
    };
  }
  if (action === "record_learning") {
    const input = z.object({ learnerProfile: learnerProfileSchema.optional(), objectiveId: z.string(), interactions: z.array(learningInteractionSchema).min(1).max(20), observedEvidence: z.array(z.string().min(1).max(1000)).min(1).max(20), level: masteryLevelSchema.exclude(["not_observed"]), confidence: z.number().min(0).max(1), rationale: z.string().min(1).max(4000), assistance: z.enum(["none", "light", "substantial"]), assessorSystem: z.string().min(1), assessorVersion: z.string().optional(), storage: storageTargetSchema.optional() }).parse(payload);
    return { ...recordLearningEvidence({ profile: input.learnerProfile, ...input }), serverRetainedLearnerData: false };
  }
  if (action === "profile_summary") {
    const { learnerProfile } = z.object({ learnerProfile: learnerProfileSchema.optional() }).parse(payload);
    return summarizeLearnerProfile(learnerProfile);
  }
  if (action === "record_lesson") {
    const input = z.object({ learnerProfile: learnerProfileSchema.optional(), lessonRun: lessonRunSchema, activityId: z.string(), observations: z.array(evidenceObservationSchema).min(1).max(50), judgements: z.array(lessonJudgementSchema).max(20).default([]), completeActivity: z.boolean().default(true), activitySummary: z.string().max(4000).optional(), storage: storageTargetSchema.optional() }).parse(payload);
    const lesson = getLesson(input.lessonRun.lessonId, siteOrigin, input.lessonRun.lessonVersion);
    if (!lesson) throw new Error(`No published lesson '${input.lessonRun.lessonId}'.`);
    return recordLessonEvidence({ profile: input.learnerProfile, lesson, run: input.lessonRun, activityId: input.activityId, observations: input.observations, judgements: input.judgements, completeActivity: input.completeActivity, activitySummary: input.activitySummary, storage: input.storage });
  }
  if (action === "generate_report") {
    const input = z.object({ learnerProfile: learnerProfileSchema, lessonRun: lessonRunSchema, storage: storageTargetSchema.optional() }).parse(payload);
    const lesson = getLesson(input.lessonRun.lessonId, siteOrigin, input.lessonRun.lessonVersion);
    if (!lesson) throw new Error(`No published lesson '${input.lessonRun.lessonId}'.`);
    const profile = migrateLearnerProfile(input.learnerProfile);
    const report = buildLessonReport(lesson, input.lessonRun, profile);
    const updatedProfile = { ...profile, updatedAt: new Date().toISOString(), lessonRuns: { ...profile.lessonRuns, [input.lessonRun.id]: input.lessonRun }, lessonReports: { ...profile.lessonReports, [report.id]: report } };
    return { report, profile: updatedProfile, persistence: persistenceFor(input.storage), serverRetainedLearnerData: false };
  }
  if (action === "export_progress") {
    const input = z.object({ assignment: lessonAssignmentSchema, report: lessonReportSchema, participantId: z.string().min(1).max(300) }).parse(payload);
    return { envelope: createReportEnvelope(input.assignment, input.report, input.participantId), serverRetainedProgress: false };
  }
  const { envelope } = z.object({ envelope: progressEnvelopeSchema }).parse(payload);
  const verified = verifyProgressEnvelope(envelope);
  return { ...verified, next: verified.integrityValid ? "Review the attributed payload; it must not silently overwrite prior claims." : "Do not import this payload until its integrity is established." };
}

function resourceAction(action: z.infer<typeof resourceActionSchema>, payload: Record<string, unknown>) {
  if (action === "create_course") {
    const input = z.object({
      courseId: z.string().optional(), title: z.string(), description: z.string().optional(),
      owner: z.object({ id: z.string(), webId: z.string().url().optional() }),
      retrievalModes: z.array(z.enum(["host_native", "pod_lexical", "direct_reading"])).optional(),
    }).parse(payload);
    return { course: createCoursePackage(input), ...persistenceNotice("educator") };
  }
  if (action === "version_course") {
    const input = z.object({
      course: courseKnowledgePackageSchema,
      patch: z.object({
        title: z.string().optional(), description: z.string().optional(), status: z.enum(["draft", "published", "retired"]).optional(),
        objectiveIds: z.array(z.string()).optional(), retrievalModes: z.array(z.enum(["host_native", "pod_lexical", "direct_reading"])).optional(),
      }),
    }).parse(payload);
    return { course: versionCoursePackage(input.course, input.patch), ...persistenceNotice("educator") };
  }
  if (action === "add_material") {
    const input = z.object({ course: courseKnowledgePackageSchema, material: courseMaterialVersionSchema }).parse(payload);
    return { course: addMaterialVersion(input.course, input.material), ...persistenceNotice("educator") };
  }
  if (action === "retire_material") {
    const input = z.object({ course: courseKnowledgePackageSchema, materialVersionId: z.string() }).parse(payload);
    return { course: retireMaterialVersion(input.course, input.materialVersionId), ...persistenceNotice("educator") };
  }
  if (action === "validate_course") return validateCoursePackage(payload.course);
  if (action === "validate_grounded_answer") {
    const input = z.object({ candidate: groundedAnswerSchema, chunks: z.array(z.unknown()), allowedMaterialVersionIds: z.array(z.string()) }).parse(payload);
    return validateGroundedAnswer(input.candidate, input.chunks, input.allowedMaterialVersionIds);
  }
  if (action === "prepare_course_share") {
    const input = z.object({
      course: courseKnowledgePackageSchema, manifestRef: podObjectReferenceSchema, recipientId: z.string().optional(),
      expiresAt: z.string().datetime({ offset: true }).optional(), confirmed: z.boolean().default(false),
    }).parse(payload);
    if (!input.confirmed) {
      return {
        preview: { courseId: input.course.courseId, courseVersion: input.course.version, recipientId: input.recipientId, manifestRef: input.manifestRef.href, expiresAt: input.expiresAt },
        confirmationRequired: true,
      };
    }
    return { grant: createCourseAccessGrant(input), signingRequired: true, ...persistenceNotice("educator"), nextTool: "asfai_storage" };
  }
  if (action === "revoke_course_share") {
    const input = z.object({ grant: courseAccessGrantSchema, confirmed: z.boolean().default(false) }).parse(payload);
    if (!input.confirmed) return { preview: { grantId: input.grant.id, status: "revoked" }, confirmationRequired: true };
    return { grant: revokeCourseAccessGrant(input.grant), ...persistenceNotice("educator") };
  }
  if (action === "validate_course_access") {
    const input = z.object({
      grant: courseAccessGrantSchema, recipientId: z.string().optional(), courseId: z.string().optional(),
      courseVersion: z.number().int().positive().optional(), manifestDigest: z.string().optional(),
    }).parse(payload);
    return validateCourseAccess(input.grant, input);
  }
  if (action === "initialize_classroom") {
    const input = z.object({ ownerRole: z.enum(["learner", "teacher"]), ownerId: z.string().optional() }).parse(payload);
    return { store: newClassroomExchangeStore(input.ownerRole, input.ownerId), ...persistenceNotice(input.ownerRole === "teacher" ? "educator" : "learner") };
  }
  if (action === "store_room") {
    const input = z.object({ store: classroomExchangeStoreSchema, room: studentRoomSchema }).parse(payload);
    return { ...putClassroomRoom(input.store, input.room), ...persistenceNotice("educator") };
  }
  if (action === "store_membership") {
    const input = z.object({ store: classroomExchangeStoreSchema, membership: z.unknown() }).parse(payload);
    return { ...putClassroomMembership(input.store, input.membership), ...persistenceNotice("learner") };
  }
  if (action === "queue_exchange" || action === "accept_exchange") {
    const input = z.object({ store: classroomExchangeStoreSchema, signedEnvelope: signedProgressEnvelopeSchema }).parse(payload);
    const result = action === "queue_exchange" ? queueClassroomEnvelope(input.store, input.signedEnvelope) : acceptClassroomEnvelope(input.store, input.signedEnvelope);
    return { ...result, ...persistenceNotice(input.store.ownerRole === "teacher" ? "educator" : "learner") };
  }
  if (action === "classroom_summary") return classroomExchangeSummary(payload.store);
  if (action === "create_workflow") {
    const input = z.object({ title: z.string(), steps: z.array(z.unknown()).min(1).max(100) }).parse(payload);
    return { ...createWorkflow(input), ...persistenceNotice("educator") };
  }
  if (action === "start_workflow") {
    const { workflow } = z.object({ workflow: workflowDefinitionSchema }).parse(payload);
    return { ...startWorkflow(workflow), ...persistenceNotice("educator") };
  }
  if (action === "advance_workflow") {
    const input = z.object({ workflow: workflowDefinitionSchema, checkpoint: workflowCheckpointSchema, stepId: z.string(), result: z.unknown().optional(), failed: z.string().optional(), approved: z.boolean().optional() }).parse(payload);
    return { ...advanceWorkflow(input), ...persistenceNotice("educator") };
  }
  if (action === "cancel_workflow") return { ...cancelWorkflow(payload.checkpoint), ...persistenceNotice("educator") };
  if (action === "create_room") {
    const input = z.object({ title: z.string(), description: z.string().optional(), capabilityIds: z.array(z.string()).min(1), objectiveIds: z.array(z.string()).optional(), resourceIds: z.array(z.string()).optional(), ageRange: z.string(), locale: z.string().optional(), accessMode: z.enum(["code", "link", "roster"]).optional(), rosterRef: z.string().optional(), teacherVisibility: z.enum(["completion", "scoped-progress", "approved-artifacts"]).optional(), allowedSourceRefs: z.array(z.string()).optional(), trustedAdultInstructions: z.string().optional() }).parse(payload);
    return { ...createStudentRoom(input), ...persistenceNotice("educator") };
  }
  if (action === "update_room") {
    const input = z.object({ room: studentRoomSchema, patch: z.record(z.string(), z.unknown()) }).parse(payload);
    return { ...updateStudentRoom(input.room, input.patch), ...persistenceNotice("educator") };
  }
  if (action === "publish_room" || action === "close_room") {
    const input = z.object({ room: studentRoomSchema, confirmed: z.boolean().default(false) }).parse(payload);
    const status = action === "publish_room" ? "published" as const : "closed" as const;
    if (!input.confirmed) return { preview: { roomId: input.room.id, version: input.room.version, status }, confirmationRequired: true, room: input.room };
    return { ...setStudentRoomStatus(input.room, status), ...persistenceNotice("educator") };
  }
  if (action === "create_quiz") {
    const input = z.object({ title: z.string(), instructions: z.string().optional(), items: z.array(z.unknown()) }).parse(payload);
    return { ...createQuiz(input), ...persistenceNotice("educator") };
  }
  if (action === "update_quiz") {
    const input = z.object({ quiz: quizDefinitionSchema, patch: z.record(z.string(), z.unknown()) }).parse(payload);
    return { ...updateQuiz(input.quiz, input.patch), ...persistenceNotice("educator") };
  }
  if (action === "publish_quiz" || action === "retire_quiz") {
    const input = z.object({ quiz: quizDefinitionSchema, confirmed: z.boolean().default(false) }).parse(payload);
    if (!input.confirmed) return { preview: { quizId: input.quiz.id, version: input.quiz.version, status: action === "publish_quiz" ? "published" : "retired" }, confirmationRequired: true, quiz: input.quiz };
    return { ...(action === "publish_quiz" ? publishQuiz(input.quiz) : retireQuiz(input.quiz)), ...persistenceNotice("educator") };
  }
  if (action === "start_job") {
    const input = z.object({ capabilityId: z.string(), input: z.record(z.string(), z.unknown()), contextRefs: z.array(z.string()).max(100).optional() }).parse(payload);
    const result = startCapabilityJob(input);
    return { ...result, ...persistenceNotice(result.capability.mcp.stateOwner === "learner-store" ? "learner" : "educator") };
  }
  if (action === "get_job") return { job: capabilityJobSchema.parse(payload.job), serverRetainedJob: false };
  if (action === "update_job") {
    const input = z.object({ job: capabilityJobSchema, status: z.enum(["running", "completed", "failed"]), progress: z.number().min(0).max(1).optional(), output: z.unknown().optional(), error: z.string().optional(), accessibilityRepresentation: z.unknown().optional(), host: z.string().optional(), model: z.string().optional() }).parse(payload);
    const owner = getCapability(input.job.capabilityId)?.mcp.stateOwner === "learner-store" ? "learner" : "educator";
    return { ...updateCapabilityJob(input), ...persistenceNotice(owner) };
  }
  if (action === "cancel_job") {
    const job = capabilityJobSchema.parse(payload.job);
    const owner = getCapability(job.capabilityId)?.mcp.stateOwner === "learner-store" ? "learner" : "educator";
    return { ...cancelCapabilityJob(job), ...persistenceNotice(owner) };
  }
  if (action === "initialize") return { workspace: newEducatorWorkspace(typeof payload.educatorId === "string" ? payload.educatorId : undefined), ...persistenceNotice("educator") };
  const workspace = parseWorkspace(payload.workspace);
  if (action === "search") return { resources: searchWorkspace(workspace, typeof payload.query === "string" ? payload.query : "") };
  if (action === "get") {
    const { resourceId } = z.object({ resourceId: z.string() }).parse(payload);
    const resource = workspace.resources[resourceId];
    if (!resource) throw new Error(`No educator resource '${resourceId}'.`);
    return resource;
  }
  if (action === "create") {
    const input = z.object({ title: z.string(), kind: z.enum(["document", "collection", "file", "artifact", "capability", "workflow", "room", "quiz", "feedback"]).optional(), content: z.unknown().optional(), contentRef: podObjectReferenceSchema.optional(), author: z.string().optional(), capabilityId: z.string().optional(), capabilityVersion: z.string().optional(), sourceRefs: z.array(z.string()).optional(), license: z.string().optional(), aiGenerated: z.boolean().optional() }).parse(payload);
    return { ...createResource(workspace, input), ...persistenceNotice("educator") };
  }
  if (action === "version") {
    const input = z.object({ resourceId: z.string(), title: z.string().optional(), content: z.unknown().optional(), contentRef: podObjectReferenceSchema.optional() }).parse(payload);
    return { ...versionResource(workspace, input.resourceId, input), ...persistenceNotice("educator") };
  }
  if (action === "delete") {
    const { resourceId } = z.object({ resourceId: z.string() }).parse(payload);
    return { ...deleteResource(workspace, resourceId), ...persistenceNotice("educator") };
  }
  if (action === "publish" || action === "retire") {
    const { resourceId, confirmed } = z.object({ resourceId: z.string(), confirmed: z.boolean().default(false) }).parse(payload);
    if (!confirmed) return { preview: { resourceId, status: action === "publish" ? "published" : "retired" }, confirmationRequired: true, workspace };
    return { ...setResourceStatus(workspace, resourceId, action === "publish" ? "published" : "retired"), ...persistenceNotice("educator") };
  }
  if (action === "create_collection") {
    const input = z.object({ title: z.string(), description: z.string().optional(), resourceIds: z.array(z.string()).optional() }).parse(payload);
    return { ...createCollection(workspace, input), ...persistenceNotice("educator") };
  }
  if (["update_collection", "share_collection", "revoke_collection"].includes(action)) {
    const input = z.object({ collectionId: z.string(), title: z.string().optional(), description: z.string().optional(), resourceIds: z.array(z.string()).optional(), visibility: z.enum(["private", "shared", "public"]).optional(), confirmed: z.boolean().default(false) }).parse(payload);
    const requested = action === "share_collection" ? { ...input, visibility: input.visibility ?? "shared" as const } : action === "revoke_collection" ? { ...input, revoke: true } : input;
    if ((action === "share_collection" || action === "revoke_collection") && !input.confirmed) return { preview: requested, confirmationRequired: true, workspace };
    return { ...updateCollection(workspace, input.collectionId, requested), ...persistenceNotice("educator") };
  }
  return { workspace, digest: digest(workspace), contentType: "application/json", filename: "asfai/educator-workspace.json", serverRetained: false };
}

function educatorPersistence(target?: { mode?: string; location?: string }) {
  const mode = target?.mode ?? "local_file";
  if (mode === "solid_pod") {
    if (!target?.location) throw new Error("A Solid Pod root or resource URL is required.");
    const root = target.location.replace(/\/$/, "");
    const location = root.endsWith(".json") ? root : `${root}/asfai/educator-workspace.json`;
    if (new URL(location).protocol !== "https:") throw new Error("Solid Pod storage requires HTTPS.");
    return { mode, location, requiredCapability: "authenticated_solid_fetch", steps: ["Use the educator's authenticated Solid session; never send credentials to ASFAI.", "Read first and preserve ETag when available.", "Write the complete JSON with application/json.", "Read back and compare digest, schemaVersion, owner identifier, and collection counts."], serverRetained: false };
  }
  if (mode === "indexeddb") return { mode, location: "indexeddb://asfai-education/educator-workspace/current", requiredCapability: "browser_indexeddb", steps: ["Put the complete workspace at key current in a readwrite transaction.", "Wait for transaction completion.", "Read back in a new transaction and compare digest and counts."], serverRetained: false };
  return { mode: "local_file", location: target?.location ?? "asfai/educator-workspace.json", requiredCapability: "local_filesystem", steps: ["Write a temporary JSON file in the same directory.", "Atomically replace the target.", "Read back and compare digest and counts."], serverRetained: false };
}

async function storageAction(action: z.infer<typeof storageActionSchema>, payload: Record<string, unknown>, tenantId?: string) {
  if (privateStorageActionSchema.options.includes(action as z.infer<typeof privateStorageActionSchema>)) {
    if (!tenantId) throw new Error("This private-storage action requires an authenticated ASFAI connector.");
    return remoteStorageAction(action as z.infer<typeof privateStorageActionSchema>, payload, tenantId);
  }
  if (action === "initialize") {
    const owner = z.enum(["learner", "educator"]).parse(payload.owner);
    return owner === "learner" ? { state: migrateLearnerProfile(), ...persistenceNotice("learner") } : { state: newEducatorWorkspace(), ...persistenceNotice("educator") };
  }
  if (action === "instructions") {
    const input = z.object({ owner: z.enum(["learner", "educator"]), target: z.record(z.string(), z.unknown()).optional(), hostCapabilities: z.array(z.string()).max(10).optional() }).parse(payload);
    const target = input.target as { mode?: string; location?: string } | undefined;
    const persistence = input.owner === "learner" ? persistenceFor(storageTargetSchema.parse(input.target ?? { mode: "local_file" })) : educatorPersistence(target);
    const required = target?.mode === "indexeddb" ? "browser_indexeddb" : target?.mode === "solid_pod" ? "authenticated_solid_fetch" : "local_filesystem";
    const capable = input.hostCapabilities ? input.hostCapabilities.includes(required) : null;
    return { persistence, capabilityCheck: { required, capable }, confirmationRule: "Say saved only after a successful write and independent read-back verification." };
  }
  if (action === "verify") {
    const input = z.object({ expected: z.unknown(), actual: z.unknown(), expectedDigest: z.string().optional() }).parse(payload);
    const expectedDigest = input.expectedDigest ?? digest(input.expected);
    const actualDigest = digest(input.actual);
    return { verified: expectedDigest === actualDigest, expectedDigest, actualDigest, rule: expectedDigest === actualDigest ? "The supplied read-back is semantically identical after canonical JSON serialization." : "Do not claim saved; reconcile or retry without silently overwriting." };
  }
  const input = z.object({ owner: z.enum(["learner", "educator"]), state: z.unknown(), filename: z.string().optional() }).parse(payload);
  return { owner: input.owner, state: input.state, digest: digest(input.state), filename: input.filename ?? (input.owner === "learner" ? "asfai/learner.json" : "asfai/educator-workspace.json"), contentType: "application/json", serverRetained: false };
}

function tenantId(extra?: { authInfo?: { extra?: Record<string, unknown> } }) {
  const value = extra?.authInfo?.extra?.tenantId;
  return typeof value === "string" ? value : undefined;
}

export function registerAsfaiTools(server: McpServer, siteOrigin: string) {
  server.registerTool("asfai_capability", { title: "Discover ASFAI capabilities", description: "Catalog, route, and install ASFAI capabilities or workflow guidance.", inputSchema: { action: capabilityActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }) => {
    try { return json(await capabilityAction(action, data(payload), siteOrigin)); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_graph", { title: "Use the public learning graph", description: "Search objectives, prerequisites, frontiers, programs, and paths.", inputSchema: { action: graphActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }) => {
    try { return json(await graphAction(action, data(payload))); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_run", { title: "Prepare or validate an ASFAI capability run", description: "Returns versioned instructions, specialized workflows, validation, and safety contracts for one-shot or job capabilities.", inputSchema: { capabilityId: z.string(), input: z.record(z.string(), z.unknown()), options: compactPayloadSchema } }, async ({ capabilityId, input, options }) => {
    try { return json(prepareCapabilityRun(capabilityRunInputSchema.parse({ capabilityId, input, ...(options ?? {}) }))); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_session", { title: "Continue an interactive learning session", description: "Start, resume, advance, or finish portable learner-facing session state.", inputSchema: { action: sessionActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }) => {
    try {
      const input = data(payload);
      if (action === "join_room") {
        const parsed = z.object({ room: studentRoomSchema, code: z.string().optional(), rosterAuthorized: z.boolean().optional(), participantId: z.string().optional() }).parse(input);
        return json(joinStudentRoom(parsed));
      }
      if (action === "start_quiz") {
        const parsed = z.object({ quiz: quizDefinitionSchema, participantId: z.string().optional() }).parse(input);
        return json(startQuizAttempt(parsed.quiz, parsed.participantId));
      }
      if (action === "answer_quiz") {
        const parsed = z.object({ quiz: quizDefinitionSchema, attempt: quizAttemptSchema, response: z.unknown(), assistance: z.enum(["none", "light", "substantial", "unknown"]).optional() }).parse(input);
        return json(answerQuizItem(parsed));
      }
      if (action === "finish_quiz") {
        const parsed = z.object({ quiz: quizDefinitionSchema, attempt: quizAttemptSchema, abandon: z.boolean().optional() }).parse(input);
        return json(finishQuizAttempt(parsed));
      }
      if (action === "start") { const parsed = z.object({ capabilityId: z.string(), context: z.record(z.string(), z.unknown()).optional() }).parse(input); return json(startLearningSession(parsed.capabilityId, parsed.context)); }
      if (action === "resume") return json({ session: learningSessionSchema.parse(input.session), rule: "Continue in learner language without exposing machinery." });
      if (action === "continue") return json(continueLearningSession({ session: input.session, learnerSummary: typeof input.learnerSummary === "string" ? input.learnerSummary : undefined, assistantSummary: typeof input.assistantSummary === "string" ? input.assistantSummary : undefined, assistance: z.enum(["none", "light", "substantial", "unknown"]).optional().parse(input.assistance), evidenceCandidate: input.evidenceCandidate as never }));
      return json(finishLearningSession({ session: input.session, abandon: input.abandon === true }));
    } catch (error) { return err(error); }
  });
  server.registerTool("asfai_lesson", { title: "Author and run ASFAI lessons", description: "Lesson planning, publication preparation, assignments, activities, and artifact relay.", inputSchema: { action: lessonActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }) => {
    try { return json(await lessonAction(action, data(payload), siteOrigin)); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_evidence", { title: "Record and report learning evidence", description: "Assessment preparation, evidence claims, reports, and scoped progress exchange.", inputSchema: { action: evidenceActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }) => {
    try { return json(await evidenceAction(action, data(payload), siteOrigin)); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_resource", { title: "Manage educator-owned resources", description: "Portable versioned resources, collections, sharing previews, and export.", inputSchema: { action: resourceActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }) => {
    try { return json(resourceAction(action, data(payload))); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_storage", { title: "Connect and use private learning storage", description: "Load or save records and course objects in the user's Solid Pod; also verifies portable host-side storage.", inputSchema: { action: storageActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }, extra) => {
    try { return json(await storageAction(action, data(payload), tenantId(extra))); } catch (error) { return err(error); }
  });
  server.registerTool("asfai_classroom", { title: "Exchange work with a classroom provider", description: "Connect a provider such as Google, import work, create assignments with documents, export learner work, and return approved evaluations.", inputSchema: { action: classroomActionSchema, payload: compactPayloadSchema } }, async ({ action, payload }, extra) => {
    try {
      const owner = tenantId(extra);
      if (!owner) throw new Error("Classroom actions require an authenticated ASFAI connector.");
      return json(await remoteClassroomAction(action, data(payload), owner));
    } catch (error) { return err(error); }
  });
}
