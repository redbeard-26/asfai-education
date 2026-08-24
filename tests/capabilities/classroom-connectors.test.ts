import { describe, expect, it } from "vitest";
import { ClassroomConnectorService } from "@/lib/classroom-connectors/contract";
import { GoogleClassroomAdapter, googleClassroomScopes, normalizeGoogleSubmission } from "@/lib/classroom-connectors/google";

describe("provider-neutral classroom connector", () => {
  it("routes providers explicitly and rejects unavailable adapters", () => {
    const google = new GoogleClassroomAdapter({ clientId: "", clientSecret: "" });
    const service = new ClassroomConnectorService([google]);
    expect(service.adapter("google")).toBe(google);
    expect(() => service.adapter("canvas")).toThrow("Unsupported classroom provider 'canvas'. Available providers: google");
  });

  it("requests least-privilege Google scopes for each connection mode", () => {
    const learnerRead = googleClassroomScopes({ role: "learner", readOnly: true, includeDriveContent: false });
    expect(learnerRead).toContain("https://www.googleapis.com/auth/classroom.coursework.me.readonly");
    expect(learnerRead).not.toContain("https://www.googleapis.com/auth/drive.file");
    expect(learnerRead).not.toContain("https://www.googleapis.com/auth/drive.readonly");

    const teacherWrite = googleClassroomScopes({ role: "teacher", readOnly: false, includeDriveContent: true });
    expect(teacherWrite).toContain("https://www.googleapis.com/auth/classroom.coursework.students");
    expect(teacherWrite).toContain("https://www.googleapis.com/auth/classroom.rosters.readonly");
    expect(teacherWrite).toContain("https://www.googleapis.com/auth/drive.file");
    expect(teacherWrite).toContain("https://www.googleapis.com/auth/drive.readonly");
  });

  it("normalizes imported submissions without asserting mastery", () => {
    expect(normalizeGoogleSubmission({
      id: "submission-1",
      courseWorkId: "assignment-1",
      userId: "learner-1",
      state: "TURNED_IN",
      shortAnswerSubmission: { answer: "Because both sides stay equal." },
      assignmentSubmission: { attachments: [{ link: { url: "https://example.edu/work", title: "My work" } }] },
    })).toMatchObject({
      id: "submission-1",
      assignmentId: "assignment-1",
      userId: "learner-1",
      state: "TURNED_IN",
      shortAnswer: "Because both sides stay equal.",
      attachments: [{ type: "link", url: "https://example.edu/work" }],
    });
  });

  it("previews external changes before authentication or mutation", async () => {
    const google = new GoogleClassroomAdapter({ clientId: "", clientSecret: "" });
    await expect(google.createAssignment({
      courseId: "course-1",
      assignment: { title: "Balance equations", state: "DRAFT", materials: [] },
      objectiveIds: ["objective-1"],
      confirmed: false,
    })).resolves.toMatchObject({
      provider: "google",
      requiresConfirmation: true,
      externalMutationPerformed: false,
      preview: { title: "Balance equations", state: "DRAFT" },
    });
  });

  it("reports local credential boundaries without exposing secrets", () => {
    const status = new GoogleClassroomAdapter({ clientId: "", clientSecret: "" }).status();
    expect(status).toMatchObject({ provider: "google", configured: false, isLoggedIn: false });
    expect(JSON.stringify(status)).not.toContain("access_token");
    expect(JSON.stringify(status)).not.toContain("refresh_token");
  });
});
