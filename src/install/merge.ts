import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  workflowArtifactRefHelperSummaryLine,
  workflowRequiredGateRolesPolicyLine,
  workflowRuntimeOptionalReviewExportsHelperSummaryLine
} from "../devgod/workflow-schema.ts";

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
workflow_check=devgod workflow-proof --run-id latest --task-id <task-id>
workflow_check_scope=runtime_authority_only
review_artifact_trust=runtime_records_only
ci_scope=runtime_contract_and_export_regressions
local_live_check=bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]
<!-- devgod-workflow-contract:end -->`;

const workflowRequiredGateRolesSentence = workflowRequiredGateRolesPolicyLine.slice(2);
const workflowRequiredGateRolesFragment = workflowRequiredGateRolesSentence.replace(
  "required task gates are ",
  ""
);
const workflowArtifactRefHelperSummarySentence = workflowArtifactRefHelperSummaryLine.toLowerCase();
const workflowRuntimeOptionalReviewExportsSentence = workflowRuntimeOptionalReviewExportsHelperSummaryLine.toLowerCase();

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
- ${workflowArtifactRefHelperSummarySentence}
- ${workflowRuntimeOptionalReviewExportsSentence}
- keep \`devgod\` as the default workflow controller even when other tools are available
- for code-file navigation in this repo and consuming repos, use Graphify MCP first when the repo-local graph is ready so agents get broader structure and spend fewer tokens before broad text scans
- when repo-local Grafana configuration is present, use Grafana logs as broader debugging and research evidence; if config is partial or unavailable, say so
- avoid strong negative claims from a narrow pass; gather broader evidence or test an alternate hypothesis first
- route evidence to \`solution_architect\`, then \`planner\`, then specialist owner
- use \`git_operator\` for staging, commit slicing, and commit-message prep when git work is required
- specialist/subagent roles use \`caveman\` \`ultra\` mode for every response; use \`/caveman ultra\` as the activation reference, and only the root thread that talks directly to the user may answer outside caveman
- use runtime-backed devgod commands for proof, status, and advancement
- substantive work completes only after ${workflowRequiredGateRolesFragment} gates plus runtime workflow proof

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
- for code-file navigation in this repo and consuming repos, use Graphify MCP first when the repo-local graph is ready for repo topology and cross-artifact retrieval, but do not treat it as workflow authority
- when repo-local Grafana configuration is present, treat Grafana as advisory evidence for debugging and research; if configuration is partial or tools are unavailable, report that explicitly
- avoid strong negative claims from a narrow pass; gather broader evidence or test an alternate hypothesis before concluding no other cases exist
- ask before deploys, auth changes, secret rotation, destructive data operations, global config changes outside this repo, or durable memory policy changes
- use repo-local \`devgod\` skills and agents when they fit; all specialist/subagent output stays on \`caveman\` \`ultra\` mode, use \`/caveman ultra\` as the activation reference, and only the root thread that talks directly to the user may answer outside caveman

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

interface GraphifyInstallSettings {
  withGrafana?: boolean;
}

const enforcedCodexConfigKeys = ["approval_policy", "sandbox_mode"] as const;
const require = createRequire(import.meta.url);
function getTomlModule(): typeof import("@iarna/toml") {
  return require("@iarna/toml") as typeof import("@iarna/toml");
}

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

export function mergeCodexConfig(
  existingContent: string | undefined,
  sourceContent: string
): string {
  const TOML = getTomlModule();
  const source = normalizeManagedCodexConfig(TOML.parse(sourceContent) as Record<string, unknown>);
  const stringifyToml = (value: Record<string, unknown>): string =>
    TOML.stringify(value as unknown as Parameters<typeof TOML.stringify>[0]);

  if (!existingContent || existingContent.trim().length === 0) {
    return `${stringifyToml(sortObjectKeys(source))}`.trimEnd() + "\n";
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

  return `${stringifyToml(normalizedMerged)}`.trimEnd() + "\n";
}

export function graphifyCodexConfigFragment(): string {
  return (
    '[mcp_servers.graphify]\n' +
    'command = "uv"\n' +
    'args = ["tool", "run", "--from", "graphifyy", "python", "-m", "graphify.serve", "graphify-out/graph.json"]\n'
  );
}

function renderPublishedTypeScriptHookEntrypoint(): string {
  return `import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const packageRootUrl = new URL("../", import.meta.url);
const packageRootPath = fileURLToPath(packageRootUrl);
const registeredPackageRoots = new Set();

export function resolveDevgodPackagePath(relativePath) {
  return path.resolve(packageRootPath, relativePath);
}

export function registerDevgodTypeScriptHooks() {
  const packageRootHref = pathToFileURL(\`\${packageRootPath}\${path.sep}\`).href;
  if (registeredPackageRoots.has(packageRootHref)) {
    return;
  }

  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith(packageRootHref) && url.endsWith(".ts")) {
        const source = readFileSync(fileURLToPath(url), "utf8");
        return {
          format: "module",
          shortCircuit: true,
          source: stripTypeScriptTypes(source, { mode: "transform", sourceUrl: url })
        };
      }

      return nextLoad(url, context);
    }
  });

  registeredPackageRoots.add(packageRootHref);
}

export async function importDevgodTypeScriptModule(relativePath, argv = []) {
  registerDevgodTypeScriptHooks();
  const targetPath = resolveDevgodPackagePath(relativePath);
  const originalArgv = process.argv;
  process.argv = [process.argv[0] ?? process.execPath, targetPath, ...argv];

  try {
    return await import(pathToFileURL(targetPath).href);
  } finally {
    process.argv = originalArgv;
  }
}
`;
}

function collectReExportedNames(sourceText: string): { valueExports: string[]; typeExports: string[] } {
  const valueExports = new Set<string>();
  const typeExports = new Set<string>();

  for (const match of sourceText.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*"[^"]+";/g)) {
    const entries = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      if (entry.startsWith("type ")) {
        typeExports.add(entry.slice("type ".length).trim());
        continue;
      }

      valueExports.add(entry);
    }
  }

  return {
    valueExports: [...valueExports].sort(),
    typeExports: [...typeExports].sort()
  };
}

function collectLazyAdminWrapperExports(sourceText: string): string[] {
  return [
    ...new Set(
      [...sourceText.matchAll(/^export const (\w+): AdminModule\["\w+"\] = async /gm)].map((match) => match[1])
    )
  ].sort();
}

export function collectPublishedPublicValueExports(sourceText: string): string[] {
  const { valueExports } = collectReExportedNames(sourceText);
  return [...new Set([...valueExports, ...collectLazyAdminWrapperExports(sourceText)])].sort();
}

export function renderPublishedIndexEntrypoint(publicSourceText: string): string {
  const exportLines = collectPublishedPublicValueExports(publicSourceText)
    .map((name) => `export const ${name} = publicApi.${name};`)
    .join("\n");

  return `import { importDevgodTypeScriptModule, registerDevgodTypeScriptHooks } from "./register-typescript-hooks.js";

registerDevgodTypeScriptHooks();

const publicApi = await importDevgodTypeScriptModule("src/public.ts");

${exportLines}
`;
}

function renderPublishedBinEntrypoint(): string {
  return `#!/usr/bin/env node

import process from "node:process";
import { importDevgodTypeScriptModule, registerDevgodTypeScriptHooks } from "../register-typescript-hooks.js";

const adminCommands = new Set([
  "migrate",
  "health",
  "doctor",
  "bootstrap-project",
  "verify-setup",
  "verify-live-migrations",
  "refresh-retrieval",
  "refresh-repo-context",
  "repair-task-queue",
  "run-embedding-jobs",
  "verify-review-identity",
  "record-review",
  "record-council-decision",
  "status",
  "coverage",
  "gaps",
  "checkpoint",
  "resume",
  "workflow-proof",
  "seed-workflow-proof",
  "seed-modernization-proof",
  "advance-active-task",
  "reconcile-runtime-state",
  "sync-runtime-exports",
  "daemon",
  "supervisor",
  "supervisor-history",
  "ops",
  "loop",
  "recover",
  "index-repo-markdown",
  "report",
  "plan-context",
  "export-docs",
  "/export-docs",
  "github-dispatch"
]);

const installCommands = new Set([
  "init",
  "upgrade",
  "verify",
  "scaffold-workflow",
  "upgrade-reasoning-workflow",
  "seed-happy-path-fixture"
]);

const directCommandTargets = new Map([
  ["autopilot-status", { modulePath: "src/devgod/autopilot-status.ts", stripCommand: true }],
  ["setup-git-guard", { modulePath: "src/install/setup-git-guard.ts", stripCommand: true }],
  ["verify-git-guard", { modulePath: "src/install/verify-git-guard.ts", stripCommand: true }],
  ["setup-graphify", { modulePath: "src/install/setup-graphify.ts", stripCommand: true }],
  ["setup-graphify-codex", { modulePath: "src/install/setup-graphify-codex.ts", stripCommand: true }],
  ["setup-local", { modulePath: "src/install/setup-local.ts", stripCommand: true }],
  ["setup-playwright", { modulePath: "src/install/setup-playwright.ts", stripCommand: true }],
  ["mcp", { modulePath: "src/mcp/server.ts", stripCommand: true }],
  ["serve-ui", { modulePath: "src/ui/server.ts", stripCommand: true }],
  ["grafana-mcp", { modulePath: "src/grafana/mcp-server.ts", stripCommand: true }]
]);

function printUsage() {
  process.stdout.write(
    [
      "devgod",
      "",
      "Stable public CLI entrypoint for the devgod package.",
      "",
      "Usage:",
      "  devgod <runtime-command> [args]",
      "  devgod <install-command> [args]",
      "  devgod <helper-command> [args]",
      "",
      "Runtime commands:",
      "  status | coverage | gaps | checkpoint | resume | workflow-proof | seed-workflow-proof | seed-modernization-proof | advance-active-task | reconcile-runtime-state | sync-runtime-exports | daemon | supervisor | supervisor-history | ops | loop | recover | report | plan-context | export-docs | github-dispatch",
      "  migrate | health | doctor [--repair] | bootstrap-project | verify-setup | verify-live-migrations",
      "  verify-review-identity | record-review | record-council-decision | index-repo-markdown | refresh-retrieval | refresh-repo-context | repair-task-queue | run-embedding-jobs",
      "",
      "Install commands:",
      "  init | upgrade | verify | scaffold-workflow | upgrade-reasoning-workflow | seed-happy-path-fixture",
      "",
      "Helper commands:",
      "  autopilot-status | setup-git-guard | verify-git-guard | setup-graphify | setup-graphify-codex | setup-local | setup-playwright | mcp | serve-ui | grafana-mcp",
      ""
    ].join("\\n")
  );
}

async function main() {
  registerDevgodTypeScriptHooks();

  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (adminCommands.has(command)) {
    await importDevgodTypeScriptModule("src/admin.ts", [command, ...rest]);
    return;
  }

  if (installCommands.has(command)) {
    await importDevgodTypeScriptModule("src/install/cli.ts", [command, ...rest]);
    return;
  }

  const directTarget = directCommandTargets.get(command);
  if (directTarget) {
    await importDevgodTypeScriptModule(directTarget.modulePath, directTarget.stripCommand ? rest : [command, ...rest]);
    return;
  }

  throw new Error(\`Unknown devgod command: \${command}\`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
`;
}

async function writePublishedPackageFile(
  filePath: string,
  content: string,
  options: { executable?: boolean } = {}
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  if (options.executable) {
    await chmod(filePath, 0o755);
  }
}

export async function writePublishedPackageEntrypoints(packageRoot: string): Promise<void> {
  const outputRoot = path.resolve(packageRoot, "dist");
  const publicSourcePath = path.join(packageRoot, "src", "public.ts");
  const publicSourceText = await readFile(publicSourcePath, "utf8");
  await writePublishedPackageFile(
    path.join(outputRoot, "register-typescript-hooks.js"),
    renderPublishedTypeScriptHookEntrypoint()
  );
  await writePublishedPackageFile(
    path.join(outputRoot, "index.js"),
    renderPublishedIndexEntrypoint(publicSourceText)
  );
  await writePublishedPackageFile(path.join(outputRoot, "bin", "devgod.js"), renderPublishedBinEntrypoint(), {
    executable: true
  });
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
    'args = ["./node_modules/devgod/dist/bin/devgod.js", "grafana-mcp"]\n'
  );
}

export function mergeGitignore(
  existingContent: string | undefined,
  _options: GraphifyInstallSettings = {}
): string {
  const requiredLines = [".env.devgod", ".env.devgod.*", "graphify-out/"];
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
  options: GraphifyInstallSettings = {}
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

  const devgodEntry = "devgod";

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
    `${devgodEntry} autopilot-status`;
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
    `${devgodEntry} verify-git-guard`;
  scripts["devgod:record-review"] = `${devgodEntry} record-review --input .devgod/review-action.json`;
  scripts["devgod:setup:git-guard"] =
    `${devgodEntry} setup-git-guard`;
  scripts["devgod:setup:graphify"] =
    `${devgodEntry} setup-graphify`;
  scripts["devgod:setup:local"] = `${devgodEntry} setup-local`;
  scripts["devgod:setup:playwright"] =
    `${devgodEntry} setup-playwright`;
  scripts["devgod:verify:playwright"] =
    `${devgodEntry} setup-playwright --verify`;
  scripts["devgod:graphify:build"] = "graphify extract src --out .";
  scripts["devgod:graphify:codex-full"] =
    `${devgodEntry} setup-graphify-codex`;
  scripts["devgod:graphify:update"] = "graphify extract src --out .";
  scripts["devgod:graphify:watch"] = "graphify watch src";
  scripts["devgod:graphify:serve"] =
    "uv tool run --from graphifyy python -m graphify.serve graphify-out/graph.json";

  if (options.withGrafana) {
    scripts["devgod:grafana:mcp"] =
      `${devgodEntry} grafana-mcp`;
  }

  devDependencies.devgod = prefixedFileDependency(dependencyPathFromTarget);

  packageJson.scripts = sortObjectKeys(scripts);
  packageJson.devDependencies = sortObjectKeys(devDependencies);

  return `${JSON.stringify(sortObjectKeys(packageJson), null, 2)}\n`;
}

export function agentsManagedBlock(): string {
  return managedAgentsBlock;
}
