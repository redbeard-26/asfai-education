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
