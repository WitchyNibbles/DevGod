import TOML from "@iarna/toml";

const AGENTS_BEGIN = "<!-- BEGIN DEVGOD MANAGED -->";
const AGENTS_END = "<!-- END DEVGOD MANAGED -->";
const DOT_AGENTS_BEGIN = "<!-- BEGIN DEVGOD KERNEL -->";
const DOT_AGENTS_END = "<!-- END DEVGOD KERNEL -->";
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
- treat substantive requests as devgod work unless the user opts out
- use \`devgod-intake\` as the default first skill for substantive work

## Workflow contract

Canonical runtime contract:

${workflowContractBlock}

## Department Workflow

- root thread is engineering manager
- manager/root stays shallow: two inspections max before trivial handling or bounded investigation
- clarify ambiguous intent before planning with targeted questions or explicit assumptions
- on first ask, clarify outcome, constraints, and done criteria unless assumptions are enough
- require Design and Architecture Council review for substantive roadmap, governance, architecture-significant, or user-flow-heavy plan work unless the task is trivial or inherits an approved decision
- keep the council lean, rotating, and time-bounded with a named dissent owner
- inherited task packets must carry explicit workflow artifact refs; use \`review_exports=runtime_optional\` only when runtime authority covers the gate
- keep \`devgod\` as the default workflow controller even when other tools are available
- when repo-local Grafana configuration is present, use Grafana logs as broader debugging and research evidence; if config is partial or unavailable, say so
- avoid strong negative claims from a narrow pass; gather broader evidence or test an alternate hypothesis first
- route evidence to \`solution_architect\`, then \`planner\`, then specialist owner
- use \`git_operator\` for staging, commit slicing, and commit-message prep when git work is required
- use runtime-backed devgod commands for proof, status, and advancement
- substantive work completes only after \`reviewer\`, \`qa_engineer\`, and \`security_reviewer\` gates plus runtime workflow proof

## Frontend delivery

- route visible UI work through \`frontend_designer\`
- before code, record a frontend direction package: redesign intent, failures to fix, visual direction, structural changes, asset and motion plan, palette or contrast strategy, and mobile notes
- remake or beautify asks fail if weak hierarchy, same misplaced controls, or stock layouts stay unchanged unless preservation is explicit
- visible UI quality claims require desktop and mobile browser evidence

## Autonomy Loop

- for full-project or multi-phase requests, \`devgod\` must operate as a continuing delivery loop
- the manager must not stop after intake, planning, or one implementation slice unless product-level acceptance is complete, a real blocker needs user input, verification is blocked after repair attempts, or the user asked for planning only
- scale, latency, or item volume are not blockers by themselves when the work can be chunked, checkpointed, and resumed
- do not wait for the user to say continue between internal tasks; keep executing until the product-level stop condition is met
- long-running but tractable work must persist concrete progress and continue instead of stopping with a partial-summary handoff
- after each completed task, update runtime product state, update runtime task queue, advance the active task pointer, select the next unblocked task, and continue execution
- a completed phase is not a completed product

## Git hygiene

- branch from updated \`origin/main\` before task or plan work
- default branch prefixes are \`feature/\`, \`bugfix/\`, \`hotfix/\`, \`release/\`, \`chore/\`, \`refactor/\`, \`docs/\`, \`test/\`, \`ci/\`, and \`perf/\`
- this git-flow-style default overrides GitHub MCP naming suggestions unless a consuming repo's higher-precedence guideline says otherwise
- in consuming repos, \`git_operator\` must not stage \`.devgod/\`, \`.agents/\`, \`.codex/\`, or \`AGENTS.md\` unless the task explicitly targets devgod/control-layer installation or maintenance
- keep commits atomic and briefly named
- do not use \`codex\` in branch names, commit subjects, PR titles, or PR bodies

${AGENTS_END}`;

const managedDotAgentsBlock = `${DOT_AGENTS_BEGIN}
# Devgod Kernel

- substantive asks default to \`devgod\` unless the user opts out
- use \`devgod-intake\` first for substantive work
- root thread is the manager: confirm goal, criteria, constraints, and main risk
- manager/root gets at most two shallow inspections before trivial handling or bounded delegation
- create or update \`.devgod/ACTIVE\` and \`.devgod/work/briefs/brief-<task-id>.md\` before moving past intake
- default sequence: evidence -> \`solution_architect\` -> \`planner\` -> task packet -> specialist owner -> \`reviewer\`, \`qa_engineer\`, \`security_reviewer\`
- for council-reviewed work, require a written decision packet before critique and assign one explicit dissent owner
- task packets need \`task_id\`, owner role, completion standard, required specialists, quality gates, write scope, acceptance criteria, verification steps, required reviews, security checks, and rollback notes
- run \`bash scripts/check-devgod-workflow.sh --task-id <task-id>\` before declaring substantive work complete
- current task id must match \`.devgod/ACTIVE\`, the current brief, the current plan/task, and required review files
- unresolved \`CRITICAL\` or \`HIGH\` security findings block completion
- markdown review files are evidence summaries, not reviewer authority
- authenticated reviewer identity and waiver authority must come from runtime policy or another authenticated principal-binding source
- branch from updated \`origin/main\` before task or plan work and prefer \`feature/\`, \`bugfix/\`, \`hotfix/\`, \`release/\`, \`chore/\`, \`refactor/\`, \`docs/\`, \`test/\`, \`ci/\`, or \`perf/\` prefixes unless a consuming repo overrides them
- keep \`codex\` out of branch names, commit subjects, PR titles, and PR bodies
- package owns \`src/\`, \`scripts/\`, \`.agents/\`, \`.codex/\`, \`.devgod/rules/\`, and \`.devgod/templates/\`
- live work state belongs in \`.devgod/work/\`
- reviewed memory in \`.devgod/memory/\` is canonical; retrieval is advisory; never store secrets there
- when repo-local Grafana configuration is present, treat Grafana as advisory evidence for debugging and research; if configuration is partial or tools are unavailable, report that explicitly
- avoid strong negative claims from a narrow pass; gather broader evidence or test an alternate hypothesis before concluding no other cases exist
- ask before deploys, auth changes, secret rotation, destructive data operations, global config changes outside this repo, or durable memory policy changes
- use repo-local \`devgod\` skills and agents when they fit; use \`caveman\` for terse internal handoffs
- for visible UI work, require the frontend direction package before implementation; redesign asks fail if weak hierarchy or misplaced controls stay unchanged

Gate reminders:

- substantive non-trivial work should normally use \`specialist_verified\`
- workers must not edit \`AGENTS.md\`, \`.codex/\`, \`.agents/\`, or \`.devgod/memory/\` unless the task packet allows it
- keep live work state in \`.devgod/work/\`; reviewed memory is not a scratchpad

Council reminders:

- the \`Design and Architecture Council\` is a pre-implementation quality gate for substantive roadmap and plan work
- the council is a rotating 3-5 role panel with default seats from \`solution_architect\`, \`product_strategist\`, \`frontend_designer\` when a human-facing surface exists, and \`infra_engineer\` or \`security_reviewer\` when the main risk is operational or security-heavy
- every council review must name a \`dissent owner\` who argues at least one serious alternative and records unresolved objections
- the council may output \`approved\`, \`approved_with_conditions\`, \`rework_required\`, \`exception_granted\`, or \`rejected\`
- the council may propose changes to user intent, but it must not silently override user intent without user acceptance

See \`AGENTS.md\` and \`.devgod/rules/\` for the full workflow contract and policy details.
${DOT_AGENTS_END}`;

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

export function mergeDotAgentsMd(existingContent: string | undefined): string {
  if (!existingContent || existingContent.trim().length === 0) {
    return `${managedDotAgentsBlock}\n`;
  }

  const blockPattern = new RegExp(`${DOT_AGENTS_BEGIN}[\\s\\S]*?${DOT_AGENTS_END}`, "m");
  if (blockPattern.test(existingContent)) {
    return `${existingContent.replace(blockPattern, managedDotAgentsBlock).trimEnd()}\n`;
  }

  return `${existingContent.trimEnd()}\n\n${managedDotAgentsBlock}\n`;
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
  scripts["devgod:focus"] = `${devgodEntry} ops --format text`;
  scripts["devgod:loop"] = `${devgodEntry} loop --format text`;
  scripts["devgod:recover"] = `${devgodEntry} recover`;
  scripts["devgod:report"] = `${devgodEntry} report --format markdown`;
  scripts["devgod:plan-context"] = `${devgodEntry} plan-context`;
  scripts["devgod:refresh-retrieval"] = `${devgodEntry} refresh-retrieval`;
  scripts["devgod:refresh-retrieval:fast"] = `${devgodEntry} refresh-retrieval --artifacts-only`;
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
