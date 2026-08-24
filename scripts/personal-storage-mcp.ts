import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { PersonalStorageService, personalDocumentKinds } from "../src/lib/personal-storage";

const storage = new PersonalStorageService(process.env.ASFAI_PERSONAL_DATA_DIR ?? path.join(homedir(), ".asfai-personal-storage"));
const server = new McpServer({ name: "asfai-personal-storage", version: "1.0.0" });
const payloadSchema = z.record(z.string(), z.unknown()).optional();
const actionSchema = z.enum(["status", "configure_local", "connect_solid", "disconnect", "load", "save", "identity", "sign", "verify"]);
const documentSchema = z.enum(personalDocumentKinds);

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool("asfai_personal_storage", {
  title: "Use authenticated personal ASFAI storage",
  description: "Connect a Solid Pod through browser OIDC, or use verified local JSON; load/save personal documents and sign classroom envelopes.",
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
