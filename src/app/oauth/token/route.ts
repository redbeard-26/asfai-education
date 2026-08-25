import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/remote-oauth";

export async function POST(request: Request) {
  const parameters = new URLSearchParams(await request.text());
  try {
    const grantType = parameters.get("grant_type");
    const result = grantType === "authorization_code"
      ? await exchangeAuthorizationCode(parameters)
      : grantType === "refresh_token"
        ? await refreshAccessToken(parameters)
        : undefined;
    if (!result) return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
    return Response.json(result, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "invalid_grant" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}

