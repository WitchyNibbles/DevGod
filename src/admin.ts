import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runEmbeddingJobs, type EmbeddingProvider } from "./runtime/embedding-runner.ts";
import { indexRepoMarkdown } from "./runtime/repo-markdown-indexer.ts";
import { loadDotEnv, withClient } from "./admin/db.ts";
import { buildOperatorStatusReport, type ReviewIdentityStatusObservation } from "./admin/status.ts";
import { isGateReviewRole, isReviewSeverity, isReviewState } from "./domain/contracts.ts";
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
import type { ReviewInput, ReviewRecord, RunStatusSnapshot, TaskStatus } from "./domain/types.ts";
import { PostgresStore } from "./store/postgres-store.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
type EnvShape = NodeJS.ProcessEnv;

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

async function createReviewIdentityAdapter(options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}): Promise<ReviewPrincipalAdapter<unknown>> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const adapterModulePath = env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  if (!adapterModulePath) {
    return createReviewIdentityFixtureAdapter();
  }

  const resolvedPath = path.isAbsolute(adapterModulePath)
    ? adapterModulePath
    : path.resolve(cwd, adapterModulePath);
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

async function createLiveReviewIdentityAdapter(options: {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
} = {}): Promise<{
  adapter: ReviewPrincipalAdapter<unknown>;
  modulePath: string;
}> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const adapterModulePath = env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  if (!adapterModulePath) {
    throw new Error("DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE is required for record-review");
  }

  const modulePath = path.isAbsolute(adapterModulePath)
    ? adapterModulePath
    : path.resolve(cwd, adapterModulePath);

  return {
    adapter: await createReviewIdentityAdapter({ cwd, env }),
    modulePath
  };
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
  principal: AuthenticatedPrincipal;
  review: ReviewRecord;
  blockers: string[];
  taskStatus: TaskStatus;
}

interface ExecuteRecordReviewCommandOptions {
  adapter: ReviewPrincipalAdapter<unknown>;
  adapterModulePath: string;
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
  }>) | undefined;
  recordReview: ExecuteRecordReviewCommandOptions["recordReview"];
}

interface ExecuteStatusCommandOptions {
  cwd?: string | undefined;
  env?: EnvShape | undefined;
  inspectReviewIdentity?: (() => Promise<ReviewIdentityStatusObservation>) | undefined;
  getStatusSnapshot: (runId: string) => Promise<RunStatusSnapshot>;
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

  if (!adapterConfigured) {
    notes.push("adapter module not configured");
  } else if (!adapterExists) {
    notes.push("adapter module path does not exist");
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
    bindingsPresent,
    bindingsPath,
    bindingsUseShippedTemplate,
    liveTrustReady:
      adapterConfigured &&
      adapterExists &&
      bindingsPresent &&
      !bindingsUseShippedTemplate &&
      !bindingsUsePlaceholderTemplate &&
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

  return executeRecordReviewCommand(command, {
    adapter: liveAdapter.adapter,
    adapterModulePath: liveAdapter.modulePath,
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
  const runId = resolveCommandFlag(args, "--run-id");
  if (!runId) {
    throw new Error("status requires --run-id <run-id>");
  }

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
  const snapshot = await options.getStatusSnapshot(runId);

  return buildOperatorStatusReport({
    snapshot,
    reviewIdentity,
    staleAfterDays
  });
}

async function statusCommand(args: readonly string[]) {
  await withClient(async (client) => {
    const service = new DevgodCoreService(new PostgresStore(client));
    const report = await executeStatusCommandFromArgs(args, {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      }
    });
    console.log(JSON.stringify(report));
  });
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
