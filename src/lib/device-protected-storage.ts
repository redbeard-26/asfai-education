import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SolidSessionStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface StorageProtector {
  readonly id: "windows-dpapi-current-user" | "user-file-permissions" | "server-aes-256-gcm";
  protect(value: Buffer): Promise<Buffer>;
  unprotect(value: Buffer): Promise<Buffer>;
}

const DPAPI_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$operation = $env:ASFAI_DPAPI_OPERATION
$inputValue = [Console]::In.ReadToEnd().Trim()
$bytes = [Convert]::FromBase64String($inputValue)
$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
if ($operation -eq 'protect') {
  $result = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope)
} elseif ($operation -eq 'unprotect') {
  $result = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, $scope)
} else {
  throw 'Unsupported ASFAI device-protection operation.'
}
[Console]::Out.Write([Convert]::ToBase64String($result))
`.trim();

async function runWindowsDpapi(operation: "protect" | "unprotect", value: Buffer) {
  const encodedCommand = Buffer.from(DPAPI_SCRIPT, "utf16le").toString("base64");
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedCommand,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, ASFAI_DPAPI_OPERATION: operation },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`Windows could not protect the saved authorization.${detail ? ` ${detail}` : ""}`));
        return;
      }
      try {
        resolve(Buffer.from(Buffer.concat(stdout).toString("utf8").trim(), "base64"));
      } catch {
        reject(new Error("Windows returned invalid protected authorization data."));
      }
    });
    child.stdin.end(value.toString("base64"));
  });
}

export function deviceStorageProtector(platform = process.platform): StorageProtector {
  if (platform === "win32") {
    return {
      id: "windows-dpapi-current-user",
      protect: (value) => runWindowsDpapi("protect", value),
      unprotect: (value) => runWindowsDpapi("unprotect", value),
    };
  }
  return {
    id: "user-file-permissions",
    protect: async (value) => value,
    unprotect: async (value) => value,
  };
}

export function serverStorageProtector(secret: string): StorageProtector {
  if (secret.length < 32) throw new Error("ASFAI remote provider encryption is not configured.");
  const key = createHash("sha256").update(secret, "utf8").digest();
  const aad = Buffer.from("asfai-remote-provider-storage-v1", "utf8");
  return {
    id: "server-aes-256-gcm",
    protect: async (value) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    unprotect: async (value) => {
      if (value.length < 29) throw new Error("Invalid protected ASFAI provider data.");
      const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      decipher.setAAD(aad);
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
    },
  };
}

type StorageEnvelope = {
  schemaVersion: "1";
  protection: StorageProtector["id"];
  payload: string;
};

/**
 * Persistent storage for provider authorization material. Windows encrypts the
 * complete map with current-user DPAPI. Other platforms rely on an owner-only
 * (0600) file until a native vault is added.
 */
export class DeviceProtectedStorage implements SolidSessionStorage {
  readonly protection: StorageProtector["id"];
  private values?: Record<string, string>;
  private serial: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly protector: StorageProtector = deviceStorageProtector(),
  ) {
    this.protection = protector.id;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation);
    this.serial = result.then(() => undefined, () => undefined);
    return result;
  }

  async withSessionLease<T>(operation: () => Promise<T>): Promise<T> {
    const leasePath = `${this.filePath}.lock`;
    await mkdir(path.dirname(leasePath), { recursive: true });
    const deadline = Date.now() + 30_000;
    while (true) {
      try {
        await mkdir(leasePath);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let leaseAge: number;
        try {
          leaseAge = Date.now() - (await stat(leasePath)).mtimeMs;
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw statError;
        }
        if (leaseAge > 120_000) {
          await rmdir(leasePath).catch(() => undefined);
          continue;
        }
        if (Date.now() >= deadline) throw new Error("Another ASFAI request is updating the saved provider authorization. Try again shortly.");
        await new Promise((resolve) => setTimeout(resolve, 75));
      }
    }
    try {
      this.values = undefined;
      return await operation();
    } finally {
      await rmdir(leasePath).catch(() => undefined);
    }
  }

  private async loadUnlocked() {
    if (this.values) return this.values;
    try {
      const envelope = JSON.parse(await readFile(this.filePath, "utf8")) as StorageEnvelope;
      if (envelope.schemaVersion !== "1" || envelope.protection !== this.protector.id || typeof envelope.payload !== "string") {
        throw new Error("unsupported format");
      }
      const plaintext = await this.protector.unprotect(Buffer.from(envelope.payload, "base64"));
      const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) {
        throw new Error("invalid contents");
      }
      this.values = parsed as Record<string, string>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.values = {};
      } else {
        throw new Error("The saved authorization could not be opened for this device user.", { cause: error });
      }
    }
    return this.values;
  }

  private async persistUnlocked() {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const protectedValue = await this.protector.protect(Buffer.from(JSON.stringify(this.values ?? {}), "utf8"));
    const envelope: StorageEnvelope = {
      schemaVersion: "1",
      protection: this.protector.id,
      payload: protectedValue.toString("base64"),
    };
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
    await chmod(this.filePath, 0o600).catch(() => undefined);
  }

  async get(key: string) {
    return await this.exclusive(async () => (await this.loadUnlocked())[key]);
  }

  async set(key: string, value: string) {
    await this.exclusive(async () => {
      const values = await this.loadUnlocked();
      values[key] = value;
      await this.persistUnlocked();
    });
  }

  async delete(key: string) {
    await this.exclusive(async () => {
      const values = await this.loadUnlocked();
      delete values[key];
      await this.persistUnlocked();
    });
  }

  async clear() {
    await this.exclusive(async () => {
      this.values = {};
      await rm(this.filePath, { force: true });
    });
  }
}
