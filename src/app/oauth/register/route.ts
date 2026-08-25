import { registerOAuthClient } from "@/lib/remote-oauth";

export async function POST(request: Request) {
  try {
    return Response.json(await registerOAuthClient(await request.json()), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "invalid_client_metadata" }, { status: 400 });
  }
}

