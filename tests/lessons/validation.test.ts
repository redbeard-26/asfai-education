import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import blockAlgebra from "@/content/lessons/block-algebra/1.0.0/lesson.json";
import { validateLesson } from "@/lib/lessons/validation";

describe("lesson validation", () => {
  it("accepts the bundled Block Algebra lesson", () => {
    const result = validateLesson(blockAlgebra);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.lesson?.activities).toHaveLength(7);
  });

  it("rejects an activity with an unknown artifact", () => {
    const input = structuredClone(blockAlgebra);
    input.activities[1].artifactId = "missing-artifact";
    const result = validateLesson(input);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("missing-artifact");
  });

  it("pins each bundled game to its published digest", () => {
    const result = validateLesson(blockAlgebra);
    expect(result.lesson).toBeDefined();
    for (const artifact of result.lesson!.artifacts) {
      const localPath = `public/${artifact.url.replace(/^\/education\//, "")}`;
      const digest = createHash("sha256").update(fs.readFileSync(localPath)).digest("hex");
      expect(digest).toBe(artifact.sha256);
    }
  });
});
