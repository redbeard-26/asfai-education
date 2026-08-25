import { asfaiEducationBaseUrl, verifyCallbackToken } from "@/lib/remote-oauth";
import { remoteGoogleAdapter } from "@/lib/remote-private-tools";

function page(title: string, message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${message}</p></body></html>`;
}

export async function GET(request: Request) {
  try {
    const incoming = new URL(request.url);
    const state = incoming.searchParams.get("state");
    if (!state) throw new Error("Missing Google authorization state.");
    const tenantId = verifyCallbackToken(state, "google-callback");
    const publicIncoming = new URL(`${asfaiEducationBaseUrl()}/oauth/google/callback`);
    publicIncoming.search = incoming.search;
    await remoteGoogleAdapter(tenantId, state).completeAuthorizationRedirect(publicIncoming.toString());
    return new Response(page("Google Classroom connected", "You can close this page and continue in chat."), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return new Response(page("Google Classroom connection failed", "Return to chat and ask ASFAI to try the connection again."), { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
}

