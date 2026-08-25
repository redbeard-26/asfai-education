import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  ClassroomConnectorService,
  classroomAssignmentExportSchema,
  classroomEvaluationExportSchema,
  classroomProviderSchema,
  classroomRoleSchema,
  classroomWorkExportSchema,
} from "@/lib/classroom-connectors/contract";
import { GoogleClassroomAdapter } from "@/lib/classroom-connectors/google";
import { DeviceProtectedStorage, serverStorageProtector } from "@/lib/device-protected-storage";
import { PersonalStorageService, personalDocumentKinds } from "@/lib/personal-storage";
import { asfaiEducationBaseUrl, signCallbackToken } from "@/lib/remote-oauth";

export const privateStorageActionSchema = z.enum([
  "status", "connect_pod", "forget_pod_authorization", "load", "save", "identity", "sign", "verify_signature",
]);

export const classroomActionSchema = z.enum([
  "status", "connect", "disconnect", "forget_authorization", "list_courses", "list_learners", "list_assignments",
  "import_work", "create_assignment", "export_work", "return_evaluation",
]);

function remoteRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.ASFAI_REMOTE_DATA_DIR ?? "/var/lib/asfai");
}

function tenantSegment(tenantId: string) {
  return createHash("sha256").update(tenantId).digest("hex");
}

function tenantRoot(tenantId: string) {
  return path.join(remoteRoot(), "tenants", tenantSegment(tenantId));
}

function protector() {
  return serverStorageProtector(process.env.ASFAI_REMOTE_ENCRYPTION_KEY ?? "");
}

export function remotePersonalStorage(tenantId: string) {
  return new PersonalStorageService(tenantRoot(tenantId), {
    createDeviceStorage: (filePath) => new DeviceProtectedStorage(filePath, protector()),
  });
}

function googleCallbackUrl() {
  return `${asfaiEducationBaseUrl()}/oauth/google/callback`;
}

export function remoteGoogleAdapter(tenantId: string, callbackState?: string) {
  return new GoogleClassroomAdapter({
    authorizationStorage: new DeviceProtectedStorage(path.join(tenantRoot(tenantId), "asfai", "auth", "google-classroom-session.protected.json"), protector()),
    redirectUrl: googleCallbackUrl(),
    stateFactory: callbackState ? () => callbackState : () => signCallbackToken(tenantId, "google-callback"),
  });
}

function publicStorageResult(value: Record<string, unknown>) {
  const mode = value.mode === "solid" ? "solid_pod" : "asfai_cloud_fallback";
  return {
    ...value,
    mode,
    baseDirectory: undefined,
    location: mode === "solid_pod" ? value.location : "asfai-private://current-connector",
    primaryStore: "solid_pod",
    fallbackStore: "asfai_cloud_fallback",
    storageRule: "Use the connected Solid Pod whenever available. The encrypted ASFAI connector store is a fallback and is never presented as a Pod save.",
  };
}

export async function remoteStorageAction(action: z.infer<typeof privateStorageActionSchema>, payload: Record<string, unknown>, tenantId: string) {
  const storage = remotePersonalStorage(tenantId);
  if (action === "status") return publicStorageResult(await storage.status());
  if (action === "connect_pod") {
    const input = z.object({ podRoot: z.string().url(), oidcIssuer: z.string().url() }).parse(payload);
    const callbackToken = signCallbackToken(tenantId, "solid-callback");
    const callbackUrl = `${asfaiEducationBaseUrl()}/oauth/solid/callback/${encodeURIComponent(callbackToken)}`;
    return publicStorageResult(await storage.connectSolid({ ...input, callbackUrl }));
  }
  if (action === "forget_pod_authorization") return publicStorageResult(await storage.forgetSolidAuthorization());
  if (action === "load") {
    const input = z.object({ document: z.enum(personalDocumentKinds), ownerRole: z.enum(["learner", "teacher"]).optional() }).parse(payload);
    return publicStorageResult(await storage.load(input.document, input.ownerRole));
  }
  if (action === "save") {
    const input = z.object({ document: z.enum(personalDocumentKinds), value: z.unknown(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional() }).parse(payload);
    return publicStorageResult(await storage.save(input.document, input.value, input.expectedDigest));
  }
  if (action === "identity") return storage.identity();
  if (action === "sign") return storage.sign(payload.value);
  const input = z.object({ value: z.unknown(), signature: z.string(), publicKeyPem: z.string() }).parse(payload);
  return storage.verify(input.value, input.signature, input.publicKeyPem);
}

export async function remoteClassroomAction(action: z.infer<typeof classroomActionSchema>, payload: Record<string, unknown>, tenantId: string) {
  const provider = classroomProviderSchema.parse(payload.provider);
  const classrooms = new ClassroomConnectorService([remoteGoogleAdapter(tenantId)]);
  const adapter = classrooms.adapter(provider);
  const page = z.object({ pageSize: z.number().int().min(1).max(100).optional(), pageToken: z.string().min(1).optional() }).parse(payload);
  if (action === "status") return adapter.status();
  if (action === "connect") {
    const input = z.object({
      role: classroomRoleSchema,
      readOnly: z.boolean().default(true),
      includeDriveContent: z.boolean().default(false),
    }).parse(payload);
    return adapter.connect(input);
  }
  if (action === "disconnect") return adapter.disconnect();
  if (action === "forget_authorization") return adapter.forgetAuthorization();
  if (action === "list_courses") return adapter.listCourses(page);
  if (action === "list_learners") {
    const input = z.object({ courseId: z.string().min(1) }).parse(payload);
    return adapter.listLearners({ ...page, ...input });
  }
  if (action === "list_assignments") {
    const input = z.object({ courseId: z.string().min(1) }).parse(payload);
    return adapter.listAssignments({ ...page, ...input });
  }
  if (action === "import_work") {
    const input = z.object({
      courseId: z.string().min(1), assignmentId: z.string().min(1), submissionId: z.string().min(1).optional(),
      userId: z.string().min(1).optional(), objectiveIds: z.array(z.string().min(1)).max(100).default([]),
      includeAttachmentContent: z.boolean().default(false), maxContentBytes: z.number().int().min(1024).max(1_000_000).default(200_000),
    }).parse(payload);
    return adapter.importWork({ ...page, ...input });
  }
  if (action === "create_assignment") {
    const input = z.object({
      courseId: z.string().min(1), assignment: classroomAssignmentExportSchema,
      objectiveIds: z.array(z.string().min(1)).max(100).default([]), confirmed: z.boolean().default(false),
    }).parse(payload);
    return adapter.createAssignment(input);
  }
  if (action === "export_work") {
    const input = z.object({
      courseId: z.string().min(1), assignmentId: z.string().min(1), submissionId: z.string().min(1),
      work: classroomWorkExportSchema, objectiveIds: z.array(z.string().min(1)).max(100).default([]), confirmed: z.boolean().default(false),
    }).parse(payload);
    return adapter.exportWork(input);
  }
  const input = z.object({
    courseId: z.string().min(1), assignmentId: z.string().min(1), submissionId: z.string().min(1),
    evaluation: classroomEvaluationExportSchema, objectiveIds: z.array(z.string().min(1)).max(100).default([]), confirmed: z.boolean().default(false),
  }).parse(payload);
  return adapter.returnEvaluation(input);
}
