import { describe, expect, it } from "vitest";
import {
  addMaterialVersion,
  courseContentDigest,
  createCourseAccessGrant,
  createCoursePackage,
  revokeCourseAccessGrant,
  validateCourseAccess,
  validateCoursePackage,
  validateGroundedAnswer,
  versionCoursePackage,
} from "@/lib/capabilities/course-knowledge";

const digest = "a".repeat(64);

function ref(name: string, mediaType = "application/pdf") {
  return { storage: "solid_pod" as const, href: `https://pod.example/asfai/${name}`, mediaType, sha256: digest, bytes: 10, immutable: true };
}

function material(id: string, materialId: string, version: number) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "0.1" as const,
    id,
    materialId,
    version,
    title: `Material ${version}`,
    status: "active" as const,
    mediaType: "application/pdf",
    original: ref(`courses/course/materials/${id}/original.pdf`),
    extractedText: ref(`courses/course/materials/${id}/chunks.ndjson`, "application/x-ndjson"),
    chunkIndex: ref(`courses/course/materials/${id}/index.json`, "application/json"),
    pageCount: 2,
    objectiveAlignments: [],
    license: {},
    provenance: { sourceName: "Teacher upload", processedBy: "host-assistant", processedAt: now, extractionMethod: "host-native-pdf" },
    createdAt: now,
  };
}

describe("private course knowledge packages", () => {
  it("creates immutable package versions and retires replaced material", () => {
    const course = createCoursePackage({ title: "Economics", owner: { id: "teacher" } });
    const first = addMaterialVersion(course, material("material-v1", "material", 1));
    const second = addMaterialVersion(first, material("material-v2", "material", 2));
    expect(second.version).toBe(3);
    expect(second.materials.find((item) => item.id === "material-v1")?.status).toBe("retired");
    expect(second.materials.find((item) => item.id === "material-v2")?.status).toBe("active");
    expect(validateCoursePackage(second)).toMatchObject({ valid: true });
    expect(first.materials[0].status).toBe("active");
  });

  it("validates exact, authorized page citations", () => {
    const chunk = {
      schemaVersion: "0.1",
      id: "chunk-1",
      materialVersionId: "material-v1",
      pageNumber: 4,
      chunkIndex: 0,
      text: "Maximum likelihood selects parameters that make the observations most probable.",
      sha256: digest,
    };
    const answer = {
      answer: "MLE selects parameters supported by the observed data.",
      groundingStatus: "grounded",
      citations: [{ materialVersionId: "material-v1", chunkId: "chunk-1", pageNumber: 4, quote: "selects parameters that make the observations most probable" }],
      sourceLimitations: [],
      promptInjectionHandled: true,
      provenance: { host: "test-host", retrievalMode: "direct_reading", courseId: "course", courseVersion: 1 },
    };
    expect(validateGroundedAnswer(answer, [chunk], ["material-v1"])).toMatchObject({ valid: true });
    expect(validateGroundedAnswer(answer, [chunk], ["other"]).errors).toContain("Citation 'chunk-1' uses an unauthorized material version.");
    expect(validateGroundedAnswer({ ...answer, citations: [{ ...answer.citations[0], quote: "invented quote" }] }, [chunk], ["material-v1"])).toMatchObject({ valid: false });
  });

  it("pins and revokes signed-share payloads without server state", () => {
    let course = createCoursePackage({ title: "Economics", owner: { id: "teacher" } });
    course = addMaterialVersion(course, material("material-v1", "material", 1));
    course = versionCoursePackage(course, { status: "published" });
    const manifestRef = { ...ref("courses/course/manifest.json", "application/json"), sha256: courseContentDigest(course) };
    const grant = createCourseAccessGrant({ course, manifestRef, recipientId: "learner" });
    expect(validateCourseAccess(grant, { recipientId: "learner", courseVersion: course.version, manifestDigest: courseContentDigest(course) })).toMatchObject({ valid: true });
    expect(validateCourseAccess(grant, { courseVersion: course.version + 1 })).toMatchObject({ valid: false });
    expect(validateCourseAccess(revokeCourseAccessGrant(grant))).toMatchObject({ valid: false });
  });
});
