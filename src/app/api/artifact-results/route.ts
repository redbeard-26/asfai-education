import { storeArtifactResult } from "@/lib/lessons/artifact-relay";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const launchId = url.searchParams.get("launch");
    const authorization = request.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!launchId || !token) return Response.json({ error: "Missing launch capability." }, { status: 400 });
    const text = await request.text();
    const byteLength = new TextEncoder().encode(text).byteLength;
    const result = storeArtifactResult(launchId, token, JSON.parse(text), byteLength);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /expired|invalid|unknown|consumed|match/i.test(message) ? 403 : 400;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
