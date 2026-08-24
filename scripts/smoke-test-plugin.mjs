import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const pluginRoot = path.resolve(process.env.ASFAI_PLUGIN_ROOT ?? "plugins/asfai-learning");
const smokeDataDirectory = await mkdtemp(path.join(tmpdir(), "asfai-plugin-smoke-"));
const launchEnvironment = { ...process.env, ASFAI_PERSONAL_DATA_DIR: smokeDataDirectory };
const launch = process.platform === "win32"
  ? {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "call", "./scripts/launch-personal-storage.cmd", "./server.mjs"],
      cwd: pluginRoot,
      env: launchEnvironment,
    }
  : { command: process.execPath, args: ["./server.mjs"], cwd: pluginRoot, env: launchEnvironment };

const client = new Client({ name: "asfai-plugin-smoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport(launch));

try {
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), ["asfai_personal_storage", "asfai_classroom"]);
  const serializedDefinitions = JSON.stringify(tools.tools);
  assert.ok(serializedDefinitions.length <= 8_000, `Private companion tool definitions use ${serializedDefinitions.length} characters`);
  const personalTool = tools.tools.find((tool) => tool.name === "asfai_personal_storage");
  const classroomTool = tools.tools.find((tool) => tool.name === "asfai_classroom");
  assert.ok(personalTool);
  assert.ok(classroomTool);
  assert.match(personalTool.description, /PrivateDataPod\/Solid Pod/);
  assert.match(personalTool.description, /installed Solid-to-MCP bridge/);
  assert.match(personalTool.description, /call status first/);
  assert.equal(personalTool.inputSchema.properties.payload.properties.podRoot.type, "string");
  assert.equal(personalTool.inputSchema.properties.payload.properties.oidcIssuer.type, "string");
  assert.equal(personalTool.inputSchema.properties.payload.properties.expectedDigest.type, "string");
  assert.match(classroomTool.description, /Provider-neutral classroom bridge/);
  assert.match(classroomTool.description, /provider.*google/i);
  assert.equal(classroomTool.inputSchema.properties.payload.properties.provider.type, "string");

  const invalid = await client.callTool({
    name: "asfai_personal_storage",
    arguments: { action: "connect_solid", payload: {} },
  });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /podRoot, oidcIssuer/);

  const result = await client.callTool({
    name: "asfai_personal_storage",
    arguments: { action: "status" },
  });
  assert.equal(result.isError, undefined);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.mode, "local");
  assert.match(payload.credentialBoundary, /never accepted/i);

  const classroomStatus = await client.callTool({
    name: "asfai_classroom",
    arguments: { action: "status", payload: { provider: "google" } },
  });
  assert.equal(classroomStatus.isError, undefined);
  const classroomPayload = JSON.parse(classroomStatus.content[0].text);
  assert.equal(classroomPayload.provider, "google");
  assert.equal(typeof classroomPayload.configured, "boolean");
  assert.match(classroomPayload.credentialBoundary, /never accepted/i);

  const unavailableProvider = await client.callTool({
    name: "asfai_classroom",
    arguments: { action: "status", payload: { provider: "canvas" } },
  });
  assert.equal(unavailableProvider.isError, true);
  assert.match(unavailableProvider.content[0].text, /Available providers: google/);
  process.stdout.write(`ASFAI plugin MCP smoke test passed (${serializedDefinitions.length} serialized tool-definition characters).\n`);
} finally {
  await client.close();
  await rm(smokeDataDirectory, { recursive: true, force: true });
}
