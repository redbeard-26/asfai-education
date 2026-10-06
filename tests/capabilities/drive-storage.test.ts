import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { addMaterialVersion, createCourseAccessGrant, createCoursePackage, storageObjectReferenceSchema, validateCoursePackage } from "@/lib/capabilities/course-knowledge";
import { createResource, newEducatorWorkspace } from "@/lib/capabilities/workspace";
import { driveDocumentLocation, driveObjectLocation, driveObjectReferenceSchema } from "@/lib/drive-storage";
import { persistenceFor, storageTargetSchema } from "@/lib/learner-workflow";
import { registerAsfaiTools } from "@/lib/register-asfai-tools";

const fileId = "1jSWZYZ_qFHX_uCTGXZX";
const driveRef = { storage: "google_drive", fileId, path: "courses/bio/versions/1/original.pdf", mediaType: "application/pdf", bytes: 1200 };

function storageTool() {
  const server = new McpServer({ name: "test", version: "1" });
  registerAsfaiTools(server, "https://education.asfai.org");
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }> })._registeredTools;
  return async (payload: Record<string, unknown>) => {
    const result = await tools.asfai_storage.handler({ action: "instructions", payload });
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text) as Record<string, unknown>;
  };
}

describe("Google Drive host-side storage", () => {
  it("returns a document location and the Drive resource, not steps", () => {
    const location = driveDocumentLocation("learner");
    expect(location).toMatchObject({ mode: "google_drive", location: "ASFAI/learner.json", requiredCapability: "host_google_drive", serverRetained: false, resource: { name: "asfai-storage-drive" } });
    expect(location).not.toHaveProperty("steps");
  });

  it("keeps a known folder ID and rejects a malformed one", () => {
    expect(driveDocumentLocation("educator", fileId).folderId).toBe(fileId);
    expect(() => driveDocumentLocation("educator", "not a folder id")).toThrow();
  });

  it("returns object locations under the shared layout", () => {
    expect(driveObjectLocation("writing/machu-picchu/essay-v1.txt", "text/plain; charset=utf-8").location).toBe("ASFAI/writing/machu-picchu/essay-v1.txt");
    expect(() => driveObjectLocation("../escape.txt", "text/plain")).toThrow();
  });

  it("serves Drive locations from asfai_storage instructions", async () => {
    const instructions = storageTool();
    await expect(instructions({ owner: "learner", target: { mode: "google_drive" }, hostCapabilities: ["host_google_drive"] }))
      .resolves.toMatchObject({ capabilityCheck: { required: "host_google_drive", capable: true }, persistence: { location: "ASFAI/learner.json" } });
    await expect(instructions({ owner: "educator", document: "classroom", target: { mode: "google_drive" } }))
      .resolves.toMatchObject({ persistence: { location: "ASFAI/classroom.json" } });
    await expect(instructions({ owner: "learner", objectPath: "writing/bees/essay-v1.txt", contentType: "text/plain", target: { mode: "google_drive" } }))
      .resolves.toMatchObject({ persistence: { location: "ASFAI/writing/bees/essay-v1.txt", contentType: "text/plain" } });
  });

  it("accepts google_drive as a learner storage target", () => {
    expect(persistenceFor(storageTargetSchema.parse({ mode: "google_drive" }))).toMatchObject({ location: "ASFAI/learner.json" });
  });

  it("accepts Drive references wherever stored objects are referenced", () => {
    expect(driveObjectReferenceSchema.parse(driveRef)).toMatchObject({ immutable: true });
    expect(storageObjectReferenceSchema.parse(driveRef).storage).toBe("google_drive");
    expect(() => storageObjectReferenceSchema.parse({ ...driveRef, path: "/abs" })).toThrow();

    const now = new Date().toISOString();
    const course = addMaterialVersion(createCoursePackage({ title: "Biology", owner: { id: "teacher" } }), {
      schemaVersion: "0.1", id: "mat-1-v1", materialId: "mat-1", version: 1, title: "Cells", status: "active", mediaType: "application/pdf",
      original: driveRef, objectiveAlignments: [], license: {},
      provenance: { sourceName: "Teacher upload", processedBy: "host-assistant", processedAt: now, extractionMethod: "host-native-pdf" }, createdAt: now,
    });
    expect(validateCoursePackage(course)).toMatchObject({ valid: true });
    expect(course.materials[0].original.storage).toBe("google_drive");

    const created = createResource(newEducatorWorkspace(), { title: "Slides", kind: "file", contentRef: driveObjectReferenceSchema.parse(driveRef) });
    expect(Object.values(created.workspace.resources)[0].contentRef?.storage).toBe("google_drive");
  });

  it("issues unsigned course grants for Drive manifests", () => {
    const course = { ...createCoursePackage({ title: "Biology", owner: { id: "teacher" } }), status: "published" as const };
    const grant = createCourseAccessGrant({ course, manifestRef: { ...driveRef, path: "courses/bio/manifest.json", mediaType: "application/json" } });
    expect(grant.manifestRef.storage).toBe("google_drive");
  });
});
