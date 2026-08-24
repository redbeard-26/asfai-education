import { describe, expect, it } from "vitest";
import blockAlgebraInput from "@/content/lessons/block-algebra/1.0.0/lesson.json";
import { recordLessonEvidence } from "@/lib/lessons/evidence";
import { lessonDefinitionSchema } from "@/lib/lessons/schemas";
import { newLearnerProfile } from "@/lib/learner-workflow";
import { startLessonRun } from "@/lib/lessons/workflow";

const lesson = lessonDefinitionSchema.parse(blockAlgebraInput);
const objectiveId = "urn:asfai:objective:block-algebra:polynomial-structure";

function observation() {
  return {
    objectiveId,
    activityId: "orientation",
    evidenceType: "conversation" as const,
    summary: "The learner distinguished all three tile types.",
    observedEvidence: ["Mapped x-squared, x, and units to separate terms."],
    assistance: "none" as const,
    observer: { type: "ai" as const, system: "test-assessor", version: "1" },
    validityFlags: [],
    occurredAt: new Date().toISOString(),
  };
}

describe("lesson evidence", () => {
  it("records linked evidence and advances a run", () => {
    const profile = newLearnerProfile("urn:test:learner");
    const run = startLessonRun(lesson, profile.learnerId);
    const result = recordLessonEvidence({
      profile,
      lesson,
      run,
      activityId: "orientation",
      observations: [observation()],
      judgements: [{ objectiveId, observationIndexes: [0], level: "emerging", confidence: 0.55, rationale: "One clear diagnostic explanation." }],
      completeActivity: true,
    });
    expect(result.profile.schemaVersion).toBe("0.2");
    expect(result.profile.evidence).toHaveLength(1);
    expect(result.profile.assessmentClaims[0].evidenceIds).toEqual([result.profile.evidence[0].id]);
    expect(result.lessonRun.currentActivityId).toBe("guided-walkthrough");
  });

  it("does not permit mastery from one observation", () => {
    const profile = newLearnerProfile("urn:test:learner");
    const run = startLessonRun(lesson, profile.learnerId);
    expect(() => recordLessonEvidence({
      profile,
      lesson,
      run,
      activityId: "orientation",
      observations: [observation()],
      judgements: [{ objectiveId, observationIndexes: [0], level: "mastered", confidence: 0.9, rationale: "Insufficient on purpose." }],
      completeActivity: true,
    })).toThrow(/requires at least three observations/i);
  });
});
