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

- treat substantive requests as devgod work by default unless the user opts out
- use \`.devgod/work/\` for active briefs, plans, tasks, and reviews
- use \`.devgod/rules/\` and \`.devgod/memory/\` as the local policy and durable-memory layer
- use the repo-local devgod skills under \`.agents/skills/devgod-*/\`
- use the repo-local devgod agent profiles under \`.codex/agents/devgod-*.toml\`
- keep one canonical active marker at \`.devgod/ACTIVE\` with \`task_id=<task-id>\`, \`workflow=devgod\`, and \`state=active\`
- if devgod is not configured yet, run \`npm run devgod:setup:local\`; if that path depends on ignored local bootstrap state, surface the dependency before relying on it

## Workflow contract

The workflow checker treats the block below as the canonical repo-local contract for task, review, and gate artifacts.

${workflowContractBlock}

## Department Workflow

For this repository, the root Codex thread acts as the engineering manager on first contact.

- confirm the request, success criteria, constraints, and main risk before execution
- manager/root owns triage, routing, synthesis, scope enforcement, and final reporting
- manager/root must not perform deep subsystem investigation, broad code search, root-cause analysis, or implementation design directly
- manager/root may run at most two shallow inspection commands before trivial classification or bounded investigation
- answer trivial or administrative asks directly without department fanout
- route every substantive build, debug, setup, or refactor ask through the department workflow
- use \`devgod-intake\` as the default first skill for substantive work

Default department chain:

1. manager intake in the root thread
2. \`product_strategist\` for ambiguous, customer-facing, or flow-heavy asks
3. bounded specialist investigation when evidence is needed
4. \`solution_architect\` for system design, boundaries, and sequencing
5. \`planner\` for task slicing, ownership, dependencies, and worker routing
6. implementation specialists (\`backend_engineer\`, \`frontend_designer\`, \`infra_engineer\`) for scoped delivery
7. blocking \`reviewer\`, \`qa_engineer\`, and \`security_reviewer\` gates before the manager reports completion
8. \`memory_curator\` for durable capture after approved completion

Additional rules:

- prefer repo-local custom agents under \`.codex/agents/devgod-*.toml\` when available
- create or update \`.devgod/ACTIVE\` and the matching intake brief before moving past intake
- any work that needs more than two inspection commands should go through bounded investigation
- use a bounded investigation packet with: owner role, precise question, read scope, forbidden write scope, evidence required, max output length, stop condition
- let \`solution_architect\` synthesize investigation evidence before planning when the evidence pass runs first
- \`planner\` task packets must include owner role, completion standard, required specialist roles, quality gates, scope, files likely touched, acceptance criteria, verification command, and review gates
- manager/root may apply only small mechanical edits for trivial, single-scope, low-risk tasks; specialist owners should handle non-trivial, risky, or subsystem-specific implementation
- preserve the trivial fast path for single-scope wording or mechanical work that stays within the two-inspection limit
- use the local \`caveman\` plugin/skill for manager notes, agent handoffs, QA/security gates, and other internal coordination to reduce token cost
- default caveman target is 4-6 lines with short labels and no prose paragraphs
- keep direct user replies in standard concise English unless the user asks for caveman format
- use \`tdd-guide\` for new feature or bugfix slices that should start with failing tests
- use \`e2e-runner\` for critical user, setup, install, and upgrade flows
- use \`release-readiness\` before package, migration, installer, or rollout-oriented changes
- if GitNexus is intentionally configured, treat it as optional advisory repo intelligence only and keep workflow authority in \`devgod\`
- substantive work that is not on the trivial fast path should normally use \`specialist_verified\` completion with explicit specialist and quality-gate evidence
- require an intake brief for substantive work in \`.devgod/work/briefs/\`
- require a task packet or plan artifact in \`.devgod/work/plans/\` or \`.devgod/work/tasks/\` before worker execution
- require the active task id to match the current brief, plan/task, and review artifacts
- the manager is the default writer for \`.devgod/work/reviews/\`; read-only reviewer roles still need persisted gate files
- run \`bash scripts/check-devgod-workflow.sh --task-id <task-id>\` before reporting substantive work complete
- do not claim substantive work is done without reviewer/QA/security gate output in \`.devgod/work/reviews/\`

${AGENTS_END}`;

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
    ensureStringArray(target.project_doc_fallback_filenames, []).concat(
      ensureStringArray(source.project_doc_fallback_filenames, [])
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

export function mergeGitignore(existingContent: string | undefined): string {
  const requiredLines = [".env.devgod", ".env.devgod.*"];
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
  dependencyPathFromTarget: string
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

  const runtimeEntry =
    "node --env-file=.env.devgod --experimental-strip-types ./node_modules/devgod/src/admin.ts";

  scripts["devgod:migrate"] = `${runtimeEntry} migrate`;
  scripts["devgod:health"] = `${runtimeEntry} health`;
  scripts["devgod:bootstrap"] = `${runtimeEntry} bootstrap-project`;
  scripts["devgod:verify:setup"] = `${runtimeEntry} verify-setup`;
  scripts["devgod:status"] = `${runtimeEntry} status`;
  scripts["devgod:ops"] = `${runtimeEntry} ops --format text`;
  scripts["devgod:recover"] = `${runtimeEntry} recover`;
  scripts["devgod:scaffold-workflow"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/cli.ts scaffold-workflow --target .";
  scripts["devgod:seed-happy-path-fixture"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/cli.ts seed-happy-path-fixture --target .";
  scripts["devgod:check:happy-path"] = "bash scripts/check-devgod-happy-path.sh";
  scripts["devgod:check-workflow"] = "bash scripts/check-devgod-workflow.sh";
  scripts["devgod:verify:migrations:live"] = `${runtimeEntry} verify-live-migrations`;
  scripts["devgod:verify:review-identity"] = `${runtimeEntry} verify-review-identity`;
  scripts["devgod:record-review"] = `${runtimeEntry} record-review --input .devgod/review-action.json`;
  scripts["devgod:setup:local"] =
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-local.ts";

  devDependencies.devgod = prefixedFileDependency(dependencyPathFromTarget);

  packageJson.scripts = sortObjectKeys(scripts);
  packageJson.devDependencies = sortObjectKeys(devDependencies);

  return `${JSON.stringify(sortObjectKeys(packageJson), null, 2)}\n`;
}

export function agentsManagedBlock(): string {
  return managedAgentsBlock;
}
