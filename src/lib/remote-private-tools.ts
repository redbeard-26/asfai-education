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
  "put_object", "get_object", "head_object", "list_objects", "delete_object",
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
  const connected = value.mode === "solid" && value.isLoggedIn === true;
  const mode = connected ? "solid_pod" : "not_connected";
  return {
    ...value,
    mode,
    baseDirectory: undefined,
    location: mode === "solid_pod" ? value.location : undefined,
    primaryStore: "solid_pod",
    fallbackStore: null,
    storageRule: connected
      ? "Private education data is read from and written to the connected Solid Pod. ASFAI does not retain a fallback copy."
      : "No private store is connected. Connect a Solid Pod before loading or saving private education data.",
    serverRetainedEducationData: false,
  };
}

function publicPodResult(value: Record<string, unknown>) {
  return {
    ...value,
    mode: "solid_pod",
    primaryStore: "solid_pod",
    fallbackStore: null,
    serverRetainedEducationData: false,
  };
}

async function requireConnectedPod(storage: PersonalStorageService) {
  const status = await storage.status();
  if (status.mode !== "solid" || !status.isLoggedIn) {
    throw new Error("Private storage is not connected. Connect a Solid Pod before reading, writing, or signing private ASFAI data.");
  }
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
    await requireConnectedPod(storage);
    const input = z.object({ document: z.enum(personalDocumentKinds), ownerRole: z.enum(["learner", "teacher"]).optional() }).parse(payload);
    return publicPodResult(await storage.load(input.document, input.ownerRole));
  }
  if (action === "save") {
    await requireConnectedPod(storage);
    const input = z.object({ document: z.enum(personalDocumentKinds), value: z.unknown(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional() }).parse(payload);
    return publicPodResult(await storage.save(input.document, input.value, input.expectedDigest));
  }
  if (action === "put_object") {
    await requireConnectedPod(storage);
    const input = z.object({
      path: z.string(), contentType: z.string(), text: z.string().optional(), base64: z.string().optional(),
      expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    }).parse(payload);
    return publicPodResult(await storage.putObject(input));
  }
  if (action === "get_object") {
    await requireConnectedPod(storage);
    const input = z.object({ path: z.string(), offset: z.number().int().min(0).optional(), length: z.number().int().positive().optional() }).parse(payload);
    return publicPodResult(await storage.getObject(input.path, input.offset, input.length));
  }
  if (action === "head_object") {
    await requireConnectedPod(storage);
    const input = z.object({ path: z.string() }).parse(payload);
    return publicPodResult(await storage.headObject(input.path));
  }
  if (action === "list_objects") {
    await requireConnectedPod(storage);
    const input = z.object({ containerPath: z.string().optional(), offset: z.number().int().min(0).optional(), limit: z.number().int().positive().max(200).optional() }).parse(payload);
    return publicPodResult(await storage.listObjects(input.containerPath, input.offset, input.limit));
  }
  if (action === "delete_object") {
    await requireConnectedPod(storage);
    const input = z.object({ path: z.string(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional() }).parse(payload);
    return publicPodResult(await storage.deleteObject(input.path, input.expectedDigest));
  }
  if (action === "identity") {
    await requireConnectedPod(storage);
    return storage.identity();
  }
  if (action === "sign") {
    await requireConnectedPod(storage);
    return storage.sign(payload.value);
  }
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
