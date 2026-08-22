import { NextRequest, NextResponse } from "next/server";
import {
  learningFrontier,
  listPrograms,
  neighboringObjectives,
  objectivesInProgram,
  searchObjectives,
} from "@/lib/graph";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") ?? "search";

  if (mode === "programs") return NextResponse.json(await listPrograms());

  if (mode === "neighbors") {
    const id = params.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const result = await neighboringObjectives(id);
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "objective not found" }, { status: 404 });
  }

  if (mode === "program") {
    const subject = params.get("subject");
    if (!subject) return NextResponse.json({ error: "subject is required" }, { status: 400 });
    return NextResponse.json(
      await objectivesInProgram(subject, params.get("domain") ?? undefined, Number(params.get("limit") ?? 100)),
    );
  }

  if (mode === "frontier") {
    const masteredIds = (params.get("mastered") ?? "").split(",").filter(Boolean);
    return NextResponse.json(
      await learningFrontier(
        masteredIds,
        params.get("subject") ?? undefined,
        params.get("domain") ?? undefined,
        Number(params.get("limit") ?? 25),
      ),
    );
  }

  return NextResponse.json(await searchObjectives(params.get("q") ?? "", Number(params.get("limit") ?? 20)));
}
