/*
 * Shared CORS allow-list for browser-based OAuth/MCP clients.
 *
 * ASFAI Learning is a public-OAuth service: a browser-only client can complete
 * registration and the token exchange without a secret, but the browser blocks
 * the responses unless the endpoints answer cross-origin requests. This helper
 * implements the allow-list described in asfai-education issue #16:
 *
 *   - An `Origin` only receives CORS headers when it exactly matches one of
 *     the origins in the `ASFAI_CORS_ORIGINS` env var (comma-separated).
 *   - A matching Origin is echoed back, `Vary: Origin` is added, and the
 *     methods, allowed headers, exposed headers and max-age below apply.
 *   - There is intentionally no `Access-Control-Allow-Credentials`: every call
 *     uses a Bearer token or a public-client form post, never cookies.
 *   - When `ASFAI_CORS_ORIGINS` is unset nothing changes: every response is
 *     byte-identical to the no-CORS behaviour these routes had before.
 */

const CORS_ALLOW_METHODS = "POST, OPTIONS";
const CORS_ALLOW_HEADERS =
  "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id";
const CORS_EXPOSE_HEADERS = "www-authenticate, mcp-session-id";
const CORS_MAX_AGE = "600";

/** Origins parsed from ASFAI_CORS_ORIGINS, or null when the env var is unset or blank. */
export function corsOrigins(): string[] | null {
  const raw = process.env.ASFAI_CORS_ORIGINS;
  if (!raw || !raw.trim()) return null;
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : null;
}

/** The request's Origin when it is on the allow-list, otherwise null. */
export function corsOrigin(request: Request): string | null {
  const origins = corsOrigins();
  if (!origins) return null;
  const origin = request.headers.get("origin");
  return origin && origins.includes(origin) ? origin : null;
}

/** The exact CORS header block from issue #16 for a listed origin. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-methods": CORS_ALLOW_METHODS,
    "access-control-allow-headers": CORS_ALLOW_HEADERS,
    "access-control-expose-headers": CORS_EXPOSE_HEADERS,
    "access-control-max-age": CORS_MAX_AGE,
  };
}

/** The CORS header block when the Origin is listed, otherwise null. */
export function corsContext(request: Request): Record<string, string> | null {
  const origin = corsOrigin(request);
  return origin ? corsHeaders(origin) : null;
}

/**
 * OPTIONS preflight for the four browser-facing routes. A listed Origin gets
 * the exact header block; anything else gets the same 204 the framework
 * returned before this helper existed (with the same `allow` line), so the
 * default response is byte-identical to the pre-change one.
 */
export function corsPreflight(request: Request, allowMethods: string): Response {
  const context = corsContext(request);
  if (context) return new Response(null, { status: 204, headers: context });
  return new Response(null, { status: 204, headers: { allow: allowMethods } });
}

/**
 * Add the allow-list CORS headers to a real response — including errors such
 * as the MCP 401, so a browser can read `www-authenticate`. The response is
 * returned unchanged when the Origin is unlisted or ASFAI_CORS_ORIGINS is
 * unset, which keeps the default byte-identical to the pre-change behaviour.
 */
export async function withCors(request: Request, response: Response | Promise<Response>): Promise<Response> {
  const context = corsContext(request);
  if (!context) return response;
  const resolved = await response;
  const headers = new Headers(resolved.headers);
  for (const [name, value] of Object.entries(context)) {
    headers.set(name, value);
  }
  return new Response(resolved.body, {
    status: resolved.status,
    statusText: resolved.statusText,
    headers,
  });
}
