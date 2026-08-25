import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "@inrupt/solid-client-authn-node";
import { describe, expect, it, vi } from "vitest";
import { acceptClassroomEnvelope, newClassroomExchangeStore, queueClassroomEnvelope } from "@/lib/capabilities/personal-state";
import { DeviceProtectedStorage, type StorageProtector } from "@/lib/device-protected-storage";
import { PersonalStorageService } from "@/lib/personal-storage";
import { createReportEnvelope } from "@/lib/lessons/progress";
import { lessonAssignmentSchema, lessonReportSchema } from "@/lib/lessons/schemas";

function reportEnvelope() {
  const assignment = lessonAssignmentSchema.parse({
    schemaVersion: "0.1", id: "urn:test:assignment", lessonId: "urn:test:lesson", lessonVersion: "1.0.0",
    sharePolicy: { includeObjectiveSummary: true, includeEvidenceSummaries: true, includeRawTelemetry: false, includeArtifacts: false }, createdAt: new Date().toISOString(),
  });
  const report = lessonReportSchema.parse({
    schemaVersion: "0.1", id: "urn:test:report", lessonRunId: "urn:test:run", lessonId: "urn:test:lesson", lessonVersion: "1.0.0", learnerId: "private-learner", status: "completed", generatedAt: new Date().toISOString(), activitySummary: [], objectiveSummary: [], artifactRefs: [], nextSteps: [], caveats: [],
  });
  return createReportEnvelope(assignment, report, "class-pseudonym");
}

describe("personal storage MCP companion", () => {
  it("persists session values through a protected owner-only store", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-protected-storage-"));
    const target = path.join(directory, "session.json");
    const protector: StorageProtector = {
      id: "user-file-permissions",
      protect: async (value) => Buffer.from(value.map((byte) => byte ^ 0xa5)),
      unprotect: async (value) => Buffer.from(value.map((byte) => byte ^ 0xa5)),
    };
    try {
      const first = new DeviceProtectedStorage(target, protector);
      await first.set("solid-session", "refresh-token-value");
      const second = new DeviceProtectedStorage(target, protector);
      expect(await second.get("solid-session")).toBe("refresh-token-value");
      expect(await readFile(target, "utf8")).not.toContain("refresh-token-value");
      await second.delete("solid-session");
      expect(await new DeviceProtectedStorage(target, protector).get("solid-session")).toBeUndefined();
      let activeLeases = 0;
      let maximumActiveLeases = 0;
      const leasedWork = () => second.withSessionLease(async () => {
        activeLeases += 1;
        maximumActiveLeases = Math.max(maximumActiveLeases, activeLeases);
        await new Promise((resolve) => setTimeout(resolve, 25));
        activeLeases -= 1;
      });
      await Promise.all([leasedWork(), leasedWork()]);
      expect(maximumActiveLeases).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses Windows current-user encryption when available", async () => {
    if (process.platform !== "win32") return;
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-dpapi-storage-"));
    const target = path.join(directory, "session.json");
    try {
      const first = new DeviceProtectedStorage(target);
      await first.set("solid-session", "device-secret-value");
      const second = new DeviceProtectedStorage(target);
      expect(second.protection).toBe("windows-dpapi-current-user");
      expect(await second.get("solid-session")).toBe("device-secret-value");
      expect(await readFile(target, "utf8")).not.toContain("device-secret-value");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("restores Pod authorization in a new companion and forgets it only on explicit request", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-solid-restore-"));
    const protector: StorageProtector = {
      id: "user-file-permissions",
      protect: async (value) => value,
      unprotect: async (value) => value,
    };
    const authenticatedSession = () => ({
      info: { sessionId: "test-session", isLoggedIn: true, webId: "https://learner.example/profile/card#me" },
      logout: vi.fn(async () => undefined),
    } as unknown as Session);
    const restoreSession = vi.fn(async () => authenticatedSession());
    const dependencies = {
      restoreSession,
      createSession: () => authenticatedSession(),
      clearSessions: vi.fn(async () => undefined),
      createDeviceStorage: (filePath: string) => new DeviceProtectedStorage(filePath, protector),
    };
    try {
      const first = new PersonalStorageService(directory, dependencies);
      const connected = await first.connectSolid({ podRoot: "https://learner.example/", oidcIssuer: "https://idp.example/" });
      expect(connected).toMatchObject({ isLoggedIn: true, authorizationUrl: undefined });

      const restarted = new PersonalStorageService(directory, dependencies);
      expect(await restarted.status()).toMatchObject({
        mode: "solid",
        isLoggedIn: true,
        webId: "https://learner.example/profile/card#me",
        authorizationPersistence: { restoredFromDevice: true, persistsAcrossChatsAndRestarts: true },
      });

      await restarted.forgetSolidAuthorization();
      const afterForget = new PersonalStorageService(directory, dependencies);
      expect(await afterForget.status()).toMatchObject({ mode: "local", isLoggedIn: false });
      expect(restoreSession).toHaveBeenCalledTimes(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("atomically saves and verifies portable local documents with conflict detection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-personal-storage-"));
    try {
      const storage = new PersonalStorageService(directory);
      const loaded = await storage.load("learner");
      expect(loaded.verified).toBe(true);
      const profile = { ...(loaded.value as Record<string, unknown>), updatedAt: new Date(Date.now() + 1000).toISOString() };
      const saved = await storage.save("learner", profile, loaded.digest);
      expect(saved).toMatchObject({ verified: true, mode: "local" });
      await expect(storage.save("learner", profile, "0".repeat(64))).rejects.toThrow("changed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("signs portable classroom envelopes and rejects replay on receipt", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "asfai-personal-storage-"));
    try {
      const storage = new PersonalStorageService(directory);
      const envelope = reportEnvelope();
      const signature = await storage.sign(envelope);
      const signed = { envelope, signature: signature.signature, publicKeyPem: signature.publicKeyPem, signerFingerprint: signature.signerFingerprint };
      const learnerStore = newClassroomExchangeStore("learner", "learner-1");
      expect(queueClassroomEnvelope(learnerStore, signed)).toMatchObject({ duplicate: false });
      const teacherStore = newClassroomExchangeStore("teacher", "teacher-1");
      const accepted = acceptClassroomEnvelope(teacherStore, signed);
      expect(accepted).toMatchObject({ duplicate: false, verified: { integrityValid: true, signatureValid: true } });
      expect(acceptClassroomEnvelope(accepted.store, signed)).toMatchObject({ duplicate: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
