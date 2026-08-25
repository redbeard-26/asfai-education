import blockAlgebra from "@/content/lessons/block-algebra/1.0.0/lesson.json";
import { validateLesson } from "@/lib/lessons/validation";
import type { LessonDefinition } from "@/lib/lessons/schemas";

const bundledInputs: unknown[] = [blockAlgebra];
let bundledLessons: LessonDefinition[] | undefined;

function loadBundledLessons() {
  if (bundledLessons) return bundledLessons;
  bundledLessons = bundledInputs.map((input) => {
    const result = validateLesson(input);
    if (!result.valid || !result.lesson) {
      throw new Error(`Invalid bundled lesson: ${result.errors.join("; ")}`);
    }
    return result.lesson;
  });
  return bundledLessons;
}

function absoluteUrl(url: string, siteOrigin: string) {
  if (URL.canParse(url)) return url;
  return new URL(url, `${siteOrigin.replace(/\/$/, "")}/`).toString();
}

export function lessonForOrigin(lesson: LessonDefinition, siteOrigin: string): LessonDefinition {
  return {
    ...lesson,
    artifacts: lesson.artifacts.map((artifact) => ({
      ...artifact,
      url: absoluteUrl(artifact.url, siteOrigin),
    })),
  };
}

export function listLessons(siteOrigin: string) {
  return loadBundledLessons()
    .filter((lesson) => lesson.status === "published")
    .map((lesson) => lessonForOrigin(lesson, siteOrigin));
}

export function searchLessons(query: string, siteOrigin: string, objectiveIds: string[] = []) {
  const normalized = query.trim().toLowerCase();
  return listLessons(siteOrigin).filter((lesson) => {
    const searchable = `${lesson.title} ${lesson.description} ${lesson.objectives.map((item) => `${item.name} ${item.description ?? ""}`).join(" ")}`.toLowerCase();
    const queryMatches = !normalized || searchable.includes(normalized);
    const objectiveMatches = objectiveIds.length === 0 || objectiveIds.some((id) => lesson.objectives.some((item) => item.objectiveId === id));
    return queryMatches && objectiveMatches;
  });
}

export function getLesson(id: string, siteOrigin: string, version?: string) {
  const lesson = loadBundledLessons().find(
    (item) => item.id === id && (!version || item.version === version) && item.status === "published",
  );
  return lesson ? lessonForOrigin(lesson, siteOrigin) : null;
}

export function getBundledLessonForValidation(id: string, version?: string) {
  return loadBundledLessons().find((item) => item.id === id && (!version || item.version === version)) ?? null;
}
