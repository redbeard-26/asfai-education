import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { listSkills, SKILLS_DIR } from "@/lib/skills";

function skillDirectory(name: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) return null;
  const directory = path.join(SKILLS_DIR, name);
  if (!directory.startsWith(SKILLS_DIR + path.sep)) return null;
  return listSkills().some((skill) => skill.name === name) ? directory : null;
}

export function readSkillFiles(name: string): { path: string; text: string }[] | null {
  const directory = skillDirectory(name);
  const skill = listSkills().find((item) => item.name === name);
  if (!directory || !skill) return null;
  return skill.files.map((relative) => ({
    path: `${name}/${relative}`,
    text: fs.readFileSync(
      /* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory, relative),
      "utf8",
    ),
  }));
}

export function buildSkillBundle(name: string): Uint8Array | null {
  const directory = skillDirectory(name);
  const skill = listSkills().find((item) => item.name === name);
  if (!directory || !skill) return null;
  const entries: Record<string, Uint8Array> = {};
  for (const relative of skill.files) {
    entries[`${name}/${relative}`] = new Uint8Array(
      fs.readFileSync(
        /* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory, relative),
      ),
    );
  }
  return zipSync(entries, { level: 6 });
}
