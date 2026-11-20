import { revokeRefreshToken } from "@/lib/remote-oauth";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS(request: Request) {
  return corsPreflight(request, "OPTIONS, POST");
}

export async function POST(request: Request) {
  await revokeRefreshToken(new URLSearchParams(await request.text()));
  return withCors(request, new Response(null, { status: 200, headers: { "cache-control": "no-store" } }));
}
