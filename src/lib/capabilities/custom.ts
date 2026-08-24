import { createHash } from "node:crypto";
import { z } from "zod";
import { capabilityModeSchema, capabilityRiskSchema } from "@/lib/capabilities/catalog";

export const customCapabilitySchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string().regex(/^C:[a-zA-Z0-9._:-]+$/),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(2000),
  audience: z.enum(["educator", "student"]),
  mode: capabilityModeSchema,
  risk: capabilityRiskSchema,
  guidance: z.string().min(1).max(16000),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  sourceRefs: z.array(z.string()).max(100),
  status: z.enum(["draft", "approved", "retired"]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export function validateCustomCapability(input: unknown) {
  const parsed = customCapabilitySchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  const capability = parsed.data;
  const warnings: string[] = [];
  if (capability.audience === "student" && !/learner|student/i.test(capability.guidance)) warnings.push("Student guidance should explicitly require natural learner language and prohibit exposing orchestration.");
  if (capability.risk === "restricted" && !/qualified|human review/i.test(capability.guidance)) warnings.push("Restricted guidance must identify qualified human review.");
  if (capability.sourceRefs.length === 0) warnings.push("No source references are declared; factual or policy claims must state this limitation.");
  if (JSON.stringify(capability.inputSchema).length > 16000 || JSON.stringify(capability.outputSchema).length > 16000) warnings.push("A custom schema exceeds the recommended 16,000-character selected-capability budget.");
  return { valid: true, capability, warnings, publishable: warnings.length === 0 && capability.status === "draft" };
}

export function prepareCustomCapabilityPublication(input: unknown) {
  const validation = validateCustomCapability(input);
  if (!validation.valid || !validation.capability || !validation.publishable) return validation;
  const digest = createHash("sha256").update(JSON.stringify(validation.capability)).digest("hex");
  return {
    ...validation,
    digest,
    preview: { id: validation.capability.id, version: validation.capability.version, title: validation.capability.title, audience: validation.capability.audience, mode: validation.capability.mode, risk: validation.capability.risk },
    confirmationRequired: true,
    next: "An authenticated educator publisher must confirm, store this immutable version, and read it back. The public MCP does not publish custom executable behavior.",
  };
}
