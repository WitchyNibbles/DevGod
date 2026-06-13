import {
  workflowArtifactRefHelperSummaryLine,
  workflowRequiredGateRolesPolicyLine,
  workflowRuntimeOptionalReviewExportsHelperSummaryLine
} from "./workflow-schema.ts";

const AGENTS_BEGIN = "<!-- BEGIN DEVGOD MANAGED -->";
const AGENTS_END = "<!-- END DEVGOD MANAGED -->";
const DOT_AGENTS_BEGIN = "<!-- BEGIN DEVGOD KERNEL -->";
const DOT_AGENTS_END = "<!-- END DEVGOD KERNEL -->";

export type WorkflowContractTarget = "installed" | "source";

const sourceOnlyWorkflowContractEntries = [
  ["runtime_canonical_records", "task,review,approval,council"],
  ["workflow_export_artifacts", "task_packet_markdown,review_markdown,product_state_markdown,task_queue_json"],
  ["task_packet_export", "required_live_export_present_and_valid"],
  ["review_export_required_when", "review_exports=required"],
  ["review_export_optional_when", "review_exports=runtime_optional"],
  ["product_state_export", "advisory_unless_runtime_written_or_verified"],
  ["task_queue_export", "advisory_unless_runtime_written_or_verified"],
  ["export_blocking", "stale_or_malformed_required_exports_block_release_not_runtime_truth"],
  ["specialist_verified_requirement", "completion_audit_required"]
] as const;

function buildWorkflowContractEntries(target: WorkflowContractTarget): Array<readonly [string, string]> {
  const workflowCheck =
    target === "source"
      ? "node --experimental-strip-types ./src/admin/devgod.ts workflow-proof --run-id latest --task-id <task-id>"
      : "npm run devgod -- workflow-proof --run-id latest --task-id <task-id>";

  const entries: Array<readonly [string, string]> = [
    ["workflow", "devgod"],
    ["workflow_runtime", "postgres"],
    ["active_run_pointer", "project_runtime_state.active_run_id"],
    ["active_task_pointer", "project_runtime_state.active_task_id"],
    ["workflow_documents", "workflow_documents"],
    ["task_queue", "project_runtime_state.task_queue"],
    ["product_state", "project_runtime_state.product_state"],
    ["required_review_roles", "reviewer,qa_engineer,security_reviewer"],
    ["release_candidate_quality_gate", "release_readiness_required"],
    ["review_authority", "runtime_authenticated_only"],
    ["workflow_check", workflowCheck],
    ["workflow_check_scope", "runtime_authority_only"],
    ["review_artifact_trust", "runtime_records_only"]
  ];

  if (target === "source") {
    entries.push(...sourceOnlyWorkflowContractEntries);
  }

  entries.push(
    ["ci_scope", "runtime_contract_and_export_regressions"],
    ["local_live_check", "bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]"]
  );

  return entries;
}

export function renderWorkflowContractBlock(options: { target?: WorkflowContractTarget } = {}): string {
  const target = options.target ?? "installed";
  const lines = buildWorkflowContractEntries(target).map(([key, value]) => `${key}=${value}`);

  return [
    "<!-- devgod-workflow-contract:start -->",
    ...lines,
    "<!-- devgod-workflow-contract:end -->"
  ].join("\n");
}

const workflowRequiredGateRolesSentence = workflowRequiredGateRolesPolicyLine.slice(2);
const workflowRequiredGateRolesFragment = workflowRequiredGateRolesSentence.replace(
  "required task gates are ",
  ""
);
const workflowArtifactRefHelperSummarySentence = workflowArtifactRefHelperSummaryLine.toLowerCase();
const workflowRuntimeOptionalReviewExportsSentence = workflowRuntimeOptionalReviewExportsHelperSummaryLine.toLowerCase();

export function renderManagedAgentsBlock(): string {
  return `${AGENTS_BEGIN}
## devgod

- treat \`devgod\` as implicitly invoked on every prompt unless the user explicitly opts out
- treat substantive requests as devgod work unless the user opts out
- use \`devgod-intake\` as the default first skill for substantive work

## Workflow contract

Canonical runtime contract:

${renderWorkflowContractBlock({ target: "installed" })}

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
}

export function renderManagedDotAgentsBlock(): string {
  return `${DOT_AGENTS_BEGIN}
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
}
