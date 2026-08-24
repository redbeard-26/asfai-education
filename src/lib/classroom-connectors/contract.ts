import { z } from "zod";

export const classroomProviderSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/);
export const classroomRoleSchema = z.enum(["learner", "teacher"]);

export const classroomMaterialSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("link"), url: z.string().url(), title: z.string().max(500).optional() }),
  z.object({ type: z.literal("drive_file"), id: z.string().min(1), title: z.string().max(500).optional() }),
  z.object({ type: z.literal("youtube_video"), id: z.string().min(1), title: z.string().max(500).optional() }),
]);

export const classroomAssignmentExportSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(30000).optional(),
  state: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  maxPoints: z.number().min(0).max(100000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  materials: z.array(classroomMaterialSchema).max(20).default([]),
});

export const classroomWorkExportSchema = z.object({
  content: z.string().max(200000).optional(),
  fileName: z.string().min(1).max(250).optional(),
  contentType: z.enum(["text/plain", "text/markdown", "application/json"]).default("text/plain"),
  links: z.array(z.object({ url: z.string().url(), title: z.string().max(500).optional() })).max(20).default([]),
  driveFileIds: z.array(z.string().min(1)).max(20).default([]),
  turnIn: z.boolean().default(false),
}).refine((value) => Boolean(value.content || value.links.length || value.driveFileIds.length), {
  message: "Exported work requires content, a link, or a Drive file ID.",
}).refine((value) => value.links.length + value.driveFileIds.length + (value.content ? 1 : 0) <= 20, {
  message: "A classroom work export may contain at most 20 total attachments.",
});

export const classroomEvaluationExportSchema = z.object({
  score: z.number().min(0),
  publishGrade: z.boolean().default(false),
  returnSubmission: z.boolean().default(false),
});

export type ClassroomRole = z.infer<typeof classroomRoleSchema>;
export type ClassroomMaterial = z.infer<typeof classroomMaterialSchema>;
export type ClassroomAssignmentExport = z.infer<typeof classroomAssignmentExportSchema>;
export type ClassroomWorkExport = z.infer<typeof classroomWorkExportSchema>;
export type ClassroomEvaluationExport = z.infer<typeof classroomEvaluationExportSchema>;

export interface ClassroomConnectInput {
  role: ClassroomRole;
  readOnly: boolean;
  includeDriveContent: boolean;
  port?: number;
}

export interface ClassroomPageInput {
  pageSize?: number;
  pageToken?: string;
}

export interface ClassroomImportInput extends ClassroomPageInput {
  courseId: string;
  assignmentId: string;
  submissionId?: string;
  userId?: string;
  objectiveIds: string[];
  includeAttachmentContent: boolean;
  maxContentBytes: number;
}

export interface ClassroomConnectorAdapter {
  readonly provider: string;
  status(): unknown;
  connect(input: ClassroomConnectInput): Promise<unknown>;
  disconnect(): Promise<unknown>;
  listCourses(input: ClassroomPageInput): Promise<unknown>;
  listLearners(input: ClassroomPageInput & { courseId: string }): Promise<unknown>;
  listAssignments(input: ClassroomPageInput & { courseId: string }): Promise<unknown>;
  importWork(input: ClassroomImportInput): Promise<unknown>;
  createAssignment(input: { courseId: string; assignment: ClassroomAssignmentExport; objectiveIds: string[]; confirmed: boolean }): Promise<unknown>;
  exportWork(input: { courseId: string; assignmentId: string; submissionId: string; work: ClassroomWorkExport; objectiveIds: string[]; confirmed: boolean }): Promise<unknown>;
  returnEvaluation(input: { courseId: string; assignmentId: string; submissionId: string; evaluation: ClassroomEvaluationExport; objectiveIds: string[]; confirmed: boolean }): Promise<unknown>;
}

export class ClassroomConnectorService {
  private readonly adapters = new Map<string, ClassroomConnectorAdapter>();

  constructor(adapters: ClassroomConnectorAdapter[]) {
    for (const adapter of adapters) this.adapters.set(adapter.provider, adapter);
  }

  providers() {
    return [...this.adapters.values()].map((adapter) => ({ provider: adapter.provider, status: adapter.status() }));
  }

  adapter(provider: string) {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unsupported classroom provider '${provider}'. Available providers: ${[...this.adapters.keys()].join(", ") || "none"}.`);
    }
    return adapter;
  }
}
