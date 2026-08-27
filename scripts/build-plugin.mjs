import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

const configuration = JSON.parse(await readFile("plugins/asfai-learning/.mcp.json", "utf8"));
const servers = Object.keys(configuration.mcpServers ?? {});
if (servers.length !== 1 || servers[0] !== "asfai_learning" || configuration.mcpServers.asfai_learning.type !== "http") {
  throw new Error("ASFAI Learning must package exactly one remote MCP connector.");
}

const claudeManifest = JSON.parse(
  await readFile("plugins/asfai-learning/.claude-plugin/plugin.json", "utf8"),
);
if (claudeManifest.name !== "asfai-learning" || claudeManifest.mcpServers !== "./.mcp.json") {
  throw new Error("The Claude manifest must identify ASFAI Learning and its bundled MCP connector.");
}

const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) {
  throw new Error("--output requires a path.");
}
const outputPath = path.resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : "dist/asfai-education-plugin.zip");
const pluginRoot = path.resolve("plugins/asfai-learning");
const files = {};
const zipOptions = { mtime: new Date(2000, 0, 1, 0, 0, 0) };

async function addFile(relativePath, archivePath = relativePath) {
  files[archivePath.replaceAll("\\", "/")] = [
    await readFile(path.join(pluginRoot, relativePath)),
    zipOptions,
  ];
}

async function addDirectory(relativePath, archiveRoot = relativePath) {
  const directory = path.join(pluginRoot, relativePath);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relativePath, entry.name);
    const archiveChild = path.join(archiveRoot, path.relative(relativePath, child));
    if (entry.isDirectory()) await addDirectory(child, archiveChild);
    else if (entry.isFile()) await addFile(child, archiveChild);
  }
}

// The ZIP root is a valid plugin for both ChatGPT/Codex and Claude. The Codex
// marketplace copy is generated from the same source files for CLI installs.
await addFile(".codex-plugin/plugin.json");
await addFile(".claude-plugin/plugin.json");
await addFile(".mcp.json");
await addFile("README.md");
await addDirectory("skills");

await addFile(".codex-plugin/plugin.json", "plugins/asfai-learning/.codex-plugin/plugin.json");
await addFile(".claude-plugin/plugin.json", "plugins/asfai-learning/.claude-plugin/plugin.json");
await addFile(".mcp.json", "plugins/asfai-learning/.mcp.json");
await addFile("README.md", "plugins/asfai-learning/README.md");
await addDirectory("skills", "plugins/asfai-learning/skills");
files[".agents/plugins/marketplace.json"] = [await readFile(".agents/plugins/marketplace.json"), zipOptions];
files["INSTALL.md"] = [await readFile("docs/PLUGIN-INSTALL.md"), zipOptions];

const zip = zipSync(files, { level: 9 });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, zip);
const digest = createHash("sha256").update(zip).digest("hex");
await writeFile(`${outputPath}.sha256`, `${digest}  ${path.basename(outputPath)}\n`);

process.stdout.write(`Built ${outputPath} (${zip.byteLength} bytes, SHA-256 ${digest}).\n`);
