import TOML from "@iarna/toml";

const AGENTS_BEGIN = "<!-- BEGIN DEVGOD MANAGED -->";
const AGENTS_END = "<!-- END DEVGOD MANAGED -->";
const workflowContractBlock = `<!-- devgod-workflow-contract:start -->
workflow=devgod
active_file=.devgod/ACTIVE
brief_file=.devgod/work/briefs/brief-<task-id>.md
plan_file=.devgod/work/plans/plan-<task-id>.md
task_file=.devgod/work/tasks/task-<task-id>.md
review_file=.devgod/work/reviews/review-<task-id>-<role>.md
brief_template=.devgod/templates/intake-brief.md
task_template=.devgod/templates/task-packet.md
review_template=.devgod/templates/review-gate.md
required_review_roles=reviewer,qa_engineer,security_reviewer
review_aliases=reviewer:reviewer;qa_engineer:qa|qa_engineer;security_reviewer:security|security_reviewer
workflow_check=bash scripts/check-devgod-workflow.sh --task-id <task-id>
workflow_check_scope=artifact_contract_only
review_artifact_trust=manager_summary_evidence_only
ci_scope=artifact_contract_regression_fixtures_only
local_live_check=bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]
<!-- devgod-workflow-contract:end -->`;

const managedAgentsBlock = `${AGENTS_BEGIN}
## devgod

- treat \`devgod\` as implicitly invoked on every prompt unless the user explicitly opts out
- treat substantive requests as devgod work by default unless the user opts out
- use \`devgod-intake\` as the default first skill for substantive work
- keep one canonical active marker at \`.devgod/ACTIVE\` with \`task_id=<task-id>\`, \`workflow=devgod\`, and \`state=active\`
- use \`.devgod/work/\` for briefs, plans, tasks, and reviews
- use \`.devgod/rules/\` and \`.devgod/memory/\` as local policy and durable-memory layers
- if devgod is not configured yet, use the setup path before relying on it

## Workflow contract

The block below is the canonical repo-local artifact contract.

${workflowContractBlock}

## Department Workflow

- root Codex thread acts as engineering manager on first contact
- manager/root stays shallow: at most two inspections before trivial handling or bounded investigation
- create or update \`.devgod/ACTIVE\` and the matching brief before moving past intake
- keep \`devgod\` as the default workflow controller even when other tools are available
- route evidence to \`solution_architect\`, then \`planner\`, then the named specialist owner
- use \`tdd-guide\`, \`e2e-runner\`, and \`release-readiness\` when the slice needs those gates
- preserve the trivial fast path for single-scope low-risk work
- unresolved \`CRITICAL\` or \`HIGH\` security findings block completion
- markdown review files are evidence summaries, not reviewer authority
- reviewer identity and waiver authority must come from authenticated runtime policy or another authenticated principal-binding source
- substantive work completes only after \`reviewer\`, \`qa_engineer\`, and \`security_reviewer\` gates plus \`bash scripts/check-devgod-workflow.sh --task-id <task-id>\`

${AGENTS_END}`;

interface GitNexusInstallSettings {
  withGitNexus?: boolean;
  gitNexusPackageVersion?: string;
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

export function mergeCodexConfig(
  existingContent: string | undefined,
  sourceContent: string
): string {
  const source = TOML.parse(sourceContent) as Record<string, unknown>;

  if (!existingContent || existingContent.trim().length === 0) {
    return sourceContent.endsWith("\n") ? sourceContent : `${sourceContent}\n`;
  }

  const target = TOML.parse(existingContent) as Record<string, unknown>;
  const merged = mergeTomlTable(target, source);

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
  scripts["devgod:bootstrap"] = `${devgodEntry} bootstrap-project`;
  scripts["devgod:verify:setup"] = `${devgodEntry} verify-setup`;
  scripts["devgod:status"] = `${devgodEntry} status`;
  scripts["devgod:ops"] = `${devgodEntry} ops --format text`;
  scripts["devgod:recover"] = `${devgodEntry} recover`;
  scripts["devgod:report"] = `${devgodEntry} report --format markdown`;
  scripts["devgod:plan-context"] = `${devgodEntry} plan-context`;
  scripts["devgod:github-dispatch"] = `${devgodEntry} github-dispatch --target .`;
  scripts["devgod:mcp"] = `${devgodEntry} mcp`;
  scripts["devgod:ui"] = `${devgodEntry} serve-ui`;
  scripts["devgod:scaffold-workflow"] = `${devgodEntry} scaffold-workflow --target .`;
  scripts["devgod:seed-happy-path-fixture"] = `${devgodEntry} seed-happy-path-fixture --target .`;
  scripts["devgod:check:happy-path"] = "bash scripts/check-devgod-happy-path.sh";
  scripts["devgod:check-workflow"] = "bash scripts/check-devgod-workflow.sh";
  scripts["devgod:verify:migrations:live"] = `${devgodEntry} verify-live-migrations`;
  scripts["devgod:verify:review-identity"] = `${devgodEntry} verify-review-identity`;
  scripts["devgod:record-review"] = `${devgodEntry} record-review --input .devgod/review-action.json`;
  scripts["devgod:setup:local"] = "node --experimental-strip-types ./node_modules/devgod/src/install/setup-local.ts";

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
