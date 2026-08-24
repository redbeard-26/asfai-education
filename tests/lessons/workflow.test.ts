import { describe, expect, it } from "vitest";
import blockAlgebraInput from "@/content/lessons/block-algebra/1.0.0/lesson.json";
import { newLearnerProfile } from "@/lib/learner-workflow";
import { lessonDefinitionSchema } from "@/lib/lessons/schemas";
import { buildLessonReport, getNextActivity, recordActivityResult, startLessonRun } from "@/lib/lessons/workflow";

const lesson = lessonDefinitionSchema.parse(blockAlgebraInput);

describe("lesson workflow", () => {
  it("starts at the first activity and advances after completion", () => {
    const profile = newLearnerProfile("urn:test:learner");
    const run = startLessonRun(lesson, profile.learnerId);
    expect(getNextActivity(lesson, run)?.id).toBe("orientation");
    const next = recordActivityResult(lesson, run, {
      activityId: "orientation",
      status: "completed",
      completedAt: new Date().toISOString(),
      evidenceIds: ["urn:test:evidence"],
      artifactIds: [],
      summary: "Completed the diagnostic conversation.",
    });
    expect(next.currentActivityId).toBe("guided-walkthrough");
  });

  it("scopes reports to evidence explicitly linked to the run", () => {
    const profile = newLearnerProfile("urn:test:learner");
    const run = { ...startLessonRun(lesson, profile.learnerId), evidenceIds: ["urn:test:included"] };
    profile.evidence.push(
      {
        id: "urn:test:included",
        learnerId: profile.learnerId,
        objectiveId: lesson.objectives[0].objectiveId,
        occurredAt: new Date().toISOString(),
        verb: "demonstrated",
      },
      {
        id: "urn:test:excluded",
        learnerId: profile.learnerId,
        objectiveId: lesson.objectives[0].objectiveId,
        occurredAt: new Date().toISOString(),
        verb: "demonstrated",
      },
    );
    const report = buildLessonReport(lesson, run, profile);
    expect(report.objectiveSummary[0].evidenceIds).toEqual(["urn:test:included"]);
  });
});
