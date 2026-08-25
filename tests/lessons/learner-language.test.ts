import fs from "node:fs";
import { describe, expect, it } from "vitest";
import blockAlgebra from "@/content/lessons/block-algebra/1.0.0/lesson.json";

const machinery = /\b(interaction|skill|workflow|tool call|MCP|rubric|evidence event|assessment claim|telemetry)\b/i;

describe("learner-facing language", () => {
  it("keeps system machinery out of bundled student instructions", () => {
    for (const activity of blockAlgebra.activities) {
      expect(activity.instructions.student, activity.id).not.toMatch(machinery);
    }
  });

  it("requires natural learner dialogue in both learner skills", () => {
    for (const path of [
      "src/content/skills/education-concept-assessment/SKILL.md",
      "src/content/skills/education-lesson-facilitation/SKILL.md",
    ]) {
      const content = fs.readFileSync(path, "utf8");
      expect(content).toContain("Speak only in learner language");
      expect(content).toMatch(/ask the actual question/i);
      expect(content).toMatch(/only after[\s\S]*verification|only after the write has been checked/i);
    }
  });

  it("ships full storage guidance inside both independently installable learner skills", () => {
    for (const path of [
      "src/content/skills/education-concept-assessment/references/learner-storage.md",
      "src/content/skills/education-lesson-facilitation/references/learner-storage.md",
    ]) {
      const content = fs.readFileSync(path, "utf8");
      expect(content).toContain("asfai-education");
      expect(content).toContain("learner-profile");
      expect(content).toContain("<pod-root>/asfai/learner.json");
      expect(content).toMatch(/authenticated fetch/i);
      expect(content).toMatch(/read-back verification/i);
    }
  });
});
