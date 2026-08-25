import { asfaiEducationBaseUrl, verifyCallbackToken } from "@/lib/remote-oauth";
import { remotePersonalStorage } from "@/lib/remote-private-tools";

function page(title: string, message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${message}</p></body></html>`;
}

export async function GET(request: Request, context: { params: Promise<{ connection: string }> }) {
  try {
    const { connection } = await context.params;
    const tenantId = verifyCallbackToken(connection, "solid-callback");
    const incoming = new URL(`${asfaiEducationBaseUrl()}/oauth/solid/callback/${encodeURIComponent(connection)}`);
    incoming.search = new URL(request.url).search;
    await remotePersonalStorage(tenantId).completeSolidAuthorization(incoming.toString());
    return new Response(page("Private storage connected", "You can close this page and continue in chat."), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return new Response(page("Private storage connection failed", "Return to chat and ask ASFAI to try the connection again."), { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
}

