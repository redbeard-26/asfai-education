import { describe, expect, it } from "vitest";
import {
  prepareEvaluationDesign,
  prepareLessonOutline,
  prepareTransform,
  validateEvaluationDesign,
  validateLessonOutline,
  validateTransformArtifact,
} from "@/lib/educator-artifact-workflows";

const now = "2026-09-24T12:00:00Z";

describe("teacher artifact workflows", () => {
  it("asks for audience and outcomes before outlining a lesson", () => {
    const result = prepareLessonOutline({ mode: "new", topic: "linear equations", course: "Algebra I" });
    expect(result.state).toBe("clarifying");
    expect(result.questions.map((item) => item.id)).toEqual(["audience", "learning_outcomes"]);
    expect(prepareLessonOutline({
      topic: "linear equations", course: "Algebra I", audience: "early high school",
      learningOutcomes: ["Solve a one-variable equation and explain each step"],
    }).state).toBe("ready_to_draft");
  });

  it("asks what polish means but does not demand pedagogical intake for formatting only", () => {
    const ambiguous = prepareLessonOutline({ mode: "polish", draftRef: "attachment:rough-outline" });
    expect(ambiguous.questions.map((item) => item.id)).toEqual(["polish_goal"]);
    expect(ambiguous.questions[0].kind).toBe("multiple-choice");
    expect(ambiguous.questions[0].options).toContain("Map to learning objectives");
    expect(prepareLessonOutline({ mode: "polish", draftRef: "attachment:rough-outline", polishGoals: ["formatting"] }).state).toBe("ready_to_draft");
    expect(prepareLessonOutline({ mode: "polish", draftRef: "attachment:rough-outline", polishGoals: ["gaps"] }).questions.map((item) => item.id)).toEqual(["audience", "learning_outcomes"]);
  });

  it("requires a complete lesson plan and feasible teacher effort for evaluation", () => {
    const outlineOnly = prepareEvaluationDesign({
      lessonPlan: { ref: "pod:lesson-1", title: "Equations", stage: "outline", activities: [] },
    });
    expect(outlineOnly.questions.map((item) => item.id)).toContain("complete_plan");
    const ready = prepareEvaluationDesign({
      lessonPlan: {
        ref: "pod:lesson-1", title: "Equations", stage: "complete", activities: ["Solve and explain examples"],
        audience: "grade 8", learningOutcomes: [{ id: "o1", description: "Solve equations" }],
      },
      purpose: "formative", teacherTimeBudgetMinutes: 5,
    });
    expect(ready.state).toBe("ready_to_draft");

    const invalid = validateEvaluationDesign({
      schemaVersion: "0.1", id: "eval-1", version: 1, status: "draft", kind: "evaluation",
      sourceRefs: ["pod:lesson-1"], createdAt: now, updatedAt: now,
      lessonPlanRef: "pod:lesson-1", audience: "grade 8",
      learningOutcomes: [{ id: "o1", description: "Solve equations" }, { id: "o2", description: "Explain a solution" }],
      purpose: "formative", modality: "problem-set", teacherTimeBudgetMinutes: 5,
      tasks: [{ id: "t1", directions: "Solve two equations", outcomeIds: ["o1"], evidenceToCollect: ["Written work"], estimatedStudentMinutes: 10, estimatedTeacherMinutes: 8 }],
      criteria: [{ outcomeId: "o1", description: "Correct reasoning" }],
      aiUsePolicy: "Disclose AI help", accessibilityAlternative: "Oral explanation with equivalent equations",
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.unassessedOutcomeIds).toEqual(["o2"]);
    expect(invalid.errors).toContain("Estimated teacher review time exceeds the stated budget.");
  });

  it("requires an existing source and target-specific details before transformation", () => {
    expect(prepareTransform({ operation: "translate", targetRepresentation: "Markdown" }).questions.map((item) => item.id)).toEqual(["source", "language"]);
    expect(prepareTransform({ sourceRef: "attachment:lecture-notes", operation: "slides", targetRepresentation: "PPTX" }).state).toBe("ready_to_draft");
    expect(validateTransformArtifact({
      schemaVersion: "0.1", id: "trans-1", version: 1, status: "draft", kind: "transform",
      sourceRefs: ["attachment:lecture-notes"], createdAt: now, updatedAt: now,
      sourceRef: "attachment:lecture-notes", operation: "slides", targetRepresentation: "PPTX",
      outputRef: "pod:slides-1", fidelityNotes: ["Preserved cited claims"],
    }).valid).toBe(true);
  });

  it("validates a versioned outline artifact", () => {
    const result = validateLessonOutline({
      schemaVersion: "0.1", id: "outline-1", version: 1, status: "draft", kind: "lesson-outline",
      sourceRefs: [], createdAt: now, updatedAt: now, course: "Algebra I", topic: "Linear equations",
      audience: "early high school", learningOutcomes: ["Solve one-variable equations"],
      sections: [{ id: "s1", title: "Explore", purpose: "Compare equivalent equations" }],
    });
    expect(result.valid).toBe(true);
    expect(result.nextState).toBe("reviewed");
  });
});
