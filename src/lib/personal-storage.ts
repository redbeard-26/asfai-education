import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { createServer, type Server } from "node:http";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createContainerAt, getFile, overwriteFile } from "@inrupt/solid-client";
import { Session } from "@inrupt/solid-client-authn-node";
import { classroomExchangeStoreSchema, newClassroomExchangeStore } from "@/lib/capabilities/personal-state";
import { educatorWorkspaceSchema, newEducatorWorkspace } from "@/lib/capabilities/workspace";
import { learnerProfileSchema, migrateLearnerProfile, newLearnerProfile } from "@/lib/learner-workflow";

export const personalDocumentKinds = ["learner", "educator", "classroom"] as const;
export type PersonalDocumentKind = (typeof personalDocumentKinds)[number];

const FILES: Record<PersonalDocumentKind, string> = {
  learner: "learner.json",
  educator: "educator.json",
  classroom: "classroom.json",
};

function withSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
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

  constructor(baseDirectory = process.cwd()) {
    this.baseDirectory = safeBaseDirectory(baseDirectory);
  }

  status() {
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
      credentialBoundary: "Passwords, cookies, tokens, refresh tokens, and DPoP keys are never accepted as MCP input or returned as output.",
    };
  }

  configureLocal(baseDirectory?: string) {
    if (baseDirectory) this.baseDirectory = safeBaseDirectory(baseDirectory);
    this.mode = "local";
    return this.status();
  }

  async connectSolid(input: { podRoot: string; oidcIssuer: string; port?: number }) {
    const podRoot = new URL(input.podRoot);
    const oidcIssuer = new URL(input.oidcIssuer);
    if (podRoot.protocol !== "https:" || oidcIssuer.protocol !== "https:") throw new Error("Solid Pod and OIDC issuer URLs must use HTTPS.");
    await this.closeCallbackServer();
    this.mode = "solid";
    this.podRoot = withSlash(podRoot.toString());
    this.oidcIssuer = withSlash(oidcIssuer.toString());
    this.session = new Session();
    this.authorizationUrl = undefined;
    this.authError = undefined;
    const port = input.port ?? 18765;
    this.callbackUrl = `http://127.0.0.1:${port}/solid/callback`;
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
        clientName: "ASFAI Personal Storage MCP",
        handleRedirect: (url) => { this.authorizationUrl = url; },
      });
    } catch (error) {
      await this.closeCallbackServer();
      throw error;
    }
    if (!this.authorizationUrl) throw new Error("The Solid identity provider did not provide an authorization URL.");
    return {
      ...this.status(),
      authorizationUrl: this.authorizationUrl,
      instruction: "Open the authorization URL in your browser. Authenticate only on your Pod provider's page; never paste credentials or tokens into chat. Then call status until isLoggedIn is true.",
    };
  }

  private async closeCallbackServer() {
    if (!this.callbackServer) return;
    const server = this.callbackServer;
    this.callbackServer = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async disconnect() {
    await this.closeCallbackServer();
    if (this.session?.info.isLoggedIn) await this.session.logout({ logoutType: "app" });
    this.session = undefined;
    this.authorizationUrl = undefined;
    this.authError = undefined;
    this.mode = "local";
    return this.status();
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

  private async ensureSolidContainer() {
    if (!this.session?.info.isLoggedIn || !this.podRoot) throw new Error("The Solid session is not authenticated. Call connect_solid and complete browser authorization first.");
    try {
      await createContainerAt(new URL("asfai/", this.podRoot).toString(), { fetch: this.session.fetch });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/409|already exists|405/i.test(message)) throw error;
    }
  }

  async load(kind: PersonalDocumentKind, ownerRole: "learner" | "teacher" = "learner") {
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
