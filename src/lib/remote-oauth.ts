import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const ACCESS_TOKEN_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_SECONDS = 10 * 60;
const CALLBACK_TOKEN_SECONDS = 15 * 60;
const DEFAULT_SCOPE = "asfai";

type OAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tenantId: string;
  createdAt: string;
};

type AuthorizationCode = {
  digest: string;
  clientId: string;
  tenantId: string;
  redirectUri: string;
  resource: string;
  scope: string[];
  codeChallenge: string;
  expiresAt: number;
};

type RefreshGrant = {
  digest: string;
  clientId: string;
  tenantId: string;
  resource: string;
  scope: string[];
  createdAt: string;
};

type OAuthState = {
  schemaVersion: "1";
  clients: Record<string, OAuthClient>;
  codes: Record<string, AuthorizationCode>;
  refreshGrants: Record<string, RefreshGrant>;
};

type AccessClaims = {
  iss: string;
  aud: string;
  sub: string;
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
  purpose?: string;
};

const EMPTY_STATE: OAuthState = { schemaVersion: "1", clients: {}, codes: {}, refreshGrants: {} };
let stateSerial: Promise<void> = Promise.resolve();

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function tokenSecret() {
  const value = process.env.ASFAI_REMOTE_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error("ASFAI remote OAuth is not configured.");
  return value;
}

function stateDirectory() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.ASFAI_REMOTE_DATA_DIR ?? "/var/lib/asfai");
}

function statePath() {
  return path.join(stateDirectory(), "oauth-state.json");
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

async function readState(): Promise<OAuthState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(), "utf8")) as OAuthState;
    if (parsed.schemaVersion !== "1" || !parsed.clients || !parsed.codes || !parsed.refreshGrants) {
      throw new Error("unsupported OAuth state");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_STATE);
    throw new Error("ASFAI could not read its remote authorization state.", { cause: error });
  }
}

async function mutateState<T>(operation: (state: OAuthState) => T | Promise<T>): Promise<T> {
  let resolveResult!: (value: T | PromiseLike<T>) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  stateSerial = stateSerial.then(async () => {
    try {
      const state = await readState();
      const now = Math.floor(Date.now() / 1000);
      for (const [key, code] of Object.entries(state.codes)) {
        if (code.expiresAt <= now) delete state.codes[key];
      }
      const value = await operation(state);
      await mkdir(stateDirectory(), { recursive: true });
      const target = statePath();
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, target);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  }, async () => {
    try {
      const state = await readState();
      const value = await operation(state);
      await mkdir(stateDirectory(), { recursive: true });
      const target = statePath();
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, target);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  }).then(() => undefined, () => undefined);
  return result;
}

function signClaims(claims: AccessClaims) {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson(claims);
  const signature = createHmac("sha256", tokenSecret()).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function parseAndVerifyToken(token: string): AccessClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid ASFAI token.");
  const expected = createHmac("sha256", tokenSecret()).update(`${parts[0]}.${parts[1]}`).digest();
  const supplied = Buffer.from(parts[2], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid ASFAI token.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AccessClaims;
  if (!claims.sub || !claims.client_id || !claims.iss || !claims.aud || !claims.exp) throw new Error("Invalid ASFAI token claims.");
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("ASFAI token expired.");
  return claims;
}

function normalizeOrigin(value: string) {
  return value.replace(/\/$/, "");
}

export function asfaiEducationBaseUrl() {
  const origin = normalizeOrigin(process.env.ASFAI_SITE_ORIGIN ?? "https://education.asfai.org");
  return origin.endsWith("/education") ? origin : `${origin}/education`;
}

export function asfaiOAuthIssuer() {
  return `${asfaiEducationBaseUrl()}/oauth`;
}

export function asfaiMcpResource() {
  return `${asfaiEducationBaseUrl()}/api/mcp`;
}

export function oauthMetadata() {
  const issuer = asfaiOAuthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    revocation_endpoint: `${issuer}/revoke`,
    authorization_response_iss_parameter_supported: true,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [DEFAULT_SCOPE],
  };
}

function allowedRedirectUri(value: string) {
  const url = new URL(value);
  if (url.protocol === "https:" && ["chatgpt.com", "platform.openai.com"].includes(url.hostname)) return true;
  if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) return true;
  return process.env.NODE_ENV !== "production" && url.protocol === "http:";
}

export async function registerOAuthClient(input: unknown) {
  const request = input as { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown };
  const redirectUris = Array.isArray(request.redirect_uris)
    ? request.redirect_uris.filter((item): item is string => typeof item === "string")
    : [];
  if (!redirectUris.length || redirectUris.some((uri) => !allowedRedirectUri(uri))) {
    throw new Error("invalid_redirect_uri");
  }
  if (request.token_endpoint_auth_method && request.token_endpoint_auth_method !== "none") {
    throw new Error("invalid_client_metadata");
  }
  const clientId = `asfai_${randomToken(24)}`;
  const client: OAuthClient = {
    clientId,
    clientName: typeof request.client_name === "string" ? request.client_name.slice(0, 200) : "ASFAI MCP client",
    redirectUris,
    tenantId: `tenant_${randomToken(24)}`,
    createdAt: new Date().toISOString(),
  };
  await mutateState((state) => { state.clients[clientId] = client; });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string[];
  state?: string;
  codeChallenge: string;
};

export async function validateAuthorizationRequest(parameters: URLSearchParams): Promise<AuthorizationRequest> {
  const clientId = parameters.get("client_id") ?? "";
  const redirectUri = parameters.get("redirect_uri") ?? "";
  const resource = parameters.get("resource") ?? "";
  const responseType = parameters.get("response_type");
  const codeChallenge = parameters.get("code_challenge") ?? "";
  const codeChallengeMethod = parameters.get("code_challenge_method");
  const scope = (parameters.get("scope") ?? DEFAULT_SCOPE).split(/\s+/).filter(Boolean);
  const client = (await readState()).clients[clientId];
  if (!client) throw new Error("unknown_client");
  if (!client.redirectUris.includes(redirectUri)) throw new Error("invalid_redirect_uri");
  if (resource !== asfaiMcpResource()) throw new Error("invalid_target");
  if (responseType !== "code") throw new Error("unsupported_response_type");
  if (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new Error("invalid_request");
  if (scope.some((item) => item !== DEFAULT_SCOPE)) throw new Error("invalid_scope");
  return { clientId, redirectUri, resource, scope, state: parameters.get("state") ?? undefined, codeChallenge };
}

export async function issueAuthorizationCode(request: AuthorizationRequest) {
  const state = await readState();
  const client = state.clients[request.clientId];
  if (!client || !client.redirectUris.includes(request.redirectUri)) throw new Error("invalid_client");
  const code = randomToken(32);
  const record: AuthorizationCode = {
    digest: digest(code),
    clientId: request.clientId,
    tenantId: client.tenantId,
    redirectUri: request.redirectUri,
    resource: request.resource,
    scope: request.scope,
    codeChallenge: request.codeChallenge,
    expiresAt: Math.floor(Date.now() / 1000) + AUTHORIZATION_CODE_SECONDS,
  };
  await mutateState((current) => { current.codes[record.digest] = record; });
  return code;
}

function issueAccessToken(grant: { clientId: string; tenantId: string; resource: string; scope: string[] }) {
  const now = Math.floor(Date.now() / 1000);
  return signClaims({
    iss: asfaiOAuthIssuer(), aud: grant.resource, sub: grant.tenantId, client_id: grant.clientId,
    scope: grant.scope.join(" "), iat: now, exp: now + ACCESS_TOKEN_SECONDS, jti: randomToken(16),
  });
}

async function issueRefreshToken(grant: Omit<RefreshGrant, "digest" | "createdAt">) {
  const refreshToken = randomToken(48);
  const record: RefreshGrant = { ...grant, digest: digest(refreshToken), createdAt: new Date().toISOString() };
  await mutateState((state) => { state.refreshGrants[record.digest] = record; });
  return refreshToken;
}

export async function exchangeAuthorizationCode(parameters: URLSearchParams) {
  const code = parameters.get("code") ?? "";
  const clientId = parameters.get("client_id") ?? "";
  const redirectUri = parameters.get("redirect_uri") ?? "";
  const resource = parameters.get("resource") ?? "";
  const verifier = parameters.get("code_verifier") ?? "";
  const codeDigest = digest(code);
  const record = await mutateState((state) => {
    const found = state.codes[codeDigest];
    if (found) delete state.codes[codeDigest];
    return found;
  });
  if (!record || record.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("invalid_grant");
  if (record.clientId !== clientId || record.redirectUri !== redirectUri || record.resource !== resource) throw new Error("invalid_grant");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  if (challenge !== record.codeChallenge) throw new Error("invalid_grant");
  const grant = { clientId, tenantId: record.tenantId, resource, scope: record.scope };
  return {
    access_token: issueAccessToken(grant),
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: await issueRefreshToken(grant),
    scope: grant.scope.join(" "),
  };
}

export async function refreshAccessToken(parameters: URLSearchParams) {
  const supplied = parameters.get("refresh_token") ?? "";
  const clientId = parameters.get("client_id") ?? "";
  const resource = parameters.get("resource") ?? "";
  const suppliedDigest = digest(supplied);
  const record = await mutateState((state) => {
    const found = state.refreshGrants[suppliedDigest];
    if (found) delete state.refreshGrants[suppliedDigest];
    return found;
  });
  if (!record || record.clientId !== clientId || record.resource !== resource) throw new Error("invalid_grant");
  const grant = { clientId, tenantId: record.tenantId, resource, scope: record.scope };
  return {
    access_token: issueAccessToken(grant), token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: await issueRefreshToken(grant), scope: grant.scope.join(" "),
  };
}

export async function revokeRefreshToken(parameters: URLSearchParams) {
  const supplied = parameters.get("token") ?? "";
  const revoked = await mutateState((state) => {
    const found = state.refreshGrants[digest(supplied)];
    if (!found) return undefined;
    for (const [key, grant] of Object.entries(state.refreshGrants)) {
      if (grant.clientId === found.clientId && grant.tenantId === found.tenantId) delete state.refreshGrants[key];
    }
    delete state.clients[found.clientId];
    return found;
  });
  if (revoked) {
    const tenantSegment = createHash("sha256").update(revoked.tenantId).digest("hex");
    await rm(path.join(stateDirectory(), "tenants", tenantSegment), { recursive: true, force: true });
  }
}

export function verifyMcpAccessToken(_request: Request, token?: string): AuthInfo | undefined {
  if (!token) return undefined;
  const claims = parseAndVerifyToken(token);
  if (claims.iss !== asfaiOAuthIssuer() || claims.aud !== asfaiMcpResource() || claims.purpose) throw new Error("Invalid ASFAI access token.");
  return {
    token,
    clientId: claims.client_id,
    scopes: claims.scope.split(/\s+/).filter(Boolean),
    expiresAt: claims.exp,
    resource: new URL(claims.aud),
    extra: { tenantId: claims.sub },
  };
}

export function signCallbackToken(tenantId: string, purpose: "solid-callback" | "google-callback") {
  const now = Math.floor(Date.now() / 1000);
  return signClaims({
    iss: asfaiOAuthIssuer(), aud: asfaiEducationBaseUrl(), sub: tenantId, client_id: "asfai-connector",
    scope: "", iat: now, exp: now + CALLBACK_TOKEN_SECONDS, jti: randomToken(16), purpose,
  });
}

export function verifyCallbackToken(token: string, purpose: "solid-callback" | "google-callback") {
  const claims = parseAndVerifyToken(token);
  if (claims.iss !== asfaiOAuthIssuer() || claims.aud !== asfaiEducationBaseUrl() || claims.purpose !== purpose) {
    throw new Error("Invalid ASFAI provider callback.");
  }
  return claims.sub;
}
