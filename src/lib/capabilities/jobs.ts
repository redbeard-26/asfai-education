import { z } from "zod";
import { getCapability } from "@/lib/capabilities/catalog";

const timestampSchema = z.string().datetime({ offset: true });

export const capabilityJobSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string(),
  capabilityId: z.string(),
  capabilityVersion: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "canceled"]),
  progress: z.number().min(0).max(1),
  requestedAt: timestampSchema,
  updatedAt: timestampSchema,
  input: z.record(z.string(), z.unknown()),
  contextRefs: z.array(z.string()).max(100),
  output: z.unknown().optional(),
  error: z.string().max(4000).optional(),
  accessibilityRepresentation: z.unknown().optional(),
  provenance: z.object({
    host: z.string().optional(),
    model: z.string().optional(),
    sourceRefs: z.array(z.string()).default([]),
  }),
});

export type CapabilityJob = z.infer<typeof capabilityJobSchema>;

export function startCapabilityJob(input: {
  capabilityId: string;
  input: Record<string, unknown>;
  contextRefs?: string[];
}) {
  const capability = getCapability(input.capabilityId);
  if (!capability) throw new Error(`No ASFAI capability '${input.capabilityId}'.`);
  if (capability.mode !== "async-job") throw new Error(`Capability '${capability.id}' is not an asynchronous job.`);
  const now = new Date().toISOString();
  const job = capabilityJobSchema.parse({
    schemaVersion: "0.1",
    id: `urn:uuid:${crypto.randomUUID()}`,
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    status: "queued",
    progress: 0,
    requestedAt: now,
    updatedAt: now,
    input: input.input,
    contextRefs: input.contextRefs ?? [],
    provenance: { sourceRefs: input.contextRefs ?? [] },
  });
  return {
    job,
    capability,
    hostInstruction: capability.guidance,
    next: "The authorized host or provider may now perform this job. Persist the checkpoint, then update it with asfai_resource action update_job.",
    serverQueuedWork: false,
  };
}

export function updateCapabilityJob(input: {
  job: unknown;
  status: "running" | "completed" | "failed";
  progress?: number;
  output?: unknown;
  error?: string;
  accessibilityRepresentation?: unknown;
  host?: string;
  model?: string;
}) {
  const job = capabilityJobSchema.parse(input.job);
  if (["completed", "failed", "canceled"].includes(job.status)) throw new Error(`Job '${job.id}' is already ${job.status}.`);
  if (input.status === "completed" && input.output === undefined) throw new Error("A completed job requires output.");
  if (input.status === "failed" && !input.error) throw new Error("A failed job requires an error message.");
  const updated = capabilityJobSchema.parse({
    ...job,
    status: input.status,
    progress: input.status === "completed" ? 1 : input.progress ?? job.progress,
    output: input.output,
    error: input.error,
    accessibilityRepresentation: input.accessibilityRepresentation,
    updatedAt: new Date().toISOString(),
    provenance: { ...job.provenance, host: input.host ?? job.provenance.host, model: input.model ?? job.provenance.model },
  });
  return {
    job: updated,
    resultReady: updated.status === "completed",
    validation: updated.status === "completed"
      ? { accessibilityRepresentationPresent: updated.accessibilityRepresentation !== undefined, provenancePresent: Boolean(updated.provenance.host || updated.provenance.model || updated.provenance.sourceRefs.length) }
      : undefined,
  };
}

export function cancelCapabilityJob(jobInput: unknown) {
  const job = capabilityJobSchema.parse(jobInput);
  if (["completed", "failed", "canceled"].includes(job.status)) return { job, changed: false };
  return { job: capabilityJobSchema.parse({ ...job, status: "canceled", updatedAt: new Date().toISOString() }), changed: true };
}
