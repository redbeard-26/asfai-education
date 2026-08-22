import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  getObjective,
  learningFrontier,
  learningPath,
  listPrograms,
  neighboringObjectives,
  objectivesInProgram,
  searchObjectives,
} from "@/lib/graph";

export const maxDuration = 60;

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_learning_programs",
      {
        title: "List learning programs",
        description:
          "Lists available learning programs from the public competency graph. A program is represented by a subject and its domains; no learner data is read or stored on the server.",
        inputSchema: {},
      },
      async () => json(await listPrograms()),
    );

    server.registerTool(
      "search_learning_objectives",
      {
        title: "Search learning objectives",
        description: "Searches objective names and descriptions in the public competency graph.",
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
        description: "Returns one objective from the public competency graph.",
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
          "Returns a learning objective together with its prerequisite objectives and the objectives it unlocks. Use this to decide what should be learned immediately before or after an objective.",
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
        description:
          "Returns objectives within a particular learning program, scoped by subject and optionally by domain.",
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
          "Computes objectives whose hard prerequisites are satisfied. Learner progress remains client-owned: pass mastered objective IDs from IndexedDB or the learner's Solid Pod; this server does not identify or persist the learner.",
        inputSchema: {
          masteredIds: z.array(z.string()).default([]),
          subject: z.string().optional(),
          domain: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ masteredIds, subject, domain, limit }) =>
        json(await learningFrontier(masteredIds, subject, domain, limit ?? 25)),
    );

    server.registerTool(
      "find_learning_path",
      {
        title: "Find a learning path",
        description:
          "Returns the remaining hard-prerequisite path to a target objective. Pass mastered IDs from the learner-owned store; no sign-in or server-side learner record is required.",
        inputSchema: {
          targetId: z.string(),
          masteredIds: z.array(z.string()).default([]),
        },
      },
      async ({ targetId, masteredIds }) => {
        const path = await learningPath(targetId, masteredIds);
        return path ? json({ targetId, steps: path.length, path }) : err(`No objective '${targetId}'.`);
      },
    );
  },
  { serverInfo: { name: "asfai-education", version: "0.1.0" } },
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

export { handler as GET, handler as POST, handler as DELETE };
