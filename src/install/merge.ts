import TOML from "@iarna/toml";

const AGENTS_BEGIN = "<!-- BEGIN DEVGOD MANAGED -->";
const AGENTS_END = "<!-- END DEVGOD MANAGED -->";
const workflowContractBlock = `<!-- devgod-workflow-contract:start -->
workflow=devgod
workflow_runtime=postgres
active_run_pointer=project_runtime_state.active_run_id
active_task_pointer=project_runtime_state.active_task_id
workflow_documents=workflow_documents
task_queue=project_runtime_state.task_queue
product_state=project_runtime_state.product_state
required_review_roles=reviewer,qa_engineer,security_reviewer
release_candidate_quality_gate=release_readiness_required
review_authority=runtime_authenticated_only
workflow_check=node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts workflow-proof --run-id latest --task-id <task-id>
workflow_check_scope=runtime_authority_only
review_artifact_trust=runtime_records_only
ci_scope=runtime_contract_and_export_regressions
local_live_check=bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]
<!-- devgod-workflow-contract:end -->`;

const managedAgentsBlock = `${AGENTS_BEGIN}
## devgod

- treat \`devgod\` as implicitly invoked on every prompt unless the user explicitly opts out
- treat substantive requests as devgod work by default unless the user opts out
- use \`devgod-intake\` as the default first skill for substantive work
- keep canonical workflow state in runtime records, not repo markdown files
- if devgod is not configured yet, run setup first

## Workflow contract

The block below is the canonical runtime contract.

${workflowContractBlock}

## Department Workflow

- root Codex thread acts as engineering manager on first contact
- manager/root stays shallow: at most two inspections before trivial handling or bounded investigation
- manager/root must clarify ambiguous intent before planning with concise targeted questions or explicit assumptions
- on the first substantive ask, clarify outcome, user, constraints/non-goals, and done criteria unless explicit assumptions are enough
- task packets that inherit a brief or plan must carry explicit workflow artifact refs; only use \`review_exports=runtime_optional\` when runtime authority covers the review gate
- keep \`devgod\` as the default workflow controller even when other tools are available
- when the optional Grafana MCP server is configured, use Grafana logs as advisory debugging and research evidence
- route evidence to \`solution_architect\`, then \`planner\`, then the named specialist owner
- use \`git_operator\` for staging, commit slicing, and commit-message prep when git work is required
- use runtime-backed devgod commands for proof, status, and task advancement
- substantive work completes only after \`reviewer\`, \`qa_engineer\`, and \`security_reviewer\` gates plus runtime workflow proof

## Autonomy Loop

- for full-project or multi-phase requests, \`devgod\` must operate as a continuing delivery loop
- the manager must not stop after intake, planning, or one implementation slice unless product-level acceptance is complete, a real blocker needs user input, verification cannot proceed after documented repair attempts, or the user asked for planning only
- scale, latency, or item volume are not blockers by themselves when the work can be chunked, checkpointed, and resumed
- do not wait for the user to say continue between internal tasks; keep executing until the product-level stop condition is met
- long-running but tractable work must persist concrete progress and continue instead of stopping with a partial-summary handoff
- after each completed task, update runtime product state, update runtime task queue, advance the active task pointer, select the next unblocked task, and continue execution
- a completed phase is not a completed product

## Git hygiene

- in consuming repos, \`git_operator\` must not stage \`.devgod/\`, \`.agents/\`, \`.codex/\`, or \`AGENTS.md\` unless the task explicitly targets devgod/control-layer installation or maintenance
- commits should stay atomic and use brief conventional messages that describe the committed slice

${AGENTS_END}`;

interface GitNexusInstallSettings {
  withGitNexus?: boolean;
  withGrafana?: boolean;
  gitNexusPackageVersion?: string;
}

const enforcedCodexConfigKeys = ["approval_policy", "sandbox_mode"] as const;

function normalizeManagedCodexConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...config };
  const features =
    normalized.features &&
    typeof normalized.features === "object" &&
    !Array.isArray(normalized.features)
      ? { ...(normalized.features as Record<string, unknown>) }
      : undefined;

  if (features?.plugin_hooks === true && normalized.suppress_unstable_features_warning === undefined) {
    normalized.suppress_unstable_features_warning = true;
  }

  if (features) {
    normalized.features = features;
  }

  return normalized;
}

function sortObjectKeys<T>(value: T): T {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => [key, sortObjectKeys(nestedValue)]);

  return Object.fromEntries(entries) as T;
}

export function mergeAgentsMd(existingContent: string | undefined): string {
  if (!existingContent || existingContent.trim().length === 0) {
    return managedAgentsBlock;
  }

  const blockPattern = new RegExp(`${AGENTS_BEGIN}[\\s\\S]*?${AGENTS_END}`, "m");
  if (blockPattern.test(existingContent)) {
    return existingContent.replace(blockPattern, managedAgentsBlock);
  }

  return `${existingContent.trimEnd()}\n\n${managedAgentsBlock}\n`;
}

function ensureStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function mergeTomlTable(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const targetValue = merged[key];

    if (targetValue === undefined) {
      merged[key] = value;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      merged[key] = mergeTomlTable(
        targetValue as Record<string, unknown>,
        value as Record<string, unknown>
      );
    }
  }

  return merged;
}

function omitGitNexusMcpServer(
  config: Record<string, unknown>
): Record<string, unknown> {
  const normalized = normalizeManagedCodexConfig(config);
  const mcpServers =
    normalized.mcp_servers &&
    typeof normalized.mcp_servers === "object" &&
    !Array.isArray(normalized.mcp_servers)
      ? { ...(normalized.mcp_servers as Record<string, unknown>) }
      : undefined;

  if (!mcpServers || mcpServers.gitnexus === undefined) {
    return normalized;
  }

  delete mcpServers.gitnexus;

  if (Object.keys(mcpServers).length === 0) {
    const { mcp_servers: _removed, ...rest } = normalized;
    return rest;
  }

  return {
    ...normalized,
    mcp_servers: mcpServers
  };
}

export function mergeCodexConfig(
  existingContent: string | undefined,
  sourceContent: string
): string {
  const source = normalizeManagedCodexConfig(TOML.parse(sourceContent) as Record<string, unknown>);

  if (!existingContent || existingContent.trim().length === 0) {
    return `${TOML.stringify(sortObjectKeys(source) as unknown as TOML.JsonMap)}`.trimEnd() + "\n";
  }

  const target = TOML.parse(existingContent) as Record<string, unknown>;
  const merged = mergeTomlTable(target, source);

  for (const key of enforcedCodexConfigKeys) {
    if (source[key] !== undefined) {
      merged[key] = source[key];
    }
  }

  const mergedFallbacks = new Set(
    ensureStringArray(source.project_doc_fallback_filenames, []).concat(
      ensureStringArray(target.project_doc_fallback_filenames, [])
    )
  );
  if (mergedFallbacks.size > 0) {
    merged.project_doc_fallback_filenames = [...mergedFallbacks];
  }

  const normalizedTarget = sortObjectKeys(target);
  const normalizedMerged = sortObjectKeys(merged);
  if (JSON.stringify(normalizedTarget) === JSON.stringify(normalizedMerged)) {
    return existingContent.endsWith("\n") ? existingContent : `${existingContent}\n`;
  }

  return `${TOML.stringify(normalizedMerged as unknown as TOML.JsonMap)}`.trimEnd() + "\n";
}

export function gitNexusCodexConfigFragment(): string {
  return (
    '[mcp_servers.gitnexus]\n' +
    'command = "npx"\n' +
    'args = ["--no-install", "gitnexus", "mcp"]\n'
  );
}

export function playwrightCodexConfigFragment(): string {
  return (
    '[mcp_servers.playwright]\n' +
    'command = "npx"\n' +
    'args = ["--yes", "@playwright/mcp@latest", "--config", ".devgod/playwright/mcp.json"]\n\n' +
    '[mcp_servers.playwright_vision]\n' +
    'command = "npx"\n' +
    'args = ["--yes", "@playwright/mcp@latest", "--config", ".devgod/playwright/mcp.vision.json"]\n'
  );
}

export function grafanaCodexConfigFragment(): string {
  return (
    '[mcp_servers.grafana]\n' +
    'command = "node"\n' +
    'args = ["--experimental-strip-types", "./node_modules/devgod/src/grafana/mcp-server.ts"]\n'
  );
}

export function stripGitNexusFromCodexConfig(
  sourceContent: string
): string {
  const source = omitGitNexusMcpServer(TOML.parse(sourceContent) as Record<string, unknown>);
  return `${TOML.stringify(sortObjectKeys(source) as unknown as TOML.JsonMap)}`.trimEnd() + "\n";
}

export function mergeGitignore(
  existingContent: string | undefined,
  options: GitNexusInstallSettings = {}
): string {
  const requiredLines = [".env.devgod", ".env.devgod.*"];
  if (options.withGitNexus) {
    requiredLines.push(".gitnexus/");
  }
  const existingLines = new Set(
    (existingContent ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );

  const missing = requiredLines.filter((line) => !existingLines.has(line));
  if (missing.length === 0) {
    return existingContent ?? "";
  }

  const prefix = existingContent && existingContent.trim().length > 0 ? `${existingContent.trimEnd()}\n` : "";
  return `${prefix}\n# devgod\n${missing.join("\n")}\n`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function prefixedFileDependency(relativePath: string): string {
  const normalized = toPosixPath(relativePath);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return `file:${normalized}`;
  }
  if (normalized.startsWith(".")) {
    return `file:${normalized}`;
  }
  return `file:./${normalized}`;
}

export function mergePackageJson(
  existingContent: string | undefined,
  dependencyPathFromTarget: string,
  options: GitNexusInstallSettings = {}
): string {
  const packageJson = existingContent && existingContent.trim().length > 0
    ? (JSON.parse(existingContent) as Record<string, unknown>)
    : {
        name: "project-with-devgod",
        private: true
      };

  const scripts =
    packageJson.scripts && typeof packageJson.scripts === "object" && !Array.isArray(packageJson.scripts)
      ? { ...(packageJson.scripts as Record<string, string>) }
      : {};
  const devDependencies =
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === "object" &&
    !Array.isArray(packageJson.devDependencies)
      ? { ...(packageJson.devDependencies as Record<string, string>) }
      : {};

  const devgodEntry =
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts";

  scripts["devgod"] = devgodEntry;
  scripts["devgod:migrate"] = `${devgodEntry} migrate`;
  scripts["devgod:health"] = `${devgodEntry} health`;
  scripts["devgod:doctor"] = `${devgodEntry} doctor`;
  scripts["devgod:heal"] = `${devgodEntry} doctor --repair`;
  scripts["devgod:bootstrap"] = `${devgodEntry} bootstrap-project`;
  scripts["devgod:verify:setup"] = `${devgodEntry} verify-setup`;
  scripts["devgod:status"] = `${devgodEntry} status`;
  scripts["devgod:coverage"] = `${devgodEntry} coverage --format text`;
  scripts["devgod:gaps"] = `${devgodEntry} gaps --format text`;
  scripts["devgod:checkpoint"] = `${devgodEntry} checkpoint --format text`;
  scripts["devgod:resume"] = `${devgodEntry} resume --format text`;
  scripts["devgod:seed-workflow-proof"] = `${devgodEntry} seed-workflow-proof`;
  scripts["devgod:seed-modernization-proof"] = `${devgodEntry} seed-modernization-proof`;
  scripts["devgod:advance-active-task"] = `${devgodEntry} advance-active-task --format text`;
  scripts["devgod:reconcile"] = `${devgodEntry} reconcile-runtime-state --apply --format text`;
  scripts["devgod:sync-runtime-exports"] = `${devgodEntry} sync-runtime-exports --format text`;
  scripts["devgod:daemon"] = `${devgodEntry} daemon --format text`;
  scripts["devgod:supervisor"] = `${devgodEntry} supervisor --format text`;
  scripts["devgod:supervisor-history"] = `${devgodEntry} supervisor-history --format text`;
  scripts["devgod:ops"] = `${devgodEntry} ops --format text`;
  scripts["devgod:loop"] = `${devgodEntry} loop --format text`;
  scripts["devgod:recover"] = `${devgodEntry} recover`;
  scripts["devgod:report"] = `${devgodEntry} report --format markdown`;
  scripts["devgod:plan-context"] = `${devgodEntry} plan-context`;
  scripts["devgod:refresh-retrieval"] = `${devgodEntry} refresh-retrieval`;
  scripts["devgod:refresh-repo-context"] = `${devgodEntry} refresh-repo-context`;
  scripts["devgod:repair-task-queue"] = `${devgodEntry} repair-task-queue`;
  scripts["devgod:export-docs"] = `${devgodEntry} export-docs`;
  scripts["devgod:autopilot-status"] =
    "node --experimental-strip-types ./node_modules/devgod/src/devgod/autopilot-status.ts";
  scripts["devgod:github-dispatch"] = `${devgodEntry} github-dispatch --target .`;
  scripts["devgod:mcp"] = `${devgodEntry} mcp`;
  scripts["devgod:ui"] = `${devgodEntry} serve-ui`;
  scripts["devgod:scaffold-workflow"] = `${devgodEntry} scaffold-workflow --target .`;
  scripts["devgod:upgrade-reasoning-workflow"] = `${devgodEntry} upgrade-reasoning-workflow --target .`;
  scripts["devgod:seed-happy-path-fixture"] = `${devgodEntry} seed-happy-path-fixture --target .`;
  scripts["devgod:check:happy-path"] = "bash scripts/check-devgod-happy-path.sh";
  scripts["devgod:check-workflow"] = "bash scripts/check-devgod-workflow.sh";
  scripts["devgod:verify:migrations:live"] = `${devgodEntry} verify-live-migrations`;
  scripts["devgod:verify:review-identity"] = `${devgodEntry} verify-review-identity`;
  scripts["devgod:verify:git-guard"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/verify-git-guard.ts";
  scripts["devgod:record-review"] = `${devgodEntry} record-review --input .devgod/review-action.json`;
  scripts["devgod:setup:git-guard"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-git-guard.ts";
  scripts["devgod:setup:local"] = "node --experimental-strip-types ./node_modules/devgod/src/install/setup-local.ts";
  scripts["devgod:setup:playwright"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-playwright.ts";
  scripts["devgod:verify:playwright"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-playwright.ts --verify";

  if (options.withGrafana) {
    scripts["devgod:grafana:mcp"] =
      "node --experimental-strip-types ./node_modules/devgod/src/grafana/mcp-server.ts";
  }

  devDependencies.devgod = prefixedFileDependency(dependencyPathFromTarget);

  if (options.withGitNexus) {
    scripts["devgod:gitnexus:analyze"] = "gitnexus analyze --skip-agents-md";
    scripts["devgod:gitnexus:status"] = "gitnexus status";
    devDependencies.gitnexus = options.gitNexusPackageVersion ?? "1.6.3";
  }

  packageJson.scripts = sortObjectKeys(scripts);
  packageJson.devDependencies = sortObjectKeys(devDependencies);

  return `${JSON.stringify(sortObjectKeys(packageJson), null, 2)}\n`;
}

export function agentsManagedBlock(): string {
  return managedAgentsBlock;
}
