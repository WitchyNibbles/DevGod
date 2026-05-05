import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Client as PgClient } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export async function loadDotEnv(): Promise<void> {
  const envPath = path.join(repoRoot, ".env");

  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key]) {
        continue;
      }

      const value = rest.join("=").replace(/^"(.*)"$/, "$1");
      process.env[key] = value;
    }
  } catch {
    // .env is optional as long as the environment variables were provided another way.
  }
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DEVGOD_CORE_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DEVGOD_CORE_DATABASE_URL is required");
  }
  return databaseUrl;
}

export async function withClient<T>(callback: (client: PgClient) => Promise<T>): Promise<T> {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: requireDatabaseUrl()
  });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
