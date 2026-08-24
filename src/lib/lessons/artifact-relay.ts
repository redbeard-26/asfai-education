import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_RESULT_BYTES = 128 * 1024;
const DEFAULT_TTL_SECONDS = 3600;
const MAX_ACTIVE_LAUNCHES = 10_000;

const artifactResultSchema = z.object({
  source: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
  schema: z.union([z.string(), z.number()]),
  session: z.string().min(1).max(300),
  summary: z.record(z.string(), z.unknown()),
  events: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  completedAt: z.string().datetime({ offset: true }),
});

export type ArtifactResult = z.infer<typeof artifactResultSchema>;

interface RelayRecord {
  artifactId: string;
  expiresAt: number;
  result?: ArtifactResult;
  consumed: boolean;
}

interface RelayState {
  records: Map<string, RelayRecord>;
}

const globalRelay = globalThis as unknown as { asfaiArtifactRelay?: RelayState };

function relayState() {
  if (!globalRelay.asfaiArtifactRelay) globalRelay.asfaiArtifactRelay = { records: new Map() };
  return globalRelay.asfaiArtifactRelay;
}

function secret() {
  const configured = process.env.ASFAI_ARTIFACT_LAUNCH_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return "asfai-development-artifact-secret-not-for-production";
  throw new Error("ASFAI_ARTIFACT_LAUNCH_SECRET must be configured with at least 32 characters.");
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeToken(payload: { launchId: string; artifactId: string; expiresAt: number }) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function decodeToken(token: string) {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) throw new Error("Invalid artifact launch token.");
  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Invalid artifact launch token.");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    launchId: string;
    artifactId: string;
    expiresAt: number;
  };
  if (!payload.launchId || !payload.artifactId || !Number.isFinite(payload.expiresAt)) {
    throw new Error("Invalid artifact launch token payload.");
  }
  if (payload.expiresAt <= Date.now()) throw new Error("Artifact launch token has expired.");
  return payload;
}

function purgeExpired() {
  const state = relayState();
  const now = Date.now();
  for (const [launchId, record] of state.records) {
    if (record.expiresAt <= now) state.records.delete(launchId);
  }
}

export function createArtifactLaunch(
  artifactId: string,
  artifactUrl: string,
  launchParameters: Record<string, string> = {},
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  purgeExpired();
  if (relayState().records.size >= MAX_ACTIVE_LAUNCHES) {
    throw new Error("Artifact launch capacity is temporarily exhausted.");
  }
  const launchId = crypto.randomUUID();
  const expiresAt = Date.now() + Math.min(Math.max(ttlSeconds, 300), DEFAULT_TTL_SECONDS) * 1000;
  relayState().records.set(launchId, { artifactId, expiresAt, consumed: false });
  const token = encodeToken({ launchId, artifactId, expiresAt });
  const url = new URL(artifactUrl);
  for (const [key, value] of Object.entries(launchParameters)) url.searchParams.set(key, value);
  if (!url.searchParams.has("telemetry")) url.searchParams.set("telemetry", "standard");
  url.hash = new URLSearchParams({ launch: launchId, token }).toString();
  return { launchId, artifactId, launchUrl: url.toString(), token, expiresAt: new Date(expiresAt).toISOString() };
}

export function storeArtifactResult(launchId: string, token: string, input: unknown, byteLength: number) {
  if (byteLength > MAX_RESULT_BYTES) throw new Error("Artifact result exceeds the 128 KB limit.");
  purgeExpired();
  const payload = decodeToken(token);
  if (payload.launchId !== launchId) throw new Error("Artifact launch identifier does not match token.");
  const record = relayState().records.get(launchId);
  if (!record || record.artifactId !== payload.artifactId) throw new Error("Unknown artifact launch.");
  if (record.consumed) throw new Error("Artifact result has already been consumed.");
  const result = artifactResultSchema.parse(input);
  if (result.source !== record.artifactId) throw new Error("Artifact result source does not match launch.");
  record.result = result;
  return { launchId, received: true, expiresAt: new Date(record.expiresAt).toISOString() };
}

export function claimArtifactResult(launchId: string, token: string) {
  purgeExpired();
  const payload = decodeToken(token);
  if (payload.launchId !== launchId) throw new Error("Artifact launch identifier does not match token.");
  const record = relayState().records.get(launchId);
  if (!record || record.artifactId !== payload.artifactId) throw new Error("Unknown artifact launch.");
  if (record.consumed) throw new Error("Artifact result has already been consumed.");
  if (!record.result) return { ready: false as const, launchId, expiresAt: new Date(record.expiresAt).toISOString() };
  record.consumed = true;
  const result = record.result;
  record.result = undefined;
  return { ready: true as const, launchId, artifactId: record.artifactId, result };
}
