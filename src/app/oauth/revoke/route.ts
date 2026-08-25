import { revokeRefreshToken } from "@/lib/remote-oauth";

export async function POST(request: Request) {
  await revokeRefreshToken(new URLSearchParams(await request.text()));
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}

