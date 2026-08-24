import { createHash } from "node:crypto";
import { lessonDefinitionSchema, type LessonDefinition } from "@/lib/lessons/schemas";

export interface LessonValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  lesson?: LessonDefinition;
}

function duplicates(values: string[]) {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => (seen.has(value) ? true : !seen.add(value))))];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function lessonContentDigest(lesson: LessonDefinition) {
  const content = {
    ...lesson,
    artifacts: lesson.artifacts.map((artifact) => {
      let url = artifact.url;
      try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith("/education/artifacts/")) url = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        // Stable relative artifact paths are already in digest form.
      }
      return { ...artifact, url };
    }),
    provenance: { ...lesson.provenance, contentDigest: undefined },
  };
  return createHash("sha256").update(canonical(content)).digest("hex");
}

export function validateLesson(input: unknown): LessonValidationResult {
  const parsed = lessonDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "lesson"}: ${issue.message}`),
      warnings: [],
    };
  }

  const lesson = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const objectiveIds = new Set(lesson.objectives.map((item) => item.objectiveId));
  const artifactIds = new Set(lesson.artifacts.map((item) => item.id));
  const methodIds = new Set(lesson.assessmentMethods.map((item) => item.id));
  const activityIds = new Set(lesson.activities.map((item) => item.id));

  for (const duplicate of duplicates(lesson.objectives.map((item) => item.objectiveId))) {
    errors.push(`Duplicate objective '${duplicate}'.`);
  }
  for (const duplicate of duplicates(lesson.artifacts.map((item) => item.id))) {
    errors.push(`Duplicate artifact '${duplicate}'.`);
  }
  for (const duplicate of duplicates(lesson.assessmentMethods.map((item) => item.id))) {
    errors.push(`Duplicate assessment method '${duplicate}'.`);
  }
  for (const duplicate of duplicates(lesson.activities.map((item) => item.id))) {
    errors.push(`Duplicate activity '${duplicate}'.`);
  }

  for (const method of lesson.assessmentMethods) {
    for (const objectiveId of method.objectiveIds) {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(`Assessment method '${method.id}' references unknown objective '${objectiveId}'.`);
      }
    }
    if (method.consequential) {
      warnings.push(`Assessment method '${method.id}' is marked consequential and requires educator review and an appeal path.`);
    }
  }

  for (const activity of lesson.activities) {
    for (const objectiveId of activity.objectiveIds) {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(`Activity '${activity.id}' references unknown objective '${objectiveId}'.`);
      }
    }
    for (const methodId of activity.assessmentMethodIds) {
      if (!methodIds.has(methodId)) {
        errors.push(`Activity '${activity.id}' references unknown assessment method '${methodId}'.`);
      }
    }
    if (activity.artifactId && !artifactIds.has(activity.artifactId)) {
      errors.push(`Activity '${activity.id}' references unknown artifact '${activity.artifactId}'.`);
    }
    if (activity.type === "game" && !activity.artifactId) {
      errors.push(`Game activity '${activity.id}' must reference an artifact.`);
    }
  }

  for (const prerequisite of lesson.prerequisites) {
    if (!objectiveIds.has(prerequisite)) {
      warnings.push(`Prerequisite '${prerequisite}' is not one of this lesson's objectives; ensure it resolves in the public graph.`);
    }
  }
  for (const artifact of lesson.artifacts) {
    if (artifact.type === "game" && !artifact.evidenceAdapter) {
      errors.push(`Game artifact '${artifact.id}' must name an evidence adapter.`);
    }
    if (!artifact.accessibility.keyboardSupported && !artifact.accessibility.fallback) {
      errors.push(`Artifact '${artifact.id}' needs a keyboard path or an explicit fallback activity.`);
    }
  }
  if (lesson.status === "published" && !lesson.provenance.contentDigest) {
    warnings.push("Published lesson has no content digest; the publisher should add one to the immutable release manifest.");
  } else if (lesson.provenance.contentDigest && lesson.provenance.contentDigest !== lessonContentDigest(lesson)) {
    errors.push("Lesson content digest does not match the normalized lesson content.");
  }
  if (activityIds.size === 0) errors.push("Lesson contains no activities.");

  return { valid: errors.length === 0, errors, warnings, lesson };
}
