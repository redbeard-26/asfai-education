import { createHash } from "node:crypto";
import { z } from "zod";
import { getCapability } from "@/lib/capabilities/catalog";

const timestampSchema = z.string().datetime({ offset: true });

export const workflowDefinitionSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  steps: z.array(z.object({
    id: z.string(),
    capabilityId: z.string(),
    input: z.record(z.string(), z.unknown()),
    dependsOn: z.array(z.string()).default([]),
    approval: z.enum(["none", "confirmation", "human-review"]).default("none"),
  })).min(1).max(100),
  createdAt: timestampSchema,
});

export const workflowCheckpointSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  workflowId: z.string(),
  workflowVersion: z.number().int().positive(),
  status: z.enum(["active", "completed", "canceled", "failed"]),
  startedAt: timestampSchema,
  updatedAt: timestampSchema,
  steps: z.record(z.string(), z.object({
    status: z.enum(["pending", "ready", "awaiting-approval", "completed", "failed", "skipped"]),
    inputDigest: z.string(),
    result: z.unknown().optional(),
    resultDigest: z.string().optional(),
    completedAt: timestampSchema.optional(),
  })),
});

function digest(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createWorkflow(input: { title: string; steps: unknown[] }) {
  const ids = new Set<string>();
  for (const raw of input.steps) {
    const step = z.object({ id: z.string(), capabilityId: z.string(), dependsOn: z.array(z.string()).optional() }).passthrough().parse(raw);
    if (ids.has(step.id)) throw new Error(`Duplicate workflow step '${step.id}'.`);
    ids.add(step.id);
    if (!getCapability(step.capabilityId)) throw new Error(`No ASFAI capability '${step.capabilityId}'.`);
  }
  for (const raw of input.steps) {
    const step = z.object({ id: z.string(), dependsOn: z.array(z.string()).optional() }).passthrough().parse(raw);
    for (const dependency of step.dependsOn ?? []) if (!ids.has(dependency)) throw new Error(`Step '${step.id}' depends on missing step '${dependency}'.`);
  }
  const visit = (id: string, visiting: Set<string>, visited: Set<string>) => {
    if (visiting.has(id)) throw new Error("Workflow dependencies contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    const step = input.steps.find((candidate) => (candidate as { id?: unknown }).id === id) as { dependsOn?: string[] };
    for (const dependency of step.dependsOn ?? []) visit(dependency, visiting, visited);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id, new Set(), new Set());
  return { workflow: workflowDefinitionSchema.parse({ schemaVersion: "0.1", id: `urn:uuid:${crypto.randomUUID()}`, version: 1, title: input.title, steps: input.steps, createdAt: new Date().toISOString() }) };
}

function refresh(workflow: z.infer<typeof workflowDefinitionSchema>, checkpoint: z.infer<typeof workflowCheckpointSchema>) {
  const steps = { ...checkpoint.steps };
  for (const step of workflow.steps) {
    if (steps[step.id].status !== "pending") continue;
    if (step.dependsOn.every((id) => steps[id].status === "completed" || steps[id].status === "skipped")) steps[step.id] = { ...steps[step.id], status: step.approval === "none" ? "ready" : "awaiting-approval" };
  }
  const values = Object.values(steps);
  const status = values.every((step) => step.status === "completed" || step.status === "skipped") ? "completed" : checkpoint.status;
  return workflowCheckpointSchema.parse({ ...checkpoint, steps, status, updatedAt: new Date().toISOString() });
}

export function startWorkflow(workflowInput: unknown) {
  const workflow = workflowDefinitionSchema.parse(workflowInput);
  const now = new Date().toISOString();
  const steps = Object.fromEntries(workflow.steps.map((step) => [step.id, { status: "pending", inputDigest: digest(step.input) }]));
  const checkpoint = refresh(workflow, workflowCheckpointSchema.parse({ schemaVersion: "0.1", id: `urn:uuid:${crypto.randomUUID()}`, workflowId: workflow.id, workflowVersion: workflow.version, status: "active", startedAt: now, updatedAt: now, steps }));
  return { checkpoint, readySteps: workflow.steps.filter((step) => checkpoint.steps[step.id].status === "ready" || checkpoint.steps[step.id].status === "awaiting-approval") };
}

export function advanceWorkflow(input: { workflow: unknown; checkpoint: unknown; stepId: string; result?: unknown; failed?: string; approved?: boolean }) {
  const workflow = workflowDefinitionSchema.parse(input.workflow);
  const checkpoint = workflowCheckpointSchema.parse(input.checkpoint);
  if (workflow.id !== checkpoint.workflowId || workflow.version !== checkpoint.workflowVersion) throw new Error("Workflow and checkpoint versions do not match.");
  const definition = workflow.steps.find((step) => step.id === input.stepId);
  if (!definition) throw new Error(`No workflow step '${input.stepId}'.`);
  const state = checkpoint.steps[input.stepId];
  if (state.status === "completed") return { checkpoint, idempotentReplay: true };
  if (checkpoint.status !== "active") throw new Error(`Workflow '${checkpoint.id}' is ${checkpoint.status}.`);
  if (!['ready', 'awaiting-approval'].includes(state.status)) throw new Error(`Step '${input.stepId}' is ${state.status}.`);
  if (state.status === "awaiting-approval" && !input.approved) return { checkpoint, confirmationRequired: true, preview: definition };
  const now = new Date().toISOString();
  const updated = refresh(workflow, workflowCheckpointSchema.parse({
    ...checkpoint,
    status: input.failed ? "failed" : checkpoint.status,
    updatedAt: now,
    steps: { ...checkpoint.steps, [input.stepId]: { ...state, status: input.failed ? "failed" : "completed", result: input.failed ? { error: input.failed } : input.result, resultDigest: digest(input.failed ? { error: input.failed } : input.result), completedAt: now } },
  }));
  return { checkpoint: updated, completedStep: input.stepId, readySteps: workflow.steps.filter((step) => updated.steps[step.id].status === "ready" || updated.steps[step.id].status === "awaiting-approval") };
}

export function cancelWorkflow(checkpointInput: unknown) {
  const checkpoint = workflowCheckpointSchema.parse(checkpointInput);
  if (checkpoint.status !== "active") return { checkpoint, changed: false };
  return { checkpoint: workflowCheckpointSchema.parse({ ...checkpoint, status: "canceled", updatedAt: new Date().toISOString() }), changed: true };
}
