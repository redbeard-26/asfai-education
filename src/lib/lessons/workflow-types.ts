import type { z } from "zod";
import { lessonActivityResultSchema } from "@/lib/lessons/schemas";

export type LessonActivityResult = z.infer<typeof lessonActivityResultSchema>;
