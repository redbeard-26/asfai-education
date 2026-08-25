import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const pluginRoot = path.resolve(process.env.ASFAI_PLUGIN_ROOT ?? "plugins/asfai-learning");
const mcp = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));
const entries = Object.entries(mcp.mcpServers ?? {});
assert.equal(entries.length, 1, "The plugin must expose exactly one MCP connector.");
assert.equal(entries[0][0], "asfai_learning");
assert.deepEqual(entries[0][1], {
  type: "http",
  url: "https://constitution.asfai.org/education/api/mcp",
});

const manifest = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
assert.equal(manifest.interface.displayName, "ASFAI Learning");
assert.match(manifest.interface.longDescription, /one authenticated remote MCP connector/i);

const skill = await readFile(path.join(pluginRoot, "skills", "asfai-learning", "SKILL.md"), "utf8");
assert.match(skill, /exactly one authenticated remote MCP server/i);
assert.match(skill, /asfai_storage/);
assert.match(skill, /asfai_classroom/);
assert.match(skill, /documents/);

for (const removed of ["server.mjs", "google-oauth-public-client.json", path.join("scripts", "launch-personal-storage.cmd")]) {
  await assert.rejects(access(path.join(pluginRoot, removed)), undefined, `${removed} should not be packaged`);
}

process.stdout.write("ASFAI plugin smoke test passed (one remote connector, no local companion).\n");
