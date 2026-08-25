import { asfaiOAuthIssuer, issueAuthorizationCode, validateAuthorizationRequest, type AuthorizationRequest } from "@/lib/remote-oauth";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function hidden(name: string, value?: string) {
  return value === undefined ? "" : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

function consentPage(input: AuthorizationRequest) {
  const fields = [
    hidden("client_id", input.clientId), hidden("redirect_uri", input.redirectUri), hidden("resource", input.resource),
    hidden("scope", input.scope.join(" ")), hidden("state", input.state), hidden("code_challenge", input.codeChallenge),
    hidden("code_challenge_method", "S256"), hidden("response_type", "code"),
  ].join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ASFAI Learning</title><style>body{font:16px system-ui;max-width:42rem;margin:4rem auto;padding:0 1.25rem;color:#172033}h1{font:600 2rem Georgia,serif}p{line-height:1.55}.actions{display:flex;gap:.75rem;margin-top:2rem}button{border:1px solid #172033;border-radius:.5rem;padding:.75rem 1rem;font:inherit;background:white}button.primary{background:#172033;color:white}</style></head><body><h1>Connect ASFAI Learning</h1><p>This creates a private, accountless connection for this ChatGPT or Codex installation. It lets ASFAI remember your approved PrivateDataPod and classroom connections across chats and devices using the same connector.</p><p>Your Pod remains the primary home for learning records when connected. Classroom and Pod authorization can be removed later.</p><form method="post">${fields}<div class="actions"><button class="primary" name="decision" value="approve">Connect ASFAI</button><button name="decision" value="deny">Cancel</button></div></form></body></html>`;
}

function redirectResponse(input: AuthorizationRequest, values: Record<string, string>) {
  const target = new URL(input.redirectUri);
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  if (input.state) target.searchParams.set("state", input.state);
  target.searchParams.set("iss", asfaiOAuthIssuer());
  return Response.redirect(target, 302);
}

async function parseRequest(request: Request) {
  return request.method === "POST" ? new URLSearchParams(await request.text()) : new URL(request.url).searchParams;
}

async function handle(request: Request) {
  try {
    const parameters = await parseRequest(request);
    const input = await validateAuthorizationRequest(parameters);
    if (request.method === "GET") return new Response(consentPage(input), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (parameters.get("decision") !== "approve") return redirectResponse(input, { error: "access_denied" });
    return redirectResponse(input, { code: await issueAuthorizationCode(input) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "invalid_request" }, { status: 400 });
  }
}

export const GET = handle;
export const POST = handle;

