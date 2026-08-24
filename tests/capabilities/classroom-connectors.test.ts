import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClassroomConnectorService } from "@/lib/classroom-connectors/contract";
import { GOOGLE_AUTHORIZATION_KEY, GoogleClassroomAdapter, googleClassroomScopes, normalizeGoogleSubmission } from "@/lib/classroom-connectors/google";
import { DeviceProtectedStorage, type StorageProtector } from "@/lib/device-protected-storage";

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

  it("reports local credential boundaries without exposing secrets", async () => {
    const status = await new GoogleClassroomAdapter({ clientId: "", clientSecret: "" }).status();
    expect(status).toMatchObject({ provider: "google", configured: false, isLoggedIn: false });
    expect(JSON.stringify(status)).not.toContain("access_token");
    expect(JSON.stringify(status)).not.toContain("refresh_token");
  });

  it("loads packaged Desktop OAuth configuration without per-device environment variables", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-google-config-"));
    const credentialsFile = path.join(directory, "google-oauth-client.json");
    try {
      await writeFile(credentialsFile, JSON.stringify({ installed: { client_id: "desktop-client-id", client_secret: "desktop-client-secret" } }));
      await expect(new GoogleClassroomAdapter({ credentialsFile }).status()).resolves.toMatchObject({
        configured: true,
        configurationSource: "credentials-file",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("restores protected Google authorization across companions until explicitly forgotten", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-google-restore-"));
    const target = path.join(directory, "google-session.protected.json");
    const protector: StorageProtector = {
      id: "user-file-permissions",
      protect: async (value) => Buffer.from(value.map((byte) => byte ^ 0xa5)),
      unprotect: async (value) => Buffer.from(value.map((byte) => byte ^ 0xa5)),
    };
    const input = { role: "learner" as const, readOnly: true, includeDriveContent: false };
    const scopes = googleClassroomScopes(input);
    const fetchImpl = (async (request: string | URL | Request) => {
      const url = String(request);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "refreshed-access-token", expires_in: 3600, scope: scopes.join(" ") }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }) as typeof fetch;
    try {
      const firstStorage = new DeviceProtectedStorage(target, protector);
      await firstStorage.set(GOOGLE_AUTHORIZATION_KEY, JSON.stringify({
        schemaVersion: "1",
        refreshToken: "saved-refresh-token",
        accountEmail: "learner@example.com",
        grantedScopes: scopes,
        role: "learner",
        readOnly: true,
        includeDriveContent: false,
        savedAt: new Date().toISOString(),
      }));

      const restarted = new GoogleClassroomAdapter({
        clientId: "desktop-client-id",
        clientSecret: "desktop-client-secret",
        authorizationStorage: new DeviceProtectedStorage(target, protector),
        fetchImpl,
      });
      await expect(restarted.status()).resolves.toMatchObject({
        isLoggedIn: true,
        accountEmail: "learner@example.com",
        authorizationPersistence: { persistsAcrossChatsAndRestarts: true, restoredFromDevice: true },
      });
      await expect(restarted.connect(input)).resolves.toMatchObject({ isLoggedIn: true, authorizationUrl: undefined });
      expect(await readFile(target, "utf8")).not.toContain("saved-refresh-token");

      await expect(restarted.forgetAuthorization()).resolves.toMatchObject({ isLoggedIn: false });
      const afterForget = new GoogleClassroomAdapter({
        clientId: "desktop-client-id",
        clientSecret: "desktop-client-secret",
        authorizationStorage: new DeviceProtectedStorage(target, protector),
        fetchImpl,
      });
      await expect(afterForget.status()).resolves.toMatchObject({ isLoggedIn: false });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
