import { describe, expect, it } from "vitest";
import { claimArtifactResult, createArtifactLaunch, storeArtifactResult } from "@/lib/lessons/artifact-relay";

describe("artifact result relay", () => {
  it("accepts a matching result and consumes it once", () => {
    const launch = createArtifactLaunch("block-algebra-puzzle", "https://education.asfai.org/education/artifact.html");
    expect(new URL(launch.launchUrl).searchParams.has("token")).toBe(false);
    expect(new URLSearchParams(new URL(launch.launchUrl).hash.slice(1)).get("token")).toBe(launch.token);
    const result = {
      source: "block-algebra-puzzle",
      version: "1.1.1",
      schema: 1,
      session: "session-1",
      summary: { levelsCompleted: 3 },
      completedAt: new Date().toISOString(),
    };
    storeArtifactResult(launch.launchId, launch.token, result, JSON.stringify(result).length);
    expect(claimArtifactResult(launch.launchId, launch.token)).toMatchObject({ ready: true, artifactId: "block-algebra-puzzle" });
    expect(() => claimArtifactResult(launch.launchId, launch.token)).toThrow(/already been consumed/i);
  });

  it("rejects a source that does not match the launch", () => {
    const launch = createArtifactLaunch("block-algebra-puzzle", "https://education.asfai.org/education/artifact.html");
    const result = {
      source: "different-game",
      version: "1",
      schema: 1,
      session: "session-2",
      summary: {},
      completedAt: new Date().toISOString(),
    };
    expect(() => storeArtifactResult(launch.launchId, launch.token, result, JSON.stringify(result).length)).toThrow(/does not match/i);
  });
});
