import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

const configuration = JSON.parse(await readFile("plugins/asfai-learning/.mcp.json", "utf8"));
const servers = Object.keys(configuration.mcpServers ?? {});
if (servers.length !== 1 || servers[0] !== "asfai_learning" || configuration.mcpServers.asfai_learning.type !== "http") {
  throw new Error("ASFAI Learning must package exactly one remote MCP connector.");
}

const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) {
  throw new Error("--output requires a path.");
}
const outputPath = path.resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : "dist/asfai-education-plugin.zip");
const archiveRoot = "asfai-education-plugin";
const pluginRoot = path.resolve("plugins/asfai-learning");
const files = {};
const zipOptions = { mtime: new Date(2000, 0, 1, 0, 0, 0) };

async function addFile(relativePath, archivePath = relativePath) {
  files[`${archiveRoot}/${archivePath.replaceAll("\\", "/")}`] = [
    await readFile(path.join(pluginRoot, relativePath)),
    zipOptions,
  ];
}

async function addDirectory(relativePath) {
  const directory = path.join(pluginRoot, relativePath);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) await addDirectory(child);
    else if (entry.isFile()) await addFile(child, path.join("plugins/asfai-learning", child));
  }
}

await addFile(".codex-plugin/plugin.json", "plugins/asfai-learning/.codex-plugin/plugin.json");
await addFile(".mcp.json", "plugins/asfai-learning/.mcp.json");
await addFile("README.md", "plugins/asfai-learning/README.md");
await addDirectory("skills");
files[`${archiveRoot}/.agents/plugins/marketplace.json`] = [await readFile(".agents/plugins/marketplace.json"), zipOptions];
files[`${archiveRoot}/INSTALL.md`] = [await readFile("docs/PLUGIN-INSTALL.md"), zipOptions];

const zip = zipSync(files, { level: 9 });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, zip);
const digest = createHash("sha256").update(zip).digest("hex");
await writeFile(`${outputPath}.sha256`, `${digest}  ${path.basename(outputPath)}\n`);

process.stdout.write(`Built ${outputPath} (${zip.byteLength} bytes, SHA-256 ${digest}).\n`);
