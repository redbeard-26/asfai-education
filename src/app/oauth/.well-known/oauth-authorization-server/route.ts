import { oauthMetadata } from "@/lib/remote-oauth";

export function GET() {
  return Response.json(oauthMetadata(), { headers: { "access-control-allow-origin": "*" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
  } });
}

