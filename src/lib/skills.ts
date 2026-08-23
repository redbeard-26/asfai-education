import fs from "node:fs";
import path from "node:path";

export interface Skill {
  name: string;
  description: string;
  body: string;
  version: number;
  files: string[];
}

const globalForSkills = globalThis as unknown as { asfaiSkills?: Skill[] };
export const SKILLS_DIR = path.join(process.cwd(), "src", "content", "skills");

function parseFrontmatter(raw: string, fallbackName: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { name: fallbackName, description: "", body: raw.trim() };
  const [, frontmatter, body] = match;
  const field = (key: string) => {
    const line = frontmatter.split(/\r?\n/).find((item) => item.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  };
  return { name: field("name") || fallbackName, description: field("description"), body: body.trim() };
}

function listFiles(directory: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

function loadSkills(): Skill[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(SKILLS_DIR, entry.name);
    const skillMarkdown = path.join(directory, "SKILL.md");
    if (!fs.existsSync(skillMarkdown)) continue;
    const { name, description, body } = parseFrontmatter(
      fs.readFileSync(skillMarkdown, "utf8"),
      entry.name,
    );
    let version = 1;
    try {
      const parsed = Number.parseInt(fs.readFileSync(path.join(directory, "VERSION"), "utf8").trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) version = parsed;
    } catch {
      // VERSION is optional.
    }
    const files = listFiles(directory).sort((a, b) =>
      a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b),
    );
    skills.push({ name, description, body, version, files });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function listSkills(): Skill[] {
  if (!globalForSkills.asfaiSkills) globalForSkills.asfaiSkills = loadSkills();
  return globalForSkills.asfaiSkills;
}
