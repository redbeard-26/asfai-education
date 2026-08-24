import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getObjective,
  learningFrontier,
  learningPath,
  listPrograms,
  neighboringObjectives,
  objectivesInProgram,
  searchObjectives,
} from "@/lib/education-graph";
import {
  ASSESSMENT_POLICY_VERSION,
  learnerProfileSchema,
  learningInteractionSchema,
  masteryLevelSchema,
  masteredIds,
  persistenceFor,
  recordLearningEvidence,
  resolveMasteredIds,
  storageTargetSchema,
  summarizeLearnerProfile,
} from "@/lib/learner-workflow";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerEducationTools(server: McpServer) {
  server.registerTool(
    "get_learner_storage_instructions",
    {
      title: "Get learner-owned storage instructions",
      description:
        "Returns exact host-side write and verification steps for ASFAI IndexedDB, a local learner.json file, or the learner's Solid Pod. It does not receive credentials or write the profile.",
      inputSchema: {
        storage: storageTargetSchema,
        hostCapabilities: z
          .array(z.enum(["browser_indexeddb", "local_filesystem", "authenticated_solid_fetch"]))
          .max(3)
          .optional(),
      },
    },
    async ({ storage, hostCapabilities }) => {
      try {
        const persistence = persistenceFor(storage);
        const required = storage.mode === "indexeddb"
          ? "browser_indexeddb"
          : storage.mode === "solid_pod"
            ? "authenticated_solid_fetch"
            : "local_filesystem";
        const capable = hostCapabilities ? hostCapabilities.includes(required) : null;
        return json({
          persistence,
          capabilityCheck: {
            required,
            capable,
            rule:
              "Confirm the required host capability before beginning. A public MCP call cannot itself access browser IndexedDB, a local filesystem, or a private Pod session.",
          },
          confirmationRule:
            "Say that progress was saved only after the host completes the write and read-back verification. Otherwise say that saving is still pending and offer an available storage target or downloadable JSON.",
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "list_learning_programs",
    {
      title: "List learning programs",
      description:
        "Lists programs from the public Marble competency graph. A program is represented by a subject and its domains; the server reads no learner data.",
      inputSchema: {},
    },
    async () => json(await listPrograms()),
  );

  server.registerTool(
    "search_learning_objectives",
    {
      title: "Search learning objectives",
      description: "Searches objective names, domains, and descriptions in the public competency graph.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ query, limit }) => json(await searchObjectives(query, limit ?? 20)),
  );

  server.registerTool(
    "get_learning_objective",
    {
      title: "Get learning objective",
      description:
        "Returns one objective, including its assessment prompt and evidence descriptors, from the public competency graph.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const objective = await getObjective(id);
      return objective ? json(objective) : err(`No objective '${id}'.`);
    },
  );

  server.registerTool(
    "get_neighboring_objectives",
    {
      title: "Get neighboring learning objectives",
      description:
        "Returns an objective with its prerequisites and unlocks. Use this to decide what belongs immediately before or after an objective.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const result = await neighboringObjectives(id);
      return result ? json(result) : err(`No objective '${id}'.`);
    },
  );

  server.registerTool(
    "get_program_objectives",
    {
      title: "Get objectives in a learning program",
      description: "Returns objectives within a subject, optionally narrowed to a domain.",
      inputSchema: {
        subject: z.string(),
        domain: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ subject, domain, limit }) =>
      json(await objectivesInProgram(subject, domain, limit ?? 100)),
  );

  server.registerTool(
    "get_learning_frontier",
    {
      title: "Get learner's next objectives",
      description:
        "Computes objectives whose hard prerequisites are satisfied. Pass a portable learnerProfile, masteredIds, or both; the server does not identify or persist the learner.",
      inputSchema: {
        learnerProfile: learnerProfileSchema.optional(),
        masteredIds: z.array(z.string()).optional(),
        subject: z.string().optional(),
        domain: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ learnerProfile, masteredIds: explicitIds, subject, domain, limit }) =>
      json(
        await learningFrontier(
          resolveMasteredIds(learnerProfile, explicitIds),
          subject,
          domain,
          limit ?? 25,
        ),
      ),
  );

  server.registerTool(
    "find_learning_path",
    {
      title: "Find a learning path",
      description:
        "Returns the remaining hard-prerequisite path to a target. Pass a portable learnerProfile, masteredIds, or both; no server-side learner account is used.",
      inputSchema: {
        targetId: z.string(),
        learnerProfile: learnerProfileSchema.optional(),
        masteredIds: z.array(z.string()).optional(),
      },
    },
    async ({ targetId, learnerProfile, masteredIds: explicitIds }) => {
      const path = await learningPath(targetId, resolveMasteredIds(learnerProfile, explicitIds));
      return path ? json({ targetId, steps: path.length, path }) : err(`No objective '${targetId}'.`);
    },
  );

  server.registerTool(
    "prepare_learning_assessment",
    {
      title: "Prepare a conversational learning assessment",
      description:
        "Gives an AI tutor the private rubric, seed prompt, follow-up strategy, eligibility, and recording rules needed to evaluate one objective entirely in chat. This tool does not change learner state.",
      inputSchema: {
        id: z.string(),
        learnerProfile: learnerProfileSchema.optional(),
        masteredIds: z.array(z.string()).optional(),
      },
    },
    async ({ id, learnerProfile, masteredIds: explicitIds }) => {
      const neighborhood = await neighboringObjectives(id);
      if (!neighborhood) return err(`No objective '${id}'.`);
      const currentMastered = new Set(resolveMasteredIds(learnerProfile, explicitIds));
      const unmetHardPrerequisites = neighborhood.prerequisites.filter(
        (link) => link.strength === "hard" && !currentMastered.has(link.id),
      );
      const objective = neighborhood.objective;
      return json({
        objective: {
          id: objective.id,
          name: objective.name,
          subject: objective.subject,
          domain: objective.domain,
          description: objective.description,
        },
        seedPrompt: objective.assessmentPrompt.replace(/\{\{name\}\}/g, objective.name),
        privateRubric: objective.evidence,
        rubricVisibility: "Keep the rubric private; give targeted feedback without reciting an answer key.",
        learnerDialogue: {
          rule:
            "Speak naturally about the subject. Ask the actual question and give ordinary teaching feedback. Do not mention an interaction, skill, workflow, tool call, MCP, rubric, evidence event, assessment claim, or other orchestration machinery unless the learner explicitly asks how the system works.",
          openingPattern: `Let's work on ${objective.name}. ${objective.assessmentPrompt.replace(/\{\{name\}\}/g, objective.name)}`,
          keepPrivate: ["privateRubric", "eligibility", "interactionPlan", "recording"],
        },
        eligibility: {
          eligible: unmetHardPrerequisites.length === 0,
          alreadyMastered: currentMastered.has(id),
          unmetHardPrerequisites,
        },
        interactionPlan: {
          minimumForMastery: 3,
          sequence: [
            "Ask the open-ended seed prompt.",
            "Ask at least two adaptive follow-ups from different angles.",
            "Use a fresh example, transfer task, misconception check, why question, or edge case.",
            "Judge only what the learner demonstrated; distinguish assistance from independent work.",
          ],
          levels: ["emerging", "developing", "proficient", "mastered"],
        },
        recording: {
          tool: "record_learning_evidence",
          policyVersion: ASSESSMENT_POLICY_VERSION,
          rule:
            "Privately record the learner's demonstrated work as an evidence event and linked assessment claim; never set a bare mastery boolean or narrate this record-building step to the learner.",
        },
      });
    },
  );

  server.registerTool(
    "record_learning_evidence",
    {
      title: "Create learning evidence and an assessment claim",
      description:
        "Validates a completed chat assessment and returns an updated portable learner profile containing an evidence event, linked assessment claim, and derived objective state. The public MCP server never stores the profile. The AI host must save the returned JSON locally or to the learner's Solid Pod using the learner's own authenticated session.",
      inputSchema: {
        learnerProfile: learnerProfileSchema.optional().describe("Existing portable profile; omit to create one"),
        objectiveId: z.string(),
        interactions: z.array(learningInteractionSchema).min(1).max(20),
        observedEvidence: z.array(z.string().min(1).max(1000)).min(1).max(20),
        level: masteryLevelSchema.exclude(["not_observed"]),
        confidence: z.number().min(0).max(1),
        rationale: z.string().min(1).max(4000),
        assistance: z.enum(["none", "light", "substantial"]),
        assessorSystem: z.string().min(1).max(200),
        assessorVersion: z.string().max(100).optional(),
        storage: storageTargetSchema.optional(),
        allowUnmetPrerequisites: z
          .boolean()
          .optional()
          .describe("Explicitly allow an out-of-sequence mastery claim when hard prerequisites are unmet"),
      },
    },
    async ({
      learnerProfile,
      objectiveId,
      interactions,
      observedEvidence,
      level,
      confidence,
      rationale,
      assistance,
      assessorSystem,
      assessorVersion,
      storage,
      allowUnmetPrerequisites,
    }) => {
      const neighborhood = await neighboringObjectives(objectiveId);
      if (!neighborhood) return err(`No objective '${objectiveId}'.`);
      const beforeMastered = new Set(masteredIds(learnerProfile));
      const unmetHardPrerequisites = neighborhood.prerequisites.filter(
        (link) => link.strength === "hard" && !beforeMastered.has(link.id),
      );
      if (level === "mastered" && unmetHardPrerequisites.length > 0 && !allowUnmetPrerequisites) {
        return err(
          `Mastery is out of sequence because ${unmetHardPrerequisites.length} hard prerequisite(s) are unmet. ` +
            "Assess a prerequisite first or repeat with allowUnmetPrerequisites:true after making the exception explicit to the learner.",
        );
      }
      try {
        const recorded = recordLearningEvidence({
          profile: learnerProfile,
          objectiveId,
          interactions,
          observedEvidence,
          level,
          confidence,
          rationale,
          assistance,
          assessorSystem,
          assessorVersion,
          storage,
        });
        const afterMastered = new Set(masteredIds(recorded.profile));
        const newlyUnlocked = [];
        if (!beforeMastered.has(objectiveId) && afterMastered.has(objectiveId)) {
          for (const link of neighborhood.unlocks) {
            const candidate = await neighboringObjectives(link.id);
            if (!candidate) continue;
            const hardPrerequisites = candidate.prerequisites.filter((item) => item.strength === "hard");
            const wasEligible = hardPrerequisites.every((item) => beforeMastered.has(item.id));
            const isEligible = hardPrerequisites.every((item) => afterMastered.has(item.id));
            if (!wasEligible && isEligible) {
              newlyUnlocked.push({
                id: candidate.objective.id,
                name: candidate.objective.name,
                subject: candidate.objective.subject,
                domain: candidate.objective.domain,
              });
            }
          }
        }
        return json({
          ...recorded,
          newlyUnlocked,
          unmetHardPrerequisites,
          serverRetainedLearnerData: false,
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "get_learner_profile_summary",
    {
      title: "Summarize a portable learner profile",
      description:
        "Summarizes learner-owned profile JSON for an AI tutor. Omit learnerProfile to initialize an empty accountless profile summary. Nothing is retained by the server.",
      inputSchema: { learnerProfile: learnerProfileSchema.optional() },
    },
    async ({ learnerProfile }) =>
      json({
        summary: summarizeLearnerProfile(learnerProfile),
        serverRetainedLearnerData: false,
        nextStep: learnerProfile
          ? "Use this profile with frontier, path, assessment, and evidence tools."
          : "Create the first evidence record, then save the returned profile JSON in the selected learner-owned store.",
      }),
  );
}
