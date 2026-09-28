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

  it("requires natural learner dialogue in learner skills", () => {
    for (const path of [
      "src/content/skills/education-concept-assessment/SKILL.md",
      "src/content/skills/education-lesson-facilitation/SKILL.md",
      "src/content/skills/education-guided-research/SKILL.md",
    ]) {
      const content = fs.readFileSync(path, "utf8");
      expect(content).toContain("Speak only in learner language");
      expect(content).toMatch(/ask the actual question/i);
      expect(content).toMatch(/only after[\s\S]*verification|only after the write has been checked/i);
    }
  });

  it("keeps saving instructions only in the three storage resources", () => {
    const resources = {
      "asfai-storage-pod": [/<pod-root>\/asfai\/learner\.json/, /expectedDigest/, /authenticated fetch/i],
      "asfai-storage-drive": [/asfai-store\.json/, /modified time/i, /never sees Drive file content/i],
      "asfai-storage-local": [/asfai-education/, /learner-profile/, /atomically replace/i],
    };
    for (const [name, patterns] of Object.entries(resources)) {
      const content = fs.readFileSync(`src/content/skills/${name}/SKILL.md`, "utf8");
      for (const pattern of patterns) expect(content, name).toMatch(pattern);
    }
    const methodDetails = /connect_pod|put_object|expectedDigest|<pod-root>|asfai-store\.json|My Drive|IndexedDB|indexeddb|learner-profile|Solid|Google Drive/;
    for (const entry of fs.readdirSync("src/content/skills")) {
      if (entry in resources) continue;
      const content = fs.readFileSync(`src/content/skills/${entry}/SKILL.md`, "utf8");
      expect(content, entry).not.toMatch(methodDetails);
    }
  });
});
