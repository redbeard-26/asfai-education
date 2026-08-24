import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import path from "node:path";

const pluginRoot = path.resolve(process.env.ASFAI_PLUGIN_ROOT ?? "plugins/asfai-learning");
const launch = process.platform === "win32"
  ? {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "call", "./scripts/launch-personal-storage.cmd", "./server.mjs"],
      cwd: pluginRoot,
    }
  : { command: process.execPath, args: ["./server.mjs"], cwd: pluginRoot };

const client = new Client({ name: "asfai-plugin-smoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport(launch));

try {
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), ["asfai_personal_storage"]);

  const result = await client.callTool({
    name: "asfai_personal_storage",
    arguments: { action: "status" },
  });
  assert.equal(result.isError, undefined);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.mode, "local");
  assert.match(payload.credentialBoundary, /never accepted/i);
  process.stdout.write("ASFAI plugin MCP smoke test passed.\n");
} finally {
  await client.close();
}
