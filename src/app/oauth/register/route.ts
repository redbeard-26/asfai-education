import { registerOAuthClient } from "@/lib/remote-oauth";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS(request: Request) {
  return corsPreflight(request, "OPTIONS, POST");
}

export async function POST(request: Request) {
  let response: Response;
  try {
    response = Response.json(await registerOAuthClient(await request.json()), { status: 201 });
  } catch (error) {
    response = Response.json({ error: error instanceof Error ? error.message : "invalid_client_metadata" }, { status: 400 });
  }
  return withCors(request, response);
}
