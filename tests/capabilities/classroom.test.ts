import { describe, expect, it } from "vitest";
import { createStudentRoom, joinStudentRoom, setStudentRoomStatus } from "@/lib/capabilities/classroom";
import { answerQuizItem, createQuiz, finishQuizAttempt, publishQuiz, startQuizAttempt } from "@/lib/capabilities/quiz";
import { cancelCapabilityJob, startCapabilityJob, updateCapabilityJob } from "@/lib/capabilities/jobs";
import { advanceWorkflow, createWorkflow, startWorkflow } from "@/lib/capabilities/workflows";

describe("MCP-only classroom state", () => {
  it("publishes and joins a pseudonymous room without retaining raw conversation", () => {
    const created = createStudentRoom({ title: "Algebra room", capabilityIds: ["S04"], objectiveIds: ["obj-1"], ageRange: "12-14" });
    expect(created.joinCode).toBeTruthy();
    const published = setStudentRoomStatus(created.room, "published").room;
    const joined = joinStudentRoom({ room: published, code: created.joinCode });
    expect(joined.membership.participantId).toMatch(/^urn:uuid:/);
    expect(published.policy.retainRawConversation).toBe(false);
    expect(joined.transparency).toContain("Raw conversations are not retained");
  });

  it("runs a quiz with learner-safe items and provisional observations", () => {
    const quiz = publishQuiz(createQuiz({
      title: "Factoring check",
      items: [{ objectiveIds: ["obj-1"], prompt: "Which pair multiplies to 12?", type: "multiple-choice", options: ["2 and 6", "2 and 5"], correctOption: 0, criteria: ["Selects a valid factor pair"], explanation: "2 × 6 = 12." }],
    }).quiz).quiz;
    const started = startQuizAttempt(quiz);
    expect(started.item).not.toHaveProperty("correctOption");
    const answered = answerQuizItem({ quiz, attempt: started.attempt, response: 0, assistance: "none" });
    expect(answered.feedback?.correct).toBe(true);
    const finished = finishQuizAttempt({ quiz, attempt: answered.attempt });
    expect(finished.observations).toHaveLength(1);
    expect(finished.rule).toContain("not mastery");
  });

  it("supports caller-owned async job checkpoints and cancellation", () => {
    const started = startCapabilityJob({ capabilityId: "T37", input: { request: "Create a presentation" } });
    expect(started.serverQueuedWork).toBe(false);
    const running = updateCapabilityJob({ job: started.job, status: "running", progress: 0.5, host: "test" });
    expect(running.job.progress).toBe(0.5);
    expect(cancelCapabilityJob(running.job).job.status).toBe("canceled");
  });

  it("resumes an idempotent dependency workflow with approval gates", () => {
    const workflow = createWorkflow({ title: "Create and review", steps: [
      { id: "draft", capabilityId: "T48", input: { request: "Draft a lesson" }, dependsOn: [] },
      { id: "review", capabilityId: "T24", input: { request: "Review the rubric" }, dependsOn: ["draft"], approval: "human-review" },
    ] }).workflow;
    const started = startWorkflow(workflow);
    expect(started.readySteps.map((step) => step.id)).toEqual(["draft"]);
    const drafted = advanceWorkflow({ workflow, checkpoint: started.checkpoint, stepId: "draft", result: { ok: true } });
    expect(drafted.readySteps!.map((step) => step.id)).toEqual(["review"]);
    const preview = advanceWorkflow({ workflow, checkpoint: drafted.checkpoint, stepId: "review", result: { ok: true } });
    expect(preview.confirmationRequired).toBe(true);
    const reviewed = advanceWorkflow({ workflow, checkpoint: drafted.checkpoint, stepId: "review", result: { ok: true }, approved: true });
    expect(reviewed.checkpoint.status).toBe("completed");
    expect(advanceWorkflow({ workflow, checkpoint: reviewed.checkpoint, stepId: "review", result: { ignored: true }, approved: true }).idempotentReplay).toBe(true);
  });
});
