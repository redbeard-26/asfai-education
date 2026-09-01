import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { createServer, type Server } from "node:http";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createContainerAt,
  deleteFile,
  getContainedResourceUrlAll,
  getFile,
  getSolidDataset,
  overwriteFile,
} from "@inrupt/solid-client";
import { clearSessionFromStorageAll, getSessionFromStorage, Session } from "@inrupt/solid-client-authn-node";
import { classroomExchangeStoreSchema, newClassroomExchangeStore } from "@/lib/capabilities/personal-state";
import { educatorWorkspaceSchema, newEducatorWorkspace } from "@/lib/capabilities/workspace";
import { DeviceProtectedStorage } from "@/lib/device-protected-storage";
import { learnerProfileSchema, migrateLearnerProfile, newLearnerProfile } from "@/lib/learner-workflow";

export const personalDocumentKinds = ["learner", "educator", "classroom"] as const;
export type PersonalDocumentKind = (typeof personalDocumentKinds)[number];

export const PERSONAL_OBJECT_MAX_BYTES = 50 * 1024 * 1024;
export const PERSONAL_OBJECT_READ_BYTES = 1024 * 1024;

export type PersonalObjectRead = {
  path: string;
  location: string;
  contentType: string;
  size: number;
  digest: string;
  offset: number;
  returnedBytes: number;
  complete: boolean;
  text?: string;
  base64?: string;
  serverRetained: false;
};

const FILES: Record<PersonalDocumentKind, string> = {
  learner: "learner.json",
  educator: "educator.json",
  classroom: "classroom.json",
};

function withSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

export function normalizePersonalObjectPath(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1000 || normalized.startsWith("/") || normalized.endsWith("/")) {
    throw new Error("A non-empty ASFAI object path naming a file is required.");
  }
  if (normalized.includes("\\") || normalized.includes("\0")) throw new Error("The ASFAI object path is invalid.");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new Error("ASFAI object paths may contain only letters, digits, '.', '_', '-', and '/'.");
  }
  return segments.join("/");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function documentDigest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function parsePersonalDocument(kind: PersonalDocumentKind, input?: unknown, ownerRole: "learner" | "teacher" = "learner") {
  if (kind === "learner") return input ? migrateLearnerProfile(learnerProfileSchema.parse(input)) : newLearnerProfile();
  if (kind === "educator") return input ? educatorWorkspaceSchema.parse(input) : newEducatorWorkspace();
  return input ? classroomExchangeStoreSchema.parse(input) : newClassroomExchangeStore(ownerRole);
}

function safeBaseDirectory(value: string) {
  return path.resolve(value);
}

type SolidConnectionPreference = {
  schemaVersion: "1";
  podRoot: string;
  oidcIssuer: string;
  sessionId: string;
};

type PersonalStorageDependencies = {
  createSession: (storage: DeviceProtectedStorage, sessionId: string) => Session;
  restoreSession: (storage: DeviceProtectedStorage, sessionId: string) => Promise<Session | undefined>;
  clearSessions: (storage: DeviceProtectedStorage) => Promise<void>;
  createDeviceStorage: (filePath: string) => DeviceProtectedStorage;
};

const defaultDependencies: PersonalStorageDependencies = {
  createSession: (storage, sessionId) => new Session({ storage, keepAlive: false }, sessionId),
  restoreSession: (storage, sessionId) => getSessionFromStorage(sessionId, { storage, refreshSession: true }),
  clearSessions: (storage) => clearSessionFromStorageAll(storage),
  createDeviceStorage: (filePath) => new DeviceProtectedStorage(filePath),
};

export class PersonalStorageService {
  private mode: "local" | "solid" = "local";
  private baseDirectory: string;
  private podRoot?: string;
  private oidcIssuer?: string;
  private session?: Session;
  private callbackServer?: Server;
  private authorizationUrl?: string;
  private callbackUrl?: string;
  private authError?: string;
  private sessionRestored = false;
  private restorePromise?: Promise<void>;
  private restoreEnabled = true;
  private deviceStorage?: DeviceProtectedStorage;
  private readonly dependencies: PersonalStorageDependencies;

  constructor(baseDirectory = process.cwd(), dependencies: Partial<PersonalStorageDependencies> = {}) {
    this.baseDirectory = safeBaseDirectory(baseDirectory);
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  private statusSnapshot() {
    const remote = this.deviceStorage?.protection === "server-aes-256-gcm";
    return {
      mode: this.mode,
      baseDirectory: this.mode === "local" ? this.baseDirectory : undefined,
      podRoot: this.podRoot,
      oidcIssuer: this.oidcIssuer,
      callbackUrl: this.callbackUrl,
      authorizationPending: Boolean(this.authorizationUrl && !this.session?.info.isLoggedIn),
      isLoggedIn: this.session?.info.isLoggedIn ?? false,
      webId: this.session?.info.webId,
      error: this.authError,
      authorizationPersistence: {
        persistsAcrossChatsAndRestarts: true,
        restoredFromDevice: this.sessionRestored,
        protectedBy: this.deviceStorage?.protection ?? (process.platform === "win32" ? "windows-dpapi-current-user" : "user-file-permissions"),
        removal: remote
          ? "Authorization remains available to this ASFAI connector until the user explicitly asks ASFAI to forget it or revokes access at the Pod provider. It is never removed merely because a chat or MCP request ends."
          : "Authorization remains available until the user explicitly asks ASFAI to forget this Pod on this device or revokes access at the Pod provider. It is never removed merely because a chat or MCP process ends.",
      },
      credentialBoundary: remote
        ? "Passwords, cookies, tokens, refresh tokens, client secrets, and DPoP keys are never accepted as MCP input or returned as output. Reusable Solid authorization is encrypted and isolated to this authenticated ASFAI connector."
        : "Passwords, cookies, tokens, refresh tokens, client secrets, and DPoP keys are never accepted as MCP input or returned as output. Reusable Solid authorization is protected for the current device user.",
    };
  }

  async status() {
    await this.restoreSavedSession();
    return this.statusSnapshot();
  }

  async configureLocal(baseDirectory?: string) {
    if (baseDirectory) {
      this.baseDirectory = safeBaseDirectory(baseDirectory);
      this.deviceStorage = undefined;
      this.restorePromise = undefined;
    }
    this.restoreEnabled = false;
    this.mode = "local";
    return this.statusSnapshot();
  }

  private authDirectory() {
    return path.resolve(this.baseDirectory, "asfai", "auth");
  }

  private connectionPreferencePath() {
    return path.join(this.authDirectory(), "solid-connection.json");
  }

  private solidSessionStorage() {
    if (!this.deviceStorage) {
      this.deviceStorage = this.dependencies.createDeviceStorage(path.join(this.authDirectory(), "solid-session.protected.json"));
    }
    return this.deviceStorage;
  }

  private sessionId(podRoot: string, oidcIssuer: string) {
    return `asfai-solid-${createHash("sha256").update(`${podRoot}\n${oidcIssuer}`).digest("hex").slice(0, 32)}`;
  }

  private async readConnectionPreference() {
    try {
      const value = JSON.parse(await readFile(this.connectionPreferencePath(), "utf8")) as SolidConnectionPreference;
      if (value.schemaVersion !== "1" || !value.podRoot || !value.oidcIssuer || !value.sessionId) throw new Error("invalid preference");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("The saved Solid connection preference is invalid.", { cause: error });
    }
  }

  private async saveConnectionPreference(value: SolidConnectionPreference) {
    await mkdir(this.authDirectory(), { recursive: true });
    const target = this.connectionPreferencePath();
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600).catch(() => undefined);
  }

  private async restoreSavedSession() {
    if (!this.restoreEnabled) return;
    const expirationDate = this.session?.info.expirationDate;
    if (this.session?.info.isLoggedIn && (expirationDate === undefined || expirationDate > Date.now() + 30_000)) return;
    if (this.session?.info.isLoggedIn) {
      this.session = undefined;
      this.restorePromise = undefined;
    }
    if (this.restorePromise) return await this.restorePromise;
    this.restorePromise = (async () => {
      const preference = await this.readConnectionPreference();
      if (!preference) return;
      this.mode = "solid";
      this.podRoot = preference.podRoot;
      this.oidcIssuer = preference.oidcIssuer;
      try {
        const storage = this.solidSessionStorage();
        const session = await storage.withSessionLease(() => this.dependencies.restoreSession(storage, preference.sessionId));
        if (session?.info.isLoggedIn) {
          this.session = session;
          this.sessionRestored = true;
          this.authError = undefined;
        }
      } catch {
        this.authError = "The saved Pod authorization could not be refreshed. Connect again to replace it, or revoke ASFAI at the Pod provider if access should end.";
      }
    })();
    await this.restorePromise;
  }

  async connectSolid(input: { podRoot: string; oidcIssuer: string; port?: number; callbackUrl?: string }) {
    const podRoot = new URL(input.podRoot);
    const oidcIssuer = new URL(input.oidcIssuer);
    if (podRoot.protocol !== "https:" || oidcIssuer.protocol !== "https:") throw new Error("Solid Pod and OIDC issuer URLs must use HTTPS.");
    await this.closeCallbackServer();
    this.restoreEnabled = true;
    this.mode = "solid";
    this.podRoot = withSlash(podRoot.toString());
    this.oidcIssuer = withSlash(oidcIssuer.toString());
    const sessionId = this.sessionId(this.podRoot, this.oidcIssuer);
    const storage = this.solidSessionStorage();
    try {
      const restored = await storage.withSessionLease(() => this.dependencies.restoreSession(storage, sessionId));
      if (restored?.info.isLoggedIn) {
        this.session = restored;
        this.sessionRestored = true;
        this.authorizationUrl = undefined;
        this.callbackUrl = undefined;
        this.authError = undefined;
        await this.saveConnectionPreference({ schemaVersion: "1", podRoot: this.podRoot, oidcIssuer: this.oidcIssuer, sessionId });
        return {
          ...this.statusSnapshot(),
          authorizationUrl: undefined,
          instruction: storage.protection === "server-aes-256-gcm"
            ? "The saved Pod authorization was restored for this ASFAI connector. Continue without opening a web page."
            : "The saved Pod authorization was restored for this device user. Continue without opening a web page.",
        };
      }
    } catch {
      // A revoked or expired grant falls through to one fresh browser authorization.
    }
    this.session = this.dependencies.createSession(storage, sessionId);
    this.sessionRestored = false;
    this.authorizationUrl = undefined;
    this.authError = undefined;
    await this.saveConnectionPreference({ schemaVersion: "1", podRoot: this.podRoot, oidcIssuer: this.oidcIssuer, sessionId });
    const port = input.port ?? 18765;
    this.callbackUrl = input.callbackUrl ?? `http://127.0.0.1:${port}/solid/callback`;
    if (input.callbackUrl) {
      await this.session.login({
        oidcIssuer: this.oidcIssuer,
        redirectUrl: this.callbackUrl,
        clientName: "ASFAI Learning",
        handleRedirect: (url) => { this.authorizationUrl = url; },
      });
      if (!this.authorizationUrl) throw new Error("The Solid identity provider did not provide an authorization URL.");
      return {
        ...this.statusSnapshot(),
        authorizationUrl: this.authorizationUrl,
        instruction: "Open the private-storage authorization link once and approve ASFAI at the Pod provider. The connection is then reused until it is explicitly forgotten or revoked. Never paste credentials or tokens into chat.",
      };
    }
    this.callbackServer = createServer(async (request, response) => {
      const incoming = new URL(request.url ?? "/", this.callbackUrl);
      if (incoming.pathname !== "/solid/callback") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      try {
        await this.session!.handleIncomingRedirect(incoming.toString());
        if (!this.session!.info.isLoggedIn) throw new Error("The Solid identity provider returned without establishing a session.");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>ASFAI Pod connected</title><h1>Pod connected</h1><p>You can close this window and continue in chat.</p>");
      } catch (error) {
        this.authError = error instanceof Error ? error.message : String(error);
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>ASFAI Pod connection failed</title><h1>Pod connection failed</h1><p>Return to chat for details.</p>");
      } finally {
        setTimeout(() => void this.closeCallbackServer(), 250);
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.callbackServer!.once("error", reject);
      this.callbackServer!.listen(port, "127.0.0.1", () => resolve());
    });
    try {
      await this.session.login({
        oidcIssuer: this.oidcIssuer,
        redirectUrl: this.callbackUrl,
        clientName: "ASFAI Learning",
        handleRedirect: (url) => { this.authorizationUrl = url; },
      });
    } catch (error) {
      await this.closeCallbackServer();
      throw error;
    }
    if (!this.authorizationUrl) throw new Error("The Solid identity provider did not provide an authorization URL.");
    return {
      ...this.statusSnapshot(),
      authorizationUrl: this.authorizationUrl,
      instruction: "Open the authorization URL once and approve ASFAI on the Pod provider page. The authorization is then protected for this device user and reused across chats and restarts until the user explicitly forgets it or revokes it at the provider. Never paste credentials or tokens into chat. Then call status until isLoggedIn is true.",
    };
  }

  async completeSolidAuthorization(incomingUrl: string) {
    const preference = await this.readConnectionPreference();
    if (!preference) throw new Error("No pending Solid authorization was found for this connector.");
    this.restoreEnabled = true;
    this.mode = "solid";
    this.podRoot = preference.podRoot;
    this.oidcIssuer = preference.oidcIssuer;
    const storage = this.solidSessionStorage();
    const session = this.dependencies.createSession(storage, preference.sessionId);
    await session.handleIncomingRedirect(incomingUrl);
    if (!session.info.isLoggedIn) throw new Error("The Solid identity provider returned without establishing a session.");
    this.session = session;
    this.sessionRestored = false;
    this.authorizationUrl = undefined;
    this.authError = undefined;
    return this.statusSnapshot();
  }

  private async closeCallbackServer() {
    if (!this.callbackServer) return;
    const server = this.callbackServer;
    this.callbackServer = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async forgetSolidAuthorization() {
    await this.closeCallbackServer();
    const storage = this.solidSessionStorage();
    await storage.withSessionLease(async () => {
      if (this.session?.info.isLoggedIn) await this.session.logout({ logoutType: "app" }).catch(() => undefined);
      await this.dependencies.clearSessions(storage).catch(() => undefined);
      await storage.clear();
    });
    await rm(this.connectionPreferencePath(), { force: true });
    this.session = undefined;
    this.authorizationUrl = undefined;
    this.authError = undefined;
    this.sessionRestored = false;
    this.restorePromise = undefined;
    this.restoreEnabled = false;
    this.mode = "local";
    this.podRoot = undefined;
    this.oidcIssuer = undefined;
    this.callbackUrl = undefined;
    return {
      ...this.statusSnapshot(),
      instruction: storage.protection === "server-aes-256-gcm"
        ? "This ASFAI connector has forgotten its reusable Pod authorization. This happens only after an explicit user request; ending a chat or MCP request never performs it."
        : "This device has forgotten its reusable Pod authorization. This happens only after an explicit user request; ending a chat or MCP process never performs it.",
    };
  }

  private localPath(kind: PersonalDocumentKind) {
    const target = path.resolve(this.baseDirectory, "asfai", FILES[kind]);
    const root = `${this.baseDirectory}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("The personal storage path escaped its configured directory.");
    return target;
  }

  private solidUrl(kind: PersonalDocumentKind) {
    if (!this.podRoot) throw new Error("No Solid Pod is configured.");
    return new URL(`asfai/${FILES[kind]}`, this.podRoot).toString();
  }

  private solidObjectUrl(objectPath: string) {
    if (!this.podRoot) throw new Error("No Solid Pod is configured.");
    const safePath = normalizePersonalObjectPath(objectPath).split("/").map(encodeURIComponent).join("/");
    return new URL(`asfai/${safePath}`, this.podRoot).toString();
  }

  private async ensureSolidContainer() {
    if (!this.session?.info.isLoggedIn || !this.podRoot) throw new Error("The Solid session is not authenticated. Call connect_solid and complete browser authorization first.");
    try {
      await createContainerAt(new URL("asfai/", this.podRoot).toString(), { fetch: this.session.fetch });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/409|already exists|405/i.test(message)) throw error;
    }
  }

  private async requireSolid() {
    await this.restoreSavedSession();
    if (this.mode !== "solid" || !this.session?.info.isLoggedIn || !this.podRoot) {
      throw new Error("Private storage is not connected. Connect a Solid Pod before reading or writing private ASFAI data.");
    }
  }

  private async ensureSolidObjectContainers(objectPath: string) {
    await this.ensureSolidContainer();
    const segments = normalizePersonalObjectPath(objectPath).split("/").slice(0, -1);
    let relative = "asfai/";
    for (const segment of segments) {
      relative += `${encodeURIComponent(segment)}/`;
      try {
        await createContainerAt(new URL(relative, this.podRoot).toString(), { fetch: this.session!.fetch });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/409|already exists|405/i.test(message)) throw error;
      }
    }
  }

  async getObject(objectPath: string, offset = 0, length = PERSONAL_OBJECT_READ_BYTES): Promise<PersonalObjectRead> {
    await this.requireSolid();
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Object offset must be a non-negative integer.");
    if (!Number.isSafeInteger(length) || length < 1 || length > PERSONAL_OBJECT_READ_BYTES) {
      throw new Error(`Object reads are limited to ${PERSONAL_OBJECT_READ_BYTES} bytes per request.`);
    }
    const path = normalizePersonalObjectPath(objectPath);
    const location = this.solidObjectUrl(path);
    const file = await getFile(location, { fetch: this.session!.fetch });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const slice = bytes.slice(offset, Math.min(bytes.length, offset + length));
    const contentType = file.type || "application/octet-stream";
    const textual = /^text\//i.test(contentType) || /(?:json|xml|javascript|markdown|ndjson)/i.test(contentType);
    return {
      path,
      location,
      contentType,
      size: bytes.length,
      digest: createHash("sha256").update(bytes).digest("hex"),
      offset,
      returnedBytes: slice.length,
      complete: offset + slice.length >= bytes.length,
      ...(textual ? { text: new TextDecoder().decode(slice) } : { base64: Buffer.from(slice).toString("base64") }),
      serverRetained: false,
    };
  }

  async headObject(objectPath: string) {
    const result = await this.getObject(objectPath, 0, 1);
    const metadata: Record<string, unknown> = { ...result };
    delete metadata.text;
    delete metadata.base64;
    return metadata;
  }

  async putObject(input: { path: string; contentType: string; text?: string; base64?: string; expectedDigest?: string }) {
    await this.requireSolid();
    const path = normalizePersonalObjectPath(input.path);
    if ((input.text === undefined) === (input.base64 === undefined)) throw new Error("Provide exactly one of text or base64 object content.");
    if (!input.contentType || input.contentType.length > 200) throw new Error("A valid content type is required.");
    const bytes = input.text !== undefined ? Buffer.from(input.text, "utf8") : Buffer.from(input.base64!, "base64");
    if (bytes.length > PERSONAL_OBJECT_MAX_BYTES) throw new Error(`ASFAI Pod objects are limited to ${PERSONAL_OBJECT_MAX_BYTES} bytes.`);
    if (input.expectedDigest) {
      try {
        const existing = await this.headObject(path);
        if (existing.digest !== input.expectedDigest) throw new Error("The stored object changed. Reload it and reconcile before saving.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/404|not found/i.test(message)) throw error;
        throw new Error("The expected object does not exist. Reload the course manifest before saving.");
      }
    }
    await this.ensureSolidObjectContainers(path);
    const location = this.solidObjectUrl(path);
    await overwriteFile(location, new Blob([bytes], { type: input.contentType }), {
      contentType: input.contentType,
      fetch: this.session!.fetch,
    });
    const readBack = await this.getObject(path, 0, 1);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (readBack.digest !== digest || readBack.size !== bytes.length) throw new Error("Read-back verification failed after saving the Pod object.");
    return { path, location, contentType: input.contentType, size: bytes.length, digest, verified: true, serverRetained: false };
  }

  async deleteObject(objectPath: string, expectedDigest?: string) {
    await this.requireSolid();
    const path = normalizePersonalObjectPath(objectPath);
    const current = await this.headObject(path);
    if (expectedDigest && current.digest !== expectedDigest) throw new Error("The stored object changed. Reload it before deleting.");
    await deleteFile(this.solidObjectUrl(path), { fetch: this.session!.fetch });
    return { path, deleted: true, priorDigest: current.digest, serverRetained: false };
  }

  async listObjects(containerPath = "courses", offset = 0, limit = 100) {
    await this.requireSolid();
    const normalized = normalizePersonalObjectPath(`${containerPath.replace(/\/$/, "")}/placeholder`).replace(/\/placeholder$/, "");
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Object listing offset or limit is invalid.");
    }
    const containerUrl = new URL(`asfai/${normalized.split("/").map(encodeURIComponent).join("/")}/`, this.podRoot).toString();
    const dataset = await getSolidDataset(containerUrl, { fetch: this.session!.fetch });
    const urls = getContainedResourceUrlAll(dataset).sort();
    return {
      containerPath: normalized,
      objects: urls.slice(offset, offset + limit).map((url) => ({ url })),
      offset,
      nextOffset: offset + limit < urls.length ? offset + limit : undefined,
      total: urls.length,
      serverRetained: false,
    };
  }

  async load(kind: PersonalDocumentKind, ownerRole: "learner" | "teacher" = "learner") {
    await this.restoreSavedSession();
    let raw: unknown;
    let location: string;
    if (this.mode === "solid") {
      if (!this.session?.info.isLoggedIn) throw new Error("The Solid session is not authenticated.");
      location = this.solidUrl(kind);
      try {
        raw = JSON.parse(await (await getFile(location, { fetch: this.session.fetch })).text()) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/404|not found/i.test(message)) throw error;
      }
    } else {
      location = this.localPath(kind);
      try { raw = JSON.parse(await readFile(location, "utf8")) as unknown; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const value = parsePersonalDocument(kind, raw, ownerRole);
    if (raw === undefined) await this.save(kind, value);
    return { kind, value, digest: documentDigest(value), location, verified: true, mode: this.mode };
  }

  async save(kind: PersonalDocumentKind, input: unknown, expectedDigest?: string) {
    const value = parsePersonalDocument(kind, input);
    if (expectedDigest) {
      const current = await this.load(kind);
      if (current.digest !== expectedDigest) throw new Error("The stored document changed. Reload it and reconcile before saving.");
    }
    let location: string;
    if (this.mode === "solid") {
      await this.ensureSolidContainer();
      location = this.solidUrl(kind);
      await overwriteFile(location, new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), { contentType: "application/json", fetch: this.session!.fetch });
    } else {
      location = this.localPath(kind);
      await mkdir(path.dirname(location), { recursive: true });
      const temporary = `${location}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, location);
      await chmod(location, 0o600).catch(() => undefined);
    }
    const readBack = await this.load(kind);
    const digest = documentDigest(value);
    if (readBack.digest !== digest) throw new Error("Read-back verification failed after saving personal data.");
    return { kind, value, digest, location, verified: true, mode: this.mode, webId: this.session?.info.webId };
  }

  private async identityFiles() {
    if (this.mode === "solid") {
      await this.requireSolid();
      const privatePath = "identity/ed25519-private.pem";
      const publicPath = "identity/ed25519-public.pem";
      try {
        const [privateObject, publicObject] = await Promise.all([
          this.getObject(privatePath, 0, PERSONAL_OBJECT_READ_BYTES),
          this.getObject(publicPath, 0, PERSONAL_OBJECT_READ_BYTES),
        ]);
        if (typeof privateObject.text !== "string" || typeof publicObject.text !== "string") throw new Error("The Pod identity resources are not text.");
        return { privatePem: privateObject.text, publicPem: publicObject.text };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/404|not found/i.test(message)) throw error;
        const pair = generateKeyPairSync("ed25519", {
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
          publicKeyEncoding: { type: "spki", format: "pem" },
        });
        await this.putObject({ path: privatePath, text: pair.privateKey, contentType: "application/x-pem-file" });
        await this.putObject({ path: publicPath, text: pair.publicKey, contentType: "application/x-pem-file" });
        return { privatePem: pair.privateKey, publicPem: pair.publicKey };
      }
    }
    const directory = path.resolve(this.baseDirectory, "asfai", "identity");
    const privatePath = path.join(directory, "ed25519-private.pem");
    const publicPath = path.join(directory, "ed25519-public.pem");
    await mkdir(directory, { recursive: true });
    try {
      return { privatePem: await readFile(privatePath, "utf8"), publicPem: await readFile(publicPath, "utf8") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const pair = generateKeyPairSync("ed25519", {
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      await writeFile(privatePath, pair.privateKey, { encoding: "utf8", mode: 0o600 });
      await writeFile(publicPath, pair.publicKey, { encoding: "utf8", mode: 0o644 });
      return { privatePem: pair.privateKey, publicPem: pair.publicKey };
    }
  }

  async identity() {
    const { publicPem } = await this.identityFiles();
    const fingerprint = createHash("sha256").update(createPublicKey(publicPem).export({ type: "spki", format: "der" })).digest("hex");
    return { algorithm: "ed25519", publicKeyPem: publicPem, fingerprint, webId: this.session?.info.webId, privateKeyExported: false };
  }

  async sign(value: unknown) {
    const { privatePem, publicPem } = await this.identityFiles();
    const message = canonical(value);
    const signature = sign(null, Buffer.from(message, "utf8"), createPrivateKey(privatePem)).toString("base64");
    const identity = await this.identity();
    return { signature, publicKeyPem: publicPem, signerFingerprint: identity.fingerprint, signerWebId: identity.webId, messageDigest: documentDigest(message) };
  }

  verify(value: unknown, signature: string, publicKeyPem: string) {
    const publicKey = createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Only Ed25519 classroom signatures are accepted.");
    const valid = verify(null, Buffer.from(canonical(value), "utf8"), publicKey, Buffer.from(signature, "base64"));
    const signerFingerprint = createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
    return { valid, signerFingerprint };
  }
}
