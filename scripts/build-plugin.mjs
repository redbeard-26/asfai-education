import { build } from "esbuild";
import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const pluginRoot = path.resolve("plugins/asfai-learning");
await mkdir(pluginRoot, { recursive: true });

const credentialsSource = process.env.ASFAI_GOOGLE_CLASSROOM_CREDENTIALS_FILE;
if (credentialsSource) {
  const parsed = JSON.parse(await readFile(path.resolve(credentialsSource), "utf8"));
  if (!parsed?.installed?.client_id) throw new Error("The Google configuration must be a Desktop OAuth client JSON file.");
  const destination = path.join(pluginRoot, "google-oauth-client.json");
  await copyFile(path.resolve(credentialsSource), destination);
  await chmod(destination, 0o600).catch(() => undefined);
  process.stdout.write("Packaged the configured Google Desktop OAuth client without printing its values.\n");
}

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
