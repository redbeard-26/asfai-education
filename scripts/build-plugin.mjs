import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const pluginRoot = path.resolve("plugins/asfai-learning");
await mkdir(pluginRoot, { recursive: true });

await build({
  entryPoints: ["scripts/personal-storage-mcp.ts"],
  outfile: path.join(pluginRoot, "server.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
  legalComments: "eof",
  banner: {
    js: "import { createRequire as __asfaiCreateRequire } from 'node:module'; const require = __asfaiCreateRequire(import.meta.url);",
  },
});

process.stdout.write(`Built ${path.relative(process.cwd(), path.join(pluginRoot, "server.mjs"))}\n`);
