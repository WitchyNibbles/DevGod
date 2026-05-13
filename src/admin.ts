import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installDevgodIntoProject, upgradeDevgodInProject, verifyDevgodInstall } from "./install/cli.ts";
import { embedQueryText, runEmbeddingJobs, type EmbeddingProvider } from "./runtime/embedding-runner.ts";
import {
  resolveQdrantCollectionsUrl,
  resolveRuntimeEnvironmentConfig,
  validateRuntimeQdrantUrl
} from "./runtime/config.ts";
import { createHashEmbeddingProvider } from "./runtime/hash-embedding-provider.ts";
import { indexRepoMarkdown } from "./runtime/repo-markdown-indexer.ts";
import { loadDotEnv, withClient } from "./admin/db.ts";
import { buildRunEvidenceReport, formatRunEvidenceReportMarkdown } from "./admin/report.ts";
import { buildPlanningContextReport, formatPlanningContextReportMarkdown } from "./admin/planning-context.ts";
import { dispatchGithubWorkItem } from "./admin/github-dispatch.ts";
import { buildOperatorDashboardReport, formatOperatorDashboardReport } from "./admin/ops.ts";
import { inspectGitNexusStatus, type GitNexusStatusObservation } from "./admin/gitnexus.ts";
import { buildOperatorStatusReport, type ReviewIdentityStatusObservation } from "./admin/status.ts";
import { parseExportDocsRequest } from "./docs-export/parser.ts";
import { resolveObsidianConfig, validateObsidianConfig } from "./docs-export/obsidian-config.ts";
import { DocsSummarizer } from "./docs-export/summarizer.ts";
import { ObsidianMarkdownRenderer } from "./docs-export/renderer.ts";
import { ObsidianVaultWriter } from "./docs-export/obsidian-writer.ts";
import { buildObsidianTargetPath } from "./docs-export/targets.ts";
import { RuntimeWorklogProvider, type WorklogProvider } from "./docs-export/worklog-provider.ts";
import { isGateReviewRole, isRetrievalRole, isReviewSeverity, isReviewState } from "./domain/contracts.ts";
import {
  createReviewActionContextResolver,
  createReviewPrincipalAdapter,
  loadReviewIdentityBindings,
  loadReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  type AuthenticatedPrincipal,
  type ReviewPrincipalAdapter
} from "./core/review-context.ts";
import { DevgodCoreService } from "./core/service.ts";
import type { ResolveReviewActionContext } from "./core/review-context.ts";
import type {
  RecoveryApplyResult,
  RecoveryInspectionReport,
  ProjectRecord,
  ReviewInput,
  ReviewRecord,
  RuntimeMigrationJournalRecord,
  RuntimeProjectRegistrationRecord,
  RoutingRecommendationReport,
  RetrievalRole,
  SearchMemoryResult,
  RunStatusSnapshot,
  TaskStatus
} from "./domain/types.ts";
import type { WorkspaceRecord } from "./domain/types.ts";
import type { ExportDocsCommandResult } from "./docs-export/models.ts";
import { PostgresStore } from "./store/postgres-store.ts";
import { QdrantArtifactIndex, type ArtifactVectorIndex } from "./store/qdrant-artifact-index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
type EnvShape = NodeJS.ProcessEnv;
type PostgresStoreClient = ConstructorParameters<typeof PostgresStore>[0];
type IndexRepoMarkdownStore = Parameters<typeof indexRepoMarkdown>[0]["store"];

interface LoadedReviewIdentityAdapter {
  adapter: ReviewPrincipalAdapter<unknown>;
  modulePath?: string | undefined;
  selectedBackend?: string | undefined;
  availableBackends: string[];
}

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
  const repoPath = path.resolve(process.env.DEVGOD_PROJECT_REPO_PATH ?? process.cwd());

  if (!projectSlug) {
    throw new Error("DEVGOD_PROJECT_SLUG is required");
  }

  const runtimeConfig = resolveRuntimeEnvironmentConfig(process.env, {
    projectSlug,
    cwd: repoPath
  });
  await mkdir(runtimeConfig.dataRoot, { recursive: true });

  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const { workspace, project } = await store.ensureProjectContext({
      workspaceSlug,
      workspaceName,
      projectSlug,
      projectName,
      repoPath
    });
    await store.saveProjectRuntimeRegistration({
      projectId: project.id,
      workspaceId: workspace.id,
      repoPath,
      runtimeProfile: runtimeConfig.runtimeProfile,
      dataRoot: runtimeConfig.dataRoot,
      qdrantUrl: runtimeConfig.qdrantUrl,
      qdrantCollection: runtimeConfig.qdrantCollection,
      installManifestPath: runtimeConfig.installManifestPath,
      manifest: {
        installManifestPath: runtimeConfig.installManifestPath
      },
      provenance: {
        authority: "runtime_authoritative",
        source: "bootstrap-project",
        version: "0.1.0"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await syncRuntimeMigrationJournal({
      store,
      workspace,
      project,
      repoPath,
      status: "registered"
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
    const store = new PostgresStore(client);
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
           'embedding_jobs',
           'runtime_project_registrations',
           'runtime_migration_journals'
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
      "embedding_jobs",
      "runtime_project_registrations",
      "runtime_migration_journals"
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

    const projectResult = await client.query<{ id: string; slug: string }>(
      `select p.id, p.slug
       from projects p
       join workspaces w on w.id = p.workspace_id
       where w.slug = $1 and p.slug = $2`,
      [workspaceSlug, projectSlug]
    );

    if (projectResult.rows.length === 0) {
      throw new Error(`Project ${workspaceSlug}/${projectSlug} is not bootstrapped`);
    }

    const projectId = projectResult.rows[0]?.id;
    const registrationResult = await client.query<{
      data_root: string;
      runtime_profile: string;
      qdrant_url: string | null;
      qdrant_collection: string;
    }>(
      `select data_root, runtime_profile, qdrant_url, qdrant_collection
       from runtime_project_registrations
       where project_id = $1`,
      [projectId]
    );

    if (registrationResult.rows.length === 0) {
      throw new Error(`Project ${workspaceSlug}/${projectSlug} is not runtime-registered`);
    }

    const projectContext = await store.getProjectContext({
      workspaceSlug,
      projectSlug
    });
    if (!projectContext) {
      throw new Error(`Project ${workspaceSlug}/${projectSlug} is not bootstrapped`);
    }

    const registration = registrationResult.rows[0]!;
    await access(registration.data_root);

    if (registration.qdrant_url) {
      const qdrantHealth = await inspectQdrantHealthWithRetry(
        {
          projectId,
          workspaceId: projectContext.workspace.id,
          repoPath: path.resolve(process.env.DEVGOD_PROJECT_REPO_PATH ?? process.cwd()),
          runtimeProfile: registration.runtime_profile,
          dataRoot: registration.data_root,
          qdrantUrl: registration.qdrant_url,
          qdrantCollection: registration.qdrant_collection,
          installManifestPath: undefined,
          manifest: {},
          provenance: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          attempts: 20,
          delayMs: 1_000
        }
      );

      if (!qdrantHealth.ok) {
        throw new Error(`Qdrant health check failed: ${qdrantHealth.summary}`);
      }
    }

    await syncRuntimeMigrationJournal({
      store,
      workspace: projectContext.workspace,
      project: projectContext.project,
      repoPath: path.resolve(process.env.DEVGOD_PROJECT_REPO_PATH ?? process.cwd()),
      status: "verified"
    });
  });

  console.log("setup verified");
}

async function verifyLiveMigrations() {
  await migrate();
  await migrate();
  await health();
  await bootstrapProject();
  await verifySetup();

  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "devgod-live-migrations-"));

  try {
    await writeFile(path.join(fixtureRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({
      sourceRoot: repoRoot,
      targetRoot: fixtureRoot
    });

    const driftTarget = path.join(fixtureRoot, "scripts", "check-devgod-workflow.sh");
    const driftedContent = `${await readFile(driftTarget, "utf8")}# local drift\n`;
    await writeFile(driftTarget, driftedContent, "utf8");
    await rm(path.join(fixtureRoot, ".devgod", "install-manifest.json"));

    const upgradeSummary = await upgradeDevgodInProject({
      sourceRoot: repoRoot,
      targetRoot: fixtureRoot
    });
    if (!upgradeSummary.runtimeMigrationReport || !upgradeSummary.runtimeBackupManifest) {
      throw new Error("upgrade did not emit the expected runtime migration artifacts");
    }
    if (upgradeSummary.backups.length === 0) {
      throw new Error("upgrade did not capture a managed-file backup for rollback proof");
    }

    const verifySummary = await verifyDevgodInstall({
      sourceRoot: repoRoot,
      targetRoot: fixtureRoot
    });
    if (!verifySummary.ok) {
      throw new Error(
        `upgraded fixture did not verify cleanly (missing=${verifySummary.missing.length}, modified=${verifySummary.modified.length}, orphans=${verifySummary.orphans.length})`
      );
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }

  console.log("live migrations verified");
}

async function createEmbeddingProvider(env: EnvShape = process.env): Promise<EmbeddingProvider> {
  const providerModulePath = env.DEVGOD_EMBEDDING_PROVIDER_MODULE;
  if (!providerModulePath) {
    return createHashEmbeddingProvider({
      model: env.DEVGOD_EMBEDDING_MODEL?.trim() || undefined
    });
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

function createReviewIdentityFixtureAdapter(): ReviewPrincipalAdapter<unknown> {
  return async ({ authContext }) => {
    const candidate =
      typeof authContext === "object" && authContext !== null
        ? (authContext as Record<string, unknown>)
        : {};

    return {
      provider: String(candidate.provider ?? ""),
      subject: String(candidate.subject ?? ""),
      verified: candidate.verified === true
    };
  };
}

async function loadConfiguredReviewIdentityAdapter(options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  requireLiveAdapter?: boolean | undefined;
} = {}): Promise<LoadedReviewIdentityAdapter> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const adapterModulePath = env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  if (!adapterModulePath) {
    if (options.requireLiveAdapter) {
      throw new Error("DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE is required for live review actions");
    }

    return {
      adapter: createReviewIdentityFixtureAdapter(),
      availableBackends: []
    };
  }

  const resolvedPath = path.isAbsolute(adapterModulePath)
    ? adapterModulePath
    : path.resolve(cwd, adapterModulePath);
  const adapterModule = await import(pathToFileURL(resolvedPath).href);
  const availableBackends =
    adapterModule.reviewIdentityAdapters &&
    typeof adapterModule.reviewIdentityAdapters === "object" &&
    !Array.isArray(adapterModule.reviewIdentityAdapters)
      ? Object.keys(adapterModule.reviewIdentityAdapters as Record<string, unknown>).sort((left, right) =>
          left.localeCompare(right)
        )
      : [];
  const selectedBackend = env.DEVGOD_REVIEW_IDENTITY_BACKEND?.trim() || undefined;

  if (selectedBackend) {
    const candidate = (adapterModule.reviewIdentityAdapters as Record<string, unknown> | undefined)?.[selectedBackend];
    if (typeof candidate !== "function") {
      throw new Error(`review identity backend not found: ${selectedBackend}`);
    }

    return {
      adapter: candidate as ReviewPrincipalAdapter<unknown>,
      modulePath: resolvedPath,
      selectedBackend,
      availableBackends
    };
  }

  if (availableBackends.length === 1) {
    const onlyBackend = availableBackends[0] as string;
    const candidate = (adapterModule.reviewIdentityAdapters as Record<string, unknown>)[onlyBackend];
    if (typeof candidate === "function") {
      return {
        adapter: candidate as ReviewPrincipalAdapter<unknown>,
        modulePath: resolvedPath,
        selectedBackend: onlyBackend,
        availableBackends
      };
    }
  }

  const factory = adapterModule.createReviewIdentityAdapter;

  if (typeof factory === "function") {
    const created = await factory();
    if (typeof created !== "function") {
      throw new Error("createReviewIdentityAdapter() must return a function");
    }
    return {
      adapter: created as ReviewPrincipalAdapter<unknown>,
      modulePath: resolvedPath,
      selectedBackend,
      availableBackends
    };
  }

  if (typeof adapterModule.default === "function") {
    return {
      adapter: adapterModule.default as ReviewPrincipalAdapter<unknown>,
      modulePath: resolvedPath,
      selectedBackend,
      availableBackends
    };
  }

  throw new Error(
    "review identity adapter module must export default(adapter), createReviewIdentityAdapter(), or reviewIdentityAdapters"
  );
}

async function inspectReviewIdentityAdapterBackends(modulePath: string): Promise<string[]> {
  const adapterModule = await import(pathToFileURL(modulePath).href);
  if (
    !adapterModule.reviewIdentityAdapters ||
    typeof adapterModule.reviewIdentityAdapters !== "object" ||
    Array.isArray(adapterModule.reviewIdentityAdapters)
  ) {
    return [];
  }

  return Object.keys(adapterModule.reviewIdentityAdapters as Record<string, unknown>).sort((left, right) =>
    left.localeCompare(right)
  );
}

async function createLiveReviewIdentityAdapter(options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}): Promise<LoadedReviewIdentityAdapter> {
  return loadConfiguredReviewIdentityAdapter({
    cwd: options.cwd,
    env: options.env,
    requireLiveAdapter: true
  });
}

async function resolveReviewIdentityFilePath(options: {
  envVarValue: string | undefined;
  liveRelativePath: string;
  templateRelativePath: string;
  cwd?: string | undefined;
}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  if (options.envVarValue) {
    return path.isAbsolute(options.envVarValue)
      ? options.envVarValue
      : path.resolve(cwd, options.envVarValue);
  }

  const livePath = path.resolve(cwd, options.liveRelativePath);
  try {
    await access(livePath);
    return livePath;
  } catch {
    return path.resolve(repoRoot, options.templateRelativePath);
  }
}

function isRepoTemplateReviewIdentityPath(filePath: string): boolean {
  const relative = path.relative(repoRoot, filePath);
  return (
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    (relative === ".devgod/templates/review-identity-bindings.json" ||
      relative === ".devgod/templates/review-identity-adapter.fixture.json")
  );
}

async function verifyReviewIdentityCommand() {
  const bindingsPath = await resolveReviewIdentityFilePath({
    envVarValue: process.env.DEVGOD_REVIEW_IDENTITY_BINDINGS,
    liveRelativePath: ".devgod/review-identity-bindings.json",
    templateRelativePath: ".devgod/templates/review-identity-bindings.json"
  });
  const fixturesPath = await resolveReviewIdentityFilePath({
    envVarValue: process.env.DEVGOD_REVIEW_IDENTITY_FIXTURES,
    liveRelativePath: ".devgod/review-identity-adapter.fixture.json",
    templateRelativePath: ".devgod/templates/review-identity-adapter.fixture.json"
  });

  if (
    !process.env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE &&
    (!isRepoTemplateReviewIdentityPath(bindingsPath) || !isRepoTemplateReviewIdentityPath(fixturesPath))
  ) {
    throw new Error("DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE is required for verify-review-identity");
  }

  const [bindings, fixtures, adapter] = await Promise.all([
    loadReviewIdentityBindings(bindingsPath),
    loadReviewIdentityFixtures(fixturesPath),
    loadConfiguredReviewIdentityAdapter()
  ]);

  const result = await verifyReviewIdentityAdapter({
    bindings,
    fixtures,
    adapter: adapter.adapter
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

interface RecordReviewCommandInput {
  runId: string;
  taskId: string;
  actor: string;
  review: ReviewInput;
  authContext?: unknown;
}

interface RecordReviewCommandResult {
  mode: "live";
  bindingsPath: string;
  adapterModulePath: string;
  selectedBackend?: string | undefined;
  availableBackends: string[];
  principal: AuthenticatedPrincipal;
  review: ReviewRecord;
  blockers: string[];
  taskStatus: TaskStatus;
}

interface ExecuteRecordReviewCommandOptions {
  adapter: ReviewPrincipalAdapter<unknown>;
  adapterModulePath: string;
  selectedBackend?: string | undefined;
  availableBackends?: string[] | undefined;
  bindingsPath: string;
  recordReview: (input: {
    command: RecordReviewCommandInput;
    resolver: ResolveReviewActionContext;
  }) => Promise<{
    review: ReviewRecord;
    blockers: string[];
    task: {
      status: TaskStatus;
    };
  }>;
}

interface ExecuteRecordReviewCommandFromArgsOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  createLiveAdapter?: (() => Promise<{
    adapter: ReviewPrincipalAdapter<unknown>;
    modulePath: string;
    selectedBackend?: string | undefined;
    availableBackends?: string[] | undefined;
  }>) | undefined;
  recordReview: ExecuteRecordReviewCommandOptions["recordReview"];
}

interface ExecuteStatusCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  inspectReviewIdentity?: (() => Promise<ReviewIdentityStatusObservation>) | undefined;
  inspectGitNexus?: (() => Promise<GitNexusStatusObservation>) | undefined;
  findLatestRun?: ((workspaceSlug: string, projectSlug: string) => Promise<{ id: string } | undefined>) | undefined;
  getStatusSnapshot: (runId: string) => Promise<RunStatusSnapshot>;
}

interface ExecuteDoctorCommandOptions extends ExecuteStatusCommandOptions {
  findProjectContext?: ((
    workspaceSlug: string,
    projectSlug: string
  ) => Promise<{ workspace: WorkspaceRecord; project: ProjectRecord } | undefined>) | undefined;
  getProjectRuntimeRegistration: (
    projectId: string
  ) => Promise<RuntimeProjectRegistrationRecord | undefined>;
  inspectQdrant?: ((
    registration: RuntimeProjectRegistrationRecord
  ) => Promise<{ ok: boolean; summary: string }>) | undefined;
  pathExists?: ((candidatePath: string) => Promise<boolean>) | undefined;
  inspectGitNexus?: (() => Promise<GitNexusStatusObservation>) | undefined;
}

interface ExecuteOpsCommandOptions extends ExecuteStatusCommandOptions {
  getRoutingReport: (runId: string) => Promise<RoutingRecommendationReport>;
  inspectRecovery: (runId: string, staleAfterHours: number) => Promise<RecoveryInspectionReport>;
}

interface ExecuteRecoverCommandOptions extends ExecuteStatusCommandOptions {
  inspectRecovery: (runId: string, staleAfterHours: number) => Promise<RecoveryInspectionReport>;
  applyRecovery: (runId: string, actionIds: readonly string[], staleAfterHours: number) => Promise<RecoveryApplyResult>;
}

interface ExecuteReportCommandOptions extends ExecuteOpsCommandOptions {
  getHandoffs: (runId: string, taskId: string) => Promise<readonly {
    createdAt: string;
    actor: string;
    ownerRole: RetrievalRole;
    completionStandard: string;
  }[]>;
  getReviews: (runId: string, taskId: string) => Promise<readonly ReviewRecord[]>;
  getApprovals: (runId: string, taskId: string) => Promise<readonly {
    createdAt: string;
    actor: string;
    actorRole: RetrievalRole;
    identityAssurance: "authenticated" | "legacy_backfill";
    decision: string;
  }[]>;
}

interface ExecutePlanContextCommandOptions {
  env?: EnvShape | undefined;
  searchMemory: (input: {
    workspaceSlug: string;
    projectSlug: string;
    query: string;
    limit: number;
    includeGlobal: boolean;
    queryEmbedding?: readonly number[] | undefined;
    embeddingModel?: string | undefined;
    requesterRole: RetrievalRole;
  }) => Promise<readonly SearchMemoryResult[]>;
  embedQuery?: ((input: { model: string; text: string }) => Promise<readonly number[]>) | undefined;
}

interface ExecuteExportDocsCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  now?: Date | undefined;
  resolveObsidianConfig?: typeof resolveObsidianConfig | undefined;
  validateObsidianConfig?: typeof validateObsidianConfig | undefined;
  createWorklogProvider: (input: {
    workspaceSlug: string;
    projectSlug: string;
  }) => WorklogProvider;
}

export interface ExecuteIndexRepoMarkdownCommandOptions {
  env?: EnvShape | undefined;
  argv?: readonly string[] | undefined;
  withClient?: typeof withClient | undefined;
  createStore?: ((client: PostgresStoreClient) => IndexRepoMarkdownStore) | undefined;
  indexRepoMarkdown?: typeof indexRepoMarkdown | undefined;
}

export interface CreateRuntimeStoreOptions {
  artifactVectorIndex?: ArtifactVectorIndex | undefined;
}

export function createRuntimeStore(
  client: PostgresStoreClient,
  options: CreateRuntimeStoreOptions = {}
): PostgresStore {
  return new PostgresStore(client, {
    artifactVectorIndex: options.artifactVectorIndex ?? new QdrantArtifactIndex()
  });
}

export async function createPlanContextEmbedQuery(
  env: EnvShape = process.env,
  options: {
    provider?: EmbeddingProvider | undefined;
  } = {}
): Promise<ExecutePlanContextCommandOptions["embedQuery"]> {
  const embeddingModel = env.DEVGOD_EMBEDDING_MODEL?.trim();
  if (!embeddingModel) {
    return undefined;
  }

  const provider = options.provider ?? (await createEmbeddingProvider(env));
  return ({ model, text }) =>
    embedQueryText({
      provider,
      model,
      text
    });
}

function normalizeRecordReviewCommandInput(raw: string): RecordReviewCommandInput {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const runId = typeof parsed.runId === "string" ? parsed.runId.trim() : "";
  const taskId = typeof parsed.taskId === "string" ? parsed.taskId.trim() : "";
  const actor = typeof parsed.actor === "string" ? parsed.actor.trim() : "";
  const reviewCandidate =
    typeof parsed.review === "object" && parsed.review !== null && !Array.isArray(parsed.review)
      ? (parsed.review as Record<string, unknown>)
      : undefined;

  if (runId.length === 0) {
    throw new Error("record-review input requires runId");
  }

  if (taskId.length === 0) {
    throw new Error("record-review input requires taskId");
  }

  if (actor.length === 0) {
    throw new Error("record-review input requires actor");
  }

  if (!reviewCandidate) {
    throw new Error("record-review input requires review");
  }

  const reviewerRole =
    typeof reviewCandidate.reviewerRole === "string" ? reviewCandidate.reviewerRole.trim() : "";
  const state = typeof reviewCandidate.state === "string" ? reviewCandidate.state.trim() : "";
  const severity = typeof reviewCandidate.severity === "string" ? reviewCandidate.severity.trim() : "";
  const findings = Array.isArray(reviewCandidate.findings)
    ? reviewCandidate.findings.map((finding) => String(finding))
    : undefined;
  const waiverReason =
    typeof reviewCandidate.waiverReason === "string" ? reviewCandidate.waiverReason : undefined;

  if (!isGateReviewRole(reviewerRole)) {
    throw new Error("record-review input requires review.reviewerRole to be a required gate role");
  }

  if (!isReviewState(state)) {
    throw new Error("record-review input requires review.state to be a valid review state");
  }

  if (!isReviewSeverity(severity)) {
    throw new Error("record-review input requires review.severity to be a valid review severity");
  }

  if (!findings) {
    throw new Error("record-review input requires review.findings to be an array of strings");
  }

  return {
    runId,
    taskId,
    actor,
    review: {
      reviewerRole,
      state,
      severity,
      findings,
      waiverReason
    },
    authContext: parsed.authContext
  };
}

function resolveCommandFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function collectCommandFlagValues(args: readonly string[], flag: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) {
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      throw new Error(`${flag} requires a value`);
    }
    values.push(value);
    index += 1;
  }

  return values;
}

function collectCommandFreeText(
  args: readonly string[],
  options: {
    valueFlags?: readonly string[] | undefined;
    booleanFlags?: readonly string[] | undefined;
  } = {}
): string {
  const valueFlags = new Set(options.valueFlags ?? []);
  const booleanFlags = new Set(options.booleanFlags ?? []);
  const tokens: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (valueFlags.has(value)) {
      index += 1;
      continue;
    }
    if (booleanFlags.has(value)) {
      continue;
    }
    tokens.push(value);
  }

  return tokens.join(" ").trim();
}

async function resolveRunIdForCommand(
  args: readonly string[],
  options: {
    env?: EnvShape | undefined;
    findLatestRun?: ((workspaceSlug: string, projectSlug: string) => Promise<{ id: string } | undefined>) | undefined;
  }
): Promise<string> {
  const env = options.env ?? process.env;
  const runId = resolveCommandFlag(args, "--run-id");
  if (runId && runId !== "latest") {
    return runId;
  }

  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;

  if (!workspaceSlug || !projectSlug || !options.findLatestRun) {
    throw new Error("status-like commands require --run-id <run-id> or --run-id latest with workspace/project");
  }

  const latestRun = await options.findLatestRun(workspaceSlug, projectSlug);
  if (!latestRun) {
    throw new Error(`No runs found for ${workspaceSlug}/${projectSlug}`);
  }

  return latestRun.id;
}

function resolveFormatFlag(args: readonly string[]): "json" | "text" {
  const format = resolveCommandFlag(args, "--format") ?? "json";
  if (format !== "json" && format !== "text") {
    throw new Error(`Invalid --format value: ${format}`);
  }
  return format;
}

function resolveMarkdownFormatFlag(args: readonly string[]): "json" | "markdown" {
  const format = resolveCommandFlag(args, "--format") ?? "json";
  if (format !== "json" && format !== "markdown") {
    throw new Error(`Invalid --format value: ${format}`);
  }
  return format;
}

async function readRecordReviewCommandInput(
  args: readonly string[],
  options: {
    cwd?: string | undefined;
  } = {}
): Promise<RecordReviewCommandInput> {
  const cwd = options.cwd ?? process.cwd();
  const inputArg = resolveCommandFlag(args, "--input");
  if (!inputArg) {
    throw new Error("record-review requires --input <file.json>");
  }

  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.resolve(cwd, inputArg);
  return normalizeRecordReviewCommandInput(await readFile(inputPath, "utf8"));
}

async function resolveRequiredReviewIdentityFilePath(options: {
  envVarName: string;
  envVarValue: string | undefined;
  liveRelativePath: string;
  cwd?: string | undefined;
}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const filePath = options.envVarValue
    ? path.isAbsolute(options.envVarValue)
      ? options.envVarValue
      : path.resolve(cwd, options.envVarValue)
    : path.resolve(cwd, options.liveRelativePath);

  try {
    await access(filePath);
  } catch {
    throw new Error(`${options.envVarName} or ${options.liveRelativePath} is required for live review actions`);
  }

  return filePath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function bindingValueContainsPlaceholder(value: string): boolean {
  return /replace-with-/i.test(value);
}

async function bindingsUsePlaceholderContent(bindingsPath: string): Promise<boolean> {
  const bindings = await loadReviewIdentityBindings(bindingsPath);
  return bindings.bindings.some((binding) => {
    if (
      bindingValueContainsPlaceholder(binding.principal.provider) ||
      bindingValueContainsPlaceholder(binding.principal.subject)
    ) {
      return true;
    }

    return binding.actors.some((actor) => {
      if (bindingValueContainsPlaceholder(actor.actor)) {
        return true;
      }

      return actor.roles.some((role) => bindingValueContainsPlaceholder(role));
    });
  });
}

export async function inspectReviewIdentityStatus(options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}): Promise<ReviewIdentityStatusObservation> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const adapterModulePath = env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE
    ? path.isAbsolute(env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE)
      ? env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE
      : path.resolve(cwd, env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE)
    : undefined;
  const bindingsPath = env.DEVGOD_REVIEW_IDENTITY_BINDINGS
    ? path.isAbsolute(env.DEVGOD_REVIEW_IDENTITY_BINDINGS)
      ? env.DEVGOD_REVIEW_IDENTITY_BINDINGS
      : path.resolve(cwd, env.DEVGOD_REVIEW_IDENTITY_BINDINGS)
    : path.resolve(cwd, ".devgod/review-identity-bindings.json");
  const adapterConfigured = adapterModulePath !== undefined;
  const adapterExists = adapterModulePath ? await pathExists(adapterModulePath) : false;
  const bindingsPresent = await pathExists(bindingsPath);
  const bindingsUseShippedTemplate = isRepoTemplateReviewIdentityPath(bindingsPath);
  const notes: string[] = [];
  let bindingsUsePlaceholderTemplate = false;
  let bindingsInvalid = false;
  let selectedBackend: string | undefined;
  let availableBackends: string[] = [];

  if (!adapterConfigured) {
    notes.push("adapter module not configured");
  } else if (!adapterExists) {
    notes.push("adapter module path does not exist");
  } else {
    try {
      availableBackends = await inspectReviewIdentityAdapterBackends(adapterModulePath);
      const loaded = await loadConfiguredReviewIdentityAdapter({
        cwd,
        env
      });
      selectedBackend = loaded.selectedBackend;
      availableBackends = loaded.availableBackends;
      if (availableBackends.length > 1 && !selectedBackend) {
        notes.push("multiple review backends are available but none is selected");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (availableBackends.length > 1 && !selectedBackend) {
        notes.push("multiple review backends are available but none is selected");
      }
      notes.push(`review identity adapter module is invalid: ${message}`);
    }
  }

  if (bindingsPresent && !bindingsUseShippedTemplate) {
    try {
      bindingsUsePlaceholderTemplate = await bindingsUsePlaceholderContent(bindingsPath);
    } catch {
      bindingsInvalid = true;
    }
  }

  if (!bindingsPresent) {
    notes.push("review identity bindings file missing");
  } else if (bindingsUseShippedTemplate) {
    notes.push("bindings path resolves to the shipped template, not a live reviewed file");
  } else if (bindingsInvalid) {
    notes.push("review identity bindings file is invalid and cannot be trusted");
  } else if (bindingsUsePlaceholderTemplate) {
    notes.push("bindings file still contains shipped placeholder values and is not live-trust-ready");
  }

  return {
    authorityLabel: "derived_only",
    adapterConfigured,
    adapterExists,
    adapterModulePath,
    selectedBackend,
    availableBackends,
    bindingsPresent,
    bindingsPath,
    bindingsUseShippedTemplate,
    liveTrustReady:
      adapterConfigured &&
      adapterExists &&
      bindingsPresent &&
      !bindingsUseShippedTemplate &&
      !bindingsUsePlaceholderTemplate &&
      !(availableBackends.length > 1 && !selectedBackend) &&
      !bindingsInvalid,
    notes
  };
}

export async function executeRecordReviewCommand(
  command: RecordReviewCommandInput,
  options: ExecuteRecordReviewCommandOptions
): Promise<RecordReviewCommandResult> {
  if (isRepoTemplateReviewIdentityPath(options.bindingsPath)) {
    throw new Error("record-review requires a live reviewed bindings file, not the shipped template");
  }

  if (await bindingsUsePlaceholderContent(options.bindingsPath)) {
    throw new Error("record-review requires reviewed bindings without shipped placeholder values");
  }

  const bindings = await loadReviewIdentityBindings(options.bindingsPath);
  const authenticate = createReviewPrincipalAdapter(options.adapter);
  const principal = await authenticate({
    runId: command.runId,
    taskId: command.taskId,
    actor: command.actor,
    reviewerRole: command.review.reviewerRole,
    reviewState: command.review.state,
    authContext: command.authContext ?? {}
  });
  const resolver = createReviewActionContextResolver({
    bindings,
    resolveAuthenticatedPrincipal() {
      return principal;
    }
  });
  const result = await options.recordReview({
    command,
    resolver
  });

  return {
    mode: "live",
    bindingsPath: options.bindingsPath,
    adapterModulePath: options.adapterModulePath,
    selectedBackend: options.selectedBackend,
    availableBackends: [...(options.availableBackends ?? [])],
    principal,
    review: result.review,
    blockers: result.blockers,
    taskStatus: result.task.status
  };
}

export async function executeRecordReviewCommandFromArgs(
  args: readonly string[],
  options: ExecuteRecordReviewCommandFromArgsOptions
): Promise<RecordReviewCommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const command = await readRecordReviewCommandInput(args, { cwd });
  const bindingsPath = await resolveRequiredReviewIdentityFilePath({
    envVarName: "DEVGOD_REVIEW_IDENTITY_BINDINGS",
    envVarValue: env.DEVGOD_REVIEW_IDENTITY_BINDINGS,
    liveRelativePath: ".devgod/review-identity-bindings.json",
    cwd
  });
  const liveAdapter = options.createLiveAdapter
    ? await options.createLiveAdapter()
    : await createLiveReviewIdentityAdapter({ cwd, env });
  if (!liveAdapter.modulePath) {
    throw new Error("record-review requires a resolved live adapter module path");
  }

  return executeRecordReviewCommand(command, {
    adapter: liveAdapter.adapter,
    adapterModulePath: liveAdapter.modulePath,
    selectedBackend: liveAdapter.selectedBackend,
    availableBackends: liveAdapter.availableBackends,
    bindingsPath,
    recordReview: options.recordReview
  });
}

async function recordReviewCommand(args: readonly string[]) {
  const result = await executeRecordReviewCommandFromArgs(args, {
    async recordReview({ command: reviewCommand, resolver }) {
      return withClient(async (client) => {
        const service = new DevgodCoreService(new PostgresStore(client), {
          resolveReviewActionContext: resolver
        });
        return service.recordReview(
          reviewCommand.runId,
          reviewCommand.taskId,
          reviewCommand.actor,
          reviewCommand.review
        );
      });
    }
  });

  console.log(JSON.stringify(result));
}

export async function executeStatusCommandFromArgs(
  args: readonly string[],
  options: ExecuteStatusCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });

  const staleAfterDaysValue = resolveCommandFlag(args, "--stale-after-days") ?? "1";
  const staleAfterDays = Number.parseInt(staleAfterDaysValue, 10);
  if (!Number.isInteger(staleAfterDays) || staleAfterDays < 0) {
    throw new Error(`Invalid --stale-after-days value: ${staleAfterDaysValue}`);
  }

  const reviewIdentity = options.inspectReviewIdentity
    ? await options.inspectReviewIdentity()
    : await inspectReviewIdentityStatus({
        cwd: options.cwd,
        env: options.env
      });
  const gitNexus = options.inspectGitNexus
    ? await options.inspectGitNexus()
    : await inspectGitNexusStatus({
        cwd: options.cwd
      });
  const snapshot = await options.getStatusSnapshot(runId);

  return buildOperatorStatusReport({
    snapshot,
    reviewIdentity,
    gitNexus,
    staleAfterDays
  });
}

async function runtimePathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function resolveProjectSelector(
  args: readonly string[],
  env: EnvShape
): { workspaceSlug: string; projectSlug: string } {
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;

  if (!workspaceSlug || !projectSlug) {
    throw new Error("doctor requires workspace/project context when no explicit run id is provided");
  }

  return { workspaceSlug, projectSlug };
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function readJsonFileIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function syncRuntimeMigrationJournal(options: {
  store: PostgresStore;
  workspace: WorkspaceRecord;
  project: ProjectRecord;
  repoPath: string;
  status: string;
  runId?: string | undefined;
}): Promise<RuntimeMigrationJournalRecord | undefined> {
  const runtimeDir = path.join(options.repoPath, ".devgod", "runtime");
  const migrationReportPath = path.join(runtimeDir, "migration-report.json");
  const registrationIntentPath = path.join(runtimeDir, "registration-intent.json");
  const backupManifestPath = path.join(runtimeDir, "backup-manifest.json");
  const migrationReport = await readJsonFileIfExists<{
    status?: string;
    cleanupRecommendation?: string;
    conflicts?: string[];
    orphans?: string[];
  }>(migrationReportPath);

  if (!migrationReport) {
    return undefined;
  }

  const registrationIntent = await readJsonFileIfExists<Record<string, unknown>>(registrationIntentPath);
  const backupManifest = await readJsonFileIfExists<Record<string, unknown>>(backupManifestPath);
  const timestamp = new Date().toISOString();
  const journal: RuntimeMigrationJournalRecord = {
    id: `runtime-migration:${options.project.id}:external-runtime-refactor`,
    workspaceId: options.workspace.id,
    projectId: options.project.id,
    runId: options.runId,
    phase: "external-runtime-refactor",
    status: options.status,
    backupManifestPath,
    verificationReportPath: migrationReportPath,
    rollbackState: backupManifest ? "backup_manifest_recorded" : "not_available",
    details: {
      reportedStatus: migrationReport.status ?? "planned",
      cleanupRecommendation: migrationReport.cleanupRecommendation ?? null,
      conflicts: migrationReport.conflicts ?? [],
      orphans: migrationReport.orphans ?? [],
      registrationIntentPath,
      registrationIntent,
      backupManifest
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await options.store.saveRuntimeMigrationJournal(journal);
  return journal;
}

async function inspectQdrantHealth(
  registration: RuntimeProjectRegistrationRecord
): Promise<{ ok: boolean; summary: string }> {
  if (!registration.qdrantUrl) {
    return {
      ok: false,
      summary: "qdrant URL is not configured in runtime registration"
    };
  }

  try {
    const qdrantUrl = validateRuntimeQdrantUrl(registration.qdrantUrl, registration.runtimeProfile);
    const response = await fetch(resolveQdrantCollectionsUrl(qdrantUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) {
      return {
        ok: false,
        summary: `qdrant returned ${response.status} ${response.statusText}`
      };
    }

    return {
      ok: true,
      summary: "qdrant reachable"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      summary: `qdrant unreachable: ${message}`
    };
  }
}

async function inspectQdrantHealthWithRetry(
  registration: RuntimeProjectRegistrationRecord,
  options: {
    attempts: number;
    delayMs: number;
  }
): Promise<{ ok: boolean; summary: string }> {
  let latestResult = await inspectQdrantHealth(registration);

  for (let attempt = 1; attempt < options.attempts && !latestResult.ok; attempt += 1) {
    await sleep(options.delayMs);
    latestResult = await inspectQdrantHealth(registration);
  }

  return latestResult;
}

export async function executeDoctorCommandFromArgs(
  args: readonly string[],
  options: ExecuteDoctorCommandOptions
) {
  const env = options.env ?? process.env;
  const explicitRunId = resolveCommandFlag(args, "--run-id");
  const projectSelector =
    explicitRunId && explicitRunId !== "latest"
      ? {
          workspaceSlug: resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG ?? "unknown",
          projectSlug: resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG ?? "unknown"
        }
      : resolveProjectSelector(args, env);
  const latestRun =
    explicitRunId === "latest" || !explicitRunId
      ? await options.findLatestRun?.(projectSelector.workspaceSlug, projectSelector.projectSlug)
      : undefined;
  const resolvedRunId =
    explicitRunId && explicitRunId !== "latest" ? explicitRunId : latestRun?.id;
  const snapshot = resolvedRunId ? await options.getStatusSnapshot(resolvedRunId) : undefined;
  const projectContext =
    projectSelector.workspaceSlug !== "unknown" && projectSelector.projectSlug !== "unknown"
      ? await options.findProjectContext?.(projectSelector.workspaceSlug, projectSelector.projectSlug)
      : undefined;

  if (!snapshot && !projectContext) {
    throw new Error(`Project ${projectSelector.workspaceSlug}/${projectSelector.projectSlug} is not bootstrapped`);
  }

  const projectId = snapshot?.run.projectId ?? projectContext?.project.id;
  const workspaceId = snapshot?.run.workspaceId ?? projectContext?.workspace.id;
  if (!projectId || !workspaceId) {
    throw new Error("doctor could not resolve project context");
  }

  const registration = await options.getProjectRuntimeRegistration(projectId);
  const reviewIdentity = options.inspectReviewIdentity
    ? await options.inspectReviewIdentity()
    : await inspectReviewIdentityStatus({
        cwd: options.cwd,
        env
      });
  const currentRepoPath = path.resolve(options.cwd ?? process.cwd());
  const canAccessPath = options.pathExists ?? runtimePathExists;

  const registrationCheck = registration
    ? {
        authorityLabel: "runtime_authoritative" as const,
        ok: true,
        summary: "runtime registration present"
      }
    : {
        authorityLabel: "runtime_authoritative" as const,
        ok: false,
        summary: "project is bootstrapped but not runtime-registered"
      };

  const repoPathCheck = registration
    ? path.resolve(registration.repoPath) === currentRepoPath
      ? {
          authorityLabel: "runtime_authoritative" as const,
          ok: true,
          summary: "repo path matches runtime registration"
        }
      : {
          authorityLabel: "runtime_authoritative" as const,
          ok: false,
          summary: `repo path mismatch: registered ${registration.repoPath}, current ${currentRepoPath}`
        }
    : {
        authorityLabel: "runtime_authoritative" as const,
        ok: false,
        summary: "repo path could not be checked without runtime registration"
      };

  const dataRootCheck = registration
    ? (await canAccessPath(registration.dataRoot))
      ? {
          authorityLabel: "runtime_authoritative" as const,
          ok: true,
          summary: "runtime data root is accessible"
        }
      : {
          authorityLabel: "runtime_authoritative" as const,
          ok: false,
          summary: `runtime data root is missing or inaccessible: ${registration.dataRoot}`
        }
    : {
        authorityLabel: "runtime_authoritative" as const,
        ok: false,
        summary: "runtime data root could not be checked without runtime registration"
      };

  const qdrantStatus =
    registration ? await (options.inspectQdrant ?? inspectQdrantHealth)(registration) : {
      ok: false,
      summary: "qdrant URL is not configured in runtime registration"
    };

  const qdrantCheck = {
    authorityLabel: "runtime_authoritative" as const,
    ok: qdrantStatus.ok,
    summary: qdrantStatus.summary
  };

  const reviewIdentityCheck = {
    authorityLabel: "derived_only" as const,
    ok: reviewIdentity.liveTrustReady,
    summary: reviewIdentity.liveTrustReady
      ? "review identity bindings are live-trust ready"
      : reviewIdentity.notes[0] ?? "review identity is not live-trust ready"
  };

  const checks = {
    registration: registrationCheck,
    repoPath: repoPathCheck,
    dataRoot: dataRootCheck,
    qdrant: qdrantCheck,
    reviewIdentity: reviewIdentityCheck
  };

  const blockers = [
    registrationCheck,
    repoPathCheck,
    dataRootCheck,
    qdrantCheck
  ]
    .filter((check) => !check.ok)
    .map((check) => check.summary);
  const advisories = reviewIdentityCheck.ok ? [] : [reviewIdentityCheck.summary];

  return {
    ok: blockers.length === 0,
    run: snapshot
      ? {
          authorityLabel: "runtime_authoritative" as const,
          id: snapshot.run.id,
          workspaceId: snapshot.run.workspaceId,
          projectId: snapshot.run.projectId
        }
      : undefined,
    project: {
      authorityLabel: "runtime_authoritative" as const,
      workspaceSlug: projectSelector.workspaceSlug,
      projectSlug: projectSelector.projectSlug,
      workspaceId,
      projectId
    },
    runtime: {
      authorityLabel: "runtime_authoritative" as const,
      runtimeProfile: registration?.runtimeProfile,
      dataRoot: registration?.dataRoot,
      qdrantUrl: registration?.qdrantUrl,
      qdrantCollection: registration?.qdrantCollection
    },
    checks,
    blockers,
    advisories
  };
}

async function doctorCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const report = await executeDoctorCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      }
    });
    console.log(JSON.stringify(report));
  });
}

async function statusCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const report = await executeStatusCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      }
    });
    console.log(JSON.stringify(report));
  });
}

export async function executeOpsCommandFromArgs(
  args: readonly string[],
  options: ExecuteOpsCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const staleAfterHoursValue = resolveCommandFlag(args, "--stale-after-hours") ?? "24";
  const staleAfterHours = Number.parseInt(staleAfterHoursValue, 10);
  if (!Number.isInteger(staleAfterHours) || staleAfterHours < 0) {
    throw new Error(`Invalid --stale-after-hours value: ${staleAfterHoursValue}`);
  }

  const format = resolveFormatFlag(args);
  const [status, routing, recovery] = await Promise.all([
    executeStatusCommandFromArgs(["--run-id", runId], options),
    options.getRoutingReport(runId),
    options.inspectRecovery(runId, staleAfterHours)
  ]);
  const report = buildOperatorDashboardReport({
    status,
    routing,
    recovery
  });

  return {
    format,
    report
  };
}

async function opsCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const result = await executeOpsCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getRoutingReport(runId) {
        return service.recommendRouting(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      }
    });

    if (result.format === "text") {
      process.stdout.write(formatOperatorDashboardReport(result.report));
      return;
    }

    console.log(JSON.stringify(result.report));
  });
}

export async function executeRecoverCommandFromArgs(
  args: readonly string[],
  options: ExecuteRecoverCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const staleAfterHoursValue = resolveCommandFlag(args, "--stale-after-hours") ?? "24";
  const staleAfterHours = Number.parseInt(staleAfterHoursValue, 10);
  if (!Number.isInteger(staleAfterHours) || staleAfterHours < 0) {
    throw new Error(`Invalid --stale-after-hours value: ${staleAfterHoursValue}`);
  }

  const applyValues = collectCommandFlagValues(args, "--apply");
  const applySafe = args.includes("--apply-safe");
  if (applyValues.length > 0 && applySafe) {
    throw new Error("recover accepts either --apply-safe or one/more --apply <action-id> flags, not both");
  }

  if (applyValues.length === 0 && !applySafe) {
    return options.inspectRecovery(runId, staleAfterHours);
  }

  return options.applyRecovery(runId, applyValues, staleAfterHours);
}

async function recoverCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const result = await executeRecoverCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      }
    });
    console.log(JSON.stringify(result));
  });
}

export async function executeReportCommandFromArgs(
  args: readonly string[],
  options: ExecuteReportCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const format = resolveMarkdownFormatFlag(args);
  const staleAfterHoursValue = resolveCommandFlag(args, "--stale-after-hours") ?? "24";
  const staleAfterHours = Number.parseInt(staleAfterHoursValue, 10);
  if (!Number.isInteger(staleAfterHours) || staleAfterHours < 0) {
    throw new Error(`Invalid --stale-after-hours value: ${staleAfterHoursValue}`);
  }

  const [status, routing, recovery] = await Promise.all([
    executeStatusCommandFromArgs(["--run-id", runId], options),
    options.getRoutingReport(runId),
    options.inspectRecovery(runId, staleAfterHours)
  ]);
  const snapshot = await options.getStatusSnapshot(runId);

  const handoffsByTask = Object.fromEntries(
    await Promise.all(
      snapshot.tasks.map(async (task) => [task.packet.taskId, await options.getHandoffs(runId, task.packet.taskId)])
    )
  );
  const reviewsByTask = Object.fromEntries(
    await Promise.all(
      snapshot.tasks.map(async (task) => [task.packet.taskId, await options.getReviews(runId, task.packet.taskId)])
    )
  );
  const approvalsByTask = Object.fromEntries(
    await Promise.all(
      snapshot.tasks.map(async (task) => [task.packet.taskId, await options.getApprovals(runId, task.packet.taskId)])
    )
  );

  return {
    format,
    report: buildRunEvidenceReport({
      snapshot,
      status,
      routing,
      recovery,
      handoffsByTask,
      reviewsByTask,
      approvalsByTask
    })
  };
}

export async function executeExportDocsCommandFromArgs(
  args: readonly string[],
  options: ExecuteExportDocsCommandOptions
): Promise<ExportDocsCommandResult> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;

  if (!workspaceSlug || !projectSlug) {
    throw new Error("export-docs requires DEVGOD_WORKSPACE_SLUG and DEVGOD_PROJECT_SLUG or explicit flags");
  }

  const resolveObsidianConfigImpl = options.resolveObsidianConfig ?? resolveObsidianConfig;
  const validateObsidianConfigImpl = options.validateObsidianConfig ?? validateObsidianConfig;
  const config = resolveObsidianConfigImpl(env, {
    cwd,
    projectSlug
  });
  await validateObsidianConfigImpl(config);

  const rawQuery = collectCommandFreeText(args, {
    valueFlags: ["--workspace-slug", "--project-slug"],
    booleanFlags: ["--overwrite"]
  });
  const request = parseExportDocsRequest(rawQuery, config, {
    now: options.now
  });
  const provider = options.createWorklogProvider({
    workspaceSlug,
    projectSlug
  });
  const entries = await provider.getEntries(request);

  if (entries.length === 0) {
    const dateLabel =
      request.dateFrom && request.dateTo && request.dateFrom === request.dateTo
        ? request.dateFrom
        : request.dateFrom && request.dateTo
          ? `${request.dateFrom} to ${request.dateTo}`
          : "the requested range";
    return {
      request,
      message: `No matching worklog entries found for ${dateLabel}. No note was created.`,
      matchedEntries: 0
    };
  }

  const summary = new DocsSummarizer().summarize(entries, request);
  const markdown = new ObsidianMarkdownRenderer().render(summary, request);
  const writer = new ObsidianVaultWriter(config.vaultPath!);
  const targetPath = await writer.writeNote(markdown, buildObsidianTargetPath(request, summary), args.includes("--overwrite"));

  return {
    request,
    summary,
    targetPath,
    message: `Exported Obsidian note:\n${targetPath}`,
    matchedEntries: entries.length
  };
}

async function reportCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const result = await executeReportCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getRoutingReport(runId) {
        return service.recommendRouting(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      },
      getHandoffs(runId, taskId) {
        return store.getHandoffs(runId, taskId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    });

    if (result.format === "markdown") {
      process.stdout.write(formatRunEvidenceReportMarkdown(result.report));
      return;
    }

    console.log(JSON.stringify(result.report));
  });
}

export async function executePlanContextCommandFromArgs(
  args: readonly string[],
  options: ExecutePlanContextCommandOptions
) {
  const env = options.env ?? process.env;
  const query = resolveCommandFlag(args, "--query");
  if (!query) {
    throw new Error("plan-context requires --query <text>");
  }

  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;
  if (!workspaceSlug || !projectSlug) {
    throw new Error("plan-context requires workspace/project via flags or environment");
  }

  const roleCandidate = resolveCommandFlag(args, "--role") ?? "planner";
  if (!isRetrievalRole(roleCandidate)) {
    throw new Error(`Invalid --role value: ${roleCandidate}`);
  }

  const limitValue = resolveCommandFlag(args, "--limit") ?? "5";
  const limit = Number.parseInt(limitValue, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${limitValue}`);
  }

  const format = resolveMarkdownFormatFlag(args);
  const includeGlobal = !args.includes("--project-only");
  const embeddingModel = env.DEVGOD_EMBEDDING_MODEL?.trim();
  const queryEmbedding =
    embeddingModel && options.embedQuery
      ? await options.embedQuery({
          model: embeddingModel,
          text: query
        })
      : undefined;
  const results = await options.searchMemory({
    workspaceSlug,
    projectSlug,
    query,
    limit,
    includeGlobal,
    queryEmbedding,
    embeddingModel,
    requesterRole: roleCandidate
  });

  return {
    format,
    report: buildPlanningContextReport({
      query,
      requesterRole: roleCandidate,
      results
    })
  };
}

async function planContextCommand(args: readonly string[]) {
  const embedQuery = await createPlanContextEmbedQuery(process.env);

  await withClient(async (client) => {
    const service = new DevgodCoreService(createRuntimeStore(client));
    const result = await executePlanContextCommandFromArgs(args, {
      env: process.env,
      searchMemory(input) {
        return service.searchMemory(input);
      },
      embedQuery
    });

    if (result.format === "markdown") {
      process.stdout.write(formatPlanningContextReportMarkdown(result.report));
      return;
    }

    console.log(JSON.stringify(result.report));
  });
}

async function exportDocsCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const result = await executeExportDocsCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      createWorklogProvider({ workspaceSlug, projectSlug }) {
        return new RuntimeWorklogProvider(createRuntimeStore(client), {
          workspaceSlug,
          projectSlug
        });
      }
    });

    process.stdout.write(`${result.message}\n`);
  });
}

export async function executeGithubDispatchCommandFromArgs(args: readonly string[]) {
  const inputArg = resolveCommandFlag(args, "--input");
  if (!inputArg) {
    throw new Error("github-dispatch requires --input <github-event.json>");
  }
  const targetRoot = path.resolve(resolveCommandFlag(args, "--target") ?? ".");
  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.resolve(process.cwd(), inputArg);
  const taskId = resolveCommandFlag(args, "--task-id");

  return dispatchGithubWorkItem({
    sourceRoot: repoRoot,
    targetRoot,
    inputPath,
    taskId,
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    forceActive: args.includes("--force-active")
  });
}

async function githubDispatchCommand(args: readonly string[]) {
  console.log(JSON.stringify(await executeGithubDispatchCommandFromArgs(args)));
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
      store: createRuntimeStore(client),
      provider,
      limit
    });
    console.log(JSON.stringify(result));
  });
}

export async function executeIndexRepoMarkdownCommand(options: ExecuteIndexRepoMarkdownCommandOptions = {}) {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const withClientImpl = options.withClient ?? withClient;
  const createStoreImpl = options.createStore ?? ((client: PostgresStoreClient) => createRuntimeStore(client));
  const indexRepoMarkdownImpl = options.indexRepoMarkdown ?? indexRepoMarkdown;

  const targetRepoRoot = argv[3]
    ? path.resolve(process.cwd(), argv[3])
    : env.DEVGOD_REPO_MARKDOWN_ROOT
      ? path.resolve(process.cwd(), env.DEVGOD_REPO_MARKDOWN_ROOT)
      : repoRoot;
  const workspaceSlug = env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const workspaceName = env.DEVGOD_WORKSPACE_NAME ?? "Default Workspace";
  const projectSlug = env.DEVGOD_PROJECT_SLUG;
  const projectName = env.DEVGOD_PROJECT_NAME;
  const include = (env.DEVGOD_REPO_MARKDOWN_INCLUDE ?? "README.md,AGENTS.md,docs,.devgod,.agents/skills")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const embeddingModel = env.DEVGOD_EMBEDDING_MODEL;

  if (!projectSlug) {
    throw new Error("DEVGOD_PROJECT_SLUG is required");
  }

  return withClientImpl(async (client) =>
    indexRepoMarkdownImpl({
      store: createStoreImpl(client),
      repoRoot: targetRepoRoot,
      workspaceSlug,
      workspaceName,
      projectSlug,
      projectName,
      include,
      embeddingModel
    })
  );
}

async function indexRepoMarkdownCommand() {
  console.log(JSON.stringify(await executeIndexRepoMarkdownCommand()));
}

async function main() {
  await loadDotEnv();
  const command = process.argv[2];
  const args = process.argv.slice(3);

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

  if (command === "record-review") {
    await recordReviewCommand(args);
    return;
  }

  if (command === "status") {
    await statusCommand(args);
    return;
  }

  if (command === "doctor") {
    await doctorCommand(args);
    return;
  }

  if (command === "ops") {
    await opsCommand(args);
    return;
  }

  if (command === "recover") {
    await recoverCommand(args);
    return;
  }

  if (command === "report") {
    await reportCommand(args);
    return;
  }

  if (command === "plan-context") {
    await planContextCommand(args);
    return;
  }

  if (command === "export-docs" || command === "/export-docs") {
    await exportDocsCommand(args);
    return;
  }

  if (command === "github-dispatch") {
    await githubDispatchCommand(args);
    return;
  }

  if (command === "index-repo-markdown") {
    await indexRepoMarkdownCommand();
    return;
  }

  throw new Error(`Unknown command: ${command ?? "<none>"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
