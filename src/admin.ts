import { access, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
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
  buildAutonomousOperatorSummary,
  classifyContinueAnalysisDirective,
  type AutonomousOperatorSummary,
  type ContinueAnalysisDirectiveClassification
} from "./admin/autonomous-summary.ts";
import {
  buildPlanningContextReport,
  formatPlanningContextReportMarkdown,
  type PlanningContextRetrievalState
} from "./admin/planning-context.ts";
import { dispatchGithubWorkItem } from "./admin/github-dispatch.ts";
import { buildOperatorDashboardReport, formatOperatorDashboardReport } from "./admin/ops.ts";
import { inspectGitNexusStatus, type GitNexusStatusObservation } from "./admin/gitnexus.ts";
import {
  buildOperatorStatusReport,
  type DaemonContinuationStatusObservation,
  type DaemonOperatorHandoffObservation,
  type DaemonSupervisorStatusObservation,
  type ReviewIdentityStatusObservation
} from "./admin/status.ts";
import { parseExportDocsRequest } from "./docs-export/parser.ts";
import { resolveObsidianConfig, validateObsidianConfig } from "./docs-export/obsidian-config.ts";
import { DocsSummarizer } from "./docs-export/summarizer.ts";
import { ObsidianMarkdownRenderer } from "./docs-export/renderer.ts";
import { ObsidianVaultWriter } from "./docs-export/obsidian-writer.ts";
import { buildObsidianTargetPath } from "./docs-export/targets.ts";
import { RuntimeWorklogProvider, type WorklogProvider } from "./docs-export/worklog-provider.ts";
import { advanceTaskQueue, parseTaskQueueContent, type TaskQueue } from "./devgod/task-queue.ts";
import { effectiveRequiredReviews, isGateReviewRole, isRetrievalRole, isReviewSeverity, isReviewState } from "./domain/contracts.ts";
import { analysisPhases } from "./domain/types.ts";
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
  AutonomousExecutionState,
  CheckpointRecord,
  ContinuationAction,
  CoverageGapRecord,
  CoverageItemRecord,
  HandoffInput,
  IntakeRequestInput,
  ProjectRuntimeStateRecord,
  ProgressProofRecord,
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
const MAX_CHECKPOINT_STRING_LENGTH = 512;
const MAX_CHECKPOINT_ARRAY_ITEMS = 32;
const MAX_CHECKPOINT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_CHECKPOINT_INPUT_BYTES = 64 * 1024;
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
  getExecutionPlan?: ((runId: string, staleAfterHours: number) => Promise<RunExecutionPlan>) | undefined;
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
  getExecutionPlan: (runId: string, staleAfterHours: number) => Promise<RunExecutionPlan>;
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

interface DaemonCycleRecord {
  cycle: number;
  directiveKind: RunExecutionPlan["directive"]["kind"];
  action:
    | "run_codex_owner"
    | "run_codex_analysis"
    | "run_workflow_proof"
    | "apply_runtime_continuation"
    | "record_review"
    | "advance_active_task"
    | "blocked"
    | "complete";
  runId: string;
  taskId: string | null;
  summary: string;
  sessionId?: string | null | undefined;
}

export interface DaemonCommandResult {
  authorityLabel: "derived_only";
  workspaceSlug: string;
  projectSlug: string;
  status: "completed" | "blocked" | "max_cycles_reached";
  reason: string;
  activeRunId: string | null;
  activeTaskId: string | null;
  sessionId: string | null;
  cycles: DaemonCycleRecord[];
}

interface SupervisorActionRecord {
  cycle: number;
  action: "enqueue_operator_continuation" | "enqueue_review_action";
  targetId?: string | undefined;
  taskId?: string | undefined;
  reviewRole?: ReviewRecord["reviewerRole"] | undefined;
  filePath: string;
  summary: string;
}

export interface SupervisorCommandResult {
  authorityLabel: "derived_only";
  workspaceSlug: string;
  projectSlug: string;
  status: "completed" | "blocked" | "max_cycles_reached";
  reason: string;
  activeRunId: string | null;
  activeTaskId: string | null;
  sessionId: string | null;
  daemonRuns: DaemonCommandResult[];
  actions: SupervisorActionRecord[];
}

export interface SupervisorHistoryCommandResult {
  authorityLabel: "derived_only";
  historyPath: string;
  scope: "run" | "all";
  runId?: string | undefined;
  retainedCount: number;
  filteredCount: number;
  returnedCount: number;
  truncated: boolean;
  entries: DaemonSupervisorStatusObservation["history"];
  latestStatus?:
    | Pick<
        DaemonSupervisorStatusObservation,
        | "state"
        | "blockerKind"
        | "reason"
        | "activeRunId"
        | "activeTaskId"
        | "sessionId"
        | "supervisorCycles"
        | "updatedAt"
      >
    | undefined;
}

interface RunCodexTurnInput {
  codexBin: string;
  cwd: string;
  env: EnvShape;
  prompt: string;
  sessionId?: string | undefined;
}

interface RunCodexTurnResult {
  sessionId?: string | undefined;
  finalMessage?: string | undefined;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExecuteDaemonCommandOptions extends ExecuteAdvanceActiveTaskCommandOptions, ExecuteLoopCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  runCodexTurn?: ((input: RunCodexTurnInput) => Promise<RunCodexTurnResult>) | undefined;
  upsertCoverageGaps?: ((runId: string, gaps: CoverageGapRecord[]) => Promise<unknown>) | undefined;
  now?: (() => Date) | undefined;
}

interface ExecuteSupervisorCommandOptions extends ExecuteDaemonCommandOptions {}

interface ExecuteSupervisorHistoryCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  findLatestRun?: ((workspaceSlug: string, projectSlug: string) => Promise<{ id: string } | undefined>) | undefined;
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

function resolveDaemonSupervisorHistoryReadOptions(
  args: readonly string[],
  env: EnvShape | undefined,
  defaultRunId: string
): DaemonSupervisorHistoryReadOptions {
  const limitValue =
    resolveCommandFlag(args, "--daemon-supervisor-history-limit") ??
    env?.DEVGOD_DAEMON_SUPERVISOR_HISTORY_LIMIT ??
    "5";
  const limit = Number.parseInt(limitValue, 10);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`Invalid --daemon-supervisor-history-limit value: ${limitValue}`);
  }

  const scopeValue =
    resolveCommandFlag(args, "--daemon-supervisor-history-scope") ??
    env?.DEVGOD_DAEMON_SUPERVISOR_HISTORY_SCOPE ??
    "run";
  if (scopeValue !== "run" && scopeValue !== "all") {
    throw new Error(`Invalid --daemon-supervisor-history-scope value: ${scopeValue}`);
  }

  const runId =
    resolveCommandFlag(args, "--daemon-supervisor-history-run-id") ??
    env?.DEVGOD_DAEMON_SUPERVISOR_HISTORY_RUN_ID ??
    defaultRunId;

  return {
    limit,
    scope: scopeValue,
    runId: scopeValue === "run" ? runId : undefined
  };
}

function resolveSupervisorHistoryRetentionLimit(args: readonly string[], env: EnvShape | undefined): number {
  const retentionValue =
    resolveCommandFlag(args, "--supervisor-history-retention") ??
    env?.DEVGOD_SUPERVISOR_HISTORY_RETENTION ??
    "200";
  const retentionLimit = Number.parseInt(retentionValue, 10);
  if (!Number.isInteger(retentionLimit) || retentionLimit <= 0) {
    throw new Error(`Invalid --supervisor-history-retention value: ${retentionValue}`);
  }
  return retentionLimit;
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

function readDaemonSessionId(metadata: ProjectRuntimeStateRecord["metadata"] | Record<string, unknown> | undefined): string | undefined {
  const candidate = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).devgodDaemon
    : undefined;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }

  const sessionId = (candidate as Record<string, unknown>).sessionId;
  return typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId.trim() : undefined;
}

async function withDaemonLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const daemonDir = path.join(cwd, ".devgod", "work", "daemon");
  const lockPath = path.join(daemonDir, "daemon.lock");
  await mkdir(daemonDir, { recursive: true });

  try {
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2), {
      encoding: "utf8",
      flag: "wx"
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`devgod daemon lock already exists: ${path.relative(cwd, lockPath)}`);
    }
    throw error;
  }

  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function runCodexTurnViaCli(input: RunCodexTurnInput): Promise<RunCodexTurnResult> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "devgod-daemon-schema-"));
  const schemaPath = path.join(tempDir, "daemon-output.schema.json");
  await writeFile(
    schemaPath,
    JSON.stringify(
      {
        type: "object",
        properties: {
          summary: { type: "string" },
          status: {
            type: "string",
            enum: ["completed", "blocked", "needs_review", "needs_followup"]
          },
          blockers: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["summary", "status", "blockers"],
        additionalProperties: false
      },
      null,
      2
    ),
    "utf8"
  );

  const args = input.sessionId
    ? ["exec", "resume", input.sessionId, input.prompt, "--json", "--output-schema", schemaPath]
    : ["exec", input.prompt, "--json", "--output-schema", schemaPath];

  try {
    const child = spawn(input.codexBin, args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });

    let sessionId = input.sessionId;
    let finalMessage: string | undefined;
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
          sessionId = parsed.thread_id;
        }
        if (parsed.type === "item.completed") {
          const item = parsed.item;
          if (item && typeof item === "object" && (item as Record<string, unknown>).type === "agent_message") {
            const text = (item as Record<string, unknown>).text;
            if (typeof text === "string" && text.trim().length > 0) {
              finalMessage = text.trim();
            }
          }
        }
      } catch {
        // Ignore non-JSONL or partial lines; the daemon only needs best-effort session/message extraction.
      }
    }

    if (exitCode !== 0) {
      const reason = stderr.trim() || stdout.trim() || `codex exited with code ${exitCode}`;
      throw new Error(`codex exec failed: ${reason}`);
    }

    return {
      sessionId,
      finalMessage,
      stdout,
      stderr,
      exitCode
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildDaemonTaskPrompt(input: {
  directive: RunExecutionPlan["directive"];
  taskId: string;
  packet?: TaskPacketInput | undefined;
  operatorNotes?: string | undefined;
}): string {
  const packet = input.packet;
  const lines = [
    "Operate as the active devgod worker for the current task.",
    `Active task: ${input.taskId}`,
    `Directive: ${input.directive.kind}`,
    packet?.goal ? `Goal: ${packet.goal}` : undefined,
    packet?.allowedWriteScope?.length ? `Allowed write scope: ${packet.allowedWriteScope.join(", ")}` : undefined,
    packet?.acceptanceCriteria?.length
      ? `Acceptance criteria: ${packet.acceptanceCriteria.join(" | ")}`
      : undefined,
    packet?.verificationSteps?.length
      ? `Verification steps: ${packet.verificationSteps.join(" | ")}`
      : undefined,
    packet?.requiredReviews?.length
      ? `Required reviews: ${packet.requiredReviews.join(", ")}`
      : undefined,
    "Follow the repository AGENTS.md and the devgod workflow.",
    "Use runtime-backed devgod commands when they are needed for proof, status, or advancement.",
    "Complete the task if possible; otherwise stop at the real blocker and state it explicitly.",
    input.operatorNotes ? `Operator notes: ${input.operatorNotes}` : undefined,
    input.directive.kind === "continue_analysis"
      ? `Autonomous target: ${input.directive.targetId}. Typed continuation actions: ${input.directive.actions.map(formatContinuationAction).join(" | ")}`
      : undefined,
    input.directive.kind === "dispatch_owner"
      ? `Owner rationale: ${input.directive.rationale.join(" | ")}`
      : undefined
  ].filter((value): value is string => Boolean(value));

  return lines.join("\n");
}

function formatContinuationAction(action: ContinuationAction): string {
  if (action.kind === "run_workflow_proof") {
    return `run_workflow_proof(${action.taskId})`;
  }
  if (action.kind === "resolve_blocking_gap") {
    return `resolve_blocking_gap(${action.gapId} -> ${action.targetId})`;
  }
  return `resume_target(${action.targetId})`;
}

function resolveDaemonWorkflowProofTaskId(
  directive: Extract<RunExecutionPlan["directive"], { kind: "continue_analysis" }>
): string | undefined {
  const workflowProofAction = directive.actions.find(
    (action): action is Extract<ContinuationAction, { kind: "run_workflow_proof" }> =>
      action.kind === "run_workflow_proof"
  );
  return workflowProofAction?.taskId;
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

interface DaemonReviewQueueEntry {
  filePath: string;
  command: RecordReviewCommandInput;
}

interface FailedDaemonReviewQueueEntry {
  filePath: string;
  error: string;
}

interface StaleDaemonReviewQueueEntry {
  filePath: string;
  reason: string;
}

interface OperatorContinuationActionCommand {
  runId: string;
  taskId: string;
  blockerKind: "operator_required_continuation";
  action: {
    kind: "continue_with_analysis";
    targetId: string;
    source?: "blocking_gap" | "progress_proof" | "checkpoint" | undefined;
    sourceId?: string | undefined;
    operatorNotes: string;
  };
}

interface DaemonOperatorActionQueueEntry {
  filePath: string;
  command: OperatorContinuationActionCommand;
}

interface FailedDaemonOperatorActionQueueEntry {
  filePath: string;
  error: string;
}

function resolveDaemonReviewInputDir(args: readonly string[], options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const explicit = resolveCommandFlag(args, "--review-input-dir") ?? env.DEVGOD_REVIEW_INPUT_DIR;
  const candidate = explicit ?? path.join(".devgod", "review-actions");
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function resolveDaemonOperatorActionDir(args: readonly string[], options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const explicit = resolveCommandFlag(args, "--operator-action-dir") ?? env.DEVGOD_OPERATOR_ACTION_DIR;
  const candidate = explicit ?? path.join(".devgod", "operator-actions");
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function normalizeOperatorContinuationActionCommand(raw: string): OperatorContinuationActionCommand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`operator action input must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("operator action input must be a JSON object");
  }

  const candidate = parsed as Record<string, unknown>;
  const runId = typeof candidate.runId === "string" && candidate.runId.trim().length > 0 ? candidate.runId.trim() : undefined;
  const taskId = typeof candidate.taskId === "string" && candidate.taskId.trim().length > 0 ? candidate.taskId.trim() : undefined;
  if (!runId) {
    throw new Error("operator action runId is required");
  }
  if (!taskId) {
    throw new Error("operator action taskId is required");
  }
  if (candidate.blockerKind !== "operator_required_continuation") {
    throw new Error("operator action blockerKind must be operator_required_continuation");
  }
  const action = candidate.action;
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("operator action payload is required");
  }
  const actionCandidate = action as Record<string, unknown>;
  if (actionCandidate.kind !== "continue_with_analysis") {
    throw new Error("operator action kind must be continue_with_analysis");
  }
  const targetId =
    typeof actionCandidate.targetId === "string" && actionCandidate.targetId.trim().length > 0
      ? actionCandidate.targetId.trim()
      : undefined;
  const source =
    actionCandidate.source === "blocking_gap" ||
    actionCandidate.source === "progress_proof" ||
    actionCandidate.source === "checkpoint"
      ? actionCandidate.source
      : undefined;
  const sourceId =
    typeof actionCandidate.sourceId === "string" && actionCandidate.sourceId.trim().length > 0
      ? actionCandidate.sourceId.trim()
      : undefined;
  const operatorNotes =
    typeof actionCandidate.operatorNotes === "string" && actionCandidate.operatorNotes.trim().length > 0
      ? actionCandidate.operatorNotes.trim()
      : undefined;
  if (!targetId) {
    throw new Error("operator action action.targetId is required");
  }
  if (!operatorNotes) {
    throw new Error("operator action action.operatorNotes is required");
  }

  return {
    runId,
    taskId,
    blockerKind: "operator_required_continuation",
    action: {
      kind: "continue_with_analysis",
      targetId,
      source,
      sourceId,
      operatorNotes
    }
  };
}

async function readDaemonReviewQueueState(reviewInputDir: string): Promise<{
  entries: DaemonReviewQueueEntry[];
  failedEntries: FailedDaemonReviewQueueEntry[];
}> {
  let entries: string[] = [];
  try {
    entries = await readdir(reviewInputDir);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") {
      return { entries: [], failedEntries: [] };
    }
    throw error;
  }

  const queueEntries: DaemonReviewQueueEntry[] = [];
  const failedEntries: FailedDaemonReviewQueueEntry[] = [];

  for (const entry of entries.filter((candidate) => candidate.endsWith(".json")).sort((left, right) => left.localeCompare(right))) {
    const filePath = path.join(reviewInputDir, entry);
    try {
      queueEntries.push({
        filePath,
        command: normalizeRecordReviewCommandInput(await readFile(filePath, "utf8"))
      });
    } catch (error) {
      failedEntries.push({
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    entries: queueEntries,
    failedEntries
  };
}

async function readDaemonOperatorActionQueueState(operatorActionDir: string): Promise<{
  entries: DaemonOperatorActionQueueEntry[];
  failedEntries: FailedDaemonOperatorActionQueueEntry[];
}> {
  let entries: string[] = [];
  try {
    entries = await readdir(operatorActionDir);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") {
      return { entries: [], failedEntries: [] };
    }
    throw error;
  }

  const queueEntries: DaemonOperatorActionQueueEntry[] = [];
  const failedEntries: FailedDaemonOperatorActionQueueEntry[] = [];

  for (const entry of entries.filter((candidate) => candidate.endsWith(".json")).sort((left, right) => left.localeCompare(right))) {
    const filePath = path.join(operatorActionDir, entry);
    try {
      queueEntries.push({
        filePath,
        command: normalizeOperatorContinuationActionCommand(await readFile(filePath, "utf8"))
      });
    } catch (error) {
      failedEntries.push({
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    entries: queueEntries,
    failedEntries
  };
}

async function archiveConsumedDaemonReviewQueueEntries(
  consumedEntries: readonly DaemonReviewQueueEntry[],
  cwd: string
): Promise<void> {
  if (consumedEntries.length === 0) {
    return;
  }

  const archiveDir = path.join(cwd, ".devgod", "work", "daemon", "processed-review-actions");
  await mkdir(archiveDir, { recursive: true });

  for (const entry of consumedEntries) {
    const archivedPath = path.join(archiveDir, path.basename(entry.filePath));
    await rename(entry.filePath, archivedPath);
  }
}

async function archiveConsumedDaemonOperatorActionQueueEntries(
  consumedEntries: readonly DaemonOperatorActionQueueEntry[],
  cwd: string
): Promise<void> {
  if (consumedEntries.length === 0) {
    return;
  }

  const archiveDir = path.join(cwd, ".devgod", "work", "daemon", "processed-operator-actions");
  await mkdir(archiveDir, { recursive: true });

  for (const entry of consumedEntries) {
    const archivedPath = path.join(archiveDir, path.basename(entry.filePath));
    await rename(entry.filePath, archivedPath);
  }
}

async function archiveFailedDaemonReviewQueueEntries(
  failedEntries: readonly FailedDaemonReviewQueueEntry[],
  cwd: string,
  nowValue: string
): Promise<void> {
  if (failedEntries.length === 0) {
    return;
  }

  const archiveDir = path.join(cwd, ".devgod", "work", "daemon", "failed-review-actions");
  await mkdir(archiveDir, { recursive: true });

  for (const entry of failedEntries) {
    const baseName = path.basename(entry.filePath);
    const archivedPath = path.join(archiveDir, baseName);
    await rename(entry.filePath, archivedPath);
    await writeFile(
      path.join(archiveDir, `${baseName}.error.json`),
      `${JSON.stringify(
        {
          file: baseName,
          error: entry.error,
          archivedAt: nowValue
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}

async function archiveFailedDaemonOperatorActionQueueEntries(
  failedEntries: readonly FailedDaemonOperatorActionQueueEntry[],
  cwd: string,
  nowValue: string
): Promise<void> {
  if (failedEntries.length === 0) {
    return;
  }

  const archiveDir = path.join(cwd, ".devgod", "work", "daemon", "failed-operator-actions");
  await mkdir(archiveDir, { recursive: true });

  for (const entry of failedEntries) {
    const baseName = path.basename(entry.filePath);
    const archivedPath = path.join(archiveDir, baseName);
    await rename(entry.filePath, archivedPath);
    await writeFile(
      path.join(archiveDir, `${baseName}.error.json`),
      `${JSON.stringify(
        {
          file: baseName,
          error: entry.error,
          archivedAt: nowValue
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}

function matchesDaemonOperatorContinuationAction(input: {
  entry: DaemonOperatorActionQueueEntry;
  runId: string;
  taskId: string;
  directive: Extract<RunExecutionPlan["directive"], { kind: "continue_analysis" }>;
  classification: ContinueAnalysisDirectiveClassification;
}): boolean {
  if (
    input.entry.command.runId !== input.runId ||
    input.entry.command.taskId !== input.taskId ||
    input.entry.command.blockerKind !== "operator_required_continuation"
  ) {
    return false;
  }

  if (input.entry.command.action.targetId !== input.directive.targetId) {
    return false;
  }

  if (input.entry.command.action.source && input.entry.command.action.source !== input.directive.source) {
    return false;
  }

  const expectedSourceId =
    input.classification.action?.kind === "resume_target" ? input.classification.action.sourceId : undefined;
  if ((input.entry.command.action.sourceId ?? undefined) !== (expectedSourceId ?? undefined)) {
    return false;
  }

  return true;
}

async function archiveStaleDaemonReviewQueueEntries(
  staleEntries: readonly StaleDaemonReviewQueueEntry[],
  cwd: string,
  nowValue: string,
  expectedReviewTargets: readonly string[]
): Promise<void> {
  if (staleEntries.length === 0) {
    return;
  }

  const archiveDir = path.join(cwd, ".devgod", "work", "daemon", "stale-review-actions");
  await mkdir(archiveDir, { recursive: true });

  for (const entry of staleEntries) {
    const baseName = path.basename(entry.filePath);
    const archivedPath = path.join(archiveDir, baseName);
    await rename(entry.filePath, archivedPath);
    await writeFile(
      path.join(archiveDir, `${baseName}.reason.json`),
      `${JSON.stringify(
        {
          file: baseName,
          reason: entry.reason,
          expectedReviewTargets,
          archivedAt: nowValue
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}

async function writeDaemonReviewQueueStatus(
  cwd: string,
  status: {
    state: "processed" | "blocked" | "failed";
    reviewInputDir: string;
    reason: string;
    expectedReviewTargets?: string[] | undefined;
    queuedFiles?: string[] | undefined;
    consumedFiles?: string[] | undefined;
    failedFiles?: { file: string; error: string }[] | undefined;
    staleFiles?: { file: string; reason: string }[] | undefined;
    updatedAt: string;
  }
): Promise<void> {
  const daemonDir = path.join(cwd, ".devgod", "work", "daemon");
  await mkdir(daemonDir, { recursive: true });
  await writeFile(
    path.join(daemonDir, "review-queue-status.json"),
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8"
  );
}

async function writeDaemonContinuationStatus(
  cwd: string,
  status: {
    state: "blocked";
    directiveKind: "continue_analysis";
    executionMode: "operator_required";
    targetId: string;
    source: "blocking_gap" | "progress_proof" | "checkpoint";
    sourceId?: string | undefined;
    actionKind?: ContinuationAction["kind"] | undefined;
    summary: string;
    nextActions: string[];
    blockers: string[];
    updatedAt: string;
  }
): Promise<void> {
  const daemonDir = path.join(cwd, ".devgod", "work", "daemon");
  await mkdir(daemonDir, { recursive: true });
  await writeFile(
    path.join(daemonDir, "continuation-status.json"),
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8"
  );
}

async function clearDaemonContinuationStatus(cwd: string): Promise<void> {
  await rm(path.join(cwd, ".devgod", "work", "daemon", "continuation-status.json"), {
    force: true
  });
}

async function writeDaemonOperatorHandoff(
  cwd: string,
  handoff: {
    state: "blocked";
    blockerKind:
      | "bootstrapping"
      | "missing_active_runtime"
      | "review_queue"
      | "review_execution_unsupported"
      | "operator_required_continuation"
      | "workflow_proof_failure"
      | "runtime_blocked"
      | "recovery_required"
      | "runtime_task_missing"
      | "active_task_mismatch";
    reason: string;
    workspaceSlug: string;
    projectSlug: string;
    activeRunId: string | null;
    activeTaskId: string | null;
    sessionId: string | null;
    cycle: number;
    directiveKind?: RunExecutionPlan["directive"]["kind"] | undefined;
    nextActions: string[];
    detailFiles: {
      continuationStatus?: string | undefined;
      reviewQueueStatus?: string | undefined;
    };
    updatedAt: string;
  }
): Promise<void> {
  const daemonDir = path.join(cwd, ".devgod", "work", "daemon");
  await mkdir(daemonDir, { recursive: true });
  await writeFile(
    path.join(daemonDir, "operator-handoff.json"),
    `${JSON.stringify(handoff, null, 2)}\n`,
    "utf8"
  );
}

async function clearDaemonOperatorHandoff(cwd: string): Promise<void> {
  await rm(path.join(cwd, ".devgod", "work", "daemon", "operator-handoff.json"), {
    force: true
  });
}

async function writeDaemonSupervisorStatus(
  cwd: string,
  status: {
    state: "completed" | "blocked" | "max_cycles_reached";
    blockerKind?:
      | "missing_review_actor_bindings"
      | "handoff_missing"
      | "unsupported_handoff"
      | "continuation_derivation_failed"
      | "review_derivation_failed"
      | undefined;
    reason: string;
    workspaceSlug: string;
    projectSlug: string;
    activeRunId: string | null;
    activeTaskId: string | null;
    sessionId: string | null;
    supervisorCycles: number;
    nextActions: string[];
    missingReviewRoles: string[];
    actions: Array<{
      cycle: number;
      action: "enqueue_operator_continuation" | "enqueue_review_action";
      targetId?: string | undefined;
      taskId?: string | undefined;
      reviewRole?: string | undefined;
      filePath: string;
      summary: string;
    }>;
    updatedAt: string;
  }
): Promise<void> {
  const daemonDir = path.join(cwd, ".devgod", "work", "daemon");
  await mkdir(daemonDir, { recursive: true });
  await writeFile(
    path.join(daemonDir, "supervisor-status.json"),
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8"
  );
}

interface DaemonSupervisorHistoryReadOptions {
  limit: number;
  scope: "run" | "all";
  runId?: string | undefined;
}

interface DaemonSupervisorHistoryReadResult {
  entries: DaemonSupervisorStatusObservation["history"];
  retainedCount: number;
  filteredCount: number;
}

async function appendDaemonSupervisorHistory(
  cwd: string,
  entry: {
    recordedAt: string;
    state: "completed" | "blocked" | "max_cycles_reached";
    blockerKind?:
      | "missing_review_actor_bindings"
      | "handoff_missing"
      | "unsupported_handoff"
      | "continuation_derivation_failed"
      | "review_derivation_failed"
      | undefined;
    reason: string;
    workspaceSlug: string;
    projectSlug: string;
    activeRunId: string | null;
    activeTaskId: string | null;
    sessionId: string | null;
    supervisorCycles: number;
    nextActions: string[];
    missingReviewRoles: string[];
    actions: Array<{
      cycle: number;
      action: "enqueue_operator_continuation" | "enqueue_review_action";
      targetId?: string | undefined;
      taskId?: string | undefined;
      reviewRole?: string | undefined;
      filePath: string;
      summary: string;
    }>;
  },
  retentionLimit: number
): Promise<void> {
  const daemonDir = path.join(cwd, ".devgod", "work", "daemon");
  const historyPath = path.join(daemonDir, "supervisor-history.jsonl");
  await mkdir(daemonDir, { recursive: true });
  let existingLines: string[] = [];
  try {
    existingLines = (await readFile(historyPath, "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const retainedLines = [...existingLines, JSON.stringify(entry)].slice(-retentionLimit);
  await writeFile(historyPath, retainedLines.length > 0 ? `${retainedLines.join("\n")}\n` : "", "utf8");
}

async function readDaemonContinuationStatus(
  cwd: string
): Promise<DaemonContinuationStatusObservation | undefined> {
  const statusPath = path.join(cwd, ".devgod", "work", "daemon", "continuation-status.json");
  let raw: string;
  try {
    raw = await readFile(statusPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state = parsed.state === "blocked" ? "blocked" : "invalid";
    const directiveKind = parsed.directiveKind === "continue_analysis" ? "continue_analysis" : "continue_analysis";
    const executionMode = parsed.executionMode === "operator_required" ? "operator_required" : "unknown";
    const targetId = typeof parsed.targetId === "string" ? parsed.targetId : undefined;
    const source =
      parsed.source === "blocking_gap" || parsed.source === "progress_proof" || parsed.source === "checkpoint"
        ? parsed.source
        : undefined;
    const sourceId = typeof parsed.sourceId === "string" ? parsed.sourceId : undefined;
    const actionKind =
      parsed.actionKind === "resolve_blocking_gap" ||
      parsed.actionKind === "run_workflow_proof" ||
      parsed.actionKind === "resume_target"
        ? parsed.actionKind
        : undefined;
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary
        : "daemon continuation status file is missing a valid summary";
    const nextActions = Array.isArray(parsed.nextActions)
      ? parsed.nextActions.filter((value): value is string => typeof value === "string")
      : [];
    const blockers = Array.isArray(parsed.blockers)
      ? parsed.blockers.filter((value): value is string => typeof value === "string")
      : [];
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;

    return {
      authorityLabel: "derived_only",
      state,
      directiveKind,
      executionMode,
      targetId,
      source,
      sourceId,
      actionKind,
      summary,
      nextActions,
      blockers,
      updatedAt
    };
  } catch (error) {
    return {
      authorityLabel: "derived_only",
      state: "invalid",
      directiveKind: "continue_analysis",
      executionMode: "unknown",
      summary: `failed to parse daemon continuation status: ${error instanceof Error ? error.message : String(error)}`,
      nextActions: [],
      blockers: [],
      updatedAt: undefined
    };
  }
}

async function readDaemonOperatorHandoff(
  cwd: string
): Promise<DaemonOperatorHandoffObservation | undefined> {
  const handoffPath = path.join(cwd, ".devgod", "work", "daemon", "operator-handoff.json");
  let raw: string;
  try {
    raw = await readFile(handoffPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state = parsed.state === "blocked" ? "blocked" : "invalid";
    const blockerKind =
      parsed.blockerKind === "bootstrapping" ||
      parsed.blockerKind === "missing_active_runtime" ||
      parsed.blockerKind === "review_queue" ||
      parsed.blockerKind === "review_execution_unsupported" ||
      parsed.blockerKind === "operator_required_continuation" ||
      parsed.blockerKind === "workflow_proof_failure" ||
      parsed.blockerKind === "runtime_blocked" ||
      parsed.blockerKind === "recovery_required" ||
      parsed.blockerKind === "runtime_task_missing" ||
      parsed.blockerKind === "active_task_mismatch"
        ? parsed.blockerKind
        : "unknown";
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason
        : "daemon operator handoff is missing a valid reason";
    const workspaceSlug = typeof parsed.workspaceSlug === "string" ? parsed.workspaceSlug : undefined;
    const projectSlug = typeof parsed.projectSlug === "string" ? parsed.projectSlug : undefined;
    const activeRunId =
      parsed.activeRunId === null || typeof parsed.activeRunId === "string" ? parsed.activeRunId : undefined;
    const activeTaskId =
      parsed.activeTaskId === null || typeof parsed.activeTaskId === "string" ? parsed.activeTaskId : undefined;
    const sessionId =
      parsed.sessionId === null || typeof parsed.sessionId === "string" ? parsed.sessionId : undefined;
    const cycle = typeof parsed.cycle === "number" ? parsed.cycle : undefined;
    const directiveKind =
      parsed.directiveKind === "complete" ||
      parsed.directiveKind === "dispatch_owner" ||
      parsed.directiveKind === "dispatch_reviews" ||
      parsed.directiveKind === "apply_recovery" ||
      parsed.directiveKind === "continue_analysis" ||
      parsed.directiveKind === "blocked"
        ? parsed.directiveKind
        : undefined;
    const nextActions = Array.isArray(parsed.nextActions)
      ? parsed.nextActions.filter((value): value is string => typeof value === "string")
      : [];
    const detailFilesCandidate =
      parsed.detailFiles && typeof parsed.detailFiles === "object" && !Array.isArray(parsed.detailFiles)
        ? (parsed.detailFiles as Record<string, unknown>)
        : {};
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;

    return {
      authorityLabel: "derived_only",
      state,
      blockerKind,
      reason,
      workspaceSlug,
      projectSlug,
      activeRunId,
      activeTaskId,
      sessionId,
      cycle,
      directiveKind,
      nextActions,
      detailFiles: {
        continuationStatus:
          typeof detailFilesCandidate.continuationStatus === "string"
            ? detailFilesCandidate.continuationStatus
            : undefined,
        reviewQueueStatus:
          typeof detailFilesCandidate.reviewQueueStatus === "string"
            ? detailFilesCandidate.reviewQueueStatus
            : undefined
      },
      updatedAt
    };
  } catch (error) {
    return {
      authorityLabel: "derived_only",
      state: "invalid",
      blockerKind: "unknown",
      reason: `failed to parse daemon operator handoff: ${error instanceof Error ? error.message : String(error)}`,
      nextActions: [],
      detailFiles: {}
    };
  }
}

async function readDaemonSupervisorStatus(
  cwd: string,
  historyOptions: DaemonSupervisorHistoryReadOptions
): Promise<DaemonSupervisorStatusObservation | undefined> {
  const statusPath = path.join(cwd, ".devgod", "work", "daemon", "supervisor-status.json");
  let raw: string;
  try {
    raw = await readFile(statusPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state =
      parsed.state === "completed" || parsed.state === "blocked" || parsed.state === "max_cycles_reached"
        ? parsed.state
        : "invalid";
    const blockerKind =
      parsed.blockerKind === "missing_review_actor_bindings" ||
      parsed.blockerKind === "handoff_missing" ||
      parsed.blockerKind === "unsupported_handoff" ||
      parsed.blockerKind === "continuation_derivation_failed" ||
      parsed.blockerKind === "review_derivation_failed"
        ? parsed.blockerKind
        : typeof parsed.blockerKind === "string"
          ? "unknown"
          : undefined;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason
        : "daemon supervisor status is missing a valid reason";
    const workspaceSlug = typeof parsed.workspaceSlug === "string" ? parsed.workspaceSlug : undefined;
    const projectSlug = typeof parsed.projectSlug === "string" ? parsed.projectSlug : undefined;
    const activeRunId =
      parsed.activeRunId === null || typeof parsed.activeRunId === "string" ? parsed.activeRunId : undefined;
    const activeTaskId =
      parsed.activeTaskId === null || typeof parsed.activeTaskId === "string" ? parsed.activeTaskId : undefined;
    const sessionId =
      parsed.sessionId === null || typeof parsed.sessionId === "string" ? parsed.sessionId : undefined;
    const supervisorCycles = typeof parsed.supervisorCycles === "number" ? parsed.supervisorCycles : undefined;
    const nextActions = Array.isArray(parsed.nextActions)
      ? parsed.nextActions.filter((value): value is string => typeof value === "string")
      : [];
    const missingReviewRoles = Array.isArray(parsed.missingReviewRoles)
      ? parsed.missingReviewRoles.filter((value): value is string => typeof value === "string")
      : [];
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return [];
          }
          const candidate = value as Record<string, unknown>;
          const action =
            candidate.action === "enqueue_operator_continuation" || candidate.action === "enqueue_review_action"
              ? (candidate.action as "enqueue_operator_continuation" | "enqueue_review_action")
              : undefined;
          const cycle = typeof candidate.cycle === "number" ? candidate.cycle : undefined;
          const filePath = typeof candidate.filePath === "string" ? candidate.filePath : undefined;
          const summary = typeof candidate.summary === "string" ? candidate.summary : undefined;
          if (!action || cycle === undefined || !filePath || !summary) {
            return [];
          }
          return [
            {
              cycle,
              action,
              targetId: typeof candidate.targetId === "string" ? candidate.targetId : undefined,
              taskId: typeof candidate.taskId === "string" ? candidate.taskId : undefined,
              reviewRole: typeof candidate.reviewRole === "string" ? candidate.reviewRole : undefined,
              filePath,
              summary
            }
          ];
        })
      : [];
    const historyResult = await readDaemonSupervisorHistory(cwd, historyOptions);
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;

    return {
      authorityLabel: "derived_only",
      state,
      blockerKind,
      reason,
      workspaceSlug,
      projectSlug,
      activeRunId,
      activeTaskId,
      sessionId,
      supervisorCycles,
      nextActions,
      missingReviewRoles,
      actions,
      history: historyResult.entries,
      historyView: {
        scope: historyOptions.scope,
        runId: historyOptions.scope === "run" ? historyOptions.runId : undefined,
        limit: historyOptions.limit,
        retainedCount: historyResult.retainedCount,
        filteredCount: historyResult.filteredCount,
        returnedCount: historyResult.entries.length,
        truncated: historyResult.filteredCount > historyResult.entries.length
      },
      updatedAt
    };
  } catch (error) {
    return {
      authorityLabel: "derived_only",
      state: "invalid",
      blockerKind: "unknown",
      reason: `failed to parse daemon supervisor status: ${error instanceof Error ? error.message : String(error)}`,
      nextActions: [],
      missingReviewRoles: [],
      actions: [],
      history: [],
      historyView: {
        scope: historyOptions.scope,
        runId: historyOptions.scope === "run" ? historyOptions.runId : undefined,
        limit: historyOptions.limit,
        retainedCount: 0,
        filteredCount: 0,
        returnedCount: 0,
        truncated: false
      },
      updatedAt: undefined
    };
  }
}

async function readDaemonSupervisorHistory(
  cwd: string,
  options: DaemonSupervisorHistoryReadOptions
): Promise<DaemonSupervisorHistoryReadResult> {
  const historyPath = path.join(cwd, ".devgod", "work", "daemon", "supervisor-history.jsonl");
  let raw: string;
  try {
    raw = await readFile(historyPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return {
        entries: [],
        retainedCount: 0,
        filteredCount: 0
      };
    }
    throw error;
  }

  const retainedEntries = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const state =
          parsed.state === "completed" || parsed.state === "blocked" || parsed.state === "max_cycles_reached"
            ? parsed.state
            : undefined;
        const reason =
          typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : undefined;
        const recordedAt =
          typeof parsed.recordedAt === "string" && parsed.recordedAt.trim().length > 0
            ? parsed.recordedAt.trim()
            : undefined;
        const activeRunId =
          parsed.activeRunId === null || typeof parsed.activeRunId === "string" ? parsed.activeRunId : undefined;
        const activeTaskId =
          parsed.activeTaskId === null || typeof parsed.activeTaskId === "string" ? parsed.activeTaskId : undefined;
        if (!state || !reason || !recordedAt) {
          return [];
        }
        const blockerKind =
          parsed.blockerKind === "missing_review_actor_bindings" ||
          parsed.blockerKind === "handoff_missing" ||
          parsed.blockerKind === "unsupported_handoff" ||
          parsed.blockerKind === "continuation_derivation_failed" ||
          parsed.blockerKind === "review_derivation_failed"
            ? parsed.blockerKind
            : typeof parsed.blockerKind === "string"
              ? "unknown"
              : undefined;
        const supervisorCycles =
          typeof parsed.supervisorCycles === "number" ? parsed.supervisorCycles : undefined;
        const actionCount = Array.isArray(parsed.actions) ? parsed.actions.length : 0;
        return [
          {
            recordedAt,
            state,
            activeRunId,
            activeTaskId,
            blockerKind,
            reason,
            supervisorCycles,
            actionCount
          } satisfies DaemonSupervisorStatusObservation["history"][number]
        ];
      } catch {
        return [];
      }
    });

  const filteredEntries =
    options.scope === "run" && options.runId
      ? retainedEntries.filter((entry) => entry.activeRunId === options.runId)
      : retainedEntries;

  return {
    entries: options.limit === 0 ? [] : filteredEntries.slice(-options.limit),
    retainedCount: retainedEntries.length,
    filteredCount: filteredEntries.length
  };
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

async function closeWorkflowProofCoverageGaps(
  runId: string,
  taskId: string,
  options: {
    getStatusSnapshot: (runId: string) => Promise<RunStatusSnapshot>;
    upsertCoverageGaps?: ((runId: string, gaps: CoverageGapRecord[]) => Promise<unknown>) | undefined;
  }
): Promise<number> {
  if (!options.upsertCoverageGaps) {
    return 0;
  }

  const proofSnapshot = await options.getStatusSnapshot(runId);
  const workflowProofGaps =
    proofSnapshot.autonomousExecution?.state.gaps.filter(
      (gap) =>
        gap.status === "open" &&
        (
          gap.targetId === `task:${taskId}` ||
          gap.suggestedNextActions.some((action) => /\bworkflow-proof\b/i.test(action))
        )
    ) ?? [];

  if (workflowProofGaps.length === 0) {
    return 0;
  }

  await options.upsertCoverageGaps(
    runId,
    workflowProofGaps.map((gap) => ({
      ...gap,
      status: "closed"
    }))
  );
  return workflowProofGaps.length;
}

function resolveWorkflowProofTaskIdForContinuationAction(
  action: ContinuationAction
): string | undefined {
  if (action.kind === "run_workflow_proof") {
    return action.taskId;
  }

  if (
    (action.kind === "resolve_blocking_gap" || action.kind === "resume_target") &&
    action.targetId.startsWith("task:")
  ) {
    const taskId = action.targetId.slice("task:".length).trim();
    return taskId.length > 0 ? taskId : undefined;
  }

  return undefined;
}

function isSelfReferentialResumeTarget(action: ContinuationAction): boolean {
  if (action.kind !== "resume_target") {
    return false;
  }

  return (
    (action.source === "progress_proof" && action.targetId.startsWith("proof:")) ||
    (action.source === "checkpoint" && action.targetId.startsWith("checkpoint:"))
  );
}

function validateResumeTargetSource(
  action: Extract<ContinuationAction, { kind: "resume_target" }>,
  autonomousState: AutonomousExecutionState
): { valid: true } | { valid: false; reason: string } {
  if (action.source === "progress_proof") {
    if (!action.sourceId?.trim()) {
      return {
        valid: false,
        reason: `resume target ${action.targetId} is missing the originating progress proof id`
      };
    }

    const sourceProof = autonomousState.progressProofs.find((proof) => proof.proofId === action.sourceId);
    if (!sourceProof) {
      return {
        valid: false,
        reason: `resume target ${action.targetId} references missing progress proof ${action.sourceId}`
      };
    }

    if (sourceProof.nextTarget.trim() !== action.targetId) {
      return {
        valid: false,
        reason: `resume target ${action.targetId} no longer matches progress proof ${action.sourceId}`
      };
    }

    return { valid: true };
  }

  if (action.source === "checkpoint") {
    if (!action.sourceId?.trim()) {
      return {
        valid: false,
        reason: `resume target ${action.targetId} is missing the originating checkpoint id`
      };
    }

    const sourceCheckpoint = autonomousState.checkpoints.find(
      (checkpoint) => checkpoint.checkpointId === action.sourceId
    );
    if (!sourceCheckpoint) {
      return {
        valid: false,
        reason: `resume target ${action.targetId} references missing checkpoint ${action.sourceId}`
      };
    }

    if (!sourceCheckpoint.activeTargets.some((target) => target.trim() === action.targetId)) {
      return {
        valid: false,
        reason: `resume target ${action.targetId} no longer matches checkpoint ${action.sourceId}`
      };
    }

    return { valid: true };
  }

  return {
    valid: false,
    reason: `resume target ${action.targetId} uses unsupported source ${action.source}`
  };
}

export function createSupportedContinuationExecutor(options: {
  env?: EnvShape | undefined;
  getStatusSnapshot: (runId: string) => Promise<RunStatusSnapshot>;
  getReviews: (runId: string, taskId: string) => Promise<readonly ReviewRecord[]>;
  getApprovals: (runId: string, taskId: string) => Promise<readonly ApprovalRecord[]>;
  upsertCoverageGaps?: ((runId: string, gaps: CoverageGapRecord[]) => Promise<unknown>) | undefined;
  recordProgressProof?: ((runId: string, proof: ProgressProofRecord) => Promise<unknown>) | undefined;
  checkpointRun?: ((
    runId: string,
    checkpoint: Omit<CheckpointRecord, "runId" | "authorityLabel">,
    options?: {
      authorityLabel?: CheckpointRecord["authorityLabel"] | undefined;
    }
  ) => Promise<unknown>) | undefined;
  now?: (() => Date) | undefined;
}): NonNullable<ExecuteDirectiveStepOptions["executeContinuationAction"]> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());

  return async ({ runId, directive, action }) => {
    const workflowProofTaskId = resolveWorkflowProofTaskIdForContinuationAction(action);
    if (!workflowProofTaskId) {
      if (
        action.kind === "resume_target" &&
        (action.targetId === "review:authenticated" || isSelfReferentialResumeTarget(action))
      ) {
        const snapshot = await options.getStatusSnapshot(runId);
        const autonomousState = snapshot.autonomousExecution?.state;
        const approvedTasks = snapshot.tasks.filter((task) => task.status === "approved");

        if (!autonomousState) {
          return {
            executed: false,
            taskId: directive.targetId,
            evidence: ["autonomous execution state is unavailable for stale resume-target normalization"]
          };
        }
        const sourceValidation = validateResumeTargetSource(action, autonomousState);
        if (!sourceValidation.valid) {
          return {
            executed: false,
            taskId: directive.targetId,
            evidence: [sourceValidation.reason]
          };
        }
        if (action.targetId === "review:authenticated" && approvedTasks.length !== 1) {
          return {
            executed: false,
            taskId: directive.targetId,
            evidence: [
              `review:authenticated resume normalization requires exactly one approved task, found ${approvedTasks.length}`
            ]
          };
        }

        const createdAt = now().toISOString();
        const approvedTask = approvedTasks[0];
        const taskId = approvedTask?.packet.taskId ?? directive.targetId;
        const evidenceRef = approvedTask
          ? `runtime://task/${approvedTask.packet.taskId}`
          : `runtime://autonomous/${action.source}/${action.targetId.replaceAll(":", "/")}`;

        if (action.source === "progress_proof") {
          if (!options.recordProgressProof) {
            return {
              executed: false,
              taskId,
              evidence: ["no supported continuation executor is available to normalize stale progress proofs"]
            };
          }

          const nextCycle =
            autonomousState.progressProofs.reduce((highest, proof) => Math.max(highest, proof.cycle), 0) + 1;
          const whyNext =
            action.targetId === "review:authenticated"
              ? "stale review:authenticated progress target was already satisfied"
              : `stale self-referential progress target ${action.targetId} was already exhausted`;
          await options.recordProgressProof(runId, {
            cycle: nextCycle,
            proofId: `proof-autoresume-${createdAt}`,
            phaseBefore: autonomousState.phase,
            phaseAfter: autonomousState.phase,
            evidenceRefs: [evidenceRef],
            coverageDelta: {},
            blockingGapDelta: { closed: 0, opened: 0 },
            nextTarget: "   ",
            whyNext,
            createdAt
          });

          return {
            executed: true,
            taskId,
            evidence: [
              action.targetId === "review:authenticated"
                ? `cleared stale progress-proof target review:authenticated for approved task ${approvedTask!.packet.taskId}`
                : `cleared stale self-referential progress-proof target ${action.targetId}`
            ]
          };
        }

        if (action.source === "checkpoint") {
          if (!options.checkpointRun) {
            return {
              executed: false,
              taskId,
              evidence: ["no supported continuation executor is available to normalize stale checkpoints"]
            };
          }

          const latestCheckpoint = [...autonomousState.checkpoints].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          )[0];
          await options.checkpointRun(
            runId,
            {
              checkpointId: `cp-autoresume-${createdAt}`,
              phase: autonomousState.phase,
              activeTargets: [],
              recentEvidenceRefs: [evidenceRef],
              openGaps: autonomousState.gaps
                .filter((gap) => gap.status === "open")
                .map((gap) => gap.id),
              nextActions: [],
              compressedContextRef: latestCheckpoint?.compressedContextRef,
              createdAt
            },
            {
              authorityLabel: "operator_import"
            }
          );

          return {
            executed: true,
            taskId,
            evidence: [
              action.targetId === "review:authenticated"
                ? `cleared stale checkpoint target review:authenticated for approved task ${approvedTask!.packet.taskId}`
                : `cleared stale self-referential checkpoint target ${action.targetId}`
            ]
          };
        }
      }

      return {
        executed: false,
        taskId: directive.targetId,
        evidence: [
          action.kind === "resume_target"
            ? `no supported continuation executor is available for resume_target target=${action.targetId} source=${action.source}${action.sourceId ? ` sourceId=${action.sourceId}` : ""}`
            : `no supported continuation executor is available for ${action.kind}`
        ]
      };
    }

    try {
      await executeWorkflowProofCommandFromArgs(["--run-id", runId, "--task-id", workflowProofTaskId], {
        env,
        getStatusSnapshot: options.getStatusSnapshot,
        getReviews: options.getReviews,
        getApprovals: options.getApprovals
      });
    } catch (error) {
      return {
        executed: false,
        taskId: workflowProofTaskId,
        evidence: [error instanceof Error ? error.message : String(error)]
      };
    }

    const closedGapCount = await closeWorkflowProofCoverageGaps(runId, workflowProofTaskId, {
      getStatusSnapshot: options.getStatusSnapshot,
      upsertCoverageGaps: options.upsertCoverageGaps
    });

    return {
      executed: true,
      taskId: workflowProofTaskId,
      evidence: [
        closedGapCount > 0
          ? `workflow proof passed for ${workflowProofTaskId}; closed ${closedGapCount} autonomous gap(s)`
          : `workflow proof passed for ${workflowProofTaskId}`
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
  const env = options.env;
  const runId = await resolveRunIdForCommand(args, {
    env,
    findLatestRun: options.findLatestRun
  });
  const daemonSupervisorHistoryOptions = resolveDaemonSupervisorHistoryReadOptions(args, env, runId);

  const staleAfterDaysValue = resolveCommandFlag(args, "--stale-after-days") ?? "1";
  const staleAfterDays = Number.parseInt(staleAfterDaysValue, 10);
  if (!Number.isInteger(staleAfterDays) || staleAfterDays < 0) {
    throw new Error(`Invalid --stale-after-days value: ${staleAfterDaysValue}`);
  }

  const reviewIdentity = options.inspectReviewIdentity
    ? await options.inspectReviewIdentity()
    : await inspectReviewIdentityStatus({
        cwd: options.cwd,
        env
      });
  const gitNexus = options.inspectGitNexus
    ? await options.inspectGitNexus()
    : await inspectGitNexusStatus({
        cwd: options.cwd
      });
  const [snapshot, executionPlan] = await Promise.all([
    options.getStatusSnapshot(runId),
    options.getExecutionPlan ? options.getExecutionPlan(runId, staleAfterDays * 24) : Promise.resolve(undefined)
  ]);
  const daemonContinuation = await readDaemonContinuationStatus(options.cwd ?? process.cwd());
  const daemonHandoff = await readDaemonOperatorHandoff(options.cwd ?? process.cwd());
  const daemonSupervisor = await readDaemonSupervisorStatus(
    options.cwd ?? process.cwd(),
    daemonSupervisorHistoryOptions
  );

  return buildOperatorStatusReport({
    snapshot,
    executionPlan,
    daemonContinuation,
    daemonHandoff,
    daemonSupervisor,
    reviewIdentity,
    gitNexus,
    staleAfterDays
  });
}

export interface AutonomousCoverageCommandReport {
  authorityLabel: "runtime_authoritative";
  runId: string;
  autonomous: AutonomousOperatorSummary;
  items: CoverageItemRecord[];
}

export interface AutonomousGapsCommandReport {
  authorityLabel: "runtime_authoritative";
  runId: string;
  autonomous: AutonomousOperatorSummary;
  gaps: CoverageGapRecord[];
}

export interface AutonomousCheckpointCommandReport {
  authorityLabel: "runtime_authoritative";
  runId: string;
  autonomous: AutonomousOperatorSummary;
  checkpoints: CheckpointRecord[];
  latestCheckpoint?: CheckpointRecord | undefined;
  latestProgressProof?: ProgressProofRecord | undefined;
  updatedCheckpointId?: string | undefined;
}

export interface AutonomousResumeCommandReport {
  authorityLabel: "runtime_authoritative";
  runId: string;
  autonomous: AutonomousOperatorSummary;
  executionPlan: RunExecutionPlan;
}

export interface ExecuteCoverageCommandOptions {
  env?: EnvShape | undefined;
  findLatestRun?: (workspaceSlug: string, projectSlug: string) => Promise<{ id: string } | undefined>;
  getStatusSnapshot: (runId: string) => Promise<RunStatusSnapshot>;
}

export interface ExecuteGapsCommandOptions extends ExecuteCoverageCommandOptions {}

export interface ExecuteCheckpointCommandOptions extends ExecuteCoverageCommandOptions {
  cwd?: string | undefined;
  checkpointRun?: (
    runId: string,
    checkpoint: Omit<CheckpointRecord, "runId" | "authorityLabel">,
    options?: {
      authorityLabel?: CheckpointRecord["authorityLabel"] | undefined;
    }
  ) => Promise<unknown>;
}

export interface ExecuteResumeCommandOptions {
  env?: EnvShape | undefined;
  findLatestRun?: (workspaceSlug: string, projectSlug: string) => Promise<{ id: string } | undefined>;
  getResumeSnapshot: (runId: string) => Promise<import("./domain/types.ts").RunResumeSnapshot>;
}

function buildCoverageCommandReport(snapshot: RunStatusSnapshot): AutonomousCoverageCommandReport {
  return {
    authorityLabel: "runtime_authoritative",
    runId: snapshot.run.id,
    autonomous: buildAutonomousOperatorSummary({ snapshot }),
    items: snapshot.autonomousExecution ? [...snapshot.autonomousExecution.state.coverageItems] : []
  };
}

function buildGapsCommandReport(snapshot: RunStatusSnapshot, gaps: CoverageGapRecord[]): AutonomousGapsCommandReport {
  return {
    authorityLabel: "runtime_authoritative",
    runId: snapshot.run.id,
    autonomous: buildAutonomousOperatorSummary({ snapshot }),
    gaps
  };
}

function buildCheckpointCommandReport(input: {
  snapshot: RunStatusSnapshot;
  updatedCheckpointId?: string | undefined;
}): AutonomousCheckpointCommandReport {
  const autonomous = buildAutonomousOperatorSummary({ snapshot: input.snapshot });
  return {
    authorityLabel: "runtime_authoritative",
    runId: input.snapshot.run.id,
    autonomous,
    checkpoints: input.snapshot.autonomousExecution ? [...input.snapshot.autonomousExecution.state.checkpoints] : [],
    latestCheckpoint: autonomous.latestCheckpoint,
    latestProgressProof: autonomous.latestProgressProof,
    updatedCheckpointId: input.updatedCheckpointId
  };
}

function buildResumeCommandReport(
  snapshot: import("./domain/types.ts").RunResumeSnapshot
): AutonomousResumeCommandReport {
  return {
    authorityLabel: "runtime_authoritative",
    runId: snapshot.run.id,
    autonomous: buildAutonomousOperatorSummary({
      snapshot,
      executionPlan: snapshot.executionPlan
    }),
    executionPlan: snapshot.executionPlan
  };
}

function formatCoverageCommandReport(report: AutonomousCoverageCommandReport): string {
  const lines = [
    `Run ${report.runId}`,
    `configured: ${report.autonomous.configured ? "yes" : "no"}`,
    `resume: ${report.autonomous.resume.summary}`
  ];

  if (!report.autonomous.configured) {
    return `${lines.join("\n")}\n`;
  }

  lines.push(`profile: ${report.autonomous.profile}`);
  lines.push(`phase: ${report.autonomous.phase}`);
  lines.push(`items: ${report.items.length}`);
  if (report.autonomous.coverageSummary) {
    lines.push(
      `coverage: critical=${report.autonomous.coverageSummary.criticalItemCoverage} validation=${report.autonomous.coverageSummary.criticalItemValidation} callsites=${report.autonomous.coverageSummary.callsiteCoverage} runtime-traces=${report.autonomous.coverageSummary.runtimeTraceCoverage}`
    );
    lines.push(
      `gaps: open=${report.autonomous.coverageSummary.openGapCount} blocking=${report.autonomous.coverageSummary.blockingGapCount}`
    );
  }
  if (report.autonomous.blockers.length > 0) {
    for (const blocker of report.autonomous.blockers) {
      lines.push(`blocked: ${blocker}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatGapsCommandReport(report: AutonomousGapsCommandReport): string {
  const lines = [
    `Run ${report.runId}`,
    `configured: ${report.autonomous.configured ? "yes" : "no"}`,
    `gaps: ${report.gaps.length}`
  ];
  if (report.gaps.length === 0) {
    lines.push(`resume: ${report.autonomous.resume.summary}`);
    return `${lines.join("\n")}\n`;
  }
  for (const gap of report.gaps) {
    lines.push(
      `${gap.id} severity=${gap.severity} blocking=${gap.blocking ? "yes" : "no"} target=${gap.targetId}: ${gap.description}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatCheckpointCommandReport(report: AutonomousCheckpointCommandReport): string {
  const lines = [
    `Run ${report.runId}`,
    `configured: ${report.autonomous.configured ? "yes" : "no"}`,
    `checkpoints: ${report.checkpoints.length}`
  ];
  if (report.updatedCheckpointId) {
    lines.push(`updated-checkpoint: ${report.updatedCheckpointId}`);
  }
  if (report.latestCheckpoint) {
    lines.push(
      `latest-checkpoint: ${report.latestCheckpoint.checkpointId} authority=${report.latestCheckpoint.authorityLabel}`
    );
    if (report.latestCheckpoint.activeTargets.length > 0) {
      lines.push(`active-targets: ${report.latestCheckpoint.activeTargets.join(", ")}`);
    }
    if (report.latestCheckpoint.nextActions.length > 0) {
      lines.push(`next-actions: ${report.latestCheckpoint.nextActions.join("; ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatResumeCommandReport(report: AutonomousResumeCommandReport): string {
  const lines = [
    `Run ${report.runId}`,
    `directive: ${report.executionPlan.directive.kind}`,
    `resume: ${report.autonomous.resume.status}/${report.autonomous.resume.source} ${report.autonomous.resume.summary}`
  ];
  if (report.autonomous.resume.nextTarget) {
    lines.push(`next-target: ${report.autonomous.resume.nextTarget}`);
  }
  if (report.autonomous.resume.nextActions.length > 0) {
    lines.push(`next-actions: ${report.autonomous.resume.nextActions.join("; ")}`);
  }
  if (report.autonomous.resume.blockers.length > 0) {
    for (const blocker of report.autonomous.resume.blockers) {
      lines.push(`blocked: ${blocker}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function readCheckpointInput(
  inputArg: string,
  cwd: string
): Promise<Omit<CheckpointRecord, "runId" | "authorityLabel">> {
  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.resolve(cwd, inputArg);
  await validateCheckpointInputPath(inputPath, cwd);
  const fileStats = await stat(inputPath);
  if (fileStats.size > MAX_CHECKPOINT_INPUT_BYTES) {
    throw new Error(
      `checkpoint input from ${inputPath} exceeds the maximum size of ${MAX_CHECKPOINT_INPUT_BYTES} bytes`
    );
  }
  const content = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  return parseCheckpointInput(parsed, inputPath);
}

function parseCheckpointInput(
  input: unknown,
  sourceLabel: string
): Omit<CheckpointRecord, "runId" | "authorityLabel"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`checkpoint input from ${sourceLabel} must be a JSON object`);
  }

  const record = input as Record<string, unknown>;
  const checkpointId = readRequiredStringField(record, "checkpointId", sourceLabel);
  const phase = readRequiredStringField(record, "phase", sourceLabel);
  validateCheckpointString(checkpointId, "checkpointId");
  if (!analysisPhases.includes(phase as (typeof analysisPhases)[number])) {
    throw new Error(`checkpoint input from ${sourceLabel} has invalid phase: ${phase}`);
  }

  const activeTargets = readRequiredStringArrayField(record, "activeTargets", sourceLabel);
  const recentEvidenceRefs = readRequiredStringArrayField(record, "recentEvidenceRefs", sourceLabel);
  const openGaps = readRequiredStringArrayField(record, "openGaps", sourceLabel);
  const nextActions = readRequiredStringArrayField(record, "nextActions", sourceLabel);
  const compressedContextRef = readOptionalStringField(record, "compressedContextRef");
  const createdAt = readRequiredStringField(record, "createdAt", sourceLabel);

  validateCheckpointStringArray(activeTargets, "activeTargets");
  validateCheckpointStringArray(recentEvidenceRefs, "recentEvidenceRefs");
  validateCheckpointStringArray(openGaps, "openGaps");
  validateCheckpointStringArray(nextActions, "nextActions");
  validateCheckpointTimestamp(createdAt, sourceLabel);
  if (compressedContextRef) {
    validateCompressedContextRef(compressedContextRef);
  }

  return {
    checkpointId,
    phase: phase as CheckpointRecord["phase"],
    activeTargets,
    recentEvidenceRefs,
    openGaps,
    nextActions,
    compressedContextRef,
    createdAt
  };
}

async function validateCheckpointInputPath(inputPath: string, cwd: string): Promise<void> {
  const [resolvedInputPath, resolvedCwd] = await Promise.all([realpath(inputPath), realpath(cwd)]);
  const relativePath = path.relative(resolvedCwd, resolvedInputPath);
  if (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return;
  }
  throw new Error(`checkpoint input path must stay within ${resolvedCwd}`);
}

function readRequiredStringField(
  record: Record<string, unknown>,
  field: string,
  sourceLabel: string
): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`checkpoint input from ${sourceLabel} is missing required string field ${field}`);
  }
  return value.trim();
}

function readOptionalStringField(
  record: Record<string, unknown>,
  field: string
): string | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`checkpoint input has invalid optional string field ${field}`);
  }
  return value.trim();
}

function readRequiredStringArrayField(
  record: Record<string, unknown>,
  field: string,
  sourceLabel: string
): string[] {
  const value = record[field];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new Error(`checkpoint input from ${sourceLabel} is missing required string[] field ${field}`);
  }
  return value.map((entry) => entry.trim());
}

function validateCheckpointString(value: string, field: string): void {
  if (value.length > MAX_CHECKPOINT_STRING_LENGTH) {
    throw new Error(`checkpoint input has ${field} longer than ${MAX_CHECKPOINT_STRING_LENGTH} characters`);
  }
  if (/[\r\n\t]/.test(value)) {
    throw new Error(`checkpoint input has invalid control characters in ${field}`);
  }
}

function validateCheckpointStringArray(values: readonly string[], field: string): void {
  if (values.length > MAX_CHECKPOINT_ARRAY_ITEMS) {
    throw new Error(`checkpoint input has too many ${field} entries`);
  }
  for (const value of values) {
    validateCheckpointString(value, `${field}[]`);
  }
}

function validateCheckpointTimestamp(value: string, sourceLabel: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`checkpoint input from ${sourceLabel} has invalid createdAt timestamp`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`checkpoint input from ${sourceLabel} has invalid createdAt timestamp`);
  }
  if (parsed > Date.now() + MAX_CHECKPOINT_FUTURE_SKEW_MS) {
    throw new Error(`checkpoint input from ${sourceLabel} has createdAt too far in the future`);
  }
}

function validateCompressedContextRef(value: string): void {
  validateCheckpointString(value, "compressedContextRef");
  if (!value.startsWith("memory://")) {
    throw new Error("checkpoint input has invalid compressedContextRef scheme");
  }
}

export async function executeCoverageCommandFromArgs(
  args: readonly string[],
  options: ExecuteCoverageCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const format = resolveFormatFlag(args);
  const snapshot = await options.getStatusSnapshot(runId);
  return {
    format,
    report: buildCoverageCommandReport(snapshot)
  };
}

export async function executeGapsCommandFromArgs(
  args: readonly string[],
  options: ExecuteGapsCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const format = resolveFormatFlag(args);
  const snapshot = await options.getStatusSnapshot(runId);
  const allGaps = snapshot.autonomousExecution?.state.gaps ?? [];
  const includeClosed = args.includes("--all");
  const blockingOnly = args.includes("--blocking-only");
  const gaps = allGaps.filter((gap) => (includeClosed ? true : gap.status === "open")).filter((gap) =>
    blockingOnly ? gap.blocking && (includeClosed ? true : gap.status === "open") : true
  );
  return {
    format,
    report: buildGapsCommandReport(snapshot, gaps)
  };
}

export async function executeCheckpointCommandFromArgs(
  args: readonly string[],
  options: ExecuteCheckpointCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const format = resolveFormatFlag(args);
  const inputArg = resolveCommandFlag(args, "--input");
  let updatedCheckpointId: string | undefined;
  if (inputArg) {
    if (!options.checkpointRun) {
      throw new Error("checkpoint mutation is not available for this command surface");
    }
    const checkpoint = await readCheckpointInput(inputArg, options.cwd ?? process.cwd());
    await options.checkpointRun(runId, checkpoint, {
      authorityLabel: "operator_import"
    });
    updatedCheckpointId = checkpoint.checkpointId;
  }
  const snapshot = await options.getStatusSnapshot(runId);
  return {
    format,
    report: buildCheckpointCommandReport({
      snapshot,
      updatedCheckpointId
    })
  };
}

export async function executeResumeCommandFromArgs(
  args: readonly string[],
  options: ExecuteResumeCommandOptions
) {
  const runId = await resolveRunIdForCommand(args, {
    env: options.env,
    findLatestRun: options.findLatestRun
  });
  const format = resolveFormatFlag(args);
  const snapshot = await options.getResumeSnapshot(runId);
  return {
    format,
    report: buildResumeCommandReport(snapshot)
  };
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
      }
    });
    console.log(JSON.stringify(report));
  });
}

async function coverageCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, report } = await executeCoverageCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      }
    });

    if (format === "text") {
      process.stdout.write(formatCoverageCommandReport(report));
      return;
    }

    console.log(JSON.stringify(report));
  });
}

async function gapsCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, report } = await executeGapsCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      }
    });

    if (format === "text") {
      process.stdout.write(formatGapsCommandReport(report));
      return;
    }

    console.log(JSON.stringify(report));
  });
}

async function checkpointCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, report } = await executeCheckpointCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      checkpointRun(runId, checkpoint, checkpointOptions) {
        return service.checkpointRun(runId, checkpoint, checkpointOptions);
      }
    });

    if (format === "text") {
      process.stdout.write(formatCheckpointCommandReport(report));
      return;
    }

    console.log(JSON.stringify(report));
  });
}

async function resumeCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, report } = await executeResumeCommandFromArgs(args, {
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getResumeSnapshot(runId) {
        return service.resumeRun(runId);
      }
    });

    if (format === "text") {
      process.stdout.write(formatResumeCommandReport(report));
      return;
    }

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
    executeStatusCommandFromArgs(args, options),
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
  } else if (result.finalPlan.directive.kind === "continue_analysis") {
    lines.push(`next: continue ${result.finalPlan.directive.targetId}`);
    if (result.finalPlan.directive.actions.length > 0) {
      lines.push(`typed-actions: ${result.finalPlan.directive.actions.map(formatContinuationAction).join("; ")}`);
    }
    if (result.finalPlan.directive.nextActions.length > 0) {
      lines.push(`guidance: ${result.finalPlan.directive.nextActions.join("; ")}`);
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
        const executeContinuationAction = createSupportedContinuationExecutor({
          env: process.env,
          getStatusSnapshot(runId) {
            return service.getStatus(runId);
          },
          getReviews(runId, taskId) {
            return store.getReviews(runId, taskId);
          },
          getApprovals(runId, taskId) {
            return store.getApprovals(runId, taskId);
          },
          upsertCoverageGaps(runId, gaps) {
            return service.upsertCoverageGaps(runId, gaps);
          },
          recordProgressProof(runId, proof) {
            return service.recordProgressProof(runId, proof);
          },
          checkpointRun(runId, checkpoint, checkpointOptions) {
            return service.checkpointRun(runId, checkpoint, checkpointOptions);
          }
        });

        return service.executeDirectiveStep(runId, {
          staleAfterHours: input.staleAfterHours,
          ownerActor: input.ownerActor,
          ...(executeReviewRecommendation ? { executeReviewRecommendation } : {}),
          executeContinuationAction
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

  const [status, executionPlan, routing, recovery] = await Promise.all([
    executeStatusCommandFromArgs(args, options),
    options.getExecutionPlan(runId, staleAfterHours),
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
      executionPlan,
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

function formatDaemonCommandResult(result: DaemonCommandResult): string {
  const lines = [
    `status: ${result.status}`,
    `reason: ${result.reason}`,
    `workspace: ${result.workspaceSlug}`,
    `project: ${result.projectSlug}`,
    `active-run: ${result.activeRunId ?? "none"}`,
    `active-task: ${result.activeTaskId ?? "none"}`,
    `session-id: ${result.sessionId ?? "none"}`
  ];

  if (result.cycles.length > 0) {
    lines.push("cycles:");
    for (const cycle of result.cycles) {
      lines.push(
        `- cycle=${cycle.cycle} directive=${cycle.directiveKind} action=${cycle.action} task=${cycle.taskId ?? "none"} run=${cycle.runId} ${cycle.summary}`
      );
    }
  }

  return lines.join("\n");
}

function formatSupervisorCommandResult(result: SupervisorCommandResult): string {
  const lines = [
    `status: ${result.status}`,
    `reason: ${result.reason}`,
    `workspace: ${result.workspaceSlug}`,
    `project: ${result.projectSlug}`,
    `active-run: ${result.activeRunId ?? "none"}`,
    `active-task: ${result.activeTaskId ?? "none"}`,
    `session-id: ${result.sessionId ?? "none"}`
  ];

  if (result.actions.length > 0) {
    lines.push("actions:");
    for (const action of result.actions) {
      lines.push(
        `- cycle=${action.cycle} action=${action.action} target=${action.targetId ?? action.taskId ?? "none"}${action.reviewRole ? ` role=${action.reviewRole}` : ""} ${action.summary}`
      );
    }
  }

  if (result.daemonRuns.length > 0) {
    lines.push("daemon-runs:");
    for (const daemonRun of result.daemonRuns) {
      lines.push(
        `- status=${daemonRun.status} reason=${daemonRun.reason} task=${daemonRun.activeTaskId ?? "none"} run=${daemonRun.activeRunId ?? "none"}`
      );
    }
  }

  return lines.join("\n");
}

function formatSupervisorHistoryCommandResult(result: SupervisorHistoryCommandResult): string {
  const lines = [
    "Supervisor history",
    `scope: ${result.scope}`,
    `run-id: ${result.runId ?? "all"}`,
    `history-path: ${result.historyPath}`,
    `retained: ${result.retainedCount}`,
    `filtered: ${result.filteredCount}`,
    `returned: ${result.returnedCount}`,
    `truncated: ${result.truncated ? "yes" : "no"}`
  ];

  if (result.latestStatus) {
    lines.push(
      `latest-status: ${result.latestStatus.state}${result.latestStatus.blockerKind ? ` ${result.latestStatus.blockerKind}` : ""} ${result.latestStatus.reason}`
    );
    if (result.latestStatus.activeRunId || result.latestStatus.activeTaskId) {
      lines.push(
        `latest-target: run=${result.latestStatus.activeRunId ?? "none"} task=${result.latestStatus.activeTaskId ?? "none"}`
      );
    }
  }

  if (result.entries.length === 0) {
    lines.push("entries: none");
    return lines.join("\n");
  }

  lines.push("entries:");
  for (const entry of result.entries) {
    lines.push(
      `- ${entry.recordedAt} run=${entry.activeRunId ?? "unknown"} task=${entry.activeTaskId ?? "unknown"} state=${entry.state}${entry.blockerKind ? ` blocker=${entry.blockerKind}` : ""} actions=${entry.actionCount} reason=${entry.reason}`
    );
  }

  return lines.join("\n");
}

function buildSupervisorOperatorNotes(input: {
  targetId: string;
  summary: string;
  nextActions: readonly string[];
  override?: string | undefined;
}): string {
  if (input.override?.trim()) {
    return input.override.trim();
  }

  const lines = [`Local supervisor authorized advisory continuation for ${input.targetId}.`];
  if (input.summary.trim()) {
    lines.push(`Reason: ${input.summary.trim()}`);
  }
  if (input.nextActions.length > 0) {
    lines.push(`Context: ${input.nextActions.join(" | ")}`);
  }
  return lines.join(" ");
}

async function writeSupervisorOperatorContinuationAction(input: {
  cwd: string;
  operatorActionDir: string;
  runId: string;
  taskId: string;
  targetId: string;
  source: "blocking_gap" | "progress_proof" | "checkpoint";
  sourceId?: string | undefined;
  operatorNotes: string;
  cycle: number;
  nowValue: string;
}): Promise<string> {
  await mkdir(input.operatorActionDir, { recursive: true });
  const safeRunId = input.runId.replace(/[^a-zA-Z0-9._-]/g, "-");
  const safeTaskId = input.taskId.replace(/[^a-zA-Z0-9._-]/g, "-");
  const safeTimestamp = input.nowValue.replace(/[^0-9A-Za-z]/g, "");
  const fileName = `supervisor-${String(input.cycle).padStart(2, "0")}-${safeRunId}-${safeTaskId}-${safeTimestamp}.json`;
  const filePath = path.join(input.operatorActionDir, fileName);
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        runId: input.runId,
        taskId: input.taskId,
        blockerKind: "operator_required_continuation",
        action: {
          kind: "continue_with_analysis",
          targetId: input.targetId,
          source: input.source,
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          operatorNotes: input.operatorNotes
        },
        supervisor: {
          kind: "local_supervisor",
          generatedAt: input.nowValue
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return path.relative(input.cwd, filePath) || path.basename(filePath);
}

interface DaemonReviewQueueStatusObservation {
  authorityLabel: "derived_only";
  state: "processed" | "blocked" | "failed" | "invalid";
  reviewInputDir?: string | undefined;
  reason: string;
  expectedReviewTargets: string[];
  queuedFiles: string[];
  consumedFiles: string[];
  failedFiles: { file: string; error: string }[];
  staleFiles: { file: string; reason: string }[];
  updatedAt?: string | undefined;
}

async function readDaemonReviewQueueStatus(
  cwd: string
): Promise<DaemonReviewQueueStatusObservation | undefined> {
  const statusPath = path.join(cwd, ".devgod", "work", "daemon", "review-queue-status.json");
  let raw: string;
  try {
    raw = await readFile(statusPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state =
      parsed.state === "processed" || parsed.state === "blocked" || parsed.state === "failed"
        ? parsed.state
        : "invalid";
    const reviewInputDir = typeof parsed.reviewInputDir === "string" ? parsed.reviewInputDir : undefined;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason
        : "daemon review queue status is missing a valid reason";
    const expectedReviewTargets = Array.isArray(parsed.expectedReviewTargets)
      ? parsed.expectedReviewTargets.filter((value): value is string => typeof value === "string")
      : [];
    const queuedFiles = Array.isArray(parsed.queuedFiles)
      ? parsed.queuedFiles.filter((value): value is string => typeof value === "string")
      : [];
    const consumedFiles = Array.isArray(parsed.consumedFiles)
      ? parsed.consumedFiles.filter((value): value is string => typeof value === "string")
      : [];
    const failedFiles = Array.isArray(parsed.failedFiles)
      ? parsed.failedFiles.flatMap((value) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? [
                {
                  file: typeof (value as { file?: unknown }).file === "string" ? (value as { file: string }).file : "unknown",
                  error:
                    typeof (value as { error?: unknown }).error === "string"
                      ? (value as { error: string }).error
                      : "unknown"
                }
              ]
            : []
        )
      : [];
    const staleFiles = Array.isArray(parsed.staleFiles)
      ? parsed.staleFiles.flatMap((value) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? [
                {
                  file: typeof (value as { file?: unknown }).file === "string" ? (value as { file: string }).file : "unknown",
                  reason:
                    typeof (value as { reason?: unknown }).reason === "string"
                      ? (value as { reason: string }).reason
                      : "unknown"
                }
              ]
            : []
        )
      : [];
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;

    return {
      authorityLabel: "derived_only",
      state,
      reviewInputDir,
      reason,
      expectedReviewTargets,
      queuedFiles,
      consumedFiles,
      failedFiles,
      staleFiles,
      updatedAt
    };
  } catch (error) {
    return {
      authorityLabel: "derived_only",
      state: "invalid",
      reason: `failed to parse daemon review queue status: ${error instanceof Error ? error.message : String(error)}`,
      expectedReviewTargets: [],
      queuedFiles: [],
      consumedFiles: [],
      failedFiles: [],
      staleFiles: [],
      updatedAt: undefined
    };
  }
}

function parseSupervisorReviewActorBindings(
  args: readonly string[],
  env: EnvShape
): Partial<Record<ReviewRecord["reviewerRole"], string>> {
  const bindings: Partial<Record<ReviewRecord["reviewerRole"], string>> = {};
  const mappingArgs = collectCommandFlagValues(args, "--review-actor");
  for (const mapping of mappingArgs) {
    const separatorIndex = mapping.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === mapping.length - 1) {
      throw new Error(`Invalid --review-actor value: ${mapping}`);
    }
    const role = mapping.slice(0, separatorIndex).trim();
    const actor = mapping.slice(separatorIndex + 1).trim();
    if (!isGateReviewRole(role)) {
      throw new Error(`Invalid review role in --review-actor: ${role}`);
    }
    if (!actor) {
      throw new Error(`Invalid empty actor in --review-actor: ${mapping}`);
    }
    bindings[role] = actor;
  }

  const envBindings: Array<[ReviewRecord["reviewerRole"], string | undefined]> = [
    ["reviewer", env.DEVGOD_SUPERVISOR_REVIEWER_ACTOR],
    ["security_reviewer", env.DEVGOD_SUPERVISOR_SECURITY_REVIEWER_ACTOR],
    ["qa_engineer", env.DEVGOD_SUPERVISOR_QA_ENGINEER_ACTOR]
  ];
  for (const [role, actor] of envBindings) {
    if (!bindings[role] && actor?.trim()) {
      bindings[role] = actor.trim();
    }
  }

  return bindings;
}

function parseExpectedReviewTarget(target: string): {
  taskId: string;
  reviewRole: ReviewRecord["reviewerRole"];
} | undefined {
  const separatorIndex = target.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex === target.length - 1) {
    return undefined;
  }
  const taskId = target.slice(0, separatorIndex).trim();
  const reviewRole = target.slice(separatorIndex + 1).trim();
  if (!taskId || !isGateReviewRole(reviewRole)) {
    return undefined;
  }
  return {
    taskId,
    reviewRole
  };
}

async function writeSupervisorReviewAction(input: {
  cwd: string;
  reviewInputDir: string;
  runId: string;
  taskId: string;
  reviewRole: ReviewRecord["reviewerRole"];
  actor: string;
  cycle: number;
  nowValue: string;
}): Promise<string> {
  await mkdir(input.reviewInputDir, { recursive: true });
  const safeRunId = input.runId.replace(/[^a-zA-Z0-9._-]/g, "-");
  const safeTaskId = input.taskId.replace(/[^a-zA-Z0-9._-]/g, "-");
  const safeTimestamp = input.nowValue.replace(/[^0-9A-Za-z]/g, "");
  const fileName = `supervisor-${String(input.cycle).padStart(2, "0")}-${safeRunId}-${safeTaskId}-${input.reviewRole}-${safeTimestamp}.json`;
  const filePath = path.join(input.reviewInputDir, fileName);
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        runId: input.runId,
        taskId: input.taskId,
        actor: input.actor,
        review: {
          reviewerRole: input.reviewRole,
          state: "passed",
          severity: "low",
          findings: []
        },
        supervisor: {
          kind: "local_supervisor",
          generatedAt: input.nowValue
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return path.relative(input.cwd, filePath) || path.basename(filePath);
}

export async function executeDaemonCommandFromArgs(
  args: readonly string[],
  options: ExecuteDaemonCommandOptions
): Promise<{ format: "json" | "text"; result: DaemonCommandResult }> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const format = resolveFormatFlag(args);
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;
  const maxCyclesValue = resolveCommandFlag(args, "--max-cycles") ?? "8";
  const maxCycles = Number.parseInt(maxCyclesValue, 10);
  const staleAfterHoursValue = resolveCommandFlag(args, "--stale-after-hours") ?? "24";
  const staleAfterHours = Number.parseInt(staleAfterHoursValue, 10);
  const codexBin = resolveCommandFlag(args, "--codex-bin") ?? env.DEVGOD_CODEX_BIN ?? "codex";
  const reviewInputDir = resolveDaemonReviewInputDir(args, { cwd, env });
  const operatorActionDir = resolveDaemonOperatorActionDir(args, { cwd, env });

  if (!workspaceSlug || !projectSlug) {
    throw new Error("daemon requires DEVGOD_WORKSPACE_SLUG and DEVGOD_PROJECT_SLUG or explicit flags");
  }
  if (!Number.isInteger(maxCycles) || maxCycles <= 0) {
    throw new Error(`Invalid --max-cycles value: ${maxCyclesValue}`);
  }
  if (!Number.isInteger(staleAfterHours) || staleAfterHours < 0) {
    throw new Error(`Invalid --stale-after-hours value: ${staleAfterHoursValue}`);
  }

  const runCodexTurn = options.runCodexTurn ?? runCodexTurnViaCli;
  const now = options.now ?? (() => new Date());

  const result = await withDaemonLock(cwd, async () => {
    const cycles: DaemonCycleRecord[] = [];
    let latestSessionId: string | undefined;
    const blockedResult = async (input: {
      blockerKind:
        | "bootstrapping"
        | "missing_active_runtime"
        | "review_queue"
        | "review_execution_unsupported"
        | "operator_required_continuation"
        | "workflow_proof_failure"
        | "runtime_blocked"
        | "recovery_required"
        | "runtime_task_missing"
        | "active_task_mismatch";
      reason: string;
      cycle: number;
      activeRunId: string | null;
      activeTaskId: string | null;
      directiveKind?: RunExecutionPlan["directive"]["kind"] | undefined;
      nextActions?: string[] | undefined;
      detailFiles?: {
        continuationStatus?: string | undefined;
        reviewQueueStatus?: string | undefined;
      } | undefined;
    }) => {
      await writeDaemonOperatorHandoff(cwd, {
        state: "blocked",
        blockerKind: input.blockerKind,
        reason: input.reason,
        workspaceSlug,
        projectSlug,
        activeRunId: input.activeRunId,
        activeTaskId: input.activeTaskId,
        sessionId: latestSessionId ?? null,
        cycle: input.cycle,
        directiveKind: input.directiveKind,
        nextActions: [...(input.nextActions ?? [])],
        detailFiles: { ...(input.detailFiles ?? {}) },
        updatedAt: now().toISOString()
      });

      return {
        authorityLabel: "derived_only" as const,
        workspaceSlug,
        projectSlug,
        status: "blocked" as const,
        reason: input.reason,
        activeRunId: input.activeRunId,
        activeTaskId: input.activeTaskId,
        sessionId: latestSessionId ?? null,
        cycles
      };
    };

    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      const projectContext = await options.getProjectContext({
        workspaceSlug,
        projectSlug
      });
      if (!projectContext) {
        return blockedResult({
          blockerKind: "bootstrapping",
          reason: `Project ${workspaceSlug}/${projectSlug} is not bootstrapped`,
          cycle,
          activeRunId: null,
          activeTaskId: null,
          nextActions: []
        });
      }

      const projectRuntimeState = await options.getProjectRuntimeState(projectContext.project.id);
      const activeRunId = projectRuntimeState?.activeRunId ?? null;
      const activeTaskId = projectRuntimeState?.activeTaskId ?? null;
      latestSessionId = latestSessionId ?? readDaemonSessionId(projectRuntimeState?.metadata);
      await clearDaemonContinuationStatus(cwd);
      await clearDaemonOperatorHandoff(cwd);

      if (!activeRunId || !activeTaskId) {
        if (cycles.length > 0) {
          return {
            authorityLabel: "derived_only" as const,
            workspaceSlug,
            projectSlug,
            status: "completed" as const,
            reason: "daemon reached an idle runtime state with no active task remaining",
            activeRunId,
            activeTaskId,
            sessionId: latestSessionId ?? null,
            cycles
          };
        }

        return blockedResult({
          blockerKind: "missing_active_runtime",
          reason: "daemon requires an active runtime run and task",
          cycle,
          activeRunId,
          activeTaskId,
          nextActions: []
        });
      }

      const loop = await executeLoopCommandFromArgs(
        [
          "--run-id",
          activeRunId,
          "--format",
          "json",
          "--stale-after-hours",
          String(staleAfterHours),
          "--apply-safe-recovery"
        ],
        options
      );
      const directive = loop.result.finalPlan.directive;
      const runDaemonCodexTurn = async (input: {
        directive: RunExecutionPlan["directive"];
        summaryAction: "run_codex_owner" | "run_codex_analysis";
        activeRunId: string;
        activeTaskId: string;
        operatorNotes?: string | undefined;
      }) => {
        const snapshot = await options.getStatusSnapshot(input.activeRunId);
        const taskRecord = snapshot.tasks.find((task) => task.packet.taskId === input.activeTaskId);
        if (!taskRecord) {
          cycles.push({
            cycle,
            directiveKind: input.directive.kind,
            action: "blocked",
            runId: input.activeRunId,
            taskId: input.activeTaskId,
            sessionId: latestSessionId ?? null,
            summary: "active runtime task is missing from the run snapshot"
          });

          return blockedResult({
            blockerKind: "runtime_task_missing",
            reason: "active runtime task is missing from the run snapshot",
            cycle,
            activeRunId: input.activeRunId,
            activeTaskId: input.activeTaskId,
            directiveKind: input.directive.kind,
            nextActions: []
          });
        }

        const prompt = buildDaemonTaskPrompt({
          directive: input.directive,
          taskId: input.activeTaskId,
          packet: taskRecord.packet,
          operatorNotes: input.operatorNotes
        });
        const codexTurn = await runCodexTurn({
          codexBin,
          cwd,
          env,
          prompt,
          sessionId: latestSessionId
        });

        latestSessionId = codexTurn.sessionId ?? latestSessionId;
        await options.saveProjectRuntimeState({
          projectId: projectRuntimeState?.projectId ?? projectContext.project.id,
          workspaceId: projectRuntimeState?.workspaceId ?? projectContext.workspace.id,
          activeRunId: input.activeRunId,
          activeTaskId: input.activeTaskId,
          taskQueue: projectRuntimeState?.taskQueue ?? buildDefaultTaskQueue(),
          productState: projectRuntimeState?.productState ?? buildDefaultProductState(),
          lastVerifiedRunId: projectRuntimeState?.lastVerifiedRunId,
          metadata: {
            ...(projectRuntimeState?.metadata ?? {}),
            devgodDaemon: {
              sessionId: latestSessionId,
              lastRunId: input.activeRunId,
              lastTaskId: input.activeTaskId,
              lastDirectiveKind: input.directive.kind,
              updatedAt: now().toISOString()
            }
          },
          createdAt: projectRuntimeState?.createdAt ?? now().toISOString(),
          updatedAt: now().toISOString()
        });

        cycles.push({
          cycle,
          directiveKind: input.directive.kind,
          action: input.summaryAction,
          runId: input.activeRunId,
          taskId: input.activeTaskId,
          sessionId: latestSessionId ?? null,
          summary: codexTurn.finalMessage?.slice(0, 160) || "codex turn executed"
        });

        return undefined;
      };
      const handleOperatorRequiredContinuation = async (input: {
        directive: Extract<RunExecutionPlan["directive"], { kind: "continue_analysis" }>;
        classification: ContinueAnalysisDirectiveClassification;
      }
      ): Promise<DaemonCommandResult | undefined> => {
        let queuedOperatorActions: DaemonOperatorActionQueueEntry[];
        let failedOperatorActions: FailedDaemonOperatorActionQueueEntry[];
        try {
          const queueState = await readDaemonOperatorActionQueueState(operatorActionDir);
          queuedOperatorActions = queueState.entries;
          failedOperatorActions = queueState.failedEntries;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cycles.push({
            cycle,
            directiveKind: input.directive.kind,
            action: "blocked",
            runId: activeRunId,
            taskId: activeTaskId,
            sessionId: latestSessionId ?? null,
            summary: `operator action queue error: ${message}`
          });

          return blockedResult({
            blockerKind: "operator_required_continuation",
            reason: `operator action queue error: ${message}`,
            cycle,
            activeRunId,
            activeTaskId,
            directiveKind: input.directive.kind,
            nextActions: [...input.directive.nextActions]
          });
        }

        if (failedOperatorActions.length > 0) {
          await archiveFailedDaemonOperatorActionQueueEntries(failedOperatorActions, cwd, now().toISOString());
        }

        const matchingOperatorAction = queuedOperatorActions.find((entry) =>
          matchesDaemonOperatorContinuationAction({
            entry,
            runId: activeRunId,
            taskId: activeTaskId,
            directive: input.directive,
            classification: input.classification
          })
        );

        if (matchingOperatorAction) {
          await archiveConsumedDaemonOperatorActionQueueEntries([matchingOperatorAction], cwd);
          const codexResult = await runDaemonCodexTurn({
            directive: input.directive,
            summaryAction: "run_codex_analysis",
            activeRunId,
            activeTaskId,
            operatorNotes: matchingOperatorAction.command.action.operatorNotes
          });
          return codexResult;
        }

        await writeDaemonContinuationStatus(cwd, {
          state: "blocked",
          directiveKind: "continue_analysis",
          executionMode: "operator_required",
          targetId: input.directive.targetId,
          source: input.directive.source,
          sourceId:
            input.classification.action?.kind === "resume_target"
              ? input.classification.action.sourceId
              : undefined,
          actionKind: input.classification.action?.kind,
          summary: input.classification.summary,
          nextActions: [...input.directive.nextActions],
          blockers: [...input.directive.blockers],
          updatedAt: now().toISOString()
        });
        cycles.push({
          cycle,
          directiveKind: input.directive.kind,
          action: "blocked",
          runId: activeRunId,
          taskId: activeTaskId,
          sessionId: latestSessionId ?? null,
          summary: input.classification.summary
        });

        return blockedResult({
          blockerKind: "operator_required_continuation",
          reason: input.classification.summary,
          cycle,
          activeRunId,
          activeTaskId,
          directiveKind: input.directive.kind,
          nextActions: [...input.directive.nextActions],
          detailFiles: {
            continuationStatus: ".devgod/work/daemon/continuation-status.json"
          }
        });
      };

      if (directive.kind === "complete") {
        const advanced = await executeAdvanceActiveTaskCommandFromArgs(
          [
            "--workspace-slug",
            workspaceSlug,
            "--project-slug",
            projectSlug,
            "--run-id",
            activeRunId,
            "--apply",
            "--format",
            "json"
          ],
          options
        );

        cycles.push({
          cycle,
          directiveKind: directive.kind,
          action: advanced.result.nextTaskId ? "advance_active_task" : "complete",
          runId: activeRunId,
          taskId: activeTaskId,
          sessionId: latestSessionId ?? null,
          summary: advanced.result.nextTaskId
            ? `advanced to ${advanced.result.nextTaskId}`
            : "advanced the final active task and closed the queue"
        });

        if (!advanced.result.nextTaskId) {
          const refreshedState = await options.getProjectRuntimeState(projectContext.project.id);
          return {
            authorityLabel: "derived_only" as const,
            workspaceSlug,
            projectSlug,
            status: "completed" as const,
            reason: "daemon advanced the final active task and no next task remains",
            activeRunId: refreshedState?.activeRunId ?? null,
            activeTaskId: refreshedState?.activeTaskId ?? null,
            sessionId: latestSessionId ?? null,
            cycles
          };
        }

        continue;
      }

      if (directive.kind === "dispatch_reviews") {
        if (!options.executeDirectiveStep) {
          cycles.push({
            cycle,
            directiveKind: directive.kind,
            action: "blocked",
            runId: activeRunId,
            taskId: activeTaskId,
            sessionId: latestSessionId ?? null,
            summary: "runtime surface does not support authenticated review execution"
          });

          return blockedResult({
            blockerKind: "review_execution_unsupported",
            reason: "required authenticated reviews block the active run",
            cycle,
            activeRunId,
            activeTaskId,
            directiveKind: directive.kind,
            nextActions: []
          });
        }

        let queuedReviewEntries: DaemonReviewQueueEntry[];
        let failedReviewEntries: FailedDaemonReviewQueueEntry[];
        try {
          const queueState = await readDaemonReviewQueueState(reviewInputDir);
          queuedReviewEntries = queueState.entries;
          failedReviewEntries = queueState.failedEntries;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cycles.push({
            cycle,
            directiveKind: directive.kind,
            action: "blocked",
            runId: activeRunId,
            taskId: activeTaskId,
            sessionId: latestSessionId ?? null,
            summary: `review input queue error: ${message}`
          });

          return blockedResult({
            blockerKind: "review_queue",
            reason: `review input queue error: ${message}`,
            cycle,
            activeRunId,
            activeTaskId,
            directiveKind: directive.kind,
            nextActions: []
          });
        }

        const expectedReviewTargets = directive.recommendations.map(
          (recommendation) => `${recommendation.taskId}:${recommendation.targetReviewRole ?? "unknown"}`
        );
        if (failedReviewEntries.length > 0) {
          const timestamp = now().toISOString();
          await archiveFailedDaemonReviewQueueEntries(failedReviewEntries, cwd, timestamp);
          await writeDaemonReviewQueueStatus(cwd, {
            state: "failed",
            reviewInputDir,
            reason: `${failedReviewEntries.length} queued review action file(s) were invalid and moved to failed-review-actions`,
            expectedReviewTargets,
            queuedFiles: queuedReviewEntries.map((entry) => path.basename(entry.filePath)),
            failedFiles: failedReviewEntries.map((entry) => ({
              file: path.basename(entry.filePath),
              error: entry.error
            })),
            updatedAt: timestamp
          });
        }

        if (queuedReviewEntries.length === 0) {
          await writeDaemonReviewQueueStatus(cwd, {
            state: failedReviewEntries.length > 0 ? "failed" : "blocked",
            reviewInputDir,
            reason: `required authenticated reviews are pending; no usable review action files were found in ${reviewInputDir}`,
            expectedReviewTargets,
            failedFiles: failedReviewEntries.map((entry) => ({
              file: path.basename(entry.filePath),
              error: entry.error
            })),
            updatedAt: now().toISOString()
          });
          cycles.push({
            cycle,
            directiveKind: directive.kind,
            action: "blocked",
            runId: activeRunId,
            taskId: activeTaskId,
            sessionId: latestSessionId ?? null,
            summary: `required authenticated reviews are pending; no review action files were found in ${reviewInputDir}`
          });

          return blockedResult({
            blockerKind: "review_queue",
            reason: "required authenticated reviews block the active run",
            cycle,
            activeRunId,
            activeTaskId,
            directiveKind: directive.kind,
            nextActions: [],
            detailFiles: {
              reviewQueueStatus: ".devgod/work/daemon/review-queue-status.json"
            }
          });
        }

        const executionResult = await options.executeDirectiveStep(activeRunId, {
          staleAfterHours,
          reviewCommands: queuedReviewEntries.map((entry) => entry.command)
        });

        const consumedEntries: DaemonReviewQueueEntry[] = [];
        const staleEntries: StaleDaemonReviewQueueEntry[] = [];
        for (const step of executionResult.steps) {
          if (
            step.directiveKind !== "dispatch_reviews" ||
            step.outcome !== "executed" ||
            !step.taskId ||
            !step.reviewRole
          ) {
            continue;
          }

          const matchIndex = queuedReviewEntries.findIndex(
            (entry) =>
              entry.command.runId === activeRunId &&
              entry.command.taskId === step.taskId &&
              entry.command.review.reviewerRole === step.reviewRole &&
              (step.actor ? entry.command.actor === step.actor : true)
          );
          if (matchIndex >= 0) {
            const [consumed] = queuedReviewEntries.splice(matchIndex, 1);
            consumedEntries.push(consumed);
          }

          cycles.push({
            cycle,
            directiveKind: directive.kind,
            action: "record_review",
            runId: activeRunId,
            taskId: step.taskId,
            sessionId: latestSessionId ?? null,
            summary: `recorded ${step.reviewRole}${step.actor ? ` via ${step.actor}` : ""}`
          });
        }

        if (consumedEntries.length > 0) {
          await archiveConsumedDaemonReviewQueueEntries(consumedEntries, cwd);
        }

        if (queuedReviewEntries.length > 0) {
          staleEntries.push(
            ...queuedReviewEntries.map((entry) => ({
              filePath: entry.filePath,
              reason: "queued review action no longer matched the active runtime review directives"
            }))
          );
          await archiveStaleDaemonReviewQueueEntries(
            staleEntries,
            cwd,
            now().toISOString(),
            expectedReviewTargets
          );
          queuedReviewEntries = [];
        }

        if (!executionResult.steps.some((step) => step.directiveKind === "dispatch_reviews" && step.outcome === "executed")) {
          const unsupportedStep = executionResult.steps.find((step) => step.directiveKind === "dispatch_reviews");
          const mismatchReason =
            staleEntries.length > 0
              ? `queued review actions did not match the pending runtime review directives from ${reviewInputDir}`
              : undefined;
          const detailedReason =
            unsupportedStep?.evidence.join(" | ") ||
            `queued review actions did not match the pending runtime review directives from ${reviewInputDir}`;
          await writeDaemonReviewQueueStatus(cwd, {
            state: "blocked",
            reviewInputDir,
            reason: mismatchReason ? `${mismatchReason}: ${detailedReason}` : detailedReason,
            expectedReviewTargets,
            queuedFiles: queuedReviewEntries.map((entry) => path.basename(entry.filePath)),
            failedFiles: failedReviewEntries.map((entry) => ({
              file: path.basename(entry.filePath),
              error: entry.error
            })),
            staleFiles: staleEntries.map((entry) => ({
              file: path.basename(entry.filePath),
              reason: entry.reason
            })),
            updatedAt: now().toISOString()
          });
          cycles.push({
            cycle,
            directiveKind: directive.kind,
            action: "blocked",
            runId: activeRunId,
            taskId: activeTaskId,
            sessionId: latestSessionId ?? null,
            summary:
              mismatchReason ? `${mismatchReason}: ${detailedReason}` : detailedReason
          });

          return blockedResult({
            blockerKind: "review_queue",
            reason: "required authenticated reviews block the active run",
            cycle,
            activeRunId,
            activeTaskId,
            directiveKind: directive.kind,
            nextActions: [],
            detailFiles: {
              reviewQueueStatus: ".devgod/work/daemon/review-queue-status.json"
            }
          });
        }

        await writeDaemonReviewQueueStatus(cwd, {
          state: "processed",
          reviewInputDir,
          reason: "queued authenticated review actions were applied",
          expectedReviewTargets,
          consumedFiles: consumedEntries.map((entry) => path.basename(entry.filePath)),
          queuedFiles: queuedReviewEntries.map((entry) => path.basename(entry.filePath)),
          failedFiles: failedReviewEntries.map((entry) => ({
            file: path.basename(entry.filePath),
            error: entry.error
          })),
          staleFiles: staleEntries.map((entry) => ({
            file: path.basename(entry.filePath),
            reason: entry.reason
          })),
          updatedAt: now().toISOString()
        });

        continue;
      }

      if (directive.kind === "blocked" || directive.kind === "apply_recovery") {
        cycles.push({
          cycle,
          directiveKind: directive.kind,
          action: "blocked",
          runId: activeRunId,
          taskId: activeTaskId,
          sessionId: latestSessionId ?? null,
          summary:
            directive.kind === "blocked"
              ? directive.blockers.join(" | ") || "runtime reported no executable next step"
              : "runtime still requires explicit recovery before the daemon can continue"
        });

        return blockedResult({
          blockerKind: directive.kind === "blocked" ? "runtime_blocked" : "recovery_required",
          reason:
            directive.kind === "blocked"
              ? "runtime reported no executable next step"
              : "safe recovery could not clear the active runtime blockers",
          cycle,
          activeRunId,
          activeTaskId,
          directiveKind: directive.kind,
          nextActions: []
        });
      }

      if (directive.kind === "continue_analysis") {
        if (options.executeDirectiveStep) {
          const executionResult = await options.executeDirectiveStep(activeRunId, {
            staleAfterHours,
            reviewCommands: []
          });
          const continueStep = executionResult.steps.find((step) => step.directiveKind === "continue_analysis");

          if (continueStep?.outcome === "executed") {
            cycles.push({
              cycle,
              directiveKind: directive.kind,
              action: "apply_runtime_continuation",
              runId: activeRunId,
              taskId: continueStep.taskId ?? activeTaskId,
              sessionId: latestSessionId ?? null,
              summary: continueStep.evidence.join(" | ") || "runtime continuation executed"
            });
            continue;
          }

          if (continueStep?.outcome === "unsupported") {
            const snapshot = await options.getStatusSnapshot(activeRunId);
            const classification = classifyContinueAnalysisDirective({
              directive,
              state: snapshot.autonomousExecution?.state
            });
            if (classification.executionMode === "operator_required") {
              const handled = await handleOperatorRequiredContinuation({
                directive,
                classification
              });
              if (handled) {
                return handled;
              }
              continue;
            }
          }
        }

        const workflowProofTaskId = resolveDaemonWorkflowProofTaskId(directive);
        if (workflowProofTaskId) {
          try {
            await executeWorkflowProofCommandFromArgs(
              ["--run-id", activeRunId, "--task-id", workflowProofTaskId],
              {
                env,
                getStatusSnapshot: options.getStatusSnapshot,
                getReviews: options.getReviews,
                getApprovals: options.getApprovals
              }
            );

            const closedGapCount = await closeWorkflowProofCoverageGaps(activeRunId, workflowProofTaskId, {
              getStatusSnapshot: options.getStatusSnapshot,
              upsertCoverageGaps: options.upsertCoverageGaps
            });

            cycles.push({
              cycle,
              directiveKind: directive.kind,
              action: "run_workflow_proof",
              runId: activeRunId,
              taskId: workflowProofTaskId,
              sessionId: latestSessionId ?? null,
              summary:
                closedGapCount > 0
                  ? `workflow proof passed for ${workflowProofTaskId}; closed ${closedGapCount} autonomous gap(s)`
                  : `workflow proof passed for ${workflowProofTaskId}`
            });
            continue;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            cycles.push({
              cycle,
              directiveKind: directive.kind,
              action: "blocked",
              runId: activeRunId,
              taskId: workflowProofTaskId,
              sessionId: latestSessionId ?? null,
              summary: message
            });

            return blockedResult({
              blockerKind: "workflow_proof_failure",
              reason: message,
              cycle,
              activeRunId,
              activeTaskId,
              directiveKind: directive.kind,
              nextActions: []
            });
          }
        }
      }

      if (directive.kind === "continue_analysis") {
        const snapshot = await options.getStatusSnapshot(activeRunId);
        const classification = classifyContinueAnalysisDirective({
          directive,
          state: snapshot.autonomousExecution?.state
        });
        if (classification.executionMode === "operator_required") {
          const handled = await handleOperatorRequiredContinuation({
            directive,
            classification
          });
          if (handled) {
            return handled;
          }
          continue;
        }
      }

      if (directive.kind === "dispatch_owner" && directive.recommendation.taskId !== activeTaskId) {
        cycles.push({
          cycle,
          directiveKind: directive.kind,
          action: "blocked",
          runId: activeRunId,
          taskId: activeTaskId,
          sessionId: latestSessionId ?? null,
          summary: `runtime wants ${directive.recommendation.taskId} but active task is ${activeTaskId}`
        });

        return blockedResult({
          blockerKind: "active_task_mismatch",
          reason: "runtime active-task pointer does not match the owner dispatch target",
          cycle,
          activeRunId,
          activeTaskId,
          directiveKind: directive.kind,
          nextActions: []
        });
      }

      const codexResult = await runDaemonCodexTurn({
        directive,
        summaryAction: directive.kind === "dispatch_owner" ? "run_codex_owner" : "run_codex_analysis",
        activeRunId,
        activeTaskId
      });
      if (codexResult) {
        return codexResult;
      }
    }

    const projectContext = await options.getProjectContext({
      workspaceSlug,
      projectSlug
    });
    const runtimeState = projectContext
      ? await options.getProjectRuntimeState(projectContext.project.id)
      : undefined;

    return {
      authorityLabel: "derived_only" as const,
      workspaceSlug,
      projectSlug,
      status: "max_cycles_reached" as const,
      reason: `daemon stopped after reaching the configured cycle budget (${maxCycles})`,
      activeRunId: runtimeState?.activeRunId ?? null,
      activeTaskId: runtimeState?.activeTaskId ?? null,
      sessionId: latestSessionId ?? null,
      cycles
    };
  });

  return {
    format,
    result
  };
}

export async function executeSupervisorCommandFromArgs(
  args: readonly string[],
  options: ExecuteSupervisorCommandOptions
): Promise<{ format: "json" | "text"; result: SupervisorCommandResult }> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const format = resolveFormatFlag(args);
  const workspaceSlug = resolveCommandFlag(args, "--workspace-slug") ?? env.DEVGOD_WORKSPACE_SLUG;
  const projectSlug = resolveCommandFlag(args, "--project-slug") ?? env.DEVGOD_PROJECT_SLUG;
  const maxSupervisorCyclesValue = resolveCommandFlag(args, "--max-supervisor-cycles") ?? "4";
  const maxSupervisorCycles = Number.parseInt(maxSupervisorCyclesValue, 10);
  const operatorActionDir = resolveDaemonOperatorActionDir(args, { cwd, env });
  const reviewActorBindings = parseSupervisorReviewActorBindings(args, env);
  const operatorNotesOverride =
    resolveCommandFlag(args, "--operator-notes") ?? env.DEVGOD_SUPERVISOR_OPERATOR_NOTES;
  const historyRetentionLimit = resolveSupervisorHistoryRetentionLimit(args, env);
  const now = options.now ?? (() => new Date());

  if (!workspaceSlug || !projectSlug) {
    throw new Error("supervisor requires DEVGOD_WORKSPACE_SLUG and DEVGOD_PROJECT_SLUG or explicit flags");
  }
  if (!Number.isInteger(maxSupervisorCycles) || maxSupervisorCycles <= 0) {
    throw new Error(`Invalid --max-supervisor-cycles value: ${maxSupervisorCyclesValue}`);
  }

  const daemonRuns: DaemonCommandResult[] = [];
  const actions: SupervisorActionRecord[] = [];
  const finalize = async (input: {
    status: SupervisorCommandResult["status"];
    reason: string;
    activeRunId: string | null;
    activeTaskId: string | null;
    sessionId: string | null;
    blockerKind?:
      | "missing_review_actor_bindings"
      | "handoff_missing"
      | "unsupported_handoff"
      | "continuation_derivation_failed"
      | "review_derivation_failed"
      | undefined;
    nextActions?: string[] | undefined;
    missingReviewRoles?: string[] | undefined;
  }): Promise<{ format: "json" | "text"; result: SupervisorCommandResult }> => {
    const result: SupervisorCommandResult = {
      authorityLabel: "derived_only",
      workspaceSlug,
      projectSlug,
      status: input.status,
      reason: input.reason,
      activeRunId: input.activeRunId,
      activeTaskId: input.activeTaskId,
      sessionId: input.sessionId,
      daemonRuns,
      actions
    };
    await writeDaemonSupervisorStatus(cwd, {
      state: input.status,
      blockerKind: input.blockerKind,
      reason: input.reason,
      workspaceSlug,
      projectSlug,
      activeRunId: input.activeRunId,
      activeTaskId: input.activeTaskId,
      sessionId: input.sessionId,
      supervisorCycles: daemonRuns.length,
      nextActions: [...(input.nextActions ?? [])],
      missingReviewRoles: [...(input.missingReviewRoles ?? [])],
      actions,
      updatedAt: now().toISOString()
    });
    await appendDaemonSupervisorHistory(cwd, {
      recordedAt: now().toISOString(),
      state: input.status,
      blockerKind: input.blockerKind,
      reason: input.reason,
      workspaceSlug,
      projectSlug,
      activeRunId: input.activeRunId,
      activeTaskId: input.activeTaskId,
      sessionId: input.sessionId,
      supervisorCycles: daemonRuns.length,
      nextActions: [...(input.nextActions ?? [])],
      missingReviewRoles: [...(input.missingReviewRoles ?? [])],
      actions
    }, historyRetentionLimit);
    return {
      format,
      result
    };
  };

  for (let cycle = 1; cycle <= maxSupervisorCycles; cycle += 1) {
    const daemonResult = await executeDaemonCommandFromArgs(args, options);
    daemonRuns.push(daemonResult.result);

    if (daemonResult.result.status !== "blocked") {
      return finalize({
        status: daemonResult.result.status,
        reason: daemonResult.result.reason,
        activeRunId: daemonResult.result.activeRunId,
        activeTaskId: daemonResult.result.activeTaskId,
        sessionId: daemonResult.result.sessionId
      });
    }

    const handoff = await readDaemonOperatorHandoff(cwd);
    if (!handoff || handoff.state !== "blocked") {
      return finalize({
        status: "blocked",
        blockerKind: "handoff_missing",
        reason: daemonResult.result.reason,
        activeRunId: daemonResult.result.activeRunId,
        activeTaskId: daemonResult.result.activeTaskId,
        sessionId: daemonResult.result.sessionId
      });
    }

    if (handoff.blockerKind === "review_queue") {
      const reviewQueueStatus = await readDaemonReviewQueueStatus(cwd);
      if (
        !reviewQueueStatus ||
        reviewQueueStatus.state === "invalid" ||
        !reviewQueueStatus.reviewInputDir ||
        !handoff.activeRunId
      ) {
        return finalize({
          status: "blocked",
          blockerKind: "review_derivation_failed",
          reason: "supervisor could not derive trusted review actions from the daemon review-queue handoff",
          activeRunId: handoff.activeRunId ?? daemonResult.result.activeRunId,
          activeTaskId: handoff.activeTaskId ?? daemonResult.result.activeTaskId,
          sessionId: handoff.sessionId ?? daemonResult.result.sessionId
        });
      }

      const pendingTargets = reviewQueueStatus.expectedReviewTargets
        .map((target) => ({ raw: target, parsed: parseExpectedReviewTarget(target) }))
        .filter(
          (target): target is { raw: string; parsed: { taskId: string; reviewRole: ReviewRecord["reviewerRole"] } } =>
            target.parsed !== undefined
        );
      if (pendingTargets.length === 0) {
        return finalize({
          status: "blocked",
          blockerKind: "review_derivation_failed",
          reason: reviewQueueStatus.reason,
          activeRunId: handoff.activeRunId ?? daemonResult.result.activeRunId,
          activeTaskId: handoff.activeTaskId ?? daemonResult.result.activeTaskId,
          sessionId: handoff.sessionId ?? daemonResult.result.sessionId
        });
      }

      const missingRoles = pendingTargets
        .map((target) => target.parsed.reviewRole)
        .filter((role, index, array) => array.indexOf(role) === index)
        .filter((role) => !reviewActorBindings[role]);
      if (missingRoles.length > 0) {
        return finalize({
          status: "blocked",
          blockerKind: "missing_review_actor_bindings",
          reason: `supervisor is missing review actor bindings for: ${missingRoles.join(", ")}`,
          activeRunId: handoff.activeRunId ?? daemonResult.result.activeRunId,
          activeTaskId: handoff.activeTaskId ?? daemonResult.result.activeTaskId,
          sessionId: handoff.sessionId ?? daemonResult.result.sessionId,
          nextActions: missingRoles.map((role) => `provide --review-actor ${role}=<actor>`),
          missingReviewRoles: missingRoles
        });
      }

      const nowValue = now().toISOString();
      for (const target of pendingTargets) {
        const actor = reviewActorBindings[target.parsed.reviewRole]!;
        const filePath = await writeSupervisorReviewAction({
          cwd,
          reviewInputDir: reviewQueueStatus.reviewInputDir,
          runId: handoff.activeRunId,
          taskId: target.parsed.taskId,
          reviewRole: target.parsed.reviewRole,
          actor,
          cycle,
          nowValue
        });
        actions.push({
          cycle,
          action: "enqueue_review_action",
          taskId: target.parsed.taskId,
          reviewRole: target.parsed.reviewRole,
          filePath,
          summary: `queued trusted ${target.parsed.reviewRole} review action via ${actor}`
        });
      }
      continue;
    }

    if (handoff.blockerKind !== "operator_required_continuation") {
      return finalize({
        status: "blocked",
        blockerKind: "unsupported_handoff",
        reason: handoff.reason,
        activeRunId: handoff.activeRunId ?? daemonResult.result.activeRunId,
        activeTaskId: handoff.activeTaskId ?? daemonResult.result.activeTaskId,
        sessionId: handoff.sessionId ?? daemonResult.result.sessionId,
        nextActions: [...handoff.nextActions]
      });
    }

    const continuationStatus = await readDaemonContinuationStatus(cwd);
    if (
      !continuationStatus ||
      continuationStatus.state !== "blocked" ||
      continuationStatus.executionMode !== "operator_required" ||
      !continuationStatus.targetId ||
      !continuationStatus.source ||
      !handoff.activeRunId ||
      !handoff.activeTaskId
    ) {
      return finalize({
        status: "blocked",
        blockerKind: "continuation_derivation_failed",
        reason: "supervisor could not derive a trusted operator continuation action from the daemon handoff",
        activeRunId: handoff.activeRunId ?? daemonResult.result.activeRunId,
        activeTaskId: handoff.activeTaskId ?? daemonResult.result.activeTaskId,
        sessionId: handoff.sessionId ?? daemonResult.result.sessionId
      });
    }

    const summary = buildSupervisorOperatorNotes({
      targetId: continuationStatus.targetId,
      summary: continuationStatus.summary,
      nextActions: continuationStatus.nextActions,
      override: operatorNotesOverride
    });
    const nowValue = now().toISOString();
    const filePath = await writeSupervisorOperatorContinuationAction({
      cwd,
      operatorActionDir,
      runId: handoff.activeRunId,
      taskId: handoff.activeTaskId,
      targetId: continuationStatus.targetId,
      source: continuationStatus.source,
      sourceId: continuationStatus.sourceId,
      operatorNotes: summary,
      cycle,
      nowValue
    });
    actions.push({
      cycle,
      action: "enqueue_operator_continuation",
      targetId: continuationStatus.targetId,
      filePath,
      summary
    });
  }

  const latestRun = daemonRuns.at(-1);
  return finalize({
    status: "max_cycles_reached",
    reason: `supervisor stopped after reaching the configured cycle budget (${maxSupervisorCycles})`,
    activeRunId: latestRun?.activeRunId ?? null,
    activeTaskId: latestRun?.activeTaskId ?? null,
    sessionId: latestRun?.sessionId ?? null
  });
}

export async function executeSupervisorHistoryCommandFromArgs(
  args: readonly string[],
  options: ExecuteSupervisorHistoryCommandOptions
): Promise<{ format: "json" | "text"; result: SupervisorHistoryCommandResult }> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const format = resolveFormatFlag(args);
  const scopeValue =
    resolveCommandFlag(args, "--daemon-supervisor-history-scope") ??
    env.DEVGOD_DAEMON_SUPERVISOR_HISTORY_SCOPE ??
    "run";

  if (scopeValue !== "run" && scopeValue !== "all") {
    throw new Error(`Invalid --daemon-supervisor-history-scope value: ${scopeValue}`);
  }

  const resolvedRunId =
    scopeValue === "run"
      ? await resolveRunIdForCommand(args, {
          env,
          findLatestRun: options.findLatestRun
        })
      : undefined;
  const historyOptions = resolveDaemonSupervisorHistoryReadOptions(args, env, resolvedRunId ?? "unknown");
  const historyResult = await readDaemonSupervisorHistory(cwd, historyOptions);
  const latestStatus = await readDaemonSupervisorStatus(cwd, {
    scope: "all",
    limit: 0
  });

  return {
    format,
    result: {
      authorityLabel: "derived_only",
      historyPath: ".devgod/work/daemon/supervisor-history.jsonl",
      scope: historyOptions.scope,
      runId: historyOptions.scope === "run" ? historyOptions.runId : undefined,
      retainedCount: historyResult.retainedCount,
      filteredCount: historyResult.filteredCount,
      returnedCount: historyResult.entries.length,
      truncated: historyResult.filteredCount > historyResult.entries.length,
      entries: historyResult.entries,
      latestStatus:
        latestStatus &&
        (historyOptions.scope === "all" || !historyOptions.runId || latestStatus.activeRunId === historyOptions.runId)
          ? {
              state: latestStatus.state,
              blockerKind: latestStatus.blockerKind,
              reason: latestStatus.reason,
              activeRunId: latestStatus.activeRunId,
              activeTaskId: latestStatus.activeTaskId,
              sessionId: latestStatus.sessionId,
              supervisorCycles: latestStatus.supervisorCycles,
              updatedAt: latestStatus.updatedAt
            }
          : undefined
    }
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

async function daemonCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, result } = await executeDaemonCommandFromArgs(args, {
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
          executeContinuationAction: createSupportedContinuationExecutor({
            env: process.env,
            getStatusSnapshot(candidateRunId) {
              return service.getStatus(candidateRunId);
            },
            getReviews(candidateRunId, taskId) {
              return store.getReviews(candidateRunId, taskId);
            },
            getApprovals(candidateRunId, taskId) {
              return store.getApprovals(candidateRunId, taskId);
            },
            upsertCoverageGaps(candidateRunId, gaps) {
              return service.upsertCoverageGaps(candidateRunId, gaps);
            },
            recordProgressProof(candidateRunId, proof) {
              return service.recordProgressProof(candidateRunId, proof);
            },
            checkpointRun(candidateRunId, checkpoint, checkpointOptions) {
              return service.checkpointRun(candidateRunId, checkpoint, checkpointOptions);
            }
          }),
          ...(executeReviewRecommendation ? { executeReviewRecommendation } : {})
        });
      },
      upsertCoverageGaps(runId, gaps) {
        return service.upsertCoverageGaps(runId, gaps);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    });

    if (format === "text") {
      process.stdout.write(`${formatDaemonCommandResult(result)}\n`);
      return;
    }

    console.log(JSON.stringify(result));
  });
}

async function supervisorCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
    const { format, result } = await executeSupervisorCommandFromArgs(args, {
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
          executeContinuationAction: createSupportedContinuationExecutor({
            env: process.env,
            getStatusSnapshot(candidateRunId) {
              return service.getStatus(candidateRunId);
            },
            getReviews(candidateRunId, taskId) {
              return store.getReviews(candidateRunId, taskId);
            },
            getApprovals(candidateRunId, taskId) {
              return store.getApprovals(candidateRunId, taskId);
            },
            upsertCoverageGaps(candidateRunId, gaps) {
              return service.upsertCoverageGaps(candidateRunId, gaps);
            },
            recordProgressProof(candidateRunId, proof) {
              return service.recordProgressProof(candidateRunId, proof);
            },
            checkpointRun(candidateRunId, checkpoint, checkpointOptions) {
              return service.checkpointRun(candidateRunId, checkpoint, checkpointOptions);
            }
          }),
          ...(executeReviewRecommendation ? { executeReviewRecommendation } : {})
        });
      },
      upsertCoverageGaps(runId, gaps) {
        return service.upsertCoverageGaps(runId, gaps);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    });

    if (format === "text") {
      process.stdout.write(`${formatSupervisorCommandResult(result)}\n`);
      return;
    }

    console.log(JSON.stringify(result));
  });
}

async function supervisorHistoryCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const store = new PostgresStore(client);
    const { format, result } = await executeSupervisorHistoryCommandFromArgs(args, {
      cwd: process.cwd(),
      env: process.env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      }
    });

    if (format === "text") {
      process.stdout.write(`${formatSupervisorHistoryCommandResult(result)}\n`);
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

  if (command === "coverage") {
    await coverageCommand(args);
    return;
  }

  if (command === "gaps") {
    await gapsCommand(args);
    return;
  }

  if (command === "checkpoint") {
    await checkpointCommand(args);
    return;
  }

  if (command === "resume") {
    await resumeCommand(args);
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

  if (command === "daemon") {
    await daemonCommand(args);
    return;
  }

  if (command === "supervisor") {
    await supervisorCommand(args);
    return;
  }

  if (command === "supervisor-history") {
    await supervisorHistoryCommand(args);
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
