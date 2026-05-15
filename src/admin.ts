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
  runtimeModeFromProfile,
  validateRuntimeQdrantUrl
} from "./runtime/config.ts";
import { createHashEmbeddingProvider } from "./runtime/hash-embedding-provider.ts";
import {
  captureRepoMarkdownSnapshot,
  DEFAULT_REPO_MARKDOWN_INCLUDE_PATHS,
  indexRepoMarkdown
} from "./runtime/repo-markdown-indexer.ts";
import { loadDotEnv, withClient } from "./admin/db.ts";
import { buildRunEvidenceReport, formatRunEvidenceReportMarkdown } from "./admin/report.ts";
import {
  buildPlanningContextReport,
  formatPlanningContextReportMarkdown,
  type PlanningContextRetrievalState
} from "./admin/planning-context.ts";
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
import { advanceTaskQueue, parseTaskQueueContent, type TaskQueue } from "./devgod/task-queue.ts";
import { effectiveRequiredReviews, isGateReviewRole, isRetrievalRole, isReviewSeverity, isReviewState } from "./domain/contracts.ts";
import {
  createReviewActionContextResolver,
  createReviewPrincipalAdapter,
  loadReviewIdentityBindings,
  loadReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  type AuthenticatedPrincipal,
  type ReviewPrincipalAdapter
} from "./core/review-context.ts";
import {
  DevgodCoreService,
  type DirectiveExecutionResult,
  type ExecuteDirectiveStepOptions
} from "./core/service.ts";
import { evaluateReviewDecision } from "./core/policy.ts";
import type { ResolveReviewActionContext } from "./core/review-context.ts";
import type {
  ApprovalRecord,
  HandoffInput,
  IntakeRequestInput,
  ProjectRuntimeStateRecord,
  RecoveryApplyResult,
  RecoveryInspectionReport,
  ProjectRecord,
  ReviewInput,
  ReviewRecord,
  RuntimeMigrationJournalRecord,
  RuntimeProjectRegistrationRecord,
  RoutingRecommendationReport,
  RunExecutionPlan,
  RunRecord,
  RetrievalRole,
  SearchMemoryResult,
  RunStatusSnapshot,
  TaskPacketInput,
  TaskStatus
} from "./domain/types.ts";
import type { WorkspaceRecord } from "./domain/types.ts";
import type { ExportDocsCommandResult } from "./docs-export/models.ts";
import { PostgresStore } from "./store/postgres-store.ts";
import { QdrantArtifactIndex, type ArtifactVectorIndex } from "./store/qdrant-artifact-index.ts";
import type { DevgodStore as DevgodStoreContract } from "./store/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
type EnvShape = NodeJS.ProcessEnv;
type PostgresStoreClient = ConstructorParameters<typeof PostgresStore>[0];
type IndexRepoMarkdownStore = Parameters<typeof indexRepoMarkdown>[0]["store"];
type RetrievalFreshnessStore = Pick<
  DevgodStoreContract,
  "getProjectContext" | "getProjectRuntimeRegistration"
>;
type RefreshRetrievalStore = IndexRepoMarkdownStore &
  Pick<
    DevgodStoreContract,
    | "getProjectContext"
    | "getProjectRuntimeRegistration"
    | "saveProjectRuntimeRegistration"
    | "leaseEmbeddingJobs"
    | "getEmbeddingSource"
    | "completeEmbeddingJob"
    | "failEmbeddingJob"
  >;

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
    const configuredPath = path.isAbsolute(options.envVarValue)
      ? options.envVarValue
      : path.resolve(cwd, options.envVarValue);
    if (await pathExists(configuredPath)) {
      return configuredPath;
    }
    return path.resolve(repoRoot, options.templateRelativePath);
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
  const result = await executeVerifyReviewIdentityCommand({
    cwd: process.cwd(),
    env: process.env
  });
  console.log(JSON.stringify(result));
}

export async function executeVerifyReviewIdentityCommand(options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const bindingsPath = await resolveReviewIdentityFilePath({
    envVarValue: env.DEVGOD_REVIEW_IDENTITY_BINDINGS,
    liveRelativePath: ".devgod/review-identity-bindings.json",
    templateRelativePath: ".devgod/templates/review-identity-bindings.json",
    cwd
  });
  const fixturesPath = await resolveReviewIdentityFilePath({
    envVarValue: env.DEVGOD_REVIEW_IDENTITY_FIXTURES,
    liveRelativePath: ".devgod/review-identity-adapter.fixture.json",
    templateRelativePath: ".devgod/templates/review-identity-adapter.fixture.json",
    cwd
  });

  if (
    !env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE &&
    (!isRepoTemplateReviewIdentityPath(bindingsPath) || !isRepoTemplateReviewIdentityPath(fixturesPath))
  ) {
    throw new Error("DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE is required for verify-review-identity");
  }

  const configuredAdapterPath = resolveAdapterModulePath(cwd, env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE);
  const useTemplateFallbackAdapter =
    isRepoTemplateReviewIdentityPath(bindingsPath) &&
    isRepoTemplateReviewIdentityPath(fixturesPath) &&
    (!configuredAdapterPath || !(await pathExists(configuredAdapterPath)));

  const [bindings, fixtures, adapter] = await Promise.all([
    loadReviewIdentityBindings(bindingsPath),
    loadReviewIdentityFixtures(fixturesPath),
    loadConfiguredReviewIdentityAdapter(
      useTemplateFallbackAdapter
        ? {
            env: {
              ...env,
              DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: undefined
            },
            cwd
          }
        : { env, cwd }
    )
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

  return result;
}

function resolveAdapterModulePath(cwd: string, modulePath: string | undefined): string | undefined {
  if (!modulePath) {
    return undefined;
  }

  return path.isAbsolute(modulePath) ? modulePath : path.resolve(cwd, modulePath);
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
  getExecutionPlan: (runId: string, staleAfterHours: number) => Promise<RunExecutionPlan>;
  getRoutingReport: (runId: string) => Promise<RoutingRecommendationReport>;
  inspectRecovery: (runId: string, staleAfterHours: number) => Promise<RecoveryInspectionReport>;
}

interface ExecuteLoopCommandOptions extends ExecuteStatusCommandOptions {
  getExecutionPlan: (runId: string, staleAfterHours: number) => Promise<RunExecutionPlan>;
  applyRecovery: (runId: string, actionIds: readonly string[], staleAfterHours: number) => Promise<RecoveryApplyResult>;
  executeDirectiveStep?: ((
    runId: string,
    input: Omit<ExecuteDirectiveStepOptions, "executeReviewRecommendation"> & {
      reviewCommands: readonly RecordReviewCommandInput[];
    }
  ) => Promise<DirectiveExecutionResult>) | undefined;
}

interface ExecuteRecoverCommandOptions extends ExecuteStatusCommandOptions {
  inspectRecovery: (runId: string, staleAfterHours: number) => Promise<RecoveryInspectionReport>;
  applyRecovery: (runId: string, actionIds: readonly string[], staleAfterHours: number) => Promise<RecoveryApplyResult>;
}

interface ExecuteReportCommandOptions extends ExecuteStatusCommandOptions {
  getRoutingReport: (runId: string) => Promise<RoutingRecommendationReport>;
  inspectRecovery: (runId: string, staleAfterHours: number) => Promise<RecoveryInspectionReport>;
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
  getLoopHistory?: ((runId: string, limit: number) => Promise<readonly SearchMemoryResult[]>) | undefined;
}

interface ExecuteWorkflowProofCommandOptions {
  env?: EnvShape | undefined;
  findLatestRun?: ((workspaceSlug: string, projectSlug: string) => Promise<{ id: string } | undefined>) | undefined;
  findLatestRunForTask?: ((
    workspaceSlug: string,
    projectSlug: string,
    taskId: string
  ) => Promise<{ id: string } | undefined>) | undefined;
  getStatusSnapshot: (runId: string) => Promise<RunStatusSnapshot>;
  getReviews: (runId: string, taskId: string) => Promise<readonly ReviewRecord[]>;
  getApprovals: (runId: string, taskId: string) => Promise<readonly ApprovalRecord[]>;
}

export interface WorkflowProofResult {
  authorityLabel: "runtime_authoritative";
  runId: string;
  taskId: string;
  taskStatus: TaskStatus;
  reviewDecision: "approved";
  blockers: [];
  latestReviews: ReviewRecord[];
  latestApproval: ApprovalRecord;
}

interface ExecuteSeedWorkflowProofCommandOptions extends ExecuteWorkflowProofCommandOptions {
  cwd?: string | undefined;
  getProjectContext: (params: {
    workspaceSlug: string;
    projectSlug: string;
  }) => Promise<{ workspace: WorkspaceRecord; project: ProjectRecord } | undefined>;
  getProjectRuntimeState: (projectId: string) => Promise<ProjectRuntimeStateRecord | undefined>;
  saveProjectRuntimeState: (state: ProjectRuntimeStateRecord) => Promise<void>;
  intakeRequest: (input: IntakeRequestInput) => Promise<RunRecord>;
  createTaskGraph: (runId: string, taskPackets: TaskPacketInput[]) => Promise<readonly unknown[]>;
  claimTask: (runId: string, taskId: string, actor: string) => Promise<unknown>;
  submitHandoff: (runId: string, taskId: string, handoff: HandoffInput) => Promise<unknown>;
  recordReview: (runId: string, taskId: string, actor: string, review: ReviewInput) => Promise<unknown>;
}

export interface SeedWorkflowProofResult extends WorkflowProofResult {
  mode: "local_workflow_proof_seed";
  workspaceSlug: string;
  projectSlug: string;
}

interface ExecuteAdvanceActiveTaskCommandOptions extends ExecuteWorkflowProofCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  getProjectContext: (params: {
    workspaceSlug: string;
    projectSlug: string;
  }) => Promise<{ workspace: WorkspaceRecord; project: ProjectRecord } | undefined>;
  getProjectRuntimeState: (projectId: string) => Promise<ProjectRuntimeStateRecord | undefined>;
  saveProjectRuntimeState: (state: ProjectRuntimeStateRecord) => Promise<void>;
}

export interface AdvanceActiveTaskCommandResult {
  mode: "dry_run" | "applied";
  taskId: string;
  nextTaskId: string | null;
  proof: WorkflowProofResult;
  queue: TaskQueue;
}

function resolveRepoMarkdownInclude(env: EnvShape): string[] {
  const includeValue = env.DEVGOD_REPO_MARKDOWN_INCLUDE ?? DEFAULT_REPO_MARKDOWN_INCLUDE_PATHS.join(",");
  return includeValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const repoMarkdownCommandFlagsWithValues = new Set([
  "--workspace-slug",
  "--workspace-name",
  "--project-slug",
  "--project-name",
  "--embedding-model"
]);

function resolveCommandPositionals(
  args: readonly string[],
  flagsWithValues: ReadonlySet<string> = new Set()
): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }

    if (value.startsWith("-")) {
      if (flagsWithValues.has(value)) {
        index += 1;
      }
      continue;
    }

    positionals.push(value);
  }

  return positionals;
}

function resolveRepoMarkdownTargetRoot(
  env: EnvShape,
  args: readonly string[] = [],
  cwd = process.cwd()
): string {
  const [targetRoot] = resolveCommandPositionals(args, repoMarkdownCommandFlagsWithValues);
  if (targetRoot) {
    return path.resolve(cwd, targetRoot);
  }

  if (env.DEVGOD_REPO_MARKDOWN_ROOT) {
    return path.resolve(cwd, env.DEVGOD_REPO_MARKDOWN_ROOT);
  }

  return path.resolve(cwd);
}

function resolveEmbeddingJobLimit(env: EnvShape, candidate?: string | undefined): number {
  const limitValue = candidate ?? env.DEVGOD_EMBEDDING_JOB_LIMIT ?? "10";
  const limit = Number.parseInt(limitValue, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid embedding job limit: ${limitValue}`);
  }
  return limit;
}

interface RetrievalIndexManifestRecord {
  status?: string | undefined;
  repoRoot?: string | undefined;
  include?: string[] | undefined;
  fileCount?: number | undefined;
  fingerprint?: string | undefined;
  embeddingModel?: string | undefined;
  indexedAt?: string | undefined;
  jobsQueued?: number | undefined;
  chunksStored?: number | undefined;
  filesIndexed?: number | undefined;
  embeddingLeased?: number | undefined;
  embeddingCompleted?: number | undefined;
  embeddingFailed?: number | undefined;
  embeddedAt?: string | undefined;
}

function readRetrievalIndexManifest(
  registration: RuntimeProjectRegistrationRecord
): RetrievalIndexManifestRecord | undefined {
  const candidate = registration.manifest.retrievalIndex;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }

  return candidate as RetrievalIndexManifestRecord;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  getRetrievalFreshness?: (() => Promise<PlanningContextRetrievalState>) | undefined;
  refreshRetrieval?: (() => Promise<RefreshRetrievalResult>) | undefined;
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

export interface ExecuteRefreshRetrievalCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  argv?: readonly string[] | undefined;
  withClient?: typeof withClient | undefined;
  createStore?: ((client: PostgresStoreClient) => RefreshRetrievalStore) | undefined;
  captureSnapshot?: typeof captureRepoMarkdownSnapshot | undefined;
  indexRepoMarkdown?: typeof indexRepoMarkdown | undefined;
  runEmbeddingJobs?: typeof runEmbeddingJobs | undefined;
  createEmbeddingProvider?: typeof createEmbeddingProvider | undefined;
  now?: (() => Date) | undefined;
}

export interface RefreshRetrievalResult {
  authorityLabel: "runtime_authoritative";
  workspaceSlug: string;
  projectSlug: string;
  repoRoot: string;
  filesIndexed: number;
  chunksStored: number;
  jobsQueued: number;
  embeddingJobs?: {
    leased: number;
    completed: number;
    failed: number;
  } | undefined;
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

function resolveAutoRefreshRetrievalEnabled(args: readonly string[], env: EnvShape): boolean {
  if (args.includes("--no-auto-refresh-retrieval")) {
    return false;
  }

  const candidate = env.DEVGOD_AUTO_REFRESH_RETRIEVAL?.trim().toLowerCase();
  if (!candidate) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(candidate)) {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(candidate)) {
    return true;
  }

  return true;
}

async function resolvePlanningRetrievalState(
  args: readonly string[],
  env: EnvShape,
  options: ExecutePlanContextCommandOptions
): Promise<PlanningContextRetrievalState | undefined> {
  if (!options.getRetrievalFreshness) {
    return undefined;
  }

  let retrieval = await options.getRetrievalFreshness();
  if (!options.refreshRetrieval || !resolveAutoRefreshRetrievalEnabled(args, env) || retrieval.state === "fresh") {
    return retrieval;
  }

  try {
    await options.refreshRetrieval();
    retrieval = await options.getRetrievalFreshness();
    if (retrieval.state === "fresh") {
      return {
        ...retrieval,
        summary: `${retrieval.summary} after automatic refresh`
      };
    }

    return retrieval;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...retrieval,
      summary: `${retrieval.summary}; automatic refresh failed: ${message}`
    };
  }
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

async function resolveActiveTaskIdFromFile(cwd = process.cwd()): Promise<string | undefined> {
  try {
    const activeContent = await readFile(path.join(cwd, ".devgod", "ACTIVE"), "utf8");
    const taskIdLine = activeContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("task_id="));

    if (!taskIdLine) {
      return undefined;
    }

    const taskId = taskIdLine.slice("task_id=".length).trim();
    return taskId.length > 0 ? taskId : undefined;
  } catch {
    return undefined;
  }
}

function buildDefaultTaskQueue(): TaskQueue {
  return {
    project_status: "idle",
    current_task_id: null,
    tasks: []
  };
}

function buildDefaultProductState(): Record<string, unknown> {
  return {
    status: "idle",
    items: []
  };
}

function parseTaskQueueRecord(candidate: TaskQueue | Record<string, unknown> | undefined): TaskQueue {
  return parseTaskQueueContent(JSON.stringify(candidate ?? buildDefaultTaskQueue()));
}

function alignQueueToActiveTask(
  candidate: TaskQueue | Record<string, unknown> | undefined,
  taskId: string
): TaskQueue {
  const queue = parseTaskQueueRecord(candidate);
  const existingTask = queue.tasks.find((task) => task.id === taskId);

  const tasks = existingTask
    ? queue.tasks.map((task) =>
        task.id === taskId
      ? {
          ...task,
          status: "in_progress" as const,
          blocker: null
        }
          : task
      )
    : [
        ...queue.tasks,
        {
          id: taskId,
          title: taskId,
          status: "in_progress" as const,
          class: "release_candidate" as const,
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ];

  return {
    project_status: "in_progress",
    current_task_id: taskId,
    tasks
  };
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

async function readLoopReviewCommandInputs(
  args: readonly string[],
  options: {
    cwd?: string | undefined;
  } = {}
): Promise<readonly RecordReviewCommandInput[]> {
  const cwd = options.cwd ?? process.cwd();
  const inputArgs = collectCommandFlagValues(args, "--review-input");

  return Promise.all(
    inputArgs.map(async (inputArg) => {
      const inputPath = path.isAbsolute(inputArg) ? inputArg : path.resolve(cwd, inputArg);
      return normalizeRecordReviewCommandInput(await readFile(inputPath, "utf8"));
    })
  );
}

export async function createLiveLoopReviewCommandExecutor(
  options: {
    cwd?: string | undefined;
    env?: EnvShape | undefined;
    createLiveAdapter?: ExecuteRecordReviewCommandFromArgsOptions["createLiveAdapter"];
    recordReview: ExecuteRecordReviewCommandOptions["recordReview"];
  }
): Promise<(command: RecordReviewCommandInput) => Promise<RecordReviewCommandResult>> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
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
    throw new Error("loop review execution requires a resolved live adapter module path");
  }
  const adapterModulePath = liveAdapter.modulePath;

  return (command) =>
    executeRecordReviewCommand(command, {
      adapter: liveAdapter.adapter,
      adapterModulePath,
      selectedBackend: liveAdapter.selectedBackend,
      availableBackends: liveAdapter.availableBackends,
      bindingsPath,
      recordReview: options.recordReview
    });
}

export function createQueuedLoopReviewExecutor(
  runId: string,
  reviewCommands: readonly RecordReviewCommandInput[],
  executeReviewCommand: (command: RecordReviewCommandInput) => Promise<RecordReviewCommandResult>
): ExecuteDirectiveStepOptions["executeReviewRecommendation"] {
  const remaining = [...reviewCommands];

  return async ({ directive }) => {
    const matchIndex = remaining.findIndex(
      (command) =>
        command.runId === runId &&
        directive.recommendations.some(
          (recommendation) =>
            recommendation.taskId === command.taskId &&
            recommendation.targetReviewRole === command.review.reviewerRole
        )
    );

    if (matchIndex < 0) {
      const nextRecommendation = directive.recommendations[0];
      return {
        executed: false,
        taskId: nextRecommendation?.taskId,
        reviewRole: nextRecommendation?.targetReviewRole,
        evidence: [
          "no matching trusted review input was supplied for the remaining review directives",
          ...directive.recommendations.map(
            (recommendation) =>
              `${recommendation.taskId}:${recommendation.targetReviewRole ?? "unknown"}`
          )
        ]
      };
    }

    const [command] = remaining.splice(matchIndex, 1);
    const result = await executeReviewCommand(command);
    return {
      executed: true,
      taskId: command?.taskId,
      actor: command?.actor,
      reviewRole: command?.review.reviewerRole,
      evidence: [
        `recorded ${command?.review.reviewerRole} for ${command?.taskId} via ${command?.actor}`,
        `authenticated principal ${result.principal.provider}:${result.principal.subject}`
      ]
    };
  };
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
      runtimeMode: registration?.runtimeProfile ? runtimeModeFromProfile(registration.runtimeProfile) : undefined,
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
  const [status, executionPlan, routing, recovery] = await Promise.all([
    executeStatusCommandFromArgs(["--run-id", runId], options),
    options.getExecutionPlan(runId, staleAfterHours),
    options.getRoutingReport(runId),
    options.inspectRecovery(runId, staleAfterHours)
  ]);
  const report = buildOperatorDashboardReport({
    status,
    executionPlan,
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
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
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

export interface LoopCommandResult {
  mode: "advisory_only" | "applied" | "executed";
  runId: string;
  initialPlan: RunExecutionPlan;
  appliedRecoveryActionIds: string[];
  executedSteps: DirectiveExecutionResult["steps"];
  finalPlan: RunExecutionPlan;
  snapshot: RunStatusSnapshot;
}

function formatLoopCommandResult(result: LoopCommandResult): string {
  const lines = [
    `Run ${result.runId}`,
    `mode: ${result.mode}`,
    `initial-directive: ${result.initialPlan.directive.kind}`,
    `applied-safe-recovery: ${
      result.appliedRecoveryActionIds.length > 0 ? result.appliedRecoveryActionIds.join(", ") : "none"
    }`
  ];

  if (result.executedSteps.length > 0) {
    for (const step of result.executedSteps) {
      const targetParts = [step.taskId, step.reviewRole, step.actor].filter(Boolean);
      lines.push(
        `executed: ${step.directiveKind} ${step.outcome}${
          targetParts.length > 0 ? ` (${targetParts.join(", ")})` : ""
        }`
      );
    }
  } else {
    lines.push("executed: none");
  }

  lines.push(
    `final-directive: ${result.finalPlan.directive.kind}`
  );

  if (result.finalPlan.directive.kind === "dispatch_owner") {
    lines.push(
      `next: route ${result.finalPlan.directive.recommendation.taskId} to ${result.finalPlan.directive.recommendation.targetRole}`
    );
  } else if (result.finalPlan.directive.kind === "dispatch_reviews") {
    for (const recommendation of result.finalPlan.directive.recommendations) {
      if (recommendation.targetReviewRole) {
        lines.push(`next: request ${recommendation.targetReviewRole} for ${recommendation.taskId}`);
      }
    }
  } else if (result.finalPlan.directive.kind === "apply_recovery") {
    for (const action of result.finalPlan.directive.actions) {
      lines.push(`next: recover ${action.id}`);
    }
  } else if (result.finalPlan.directive.kind === "blocked") {
    for (const blocker of result.finalPlan.directive.blockers) {
      lines.push(`blocked: ${blocker}`);
    }
  } else {
    lines.push("next: none");
  }

  return `${lines.join("\n")}\n`;
}

export async function executeLoopCommandFromArgs(
  args: readonly string[],
  options: ExecuteLoopCommandOptions
): Promise<{ format: "json" | "text"; result: LoopCommandResult }> {
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
  const applySafeRecovery = args.includes("--apply-safe-recovery");
  const executeSupportedDirectives = args.includes("--execute-supported-directives");
  const ownerActor = resolveCommandFlag(args, "--owner-actor")?.trim() || undefined;
  const reviewCommands = await readLoopReviewCommandInputs(args, { cwd: options.cwd });
  const initialPlan = await options.getExecutionPlan(runId, staleAfterHours);
  let appliedRecoveryActionIds: string[] = [];
  let executedSteps: DirectiveExecutionResult["steps"] = [];
  let snapshot: RunStatusSnapshot;
  let finalPlan = initialPlan;

  if (applySafeRecovery && initialPlan.directive.kind === "apply_recovery") {
    const recoveryResult = await options.applyRecovery(
      runId,
      initialPlan.directive.actions.map((action) => action.id),
      staleAfterHours
    );
    appliedRecoveryActionIds = [...recoveryResult.appliedActionIds];
    snapshot = recoveryResult.snapshot;
    finalPlan = await options.getExecutionPlan(runId, staleAfterHours);
  } else {
    snapshot = await options.getStatusSnapshot(runId);
  }

  if (executeSupportedDirectives) {
    if (!options.executeDirectiveStep) {
      throw new Error("loop directive execution is not available for this runtime surface");
    }
    const executionResult = await options.executeDirectiveStep(runId, {
      staleAfterHours,
      ownerActor,
      reviewCommands
    });
    executedSteps = executionResult.steps;
    finalPlan = executionResult.finalPlan;
    snapshot = executionResult.snapshot;
  }

  return {
    format,
    result: {
      mode:
        executedSteps.length > 0
          ? "executed"
          : appliedRecoveryActionIds.length > 0
            ? "applied"
            : "advisory_only",
      runId,
      initialPlan,
      appliedRecoveryActionIds,
      executedSteps,
      finalPlan,
      snapshot
    }
  };
}

async function loopCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, result } = await executeLoopCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      },
      async executeDirectiveStep(runId, input) {
        const executeReviewRecommendation =
          input.reviewCommands.length > 0
            ? createQueuedLoopReviewExecutor(
                runId,
                input.reviewCommands,
                await createLiveLoopReviewCommandExecutor({
                  cwd: process.cwd(),
                  env: process.env,
                  recordReview({ command, resolver }) {
                    const reviewService = new DevgodCoreService(store, {
                      resolveReviewActionContext: resolver
                    });
                    return reviewService.recordReview(
                      command.runId,
                      command.taskId,
                      command.actor,
                      command.review
                    );
                  }
                })
              )
            : undefined;

        return service.executeDirectiveStep(runId, {
          staleAfterHours: input.staleAfterHours,
          ownerActor: input.ownerActor,
          ...(executeReviewRecommendation ? { executeReviewRecommendation } : {})
        });
      }
    });

    if (format === "text") {
      process.stdout.write(formatLoopCommandResult(result));
      return;
    }

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
      approvalsByTask,
      loopHistoryResults: options.getLoopHistory ? await options.getLoopHistory(runId, 20) : []
    })
  };
}

export async function executeWorkflowProofCommandFromArgs(
  args: readonly string[],
  options: ExecuteWorkflowProofCommandOptions
): Promise<WorkflowProofResult> {
  const taskId = resolveCommandFlag(args, "--task-id");
  if (!taskId) {
    throw new Error("workflow-proof requires --task-id <task-id>");
  }

  const explicitRunId = resolveCommandFlag(args, "--run-id");
  let runId: string;

  if (explicitRunId && explicitRunId !== "latest") {
    runId = explicitRunId;
  } else if (options.findLatestRunForTask) {
    const env = options.env ?? process.env;
    const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
    const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;

    if (!workspaceSlug || !projectSlug) {
      throw new Error("workflow-proof requires workspace/project context when using --run-id latest");
    }

    const latestRunForTask = await options.findLatestRunForTask(workspaceSlug, projectSlug, taskId);
    if (!latestRunForTask) {
      throw new Error(`No runs found for ${workspaceSlug}/${projectSlug} with task ${taskId}`);
    }

    runId = latestRunForTask.id;
  } else {
    runId = await resolveRunIdForCommand(args, {
      env: options.env,
      findLatestRun: options.findLatestRun
    });
  }

  const snapshot = await options.getStatusSnapshot(runId);
  const task = snapshot.tasks.find((candidate) => candidate.packet.taskId === taskId);

  if (!task) {
    throw new Error(`Task ${taskId} not found in runtime run ${runId}`);
  }

  const reviews = await options.getReviews(runId, taskId);
  const decision = evaluateReviewDecision(task, reviews);
  if (decision.decision !== "approved") {
    throw new Error(`Task ${taskId} is not approved in runtime: ${decision.blockers.join("; ")}`);
  }

  if (task.status !== "approved") {
    throw new Error(`Task ${taskId} runtime status must be approved, found ${task.status}`);
  }

  const requiredReviews = effectiveRequiredReviews(task.packet.requiredReviews);
  const latestReviews = requiredReviews
    .map((role) => reviews.filter((review) => review.reviewerRole === role).at(-1))
    .filter((review): review is ReviewRecord => review !== undefined);

  if (latestReviews.length !== requiredReviews.length) {
    throw new Error(`Task ${taskId} is missing one or more required runtime reviews`);
  }

  const latestApproval = (await options.getApprovals(runId, taskId)).at(-1);
  if (!latestApproval) {
    throw new Error(`Task ${taskId} is missing a runtime approval record`);
  }
  if (latestApproval.identityAssurance !== "authenticated" || latestApproval.decision !== "approved") {
    throw new Error(
      `Task ${taskId} latest runtime approval must be authenticated approved, found ${latestApproval.identityAssurance} ${latestApproval.decision}`
    );
  }

  return {
    authorityLabel: "runtime_authoritative",
    runId,
    taskId,
    taskStatus: task.status,
    reviewDecision: "approved",
    blockers: [],
    latestReviews,
    latestApproval
  };
}

function buildWorkflowProofSeedTaskPacket(taskId: string): TaskPacketInput {
  return {
    taskId,
    title: `Local workflow proof seed for ${taskId}`,
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    requiredSpecialistRoles: ["planner"],
    qualityGates: ["tdd_required", "release_readiness_required", "setup_replay_required"],
    goal: `Seed authoritative runtime workflow proof for ${taskId}`,
    inputs: ["local workflow artifacts", "runtime store"],
    outputs: ["approved runtime workflow proof"],
    dependencies: [],
    allowedWriteScope: [".devgod/work"],
    outOfScope: ["production deploys", "manual database edits"],
    acceptanceCriteria: [
      `workflow-proof resolves ${taskId} from the latest runtime run`,
      "required reviewer, qa, and security reviews are recorded as authenticated approvals"
    ],
    verificationSteps: [
      `node --experimental-strip-types src/admin.ts workflow-proof --run-id latest --task-id ${taskId}`
    ],
    requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
    securityChecks: [
      "use the trusted review-context resolver",
      "keep the seed path explicit and local-development oriented"
    ],
    antiPatterns: ["manual SQL approvals", "summary-only runtime proof"],
    rollbackNotes: "delete the seeded runtime run if local proof state must be reset",
    handoffFormat: "summary + verification evidence + local proof context"
  };
}

export async function executeSeedWorkflowProofCommandFromArgs(
  args: readonly string[],
  options: ExecuteSeedWorkflowProofCommandOptions
): Promise<SeedWorkflowProofResult> {
  const env = options.env ?? process.env;
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;

  if (!workspaceSlug || !projectSlug) {
    throw new Error("seed-workflow-proof requires DEVGOD_WORKSPACE_SLUG and DEVGOD_PROJECT_SLUG or explicit flags");
  }

  const projectContext = await options.getProjectContext({
    workspaceSlug,
    projectSlug
  });
  if (!projectContext) {
    throw new Error(`Project ${workspaceSlug}/${projectSlug} is not bootstrapped`);
  }

  const explicitTaskId = resolveCommandFlag(args, "--task-id");
  const projectRuntimeState = await options.getProjectRuntimeState(projectContext.project.id);
  const resolvedTaskId = explicitTaskId ?? projectRuntimeState?.activeTaskId;

  if (!resolvedTaskId) {
    throw new Error("seed-workflow-proof requires --task-id or an active runtime task");
  }

  const run = await options.intakeRequest({
    workspaceSlug,
    projectSlug,
    actor: "devgod-local-seed-manager",
    title: `Seed workflow proof for ${resolvedTaskId}`,
    request: `Create a local authoritative runtime workflow proof run for ${resolvedTaskId}.`
  });

  await options.createTaskGraph(run.id, [buildWorkflowProofSeedTaskPacket(resolvedTaskId)]);
  await options.claimTask(run.id, resolvedTaskId, "planner");
  await options.submitHandoff(run.id, resolvedTaskId, {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: `Seeded local workflow proof runtime state for ${resolvedTaskId}.`,
    changedFiles: [".devgod/ACTIVE"],
    blockers: [],
    verificationNotes: ["runtime workflow proof seeded locally"],
    executionEvidence: ["task graph created", "task claimed", "handoff submitted"],
    qualityGateEvidence: ["seed command test coverage", "local runtime proof replay path"],
    contextRefs: [`brief://${resolvedTaskId}`, "seed://workflow-proof"]
  });

  await options.recordReview(run.id, resolvedTaskId, "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await options.recordReview(run.id, resolvedTaskId, "security-actor", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await options.recordReview(run.id, resolvedTaskId, "qa-actor", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const proof = await executeWorkflowProofCommandFromArgs(
    ["--run-id", run.id, "--task-id", resolvedTaskId],
    {
      env,
      getStatusSnapshot: options.getStatusSnapshot,
      getReviews: options.getReviews,
      getApprovals: options.getApprovals
    }
  );

  await options.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: run.id,
    activeTaskId: resolvedTaskId,
    taskQueue: alignQueueToActiveTask(projectRuntimeState?.taskQueue, resolvedTaskId),
    productState: projectRuntimeState?.productState ?? buildDefaultProductState(),
    lastVerifiedRunId: proof.runId,
    metadata: projectRuntimeState?.metadata ?? {},
    createdAt: projectRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  return {
    mode: "local_workflow_proof_seed",
    workspaceSlug,
    projectSlug,
    ...proof
  };
}

function formatActiveWorkflowContent(taskId: string | null): string {
  const lines = [];
  if (taskId) {
    lines.push(`task_id=${taskId}`);
  }
  lines.push("workflow=devgod");
  lines.push(`state=${taskId ? "active" : "idle"}`);
  return `${lines.join("\n")}\n`;
}

function formatAdvanceActiveTaskCommandResult(result: AdvanceActiveTaskCommandResult): string {
  return [
    `mode: ${result.mode}`,
    `completed-task: ${result.taskId}`,
    `proof-run: ${result.proof.runId}`,
    `next-task: ${result.nextTaskId ?? "none"}`,
    `queue-current-task: ${result.queue.current_task_id ?? "none"}`
  ].join("\n");
}

export async function executeAdvanceActiveTaskCommandFromArgs(
  args: readonly string[],
  options: ExecuteAdvanceActiveTaskCommandOptions
): Promise<{ format: "json" | "text"; result: AdvanceActiveTaskCommandResult }> {
  const env = options.env ?? process.env;
  const explicitTaskId = resolveCommandFlag(args, "--task-id");
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;

  if (!workspaceSlug || !projectSlug) {
    throw new Error("advance-active-task requires DEVGOD_WORKSPACE_SLUG and DEVGOD_PROJECT_SLUG or explicit flags");
  }

  const projectContext = await options.getProjectContext({
    workspaceSlug,
    projectSlug
  });
  if (!projectContext) {
    throw new Error(`Project ${workspaceSlug}/${projectSlug} is not bootstrapped`);
  }

  const projectRuntimeState = await options.getProjectRuntimeState(projectContext.project.id);
  const activeTaskId = projectRuntimeState?.activeTaskId;

  if (!activeTaskId) {
    throw new Error("advance-active-task requires an active runtime task");
  }
  if (explicitTaskId && explicitTaskId !== activeTaskId) {
    throw new Error(
      `advance-active-task task mismatch: active runtime task is "${activeTaskId}", not "${explicitTaskId}"`
    );
  }

  const format = resolveFormatFlag(args);
  const proof = await executeWorkflowProofCommandFromArgs([...args, "--task-id", activeTaskId], options);
  const queue = parseTaskQueueRecord(projectRuntimeState?.taskQueue);

  if (queue.current_task_id !== activeTaskId) {
    throw new Error(
      `advance-active-task requires runtime queue current_task_id "${queue.current_task_id ?? "none"}" to match active task "${activeTaskId}"`
    );
  }

  const advanced = advanceTaskQueue(queue, activeTaskId);
  const result: AdvanceActiveTaskCommandResult = {
    mode: args.includes("--apply") ? "applied" : "dry_run",
    taskId: activeTaskId,
    nextTaskId: advanced.nextTask?.id ?? null,
    proof,
    queue: advanced.queue
  };

  if (result.mode === "dry_run") {
    return {
      format,
      result
    };
  }

  await options.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: proof.runId,
    activeTaskId: result.nextTaskId ?? undefined,
    taskQueue: advanced.queue,
    productState: projectRuntimeState?.productState ?? buildDefaultProductState(),
    lastVerifiedRunId: proof.runId,
    metadata: projectRuntimeState?.metadata ?? {},
    createdAt: projectRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  return {
    format,
    result
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
      },
      getLoopHistory(runId, limit) {
        return service.getLoopExecutionHistory(runId, { limit });
      }
    });

    if (result.format === "markdown") {
      process.stdout.write(formatRunEvidenceReportMarkdown(result.report));
      return;
    }

    console.log(JSON.stringify(result.report));
  });
}

async function workflowProofCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const result = await executeWorkflowProofCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      findLatestRunForTask(workspaceSlug, projectSlug, taskId) {
        return store.findLatestRunForTask({ workspaceSlug, projectSlug, taskId });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    });

    console.log(JSON.stringify(result));
  });
}

function createWorkflowProofSeedResolver(): ResolveReviewActionContext {
  return createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: { provider: "devgod-local-seed", subject: "reviewer-actor" },
          actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
        },
        {
          principal: { provider: "devgod-local-seed", subject: "security-actor" },
          actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
        },
        {
          principal: { provider: "devgod-local-seed", subject: "qa-actor" },
          actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
        }
      ]
    },
    async resolveAuthenticatedPrincipal(input) {
      return {
        provider: "devgod-local-seed",
        subject: input.actor,
        verified: true
      };
    }
  });
}

async function seedWorkflowProofCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store, {
      resolveReviewActionContext: createWorkflowProofSeedResolver()
    });
    const result = await executeSeedWorkflowProofCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      intakeRequest(input) {
        return service.intakeRequest(input);
      },
      createTaskGraph(runId, taskPackets) {
        return service.createTaskGraph(runId, taskPackets);
      },
      claimTask(runId, taskId, actor) {
        return service.claimTask(runId, taskId, actor);
      },
      submitHandoff(runId, taskId, handoff) {
        return service.submitHandoff(runId, taskId, handoff);
      },
      recordReview(runId, taskId, actor, review) {
        return service.recordReview(runId, taskId, actor, review);
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    });

    console.log(JSON.stringify(result));
  });
}

async function advanceActiveTaskCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, result } = await executeAdvanceActiveTaskCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      findLatestRunForTask(workspaceSlug, projectSlug, taskId) {
        return store.findLatestRunForTask({ workspaceSlug, projectSlug, taskId });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    });

    if (format === "text") {
      process.stdout.write(`${formatAdvanceActiveTaskCommandResult(result)}\n`);
      return;
    }

    console.log(JSON.stringify(result));
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
  const retrieval = await resolvePlanningRetrievalState(args, env, options);
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
      retrieval,
      results
    })
  };
}

async function planContextCommand(args: readonly string[]) {
  const embedQuery = await createPlanContextEmbedQuery(process.env);
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? process.env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? process.env.DEVGOD_PROJECT_SLUG;

  await withClient(async (client) => {
    const store = createRuntimeStore(client);
    const service = new DevgodCoreService(store);
    const result = await executePlanContextCommandFromArgs(args, {
      env: process.env,
      searchMemory(input) {
        return service.searchMemory(input);
      },
      getRetrievalFreshness() {
        return inspectRetrievalFreshness({
          cwd: process.cwd(),
          env: process.env,
          store
        });
      },
      refreshRetrieval() {
        return executeRefreshRetrievalCommand({
          cwd: process.cwd(),
          env: {
            ...process.env,
            ...(workspaceSlug ? { DEVGOD_WORKSPACE_SLUG: workspaceSlug } : {}),
            ...(projectSlug ? { DEVGOD_PROJECT_SLUG: projectSlug } : {})
          },
          argv: ["node", "src/admin.ts", "refresh-retrieval"],
          withClient: async (callback) => callback(client),
          createStore() {
            return store;
          }
        });
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
  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.resolve(process.cwd(), inputArg);
  const taskId = resolveCommandFlag(args, "--task-id");
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? process.env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const workspaceName = resolveCommandFlag(args, "--workspace-name") ?? process.env.DEVGOD_WORKSPACE_NAME;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? process.env.DEVGOD_PROJECT_SLUG;
  const projectName = resolveCommandFlag(args, "--project-name") ?? process.env.DEVGOD_PROJECT_NAME;

  if (!projectSlug) {
    throw new Error("github-dispatch requires DEVGOD_PROJECT_SLUG or --project-slug");
  }

  return withClient(async (client) =>
    dispatchGithubWorkItem({
      store: createRuntimeStore(client),
      workspaceSlug,
      workspaceName,
      projectSlug,
      projectName,
      inputPath,
      taskId,
      dryRun: args.includes("--dry-run")
    })
  );
}

async function githubDispatchCommand(args: readonly string[]) {
  console.log(JSON.stringify(await executeGithubDispatchCommandFromArgs(args)));
}

async function runEmbeddingJobsCommand() {
  const provider = await createEmbeddingProvider();
  const limit = resolveEmbeddingJobLimit(process.env, process.argv[3]);

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
  const args = argv.slice(3);
  const withClientImpl = options.withClient ?? withClient;
  const createStoreImpl = options.createStore ?? ((client: PostgresStoreClient) => createRuntimeStore(client));
  const indexRepoMarkdownImpl = options.indexRepoMarkdown ?? indexRepoMarkdown;

  const targetRepoRoot = resolveRepoMarkdownTargetRoot(env, args);
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const workspaceName =
    resolveCommandFlag(args, "--workspace-name") ?? env.DEVGOD_WORKSPACE_NAME ?? "Default Workspace";
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;
  const projectName = resolveCommandFlag(args, "--project-name") ?? env.DEVGOD_PROJECT_NAME;
  const include = resolveRepoMarkdownInclude(env);
  const embeddingModel = resolveCommandFlag(args, "--embedding-model") ?? env.DEVGOD_EMBEDDING_MODEL;

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

export async function inspectRetrievalFreshness(input: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  store: RetrievalFreshnessStore;
  captureSnapshot?: typeof captureRepoMarkdownSnapshot | undefined;
}): Promise<PlanningContextRetrievalState> {
  const env = input.env ?? process.env;
  const workspaceSlug = env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = env.DEVGOD_PROJECT_SLUG;
  if (!workspaceSlug || !projectSlug) {
    return {
      authorityLabel: "derived_only",
      state: "degraded",
      summary: "workspace/project context is missing for retrieval freshness"
    };
  }

  const context = await input.store.getProjectContext({ workspaceSlug, projectSlug });
  if (!context) {
    return {
      authorityLabel: "derived_only",
      state: "degraded",
      summary: `project ${workspaceSlug}/${projectSlug} is not bootstrapped for retrieval freshness`
    };
  }

  const registration = await input.store.getProjectRuntimeRegistration(context.project.id);
  if (!registration) {
    return {
      authorityLabel: "derived_only",
      state: "missing",
      summary: "runtime registration is missing retrieval metadata"
    };
  }

  const manifest = readRetrievalIndexManifest(registration);
  if (!manifest) {
    return {
      authorityLabel: "derived_only",
      state: "missing",
      summary: "retrieval index has not been bootstrapped yet"
    };
  }

  const include = resolveRepoMarkdownInclude(env);
  const captureSnapshotImpl = input.captureSnapshot ?? captureRepoMarkdownSnapshot;
  const repoPath = path.resolve(registration.repoPath || input.cwd || process.cwd());

  try {
    const snapshot = await captureSnapshotImpl({
      repoRoot: repoPath,
      include
    });
    const embeddingModel = env.DEVGOD_EMBEDDING_MODEL?.trim() || undefined;

    if (!sameStringArray(manifest.include ?? [], snapshot.include)) {
      return {
        authorityLabel: "derived_only",
        state: "stale",
        summary: "repo retrieval index does not match the current repo snapshot"
      };
    }

    if ((manifest.fingerprint ?? "") !== snapshot.fingerprint) {
      return {
        authorityLabel: "derived_only",
        state: "stale",
        summary: "repo retrieval index does not match the current repo snapshot"
      };
    }

    if ((manifest.embeddingModel ?? undefined) !== embeddingModel) {
      return {
        authorityLabel: "derived_only",
        state: "stale",
        summary: "repo retrieval embeddings no longer match the configured embedding model"
      };
    }

    const manifestStatus = manifest.status ?? "missing";
    if (embeddingModel && manifestStatus !== "ready") {
      return {
        authorityLabel: "derived_only",
        state: "degraded",
        summary: `repo retrieval index is ${manifestStatus}`
      };
    }

    if (!embeddingModel && !["ready", "artifacts_only"].includes(manifestStatus)) {
      return {
        authorityLabel: "derived_only",
        state: "degraded",
        summary: `repo retrieval index is ${manifestStatus}`
      };
    }

    return {
      authorityLabel: "derived_only",
      state: "fresh",
      summary: "repo retrieval index matches the current repo snapshot"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      authorityLabel: "derived_only",
      state: "degraded",
      summary: `retrieval freshness check failed: ${message}`
    };
  }
}

export async function executeRefreshRetrievalCommand(
  options: ExecuteRefreshRetrievalCommandOptions = {}
): Promise<RefreshRetrievalResult> {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const args = argv.slice(3);
  const cwd = options.cwd ?? process.cwd();
  const withClientImpl = options.withClient ?? withClient;
  const createStoreImpl = options.createStore ?? ((client: PostgresStoreClient) => createRuntimeStore(client));
  const captureSnapshotImpl = options.captureSnapshot ?? captureRepoMarkdownSnapshot;
  const indexRepoMarkdownImpl = options.indexRepoMarkdown ?? indexRepoMarkdown;
  const runEmbeddingJobsImpl = options.runEmbeddingJobs ?? runEmbeddingJobs;
  const createEmbeddingProviderImpl = options.createEmbeddingProvider ?? createEmbeddingProvider;
  const now = (options.now ?? (() => new Date()))().toISOString();

  const targetRepoRoot = resolveRepoMarkdownTargetRoot(env, args, cwd);
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG ?? "default";
  const workspaceName =
    resolveCommandFlag(args, "--workspace-name") ?? env.DEVGOD_WORKSPACE_NAME ?? "Default Workspace";
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;
  const projectName = resolveCommandFlag(args, "--project-name") ?? env.DEVGOD_PROJECT_NAME;
  const include = resolveRepoMarkdownInclude(env);
  const embeddingModel = (resolveCommandFlag(args, "--embedding-model") ?? env.DEVGOD_EMBEDDING_MODEL)?.trim()
    || undefined;

  if (!projectSlug) {
    throw new Error("DEVGOD_PROJECT_SLUG is required");
  }

  return withClientImpl(async (client) => {
    const store = createStoreImpl(client);
    const snapshot = await captureSnapshotImpl({
      repoRoot: targetRepoRoot,
      include
    });
    const indexResult = await indexRepoMarkdownImpl({
      store,
      repoRoot: targetRepoRoot,
      workspaceSlug,
      workspaceName,
      projectSlug,
      projectName,
      include,
      embeddingModel
    });

    let embeddingJobs:
      | {
          leased: number;
          completed: number;
          failed: number;
        }
      | undefined;
    if (embeddingModel) {
      const provider = await createEmbeddingProviderImpl(env);
      embeddingJobs = await runEmbeddingJobsImpl({
        store,
        provider,
        limit: Math.max(resolveEmbeddingJobLimit(env), indexResult.jobsQueued || 0)
      });
    }

    const context = await store.getProjectContext({
      workspaceSlug,
      projectSlug
    });
    if (!context) {
      throw new Error(`Project ${workspaceSlug}/${projectSlug} must be bootstrapped before retrieval refresh`);
    }

    const registration = await store.getProjectRuntimeRegistration(context.project.id);
    if (!registration) {
      throw new Error(`Project ${workspaceSlug}/${projectSlug} must be runtime-registered before retrieval refresh`);
    }

    const retrievalStatus = embeddingModel
      ? (embeddingJobs?.failed ?? 0) === 0
        ? "ready"
        : "degraded"
      : "artifacts_only";

    await store.saveProjectRuntimeRegistration({
      ...registration,
      manifest: {
        ...registration.manifest,
        retrievalIndex: {
          status: retrievalStatus,
          repoRoot: targetRepoRoot,
          include: [...snapshot.include],
          fileCount: snapshot.fileCount,
          fingerprint: snapshot.fingerprint,
          embeddingModel,
          indexedAt: now,
          filesIndexed: indexResult.filesIndexed,
          chunksStored: indexResult.chunksStored,
          jobsQueued: indexResult.jobsQueued,
          embeddingLeased: embeddingJobs?.leased,
          embeddingCompleted: embeddingJobs?.completed,
          embeddingFailed: embeddingJobs?.failed,
          embeddedAt: embeddingJobs ? now : undefined
        }
      },
      updatedAt: now
    });

    return {
      authorityLabel: "runtime_authoritative",
      workspaceSlug,
      projectSlug,
      repoRoot: targetRepoRoot,
      filesIndexed: indexResult.filesIndexed,
      chunksStored: indexResult.chunksStored,
      jobsQueued: indexResult.jobsQueued,
      embeddingJobs
    };
  });
}

async function refreshRetrievalCommand() {
  console.log(JSON.stringify(await executeRefreshRetrievalCommand()));
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

  if (command === "refresh-retrieval") {
    await refreshRetrievalCommand();
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

  if (command === "loop") {
    await loopCommand(args);
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

  if (command === "workflow-proof") {
    await workflowProofCommand(args);
    return;
  }

  if (command === "seed-workflow-proof") {
    await seedWorkflowProofCommand(args);
    return;
  }

  if (command === "advance-active-task") {
    await advanceActiveTaskCommand(args);
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

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
