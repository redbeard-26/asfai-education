import { readFile } from "node:fs/promises";

const configuration = JSON.parse(await readFile("plugins/asfai-learning/.mcp.json", "utf8"));
const servers = Object.keys(configuration.mcpServers ?? {});
if (servers.length !== 1 || servers[0] !== "asfai_learning" || configuration.mcpServers.asfai_learning.type !== "http") {
  throw new Error("ASFAI Learning must package exactly one remote MCP connector.");
}
process.stdout.write("ASFAI Learning uses one remote MCP connector; no local companion bundle is required.\n");
