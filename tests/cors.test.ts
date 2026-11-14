import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/*
 * Browser MCP client support: ASFAI_CORS_ORIGINS allow-list.
 *
 * Covers the four endpoints named in asfai-education issue #16:
 *   GET/POST /education/oauth/register, /oauth/token, /oauth/revoke and /api/mcp
 * plus their OPTIONS preflights. Every unlocked behaviour is a function of the
 * request's Origin and the ASFAI_CORS_ORIGINS env var, so tests import the
 * route modules directly and drive their exported handlers.
 */

const LISTED_ORIGIN = "https://silicus-ta.vercel.app";
const UNLISTED_ORIGIN = "https://unlisted.example.com";
const CORS_ENV = "ASFAI_CORS_ORIGINS";

/*
 * Look-alike Origins: requests that share text with the listed origin but are
 * not an exact string match. Each must receive zero access-control-* headers
 * on every endpoint — the security property of this allow-list is exact
 * match. These rows guard the strict equality in corsOrigin() against
 * startsWith / includes / "null" short-circuit regressions. A padded Origin
 * (` https://… `) is deliberately NOT here: the Fetch/HTTP layer strips
 * surrounding whitespace (OWS), so it reaches corsOrigin() as the exact
 * listed origin and legitimately matches.
 */
const LOOKALIKE_ORIGINS: { name: string; origin: string }[] = [
  { name: "a suffix after the host's TLD", origin: `${LISTED_ORIGIN}.evil.example` },
  { name: "an extra subdomain before the host", origin: "https://evil.silicus-ta.vercel.app" },
  { name: "the listed origin spliced after an attacker prefix", origin: `evil-${LISTED_ORIGIN}` },
  { name: "an explicit default port", origin: `${LISTED_ORIGIN}:443` },
  { name: "a different scheme", origin: "http://silicus-ta.vercel.app" },
  { name: "a trailing slash", origin: `${LISTED_ORIGIN}/` },
  { name: "an upper-case host", origin: "https://SILICUS-TA.VERCEL.APP" },
  { name: "the literal string null", origin: "null" },
  { name: "a wildcard", origin: "*" },
];

const BASE = "https://education.asfai.org/education";

const ENDPOINTS = {
  register: `${BASE}/oauth/register`,
  token: `${BASE}/oauth/token`,
  revoke: `${BASE}/oauth/revoke`,
  mcp: `${BASE}/api/mcp`,
} as const;

type RouteModule = {
  GET?: (request: Request) => Promise<Response> | Response;
  POST?: (request: Request) => Promise<Response> | Response;
  DELETE?: (request: Request) => Promise<Response> | Response;
  OPTIONS?: (request: Request) => Promise<Response> | Response;
};

function loadRoutes(): Record<keyof typeof ENDPOINTS, () => Promise<RouteModule>> {
  return {
    register: () => import("@/app/oauth/register/route"),
    token: () => import("@/app/oauth/token/route"),
    revoke: () => import("@/app/oauth/revoke/route"),
    mcp: () => import("@/app/api/[transport]/route"),
  };
}

const routes = loadRoutes();

function preflight(url: string, origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) {
    headers.set("Origin", origin);
    headers.set("Access-Control-Request-Method", "POST");
  }
  return new Request(url, { method: "OPTIONS", headers });
}

function corsHeaderNames(headers: Headers): string[] {
  return Array.from(headers.keys()).filter((name) => name.toLowerCase().startsWith("access-control-"));
}

/** The exact header set from issue #16, in the exact values. */
function expectListedPreflight(headers: Headers, origin: string) {
  expect(headers.get("access-control-allow-origin")).toBe(origin);
  expect(headers.get("vary")?.toLowerCase()).toBe("origin");
  expect(headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  expect(headers.get("access-control-allow-headers")).toBe(
    "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  );
  expect(headers.get("access-control-expose-headers")).toBe("www-authenticate, mcp-session-id");
  expect(headers.get("access-control-max-age")).toBe("600");
  expect(headers.get("access-control-allow-credentials")).toBeNull();
}

function expectNoCorsHeaders(headers: Headers) {
  expect(corsHeaderNames(headers)).toEqual([]);
}

describe("CORS preflights on the four OAuth/MCP endpoints", () => {
  it("register: a listed Origin gets the exact preflight header set", async () => {
    const { OPTIONS } = await routes.register();
    const response = await OPTIONS!(preflight(ENDPOINTS.register, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
  });

  it("register: an unlisted Origin gets no CORS headers (204 only)", async () => {
    const { OPTIONS } = await routes.register();
    const response = await OPTIONS!(preflight(ENDPOINTS.register, UNLISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("register: env unset returns today's response, no CORS headers", async () => {
    delete process.env[CORS_ENV];
    const { OPTIONS } = await routes.register();
    const response = await OPTIONS!(preflight(ENDPOINTS.register, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("token: a listed Origin gets the exact preflight header set", async () => {
    const { OPTIONS } = await routes.token();
    const response = await OPTIONS!(preflight(ENDPOINTS.token, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
  });

  it("token: an unlisted Origin gets no CORS headers", async () => {
    const { OPTIONS } = await routes.token();
    const response = await OPTIONS!(preflight(ENDPOINTS.token, UNLISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("token: env unset returns today's response, no CORS headers", async () => {
    delete process.env[CORS_ENV];
    const { OPTIONS } = await routes.token();
    const response = await OPTIONS!(preflight(ENDPOINTS.token, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("revoke: a listed Origin gets the exact preflight header set", async () => {
    const { OPTIONS } = await routes.revoke();
    const response = await OPTIONS!(preflight(ENDPOINTS.revoke, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
  });

  it("revoke: an unlisted Origin gets no CORS headers", async () => {
    const { OPTIONS } = await routes.revoke();
    const response = await OPTIONS!(preflight(ENDPOINTS.revoke, UNLISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("revoke: env unset returns today's response, no CORS headers", async () => {
    delete process.env[CORS_ENV];
    const { OPTIONS } = await routes.revoke();
    const response = await OPTIONS!(preflight(ENDPOINTS.revoke, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("api/mcp: a listed Origin gets the exact preflight header set", async () => {
    const { OPTIONS } = await routes.mcp();
    const response = await OPTIONS!(preflight(ENDPOINTS.mcp, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
  });

  it("api/mcp: an unlisted Origin gets no CORS headers", async () => {
    const { OPTIONS } = await routes.mcp();
    const response = await OPTIONS!(preflight(ENDPOINTS.mcp, UNLISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });

  it("api/mcp: env unset returns today's response, no CORS headers", async () => {
    delete process.env[CORS_ENV];
    const { OPTIONS } = await routes.mcp();
    const response = await OPTIONS!(preflight(ENDPOINTS.mcp, LISTED_ORIGIN));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });
});

describe("CORS headers on the real responses", () => {
  it("register POST: a listed Origin gets CORS headers on a real (400) response", async () => {
    const { POST } = await routes.register();
    const request = new Request(ENDPOINTS.register, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST!(request);
    expect(response.status).toBe(400);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
  });

  it("register POST: unlisted Origin keeps today's headers", async () => {
    const { POST } = await routes.register();
    const request = new Request(ENDPOINTS.register, {
      method: "POST",
      headers: { Origin: UNLISTED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST!(request);
    expect(response.status).toBe(400);
    expectNoCorsHeaders(response.headers);
  });

  it("register POST: env unset leaves the response byte-identical (no CORS headers)", async () => {
    delete process.env[CORS_ENV];
    const { POST } = await routes.register();
    const request = new Request(ENDPOINTS.register, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST!(request);
    expect(response.status).toBe(400);
    expectNoCorsHeaders(response.headers);
    expect(await response.json()).toEqual({ error: "invalid_redirect_uri" });
  });

  it("token POST: a listed Origin gets CORS headers and keeps cache-control", async () => {
    const { POST } = await routes.token();
    const request = new Request(ENDPOINTS.token, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username: "x", password: "y" }),
    });
    const response = await POST!(request);
    expect(response.status).toBe(400);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
    expect(await response.json()).toEqual({ error: "unsupported_grant_type" });
  });

  it("token POST: env unset leaves the response unchanged", async () => {
    delete process.env[CORS_ENV];
    const { POST } = await routes.token();
    const request = new Request(ENDPOINTS.token, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username: "x", password: "y" }),
    });
    const response = await POST!(request);
    expect(response.status).toBe(400);
    expectNoCorsHeaders(response.headers);
    expect(await response.json()).toEqual({ error: "unsupported_grant_type" });
  });

  it("revoke POST: a listed Origin gets CORS headers and keeps cache-control", async () => {
    const { POST } = await routes.revoke();
    const request = new Request(ENDPOINTS.revoke, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "bogus-refresh-token" }),
    });
    const response = await POST!(request);
    expect(response.status).toBe(200);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("revoke POST: env unset leaves the response unchanged", async () => {
    delete process.env[CORS_ENV];
    const { POST } = await routes.revoke();
    const request = new Request(ENDPOINTS.revoke, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "bogus-refresh-token" }),
    });
    const response = await POST!(request);
    expect(response.status).toBe(200);
    expectNoCorsHeaders(response.headers);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("api/mcp POST: the 401 keeps www-authenticate and gains CORS headers for a listed Origin", async () => {
    const { POST } = await routes.mcp();
    const request = new Request(ENDPOINTS.mcp, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    const response = await POST!(request);
    expect(response.status).toBe(401);
    expectListedPreflight(response.headers, LISTED_ORIGIN);
    expect(response.headers.get("www-authenticate")).toBeTruthy();
  });

  it("api/mcp POST: env unset leaves the 401 byte-identical (no CORS headers)", async () => {
    delete process.env[CORS_ENV];
    const { POST } = await routes.mcp();
    const request = new Request(ENDPOINTS.mcp, {
      method: "POST",
      headers: { Origin: LISTED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    const response = await POST!(request);
    expect(response.status).toBe(401);
    expectNoCorsHeaders(response.headers);
    expect(response.headers.get("www-authenticate")).toBeTruthy();
  });
});

describe("look-alike origins get no CORS headers on preflights", () => {
  const endpoints = Object.keys(ENDPOINTS) as (keyof typeof ENDPOINTS)[];
  const cases = endpoints.flatMap((endpoint) =>
    LOOKALIKE_ORIGINS.map((lookalike) => ({ endpoint, ...lookalike })),
  );

  it.each(cases)("$endpoint preflight: $name", async ({ endpoint, origin }) => {
    const { OPTIONS } = await routes[endpoint]();
    const response = await OPTIONS!(preflight(ENDPOINTS[endpoint], origin));
    expect(response.status).toBe(204);
    expectNoCorsHeaders(response.headers);
  });
});

describe("look-alike origins get no CORS headers on real responses", () => {
  it.each(LOOKALIKE_ORIGINS)("register POST: $name (400 stays readable, no CORS headers)", async ({ origin }) => {
    const { POST } = await routes.register();
    const response = await POST!(
      new Request(ENDPOINTS.register, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
    expectNoCorsHeaders(response.headers);
  });

  it.each(LOOKALIKE_ORIGINS)("api/mcp POST: $name (401 stays readable, no CORS headers)", async ({ origin }) => {
    const { POST } = await routes.mcp();
    const response = await POST!(
      new Request(ENDPOINTS.mcp, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(response.status).toBe(401);
    expectNoCorsHeaders(response.headers);
    expect(response.headers.get("www-authenticate")).toBeTruthy();
  });
});

describe("allow-list parsing: an env entry with surrounding spaces", () => {
  it("is trimmed to an exact-match entry; the listed origin matches, look-alikes do not", async () => {
    process.env[CORS_ENV] = `  ${LISTED_ORIGIN}  ,  https://app.example.com , ,`;
    const { OPTIONS } = await routes.register();

    const listed = await OPTIONS!(preflight(ENDPOINTS.register, LISTED_ORIGIN));
    expect(listed.status).toBe(204);
    expectListedPreflight(listed.headers, LISTED_ORIGIN);

    const second = await OPTIONS!(preflight(ENDPOINTS.register, "https://app.example.com"));
    expect(second.status).toBe(204);
    expectListedPreflight(second.headers, "https://app.example.com");

    const suffixed = await OPTIONS!(preflight(ENDPOINTS.register, `${LISTED_ORIGIN}.evil.example`));
    expect(suffixed.status).toBe(204);
    expectNoCorsHeaders(suffixed.headers);
  });
});

beforeEach(() => {
  process.env[CORS_ENV] = LISTED_ORIGIN;
});

afterEach(() => {
  delete process.env[CORS_ENV];
});

let tempStateDir: string;

beforeAll(() => {
  tempStateDir = mkdtempSync(path.join(tmpdir(), "asfai-cors-test-"));
  process.env.ASFAI_REMOTE_DATA_DIR = tempStateDir;
  process.env.ASFAI_REMOTE_TOKEN_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
});

afterAll(() => {
  delete process.env.ASFAI_REMOTE_DATA_DIR;
  delete process.env.ASFAI_REMOTE_TOKEN_SECRET;
  rmSync(tempStateDir, { recursive: true, force: true });
});
