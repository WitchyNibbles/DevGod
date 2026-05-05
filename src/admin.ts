import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runEmbeddingJobs, type EmbeddingProvider } from "./runtime/embedding-runner.ts";
import { indexRepoMarkdown } from "./runtime/repo-markdown-indexer.ts";
import { loadDotEnv, withClient } from "./admin/db.ts";
import {
  loadReviewIdentityBindings,
  loadReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  type ReviewPrincipalAdapter
} from "./core/review-context.ts";
import { PostgresStore } from "./store/postgres-store.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function migrate() {
  const migrationsDir = path.resolve(__dirname, "sql/migrations");
  const migrationPaths = (await readdir(migrationsDir))
    .filter((entry) => /^\d+_.*\.sql$/i.test(entry))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => path.join(migrationsDir, entry));

  await withClient(async (client) => {
    for (const migrationPath of migrationPaths) {
      const sql = await readFile(migrationPath, "utf8");
      await client.query(sql);
    }
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

    const columnsResult = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'
         and (
           (table_name = 'artifacts' and column_name in ('metadata'))
           or (table_name = 'memory_entries' and column_name in ('metadata'))
           or (table_name = 'handoffs' and column_name in ('owner_role', 'completion_standard', 'execution_evidence', 'quality_gate_evidence'))
           or
           (table_name = 'reviews' and column_name in ('actor', 'actor_role', 'waiver_authority', 'identity_assurance'))
           or (table_name = 'approvals' and column_name in ('actor', 'actor_role', 'identity_assurance'))
         )`
    );

    const requiredColumns = new Set([
      "artifacts.metadata",
      "memory_entries.metadata",
      "handoffs.owner_role",
      "handoffs.completion_standard",
      "handoffs.execution_evidence",
      "handoffs.quality_gate_evidence",
      "reviews.actor",
      "reviews.actor_role",
      "reviews.waiver_authority",
      "reviews.identity_assurance",
      "approvals.actor",
      "approvals.actor_role",
      "approvals.identity_assurance"
    ]);

    for (const row of columnsResult.rows) {
      requiredColumns.delete(`${row.table_name}.${row.column_name}`);
    }

    if (requiredColumns.size > 0) {
      throw new Error(`Missing required columns: ${[...requiredColumns].join(", ")}`);
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

async function verifyLiveMigrations() {
  await migrate();
  await migrate();
  await health();
  await bootstrapProject();
  await verifySetup();
  console.log("live migrations verified");
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

async function createReviewIdentityAdapter(): Promise<ReviewPrincipalAdapter<unknown>> {
  const adapterModulePath = process.env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  if (!adapterModulePath) {
    throw new Error("DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE is required for verify-review-identity");
  }

  const resolvedPath = path.isAbsolute(adapterModulePath)
    ? adapterModulePath
    : path.resolve(process.cwd(), adapterModulePath);
  const adapterModule = await import(pathToFileURL(resolvedPath).href);
  const factory = adapterModule.createReviewIdentityAdapter;

  if (typeof factory === "function") {
    const created = await factory();
    if (typeof created !== "function") {
      throw new Error("createReviewIdentityAdapter() must return a function");
    }
    return created as ReviewPrincipalAdapter<unknown>;
  }

  if (typeof adapterModule.default === "function") {
    return adapterModule.default as ReviewPrincipalAdapter<unknown>;
  }

  throw new Error("review identity adapter module must export default(adapter) or createReviewIdentityAdapter()");
}

async function verifyReviewIdentityCommand() {
  const bindingsPath = path.isAbsolute(process.env.DEVGOD_REVIEW_IDENTITY_BINDINGS ?? "")
    ? (process.env.DEVGOD_REVIEW_IDENTITY_BINDINGS as string)
    : path.resolve(
        process.cwd(),
        process.env.DEVGOD_REVIEW_IDENTITY_BINDINGS ?? ".devgod/review-identity-bindings.json"
      );
  const fixturesPath = path.isAbsolute(process.env.DEVGOD_REVIEW_IDENTITY_FIXTURES ?? "")
    ? (process.env.DEVGOD_REVIEW_IDENTITY_FIXTURES as string)
    : path.resolve(
        process.cwd(),
        process.env.DEVGOD_REVIEW_IDENTITY_FIXTURES ?? ".devgod/review-identity-adapter.fixture.json"
      );

  const [bindings, fixtures, adapter] = await Promise.all([
    loadReviewIdentityBindings(bindingsPath),
    loadReviewIdentityFixtures(fixturesPath),
    createReviewIdentityAdapter()
  ]);

  const result = await verifyReviewIdentityAdapter({
    bindings,
    fixtures,
    adapter
  });

  if (result.failed > 0) {
    throw new Error(
      `Review identity verification failed: ${result.failures
        .map((failure) => `${failure.fixture}: ${failure.message}`)
        .join("; ")}`
    );
  }

  console.log(JSON.stringify(result));
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

async function indexRepoMarkdownCommand() {
  const targetRepoRoot = process.argv[3]
    ? path.resolve(process.cwd(), process.argv[3])
    : process.env.DEVGOD_REPO_MARKDOWN_ROOT
      ? path.resolve(process.cwd(), process.env.DEVGOD_REPO_MARKDOWN_ROOT)
      : repoRoot;
  const workspaceSlug = process.env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const workspaceName = process.env.DEVGOD_WORKSPACE_NAME ?? "Default Workspace";
  const projectSlug = process.env.DEVGOD_PROJECT_SLUG;
  const projectName = process.env.DEVGOD_PROJECT_NAME;
  const include = (process.env.DEVGOD_REPO_MARKDOWN_INCLUDE ?? "README.md,docs,.devgod")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const embeddingModel = process.env.DEVGOD_EMBEDDING_MODEL;

  if (!projectSlug) {
    throw new Error("DEVGOD_PROJECT_SLUG is required");
  }

  await withClient(async (client) => {
    const result = await indexRepoMarkdown({
      store: new PostgresStore(client),
      repoRoot: targetRepoRoot,
      workspaceSlug,
      workspaceName,
      projectSlug,
      projectName,
      include,
      embeddingModel
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

  if (command === "verify-live-migrations") {
    await verifyLiveMigrations();
    return;
  }

  if (command === "run-embedding-jobs") {
    await runEmbeddingJobsCommand();
    return;
  }

  if (command === "verify-review-identity") {
    await verifyReviewIdentityCommand();
    return;
  }

  if (command === "index-repo-markdown") {
    await indexRepoMarkdownCommand();
    return;
  }

  throw new Error(`Unknown command: ${command ?? "<none>"}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
