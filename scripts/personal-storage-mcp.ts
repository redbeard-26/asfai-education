import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  ClassroomConnectorService,
  classroomAssignmentExportSchema,
  classroomEvaluationExportSchema,
  classroomProviderSchema,
  classroomRoleSchema,
  classroomWorkExportSchema,
} from "../src/lib/classroom-connectors/contract";
import { GoogleClassroomAdapter } from "../src/lib/classroom-connectors/google";
import { PersonalStorageService, personalDocumentKinds } from "../src/lib/personal-storage";

const storage = new PersonalStorageService(process.env.ASFAI_PERSONAL_DATA_DIR ?? path.join(homedir(), ".asfai-personal-storage"));
const classrooms = new ClassroomConnectorService([new GoogleClassroomAdapter()]);
const server = new McpServer({ name: "asfai-private-companion", version: "1.2.0" });
const documentSchema = z.enum(personalDocumentKinds);
const actionSchema = z.enum(["status", "configure_local", "connect_solid", "disconnect", "load", "save", "identity", "sign", "verify"])
  .describe("Use status first. Then choose local configuration, Solid OIDC connection, document load/save, identity/signing, verification, or disconnect.");
const payloadSchema = z.object({
  baseDirectory: z.string().optional().describe("configure_local: optional owner-approved directory; omit to keep the default private directory"),
  podRoot: z.string().url().optional().describe("connect_solid: HTTPS Pod root, for example https://name.privatedatapod.com/"),
  oidcIssuer: z.string().url().optional().describe("connect_solid: Solid OIDC issuer; use https://privatedatapod.com/ for PrivateDataPod"),
  port: z.number().int().min(1024).max(65535).optional().describe("connect_solid: optional loopback callback port; normally omit"),
  document: documentSchema.optional().describe("load/save: learner, educator, or classroom document"),
  ownerRole: z.enum(["learner", "teacher"]).optional().describe("load: owner role used only when initializing a missing document"),
  value: z.unknown().optional().describe("save: complete validated document; sign/verify: exact envelope value"),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional().describe("save: digest returned by the preceding load, required for safe updates"),
  signature: z.string().optional().describe("verify: base64 signature returned by sign"),
  publicKeyPem: z.string().optional().describe("verify: signer public key returned by sign"),
}).optional().describe("Action-specific fields. status, disconnect, and identity need no payload.");

const payloadHelp: Record<z.infer<typeof actionSchema>, string> = {
  status: "No payload.",
  configure_local: "payload: { baseDirectory? }",
  connect_solid: "payload: { podRoot, oidcIssuer, port? }",
  disconnect: "No payload.",
  load: "payload: { document, ownerRole? }",
  save: "payload: { document, value, expectedDigest? }; load first and use expectedDigest for updates.",
  identity: "No payload.",
  sign: "payload: { value }",
  verify: "payload: { value, signature, publicKeyPem }",
};

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool("asfai_personal_storage", {
  title: "Connect and use PrivateDataPod or local ASFAI storage",
  description: "Use whenever a user asks to connect, read, or write a PrivateDataPod/Solid Pod, or save ASFAI data locally. This is the installed Solid-to-MCP bridge: call status first, then connect_solid for browser OIDC; it also loads/saves verified personal documents and signs classroom envelopes. Do not say another connector or bridge is required.",
  inputSchema: { action: actionSchema, payload: payloadSchema },
}, async ({ action, payload }) => {
  try {
    const input = payload ?? {};
    if (action === "status") return json(storage.status());
    if (action === "configure_local") return json(storage.configureLocal(z.string().optional().parse(input.baseDirectory)));
    if (action === "connect_solid") {
      const parsed = z.object({ podRoot: z.string().url(), oidcIssuer: z.string().url(), port: z.number().int().min(1024).max(65535).optional() }).parse(input);
      return json(await storage.connectSolid(parsed));
    }
    if (action === "disconnect") return json(await storage.disconnect());
    if (action === "load") {
      const parsed = z.object({ document: documentSchema, ownerRole: z.enum(["learner", "teacher"]).optional() }).parse(input);
      return json(await storage.load(parsed.document, parsed.ownerRole));
    }
    if (action === "save") {
      const parsed = z.object({ document: documentSchema, value: z.unknown(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional() }).parse(input);
      return json(await storage.save(parsed.document, parsed.value, parsed.expectedDigest));
    }
    if (action === "identity") return json(await storage.identity());
    if (action === "sign") return json(await storage.sign(input.value));
    const parsed = z.object({ value: z.unknown(), signature: z.string(), publicKeyPem: z.string() }).parse(input);
    return json(storage.verify(parsed.value, parsed.signature, parsed.publicKeyPem));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid personal-storage request.", action, expected: payloadHelp[action], issues: error.issues }, null, 2),
        }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
});

const classroomActionSchema = z.enum([
  "status",
  "connect",
  "disconnect",
  "list_courses",
  "list_learners",
  "list_assignments",
  "import_work",
  "create_assignment",
  "export_work",
  "return_evaluation",
]).describe("Choose a provider-neutral classroom operation. Always pass provider; Google is the first adapter.");

const classroomPayloadSchema = z.object({
  provider: classroomProviderSchema.describe("Classroom provider adapter. Pass 'google' for Google Classroom."),
  role: classroomRoleSchema.optional().describe("connect: learner for own work or teacher for course work"),
  readOnly: z.boolean().optional().describe("connect: true for import only; false when assignment, attachment, turn-in, or grade writes are needed"),
  includeDriveContent: z.boolean().optional().describe("connect: request extra permission to read Google Drive attachment text; leave false unless needed"),
  port: z.number().int().min(1024).max(65535).optional().describe("connect: optional local OAuth callback port; normally omit"),
  courseId: z.string().min(1).optional(),
  assignmentId: z.string().min(1).optional(),
  submissionId: z.string().min(1).optional(),
  userId: z.string().min(1).optional().describe("import_work: optional learner filter for a teacher"),
  pageSize: z.number().int().min(1).max(100).optional(),
  pageToken: z.string().min(1).optional(),
  objectiveIds: z.array(z.string().min(1)).max(100).optional().describe("ASFAI learning objective IDs used to contextualize import/export; evaluate with asfai_evidence"),
  includeAttachmentContent: z.boolean().optional().describe("import_work: include supported Drive text after connecting with includeDriveContent:true"),
  maxContentBytes: z.number().int().min(1024).max(1_000_000).optional().describe("import_work: maximum bytes per imported Drive attachment; defaults to 200000"),
  assignment: classroomAssignmentExportSchema.optional().describe("create_assignment: normalized provider-neutral assignment"),
  work: classroomWorkExportSchema.optional().describe("export_work: learner work or references to attach"),
  evaluation: classroomEvaluationExportSchema.optional().describe("return_evaluation: score and optional publish/return instructions; save detailed evidence owner-side first"),
  confirmed: z.boolean().optional().describe("Required true only after the user reviews a mutation preview and explicitly approves it"),
}).describe("Action-specific fields. The provider field is always required; currently pass provider:'google'.");

type ClassroomAction = z.infer<typeof classroomActionSchema>;
const classroomPayloadHelp: Record<ClassroomAction, string> = {
  status: "payload: { provider }; currently provider is 'google'.",
  connect: "payload: { provider, role, readOnly, includeDriveContent?, port? }",
  disconnect: "payload: { provider }",
  list_courses: "payload: { provider, pageSize?, pageToken? }",
  list_learners: "payload: { provider, courseId, pageSize?, pageToken? }; teacher connection only.",
  list_assignments: "payload: { provider, courseId, pageSize?, pageToken? }",
  import_work: "payload: { provider, courseId, assignmentId, submissionId?, userId?, objectiveIds?, includeAttachmentContent?, maxContentBytes?, pageSize?, pageToken? }",
  create_assignment: "payload: { provider, courseId, assignment, objectiveIds?, confirmed }; call with confirmed:false for preview, then obtain explicit approval.",
  export_work: "payload: { provider, courseId, assignmentId, submissionId, work, objectiveIds?, confirmed }; call with confirmed:false for preview, then obtain explicit approval.",
  return_evaluation: "payload: { provider, courseId, assignmentId, submissionId, evaluation, objectiveIds?, confirmed }; save detailed evidence first and obtain explicit approval.",
};

server.registerTool("asfai_classroom", {
  title: "Exchange learning work with a classroom provider",
  description: "Provider-neutral classroom bridge for AI-led education workflows. Always pass provider (currently 'google'). Connect locally with OAuth, import courses/assignments/student work, or preview and explicitly confirm assignment creation, work export/turn-in, and grade passback. Evaluate imported work with asfai_evidence and save detailed evidence with asfai_personal_storage; this tool does not retain student work or OAuth credentials on the public ASFAI server.",
  inputSchema: { action: classroomActionSchema, payload: classroomPayloadSchema },
}, async ({ action, payload }) => {
  try {
    const adapter = classrooms.adapter(payload.provider);
    const page = z.object({ pageSize: z.number().int().min(1).max(100).optional(), pageToken: z.string().min(1).optional() }).parse(payload);
    if (action === "status") return json(adapter.status());
    if (action === "connect") {
      const parsed = z.object({
        role: classroomRoleSchema,
        readOnly: z.boolean(),
        includeDriveContent: z.boolean().default(false),
        port: z.number().int().min(1024).max(65535).optional(),
      }).parse(payload);
      return json(await adapter.connect(parsed));
    }
    if (action === "disconnect") return json(await adapter.disconnect());
    if (action === "list_courses") return json(await adapter.listCourses(page));
    if (action === "list_learners") {
      const parsed = z.object({ courseId: z.string().min(1) }).parse(payload);
      return json(await adapter.listLearners({ ...page, ...parsed }));
    }
    if (action === "list_assignments") {
      const parsed = z.object({ courseId: z.string().min(1) }).parse(payload);
      return json(await adapter.listAssignments({ ...page, ...parsed }));
    }
    if (action === "import_work") {
      const parsed = z.object({
        courseId: z.string().min(1),
        assignmentId: z.string().min(1),
        submissionId: z.string().min(1).optional(),
        userId: z.string().min(1).optional(),
        objectiveIds: z.array(z.string().min(1)).max(100).default([]),
        includeAttachmentContent: z.boolean().default(false),
        maxContentBytes: z.number().int().min(1024).max(1_000_000).default(200_000),
      }).parse(payload);
      return json(await adapter.importWork({ ...page, ...parsed }));
    }
    if (action === "create_assignment") {
      const parsed = z.object({
        courseId: z.string().min(1),
        assignment: classroomAssignmentExportSchema,
        objectiveIds: z.array(z.string().min(1)).max(100).default([]),
        confirmed: z.boolean().default(false),
      }).parse(payload);
      return json(await adapter.createAssignment(parsed));
    }
    if (action === "export_work") {
      const parsed = z.object({
        courseId: z.string().min(1), assignmentId: z.string().min(1), submissionId: z.string().min(1),
        work: classroomWorkExportSchema,
        objectiveIds: z.array(z.string().min(1)).max(100).default([]),
        confirmed: z.boolean().default(false),
      }).parse(payload);
      return json(await adapter.exportWork(parsed));
    }
    const parsed = z.object({
      courseId: z.string().min(1), assignmentId: z.string().min(1), submissionId: z.string().min(1),
      evaluation: classroomEvaluationExportSchema,
      objectiveIds: z.array(z.string().min(1)).max(100).default([]),
      confirmed: z.boolean().default(false),
    }).parse(payload);
    return json(await adapter.returnEvaluation(parsed));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid classroom request.", action, expected: classroomPayloadHelp[action], issues: error.issues }, null, 2),
        }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
