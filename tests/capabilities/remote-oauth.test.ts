import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  asfaiMcpResource,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  oauthMetadata,
  refreshAccessToken,
  registerOAuthClient,
  revokeRefreshToken,
  signCallbackToken,
  validateAuthorizationRequest,
  verifyCallbackToken,
  verifyMcpAccessToken,
} from "@/lib/remote-oauth";

describe("remote ASFAI connector OAuth", () => {
  let directory: string;
  const prior = { data: process.env.ASFAI_REMOTE_DATA_DIR, token: process.env.ASFAI_REMOTE_TOKEN_SECRET, origin: process.env.ASFAI_SITE_ORIGIN };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "asfai-remote-oauth-"));
    process.env.ASFAI_REMOTE_DATA_DIR = directory;
    process.env.ASFAI_REMOTE_TOKEN_SECRET = randomBytes(48).toString("base64url");
    process.env.ASFAI_SITE_ORIGIN = "https://asfai.example";
  });

  afterEach(async () => {
    if (prior.data === undefined) delete process.env.ASFAI_REMOTE_DATA_DIR; else process.env.ASFAI_REMOTE_DATA_DIR = prior.data;
    if (prior.token === undefined) delete process.env.ASFAI_REMOTE_TOKEN_SECRET; else process.env.ASFAI_REMOTE_TOKEN_SECRET = prior.token;
    if (prior.origin === undefined) delete process.env.ASFAI_SITE_ORIGIN; else process.env.ASFAI_SITE_ORIGIN = prior.origin;
    await rm(directory, { recursive: true, force: true });
  });

  it("registers one accountless connector tenant and completes PKCE with refresh", async () => {
    const registered = await registerOAuthClient({
      client_name: "Test ASFAI host",
      redirect_uris: ["http://127.0.0.1:45678/callback"],
      token_endpoint_auth_method: "none",
    }) as { client_id: string };
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = new URLSearchParams({
      client_id: registered.client_id,
      redirect_uri: "http://127.0.0.1:45678/callback",
      resource: asfaiMcpResource(),
      response_type: "code",
      scope: "asfai",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const request = await validateAuthorizationRequest(authorize);
    const code = await issueAuthorizationCode(request);
    const tokens = await exchangeAuthorizationCode(new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registered.client_id,
      redirect_uri: request.redirectUri,
      resource: request.resource,
      code,
      code_verifier: verifier,
    }));
    const auth = verifyMcpAccessToken(new Request(asfaiMcpResource()), tokens.access_token);
    expect(auth).toMatchObject({ clientId: registered.client_id, scopes: ["asfai"], resource: new URL(asfaiMcpResource()) });
    expect(auth?.extra?.tenantId).toMatch(/^tenant_/);

    const refreshed = await refreshAccessToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: registered.client_id,
      resource: request.resource,
      refresh_token: tokens.refresh_token,
    }));
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    expect(verifyMcpAccessToken(new Request(asfaiMcpResource()), refreshed.access_token)?.extra?.tenantId).toBe(auth?.extra?.tenantId);
    expect(oauthMetadata()).toMatchObject({ code_challenge_methods_supported: ["S256"], grant_types_supported: ["authorization_code", "refresh_token"] });

    await revokeRefreshToken(new URLSearchParams({ token: refreshed.refresh_token }));
    await expect(refreshAccessToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: registered.client_id,
      resource: request.resource,
      refresh_token: refreshed.refresh_token,
    }))).rejects.toThrow("invalid_grant");
  });

  it("binds provider callbacks to the authenticated connector tenant", () => {
    const token = signCallbackToken("tenant-example", "google-callback");
    expect(verifyCallbackToken(token, "google-callback")).toBe("tenant-example");
    expect(() => verifyCallbackToken(token, "solid-callback")).toThrow("Invalid ASFAI provider callback");
  });
});
