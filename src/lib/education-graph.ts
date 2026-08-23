export type Strength = "hard" | "soft";

export interface Topic {
  id: string;
  type: string;
  subject: string;
  domain: string;
  name: string;
  description: string;
  ageRangeStart: number;
  ageRangeEnd: number;
  centrality: number;
  evidence: string[];
  assessmentPrompt: string;
  standards: string[];
}

export interface Dependency {
  topicId: string;
  prerequisiteId: string;
  strength: Strength;
  reason: string;
}

export interface Link {
  id: string;
  name: string;
  strength: Strength;
  reason: string;
}

interface Graph {
  topics: Topic[];
  byId: Map<string, Topic>;
  prereqs: Map<string, Link[]>;
  unlocks: Map<string, Link[]>;
}

export const TAXONOMY_SOURCE = "https://github.com/withmarbleapp/os-taxonomy";
const TOPICS_URL = "https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/main/data/topics.json";
const DEPS_URL = "https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/main/data/dependencies.json";

interface GraphCache {
  graph?: Graph;
  pending?: Promise<Graph>;
  expiresAt: number;
}

const CACHE_TTL_MS = 86_400_000;
const globalForEducationGraph = globalThis as unknown as { asfaiEducationGraph?: GraphCache };

function graphCache(): GraphCache {
  if (!globalForEducationGraph.asfaiEducationGraph) {
    globalForEducationGraph.asfaiEducationGraph = { expiresAt: 0 };
  }
  return globalForEducationGraph.asfaiEducationGraph;
}

async function loadGraph(): Promise<Graph> {
  const cache = graphCache();
  if (cache.graph && cache.expiresAt > Date.now()) return cache.graph;
  if (!cache.pending) {
    // The topics response is larger than Next's 2 MB data-cache entry limit.
    // Fetch upstream once per warm process and retain the parsed graph for 24h.
    cache.pending = Promise.all([
      fetch(TOPICS_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`Unable to load topics: ${response.status}`);
        return response.json() as Promise<{ topics: Topic[] }>;
      }),
      fetch(DEPS_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`Unable to load dependencies: ${response.status}`);
        return response.json() as Promise<{ dependencies: Dependency[] }>;
      }),
    ]).then(([topicData, dependencyData]) => {
      const byId = new Map(topicData.topics.map((topic) => [topic.id, topic]));
      const prereqs = new Map<string, Link[]>();
      const unlocks = new Map<string, Link[]>();
      for (const dependency of dependencyData.dependencies) {
        const topic = byId.get(dependency.topicId);
        const prerequisite = byId.get(dependency.prerequisiteId);
        if (!topic || !prerequisite) continue;
        const prerequisiteLinks = prereqs.get(topic.id) ?? [];
        prerequisiteLinks.push({
          id: prerequisite.id,
          name: prerequisite.name,
          strength: dependency.strength,
          reason: dependency.reason,
        });
        prereqs.set(topic.id, prerequisiteLinks);
        const unlockLinks = unlocks.get(prerequisite.id) ?? [];
        unlockLinks.push({
          id: topic.id,
          name: topic.name,
          strength: dependency.strength,
          reason: dependency.reason,
        });
        unlocks.set(prerequisite.id, unlockLinks);
      }
      const graph = { topics: topicData.topics, byId, prereqs, unlocks };
      cache.graph = graph;
      cache.expiresAt = Date.now() + CACHE_TTL_MS;
      return graph;
    }).finally(() => {
      cache.pending = undefined;
    });
  }
  return cache.pending;
}

export async function getObjective(id: string) {
  return (await loadGraph()).byId.get(id) ?? null;
}

export async function searchObjectives(query: string, limit = 20) {
  const graph = await loadGraph();
  const normalized = query.trim().toLowerCase();
  return graph.topics
    .map((topic) => {
      const name = topic.name.toLowerCase();
      const description = topic.description.toLowerCase();
      const score =
        name === normalized
          ? 0
          : name.startsWith(normalized)
            ? 1
            : name.includes(normalized)
              ? 2
              : topic.domain.toLowerCase().includes(normalized)
                ? 3
                : description.includes(normalized)
                  ? 4
                  : 99;
      return { topic, score };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || b.topic.centrality - a.topic.centrality)
    .slice(0, limit)
    .map(({ topic }) => topic);
}

export async function neighboringObjectives(id: string) {
  const graph = await loadGraph();
  const objective = graph.byId.get(id);
  if (!objective) return null;
  return {
    objective,
    prerequisites: graph.prereqs.get(id) ?? [],
    unlocks: graph.unlocks.get(id) ?? [],
  };
}

export async function listPrograms() {
  const graph = await loadGraph();
  const programs = new Map<string, Map<string, number>>();
  for (const topic of graph.topics) {
    const domains = programs.get(topic.subject) ?? new Map<string, number>();
    domains.set(topic.domain, (domains.get(topic.domain) ?? 0) + 1);
    programs.set(topic.subject, domains);
  }
  return [...programs.entries()]
    .map(([subject, domains]) => ({
      subject,
      objectiveCount: [...domains.values()].reduce((sum, count) => sum + count, 0),
      domains: [...domains.entries()].map(([domain, objectiveCount]) => ({ domain, objectiveCount })),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

export async function objectivesInProgram(subject: string, domain?: string, limit = 100) {
  const graph = await loadGraph();
  return graph.topics
    .filter((topic) => topic.subject.toLowerCase() === subject.toLowerCase())
    .filter((topic) => !domain || topic.domain.toLowerCase() === domain.toLowerCase())
    .sort((a, b) => a.ageRangeStart - b.ageRangeStart || b.centrality - a.centrality)
    .slice(0, limit);
}

export async function learningFrontier(
  masteredIds: string[],
  subject?: string,
  domain?: string,
  limit = 25,
) {
  const graph = await loadGraph();
  const mastered = new Set(masteredIds);
  return graph.topics
    .filter((topic) => !mastered.has(topic.id))
    .filter((topic) => !subject || topic.subject.toLowerCase() === subject.toLowerCase())
    .filter((topic) => !domain || topic.domain.toLowerCase() === domain.toLowerCase())
    .filter((topic) =>
      (graph.prereqs.get(topic.id) ?? [])
        .filter((link) => link.strength === "hard")
        .every((link) => mastered.has(link.id)),
    )
    .sort((a, b) => a.ageRangeStart - b.ageRangeStart || b.centrality - a.centrality)
    .slice(0, limit);
}

export async function learningPath(targetId: string, masteredIds: string[]) {
  const graph = await loadGraph();
  if (!graph.byId.has(targetId)) return null;
  const mastered = new Set(masteredIds);
  const visited = new Set<string>();
  const stack = new Set<string>();
  const order: Topic[] = [];
  const visit = (id: string) => {
    if (mastered.has(id) || visited.has(id) || stack.has(id)) return;
    stack.add(id);
    for (const link of (graph.prereqs.get(id) ?? []).filter((item) => item.strength === "hard")) {
      visit(link.id);
    }
    stack.delete(id);
    visited.add(id);
    const topic = graph.byId.get(id);
    if (topic) order.push(topic);
  };
  visit(targetId);
  return order;
}
