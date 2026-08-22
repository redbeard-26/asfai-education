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

const TOPICS_URL = "https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/main/data/topics.json";
const DEPS_URL = "https://raw.githubusercontent.com/withmarbleapp/os-taxonomy/main/data/dependencies.json";

let graphPromise: Promise<Graph> | undefined;

async function loadGraph(): Promise<Graph> {
  if (!graphPromise) {
    graphPromise = Promise.all([
      fetch(TOPICS_URL, { next: { revalidate: 86400 } }).then((r) => {
        if (!r.ok) throw new Error(`Unable to load topics: ${r.status}`);
        return r.json() as Promise<{ topics: Topic[] }>;
      }),
      fetch(DEPS_URL, { next: { revalidate: 86400 } }).then((r) => {
        if (!r.ok) throw new Error(`Unable to load dependencies: ${r.status}`);
        return r.json() as Promise<{ dependencies: Dependency[] }>;
      }),
    ]).then(([topicData, depData]) => {
      const byId = new Map(topicData.topics.map((topic) => [topic.id, topic]));
      const prereqs = new Map<string, Link[]>();
      const unlocks = new Map<string, Link[]>();
      for (const dep of depData.dependencies) {
        const topic = byId.get(dep.topicId);
        const prereq = byId.get(dep.prerequisiteId);
        if (!topic || !prereq) continue;
        const p = prereqs.get(topic.id) ?? [];
        p.push({ id: prereq.id, name: prereq.name, strength: dep.strength, reason: dep.reason });
        prereqs.set(topic.id, p);
        const u = unlocks.get(prereq.id) ?? [];
        u.push({ id: topic.id, name: topic.name, strength: dep.strength, reason: dep.reason });
        unlocks.set(prereq.id, u);
      }
      return { topics: topicData.topics, byId, prereqs, unlocks };
    });
  }
  return graphPromise;
}

export async function getObjective(id: string) {
  return (await loadGraph()).byId.get(id) ?? null;
}

export async function searchObjectives(query: string, limit = 20) {
  const graph = await loadGraph();
  const q = query.trim().toLowerCase();
  return graph.topics
    .map((topic) => {
      const name = topic.name.toLowerCase();
      const description = topic.description.toLowerCase();
      const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : description.includes(q) ? 3 : 99;
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

export async function learningFrontier(masteredIds: string[], subject?: string, domain?: string, limit = 25) {
  const graph = await loadGraph();
  const mastered = new Set(masteredIds);
  return graph.topics
    .filter((topic) => !mastered.has(topic.id))
    .filter((topic) => !subject || topic.subject.toLowerCase() === subject.toLowerCase())
    .filter((topic) => !domain || topic.domain.toLowerCase() === domain.toLowerCase())
    .filter((topic) => (graph.prereqs.get(topic.id) ?? []).filter((link) => link.strength === "hard").every((link) => mastered.has(link.id)))
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
    for (const link of (graph.prereqs.get(id) ?? []).filter((x) => x.strength === "hard")) visit(link.id);
    stack.delete(id);
    visited.add(id);
    const topic = graph.byId.get(id);
    if (topic) order.push(topic);
  };
  visit(targetId);
  return order;
}
