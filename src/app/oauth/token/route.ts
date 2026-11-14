import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/remote-oauth";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS(request: Request) {
  return corsPreflight(request, "OPTIONS, POST");
}

export async function POST(request: Request) {
  const parameters = new URLSearchParams(await request.text());
  let response: Response;
  try {
    const grantType = parameters.get("grant_type");
    const result = grantType === "authorization_code"
      ? await exchangeAuthorizationCode(parameters)
      : grantType === "refresh_token"
        ? await refreshAccessToken(parameters)
        : undefined;
    if (!result) response = Response.json({ error: "unsupported_grant_type" }, { status: 400 });
    else response = Response.json(result, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  } catch (error) {
    response = Response.json({ error: error instanceof Error ? error.message : "invalid_grant" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  return withCors(request, response);
}
