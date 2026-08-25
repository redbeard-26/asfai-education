import { describe, expect, it } from "vitest";
import { persistenceFor } from "@/lib/learner-workflow";
import { assertStoredProfileMatches, newLearnerProfile } from "@/lib/learner-store/types";

describe("learner-owned storage instructions", () => {
  it("identifies the exact ASFAI IndexedDB database, store, and key", () => {
    const persistence = persistenceFor({ mode: "indexeddb" });
    expect(persistence).toMatchObject({
      mode: "indexeddb",
      database: "asfai-education",
      databaseVersion: 1,
      objectStore: "learner-profile",
      key: "current",
      serverRetained: false,
      writeRequired: true,
    });
    expect(persistence.steps.join(" ")).toMatch(/transaction complete/i);
    expect(persistence.steps.join(" ")).toMatch(/read.*back/i);
  });

  it("resolves a Solid Pod root and requires authenticated read-back", () => {
    const persistence = persistenceFor({ mode: "solid_pod", location: "https://pod.example/private/" });
    expect(persistence).toMatchObject({
      mode: "solid_pod",
      location: "https://pod.example/private/asfai/learner.json",
      serverRetained: false,
      writeRequired: true,
    });
    expect(persistence.requiredCapability).toMatch(/authenticated Solid fetch/i);
    expect(persistence.steps.join(" ")).toMatch(/401 or 403/i);
    expect(persistence.steps.join(" ")).toMatch(/read.*back/i);
  });

  it("requires an atomic local replacement and read-back", () => {
    const persistence = persistenceFor({ mode: "local_file", location: "profiles/learner.json" });
    expect(persistence.location).toBe("profiles/learner.json");
    expect(persistence.steps.join(" ")).toMatch(/atomically replace/i);
    expect(persistence.steps.join(" ")).toMatch(/read.*back/i);
  });

  it("rejects a read-back that differs from the returned profile", () => {
    const expected = newLearnerProfile("urn:uuid:expected");
    const changed = { ...expected, updatedAt: new Date(Date.parse(expected.updatedAt) + 1_000).toISOString() };
    expect(() => assertStoredProfileMatches(expected, changed)).toThrow(/did not match/i);
    expect(() => assertStoredProfileMatches(expected, structuredClone(expected))).not.toThrow();
  });
});
