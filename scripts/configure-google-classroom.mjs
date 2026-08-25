import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  throw new Error("Provide the downloaded Google Desktop OAuth client JSON file.");
}

const absoluteSource = path.resolve(source);
const parsed = JSON.parse(await readFile(absoluteSource, "utf8"));
if (!parsed?.installed?.client_id) {
  throw new Error("The selected file is not a Google Desktop OAuth client JSON file.");
}

const pluginRoot = path.resolve("plugins/asfai-learning");
await mkdir(pluginRoot, { recursive: true });
const destination = path.join(pluginRoot, "google-oauth-client.json");
await copyFile(absoluteSource, destination);
await chmod(destination, 0o600).catch(() => undefined);
process.stdout.write("Google Classroom application configuration installed in the ASFAI plugin. Its values were not printed.\n");
