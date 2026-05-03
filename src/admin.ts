import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client as PgClient } from "pg";
import { runEmbeddingJobs, type EmbeddingProvider } from "./runtime/embedding-runner.ts";
import { PostgresStore } from "./store/postgres-store.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function loadDotEnv(): Promise<void> {
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

async function withClient<T>(callback: (client: PgClient) => Promise<T>): Promise<T> {
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

async function migrate() {
  const migrationPath = path.resolve(__dirname, "sql/migrations/001_initial_schema.sql");
  const sql = await readFile(migrationPath, "utf8");
  await withClient(async (client) => {
    await client.query(sql);
  });
  console.log("migrations applied");
}

async function health() {
  await withClient(async (client) => {
    await client.query("select 1");
  });
  console.log("healthy");
}

async function bootstrapProject() {
  const workspaceSlug = process.env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const workspaceName = process.env.DEVGOD_WORKSPACE_NAME ?? "Default Workspace";
  const projectSlug = process.env.DEVGOD_PROJECT_SLUG;
  const projectName = process.env.DEVGOD_PROJECT_NAME;
  const repoPath = process.env.DEVGOD_PROJECT_REPO_PATH;

  if (!projectSlug) {
    throw new Error("DEVGOD_PROJECT_SLUG is required");
  }

  await withClient(async (client) => {
    const store = new PostgresStore(client);
    await store.ensureProjectContext({
      workspaceSlug,
      workspaceName,
      projectSlug,
      projectName,
      repoPath
    });
  });

  console.log(`bootstrapped ${workspaceSlug}/${projectSlug}`);
}

async function verifySetup() {
  const workspaceSlug = process.env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const projectSlug = process.env.DEVGOD_PROJECT_SLUG;

  if (!projectSlug) {
    throw new Error("DEVGOD_PROJECT_SLUG is required");
  }

  await withClient(async (client) => {
    const extensionResult = await client.query<{ extversion: string }>(
      `select extversion from pg_extension where extname = 'vector'`
    );

    if (extensionResult.rows.length === 0) {
      throw new Error("pgvector extension is not installed in the target database");
    }

    const tablesResult = await client.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in (
           'workspaces',
           'projects',
           'runs',
           'tasks',
           'task_dependencies',
           'artifacts',
           'handoffs',
           'approvals',
           'reviews',
           'locks',
           'memory_entries',
           'embedding_jobs'
         )`
    );

    const requiredTables = new Set([
      "workspaces",
      "projects",
      "runs",
      "tasks",
      "task_dependencies",
      "artifacts",
      "handoffs",
      "approvals",
      "reviews",
      "locks",
      "memory_entries",
      "embedding_jobs"
    ]);

    for (const row of tablesResult.rows) {
      requiredTables.delete(row.table_name);
    }

    if (requiredTables.size > 0) {
      throw new Error(`Missing required tables: ${[...requiredTables].join(", ")}`);
    }

    const projectResult = await client.query<{ slug: string }>(
      `select p.slug
       from projects p
       join workspaces w on w.id = p.workspace_id
       where w.slug = $1 and p.slug = $2`,
      [workspaceSlug, projectSlug]
    );

    if (projectResult.rows.length === 0) {
      throw new Error(`Project ${workspaceSlug}/${projectSlug} is not bootstrapped`);
    }
  });

  console.log("setup verified");
}

async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  const providerModulePath = process.env.DEVGOD_EMBEDDING_PROVIDER_MODULE;
  if (!providerModulePath) {
    throw new Error("DEVGOD_EMBEDDING_PROVIDER_MODULE is required for run-embedding-jobs");
  }

  const resolvedPath = path.isAbsolute(providerModulePath)
    ? providerModulePath
    : path.resolve(repoRoot, providerModulePath);
  const providerModule = await import(pathToFileURL(resolvedPath).href);
  const factory = providerModule.createEmbeddingProvider ?? providerModule.default;

  if (typeof factory !== "function") {
    throw new Error("embedding provider module must export createEmbeddingProvider() or default()");
  }

  return await factory();
}

async function runEmbeddingJobsCommand() {
  const provider = await createEmbeddingProvider();
  const limitArg = process.argv[3];
  const limitValue = limitArg ?? process.env.DEVGOD_EMBEDDING_JOB_LIMIT ?? "10";
  const limit = Number.parseInt(limitValue, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid embedding job limit: ${limitValue}`);
  }

  await withClient(async (client) => {
    const result = await runEmbeddingJobs({
      store: new PostgresStore(client),
      provider,
      limit
    });
    console.log(JSON.stringify(result));
  });
}

async function main() {
  await loadDotEnv();
  const command = process.argv[2];

  if (command === "migrate") {
    await migrate();
    return;
  }

  if (command === "health") {
    await health();
    return;
  }

  if (command === "bootstrap-project") {
    await bootstrapProject();
    return;
  }

  if (command === "verify-setup") {
    await verifySetup();
    return;
  }

  if (command === "run-embedding-jobs") {
    await runEmbeddingJobsCommand();
    return;
  }

  throw new Error(`Unknown command: ${command ?? "<none>"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
