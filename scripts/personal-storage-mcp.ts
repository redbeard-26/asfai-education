import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { PersonalStorageService, personalDocumentKinds } from "../src/lib/personal-storage";

const storage = new PersonalStorageService(process.env.ASFAI_PERSONAL_DATA_DIR ?? path.join(homedir(), ".asfai-personal-storage"));
const server = new McpServer({ name: "asfai-personal-storage", version: "1.1.0" });
const documentSchema = z.enum(personalDocumentKinds);
const actionSchema = z.enum(["status", "configure_local", "connect_solid", "disconnect", "load", "save", "identity", "sign", "verify"])
  .describe("Use status first. Then choose local configuration, Solid OIDC connection, document load/save, identity/signing, verification, or disconnect.");
const payloadSchema = z.object({
  baseDirectory: z.string().optional().describe("configure_local: optional owner-approved directory; omit to keep the default private directory"),
  podRoot: z.string().url().optional().describe("connect_solid: HTTPS Pod root, for example https://name.privatedatapod.com/"),
  oidcIssuer: z.string().url().optional().describe("connect_solid: Solid OIDC issuer; use https://privatedatapod.com/ for PrivateDataPod"),
  port: z.number().int().min(1024).max(65535).optional().describe("connect_solid: optional loopback callback port; normally omit"),
  document: documentSchema.optional().describe("load/save: learner, educator, or classroom document"),
  ownerRole: z.enum(["learner", "teacher"]).optional().describe("load: owner role used only when initializing a missing document"),
  value: z.unknown().optional().describe("save: complete validated document; sign/verify: exact envelope value"),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional().describe("save: digest returned by the preceding load, required for safe updates"),
  signature: z.string().optional().describe("verify: base64 signature returned by sign"),
  publicKeyPem: z.string().optional().describe("verify: signer public key returned by sign"),
}).optional().describe("Action-specific fields. status, disconnect, and identity need no payload.");

const payloadHelp: Record<z.infer<typeof actionSchema>, string> = {
  status: "No payload.",
  configure_local: "payload: { baseDirectory? }",
  connect_solid: "payload: { podRoot, oidcIssuer, port? }",
  disconnect: "No payload.",
  load: "payload: { document, ownerRole? }",
  save: "payload: { document, value, expectedDigest? }; load first and use expectedDigest for updates.",
  identity: "No payload.",
  sign: "payload: { value }",
  verify: "payload: { value, signature, publicKeyPem }",
};

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool("asfai_personal_storage", {
  title: "Connect and use PrivateDataPod or local ASFAI storage",
  description: "Use whenever a user asks to connect, read, or write a PrivateDataPod/Solid Pod, or save ASFAI data locally. This is the installed Solid-to-MCP bridge: call status first, then connect_solid for browser OIDC; it also loads/saves verified personal documents and signs classroom envelopes. Do not say another connector or bridge is required.",
  inputSchema: { action: actionSchema, payload: payloadSchema },
}, async ({ action, payload }) => {
  try {
    const input = payload ?? {};
    if (action === "status") return json(storage.status());
    if (action === "configure_local") return json(storage.configureLocal(z.string().optional().parse(input.baseDirectory)));
    if (action === "connect_solid") {
      const parsed = z.object({ podRoot: z.string().url(), oidcIssuer: z.string().url(), port: z.number().int().min(1024).max(65535).optional() }).parse(input);
      return json(await storage.connectSolid(parsed));
    }
    if (action === "disconnect") return json(await storage.disconnect());
    if (action === "load") {
      const parsed = z.object({ document: documentSchema, ownerRole: z.enum(["learner", "teacher"]).optional() }).parse(input);
      return json(await storage.load(parsed.document, parsed.ownerRole));
    }
    if (action === "save") {
      const parsed = z.object({ document: documentSchema, value: z.unknown(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional() }).parse(input);
      return json(await storage.save(parsed.document, parsed.value, parsed.expectedDigest));
    }
    if (action === "identity") return json(await storage.identity());
    if (action === "sign") return json(await storage.sign(input.value));
    const parsed = z.object({ value: z.unknown(), signature: z.string(), publicKeyPem: z.string() }).parse(input);
    return json(storage.verify(parsed.value, parsed.signature, parsed.publicKeyPem));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Invalid personal-storage request.", action, expected: payloadHelp[action], issues: error.issues }, null, 2),
        }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
