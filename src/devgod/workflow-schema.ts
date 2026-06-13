export const approvalDecisions = ["approved", "blocked", "waived"] as const;
export const completionStandards = ["artifact_complete", "specialist_verified"] as const;
export const qualityGates = [
  "council_review_required",
  "completion_audit_required",
  "product_acceptance",
  "frontend_acceptance",
  "accessibility_acceptance",
  "responsive_acceptance",
  "tdd_required",
  "e2e_required",
  "regression_safety_required",
  "release_readiness_required",
  "performance_check_required",
  "setup_replay_required",
  "coverage_ledger_required",
  "progress_proof_required",
  "checkpoint_resume_required",
  "memory_compaction_required",
  "reasoning_dual_required",
  "reasoning_strict_required"
] as const;
export const reasoningWorkflowModes = ["legacy", "dual", "strict"] as const;
export const reviewSeverities = ["low", "medium", "high", "critical"] as const;
export const reviewStates = ["pending", "passed", "blocked", "waived"] as const;
export const reviewWaiverAuthorities = ["none", "manager", "security_exception"] as const;
export const uiSurfaces = ["none", "visual_change", "interactive_flow"] as const;

export const workflowTemplateReviewRoles = ["reviewer", "qa_engineer", "security_reviewer"] as const;
export type WorkflowTemplateReviewRole = typeof workflowTemplateReviewRoles[number];
export const workflowReviewFilenameAliases = [
  "reviewer:reviewer",
  "qa_engineer:qa",
  "security_reviewer:security"
] as const;
export const workflowReviewActorRoles = [...workflowTemplateReviewRoles, "planner", "solution_architect"] as const;
export const workflowReviewProvenanceStatuses = ["summary_only", "runtime_verified", "legacy_backfill"] as const;
export const workflowReviewExportPolicies = ["required", "runtime_optional"] as const;
export const workflowReviewExportPoliciesDisplay = workflowReviewExportPolicies.join(" | ");
export const workflowReviewExportsDefaultExampleLine = "review_exports=runtime_optional";
export const workflowCouncilNeeds = ["required", "not_required", "inherited"] as const;
export const workflowCouncilRequiredStates = ["true", "false", "inherited"] as const;
export const workflowCouncilOutcomes = [
  "pending",
  "approved",
  "approved_with_conditions",
  "rework_required",
  "exception_granted",
  "rejected",
  "inherited"
] as const;
export const workflowCouncilHandoffTargets = ["none", "solution_architect", "product_strategist", "planner"] as const;
export const workflowStopGoStates = ["go", "needs_review", "stop"] as const;
export const workflowPlaywrightRequirementStates = ["true", "false"] as const;
export const strongerArtifactQualityGates = [
  "coverage_ledger_required",
  "progress_proof_required",
  "checkpoint_resume_required",
  "memory_compaction_required"
] as const;

export const workflowArtifactRefKeys = [
  "brief",
  "plan",
  "task",
  "reviewer",
  "qa_engineer",
  "security_reviewer",
  "review_exports"
] as const;

export const workflowArtifactRefGuidanceLine =
  "Declare explicit workflow artifact ownership whenever the task inherits a parent brief or plan, or when authenticated runtime review authority is allowed to satisfy completion before markdown review exports exist.";
export const workflowArtifactRefHelperSummaryLine =
  "Inherited task packets must carry explicit workflow artifact refs.";
export const workflowArtifactRefFormatIntroLine = "Use repo-relative `key=value` lines:";
export const workflowRuntimeCanonicalRecordsPolicyLine =
  "- runtime task, review, approval, and council records are canonical truth for workflow state and release decisions";
export const workflowExportArtifactsPolicyLine =
  "- markdown task packets, markdown review summaries, `product-state.md`, and `task-queue.json` are export artifacts; they may block release when stale or malformed, but they cannot override authenticated runtime truth";
export const workflowRequiredReviewExportsPolicyLine =
  "- `review_exports=required` means markdown review summaries are required export evidence for the task class";
export const workflowReviewExportsRuntimeOptionalGuidanceLine =
  "When `review_exports=runtime_optional`, the task must run under the runtime workflow contract and still cite release-readiness or other gate evidence in task verification artifacts or exported review summaries.";
export const workflowReviewExportsAllowedValuesGuidanceLine =
  "Allowed values: `required | runtime_optional`.";
export const workflowReviewExportsScopeAlignmentGuidanceLine =
  "Set `review_exports=required` only when the allowed write scope can actually update the referenced review artifacts; otherwise use `runtime_optional` or request the minimum safe scope expansion before execution.";
export const workflowSpecialistVerifiedCompletionAuditRequirementLine =
  "`specialist_verified` work always requires `completion_audit_required`";
export const workflowSpecialistVerifiedExportPolicyLine =
  `- ${workflowSpecialistVerifiedCompletionAuditRequirementLine}; \`review_exports=runtime_optional\` waives only markdown review-summary exports, not the task packet or other required workflow exports`;
export const workflowTaskPacketExportPolicyHeading = "## Export artifact policy";
export const workflowTaskPacketExportRequiredLine =
  "Task packet markdown is a required export artifact for live work and must remain present, current, and well-formed.";
export const workflowTaskPacketReviewExportsRequiredLine =
  "Review markdown summaries are required when `review_exports=required`.";
export const workflowTaskPacketReviewExportsRuntimeOptionalLine =
  "Runtime-authenticated review authority may satisfy completion before markdown review summaries exist only when `review_exports=runtime_optional`.";
export const workflowTaskPacketRequiredExportsValidationLine =
  "Required export artifacts must be present and validate under the workflow checker.";
export const workflowTaskPacketProductStateAdvisoryLine =
  "`product-state.md` and `task-queue.json` are advisory export artifacts unless runtime writes or verifies them.";
export const workflowTaskPacketExportBlockingLine =
  "Stale or malformed export artifacts can block release or workflow proof, but they cannot override authenticated runtime truth.";
export const workflowRuntimeOptionalReviewExportsHelperSummaryLine =
  "Use `review_exports=runtime_optional` only when runtime-authenticated review authority covers the gate.";
export const workflowRequiredGateRolesPolicyLine =
  "- required task gates are `reviewer`, `security_reviewer`, and `qa_engineer`";
export const workflowCouncilVsReviewGatePolicyLine =
  "- `council_review_required` is a quality gate, not a fourth review role; it governs pre-implementation decision quality and does not replace the required review trio";
export const workflowReleaseReadinessPolicyLine =
  "- `release_readiness_required` is a quality gate, not a fourth review gate; release-sensitive work must still surface explicit release-readiness evidence in handoffs or review summaries";
export const workflowCompletionAuditPolicyLine =
  "- `completion_audit_required` keeps specialist-verified work in gate scope until review evidence explicitly states the touched outcome is complete, clean, and has no unresolved follow-up work in scope";
export const workflowRuntimeOptionalReviewExportsPolicyLine =
  "- `review_exports=runtime_optional` means runtime-authenticated review records may satisfy completion before markdown review summaries exist; if summaries exist they remain export evidence and must validate against runtime truth";
export const workflowReviewExportsScopeAlignmentPolicyLine =
  "- a task may declare `review_exports=required` only when its allowed write scope includes the referenced markdown review artifacts; otherwise use `runtime_optional` or widen scope explicitly before execution";
export const workflowAuthenticatedGatePolicyLine =
  "- a required gate satisfies completion only when its latest satisfying review has authenticated actor provenance";
export const workflowPassedStatePolicyLine =
  "- a latest review state of `passed` satisfies completion only with authenticated provenance";
export const workflowWaiverPolicyLine =
  "- a `waived` gate satisfies completion only when the review stores actor, actor role, waiver authority, waiver reason, authenticated provenance, and the waiver is authorized by runtime policy";
export const workflowBlockingStatePolicyLine = "- `pending` and `blocked` remain blocking states";
export const workflowHandoffPolicyLine =
  "- handoffs must include changed files, verification notes, and context refs before review starts";
export const workflowLegacyBackfillPolicyLine =
  "- legacy-backfilled review rows are compatibility history and do not satisfy required gates";
export const workflowUnauthorizedWaiverPolicyLine = "- unauthorized or actorless waivers block completion";

export function getWorkflowReviewFilenameAlias(role: WorkflowTemplateReviewRole): string {
  const entry = workflowReviewFilenameAliases.find((value) => value.startsWith(`${role}:`));
  if (!entry) {
    throw new Error(`missing review filename alias for role ${role}`);
  }
  return entry.slice(role.length + 1);
}

export function buildWorkflowReviewArtifactRelativePath(
  taskId: string,
  role: WorkflowTemplateReviewRole
): string {
  return `.devgod/work/reviews/review-${taskId}-${role}.md`;
}

export function buildWorkflowReviewArtifactRelativePaths(
  taskId: string
): Record<WorkflowTemplateReviewRole, string> {
  return {
    reviewer: buildWorkflowReviewArtifactRelativePath(taskId, "reviewer"),
    qa_engineer: buildWorkflowReviewArtifactRelativePath(taskId, "qa_engineer"),
    security_reviewer: buildWorkflowReviewArtifactRelativePath(taskId, "security_reviewer")
  };
}

export function buildWorkflowArtifactRefExampleLines(taskId: string): string[] {
  const reviewPaths = buildWorkflowReviewArtifactRelativePaths(taskId);
  return [
    `brief=.devgod/work/briefs/brief-${taskId}.md`,
    `plan=.devgod/work/plans/plan-${taskId}.md`,
    `task=.devgod/work/tasks/task-${taskId}.md`,
    `reviewer=${reviewPaths.reviewer}`,
    `qa_engineer=${reviewPaths.qa_engineer}`,
    `security_reviewer=${reviewPaths.security_reviewer}`,
    `review_exports=${workflowReviewExportPoliciesDisplay}`
  ];
}

function buildWorkflowTaskTemplateArtifactRefExampleLines(taskId: string): string[] {
  const reviewPaths = buildWorkflowReviewArtifactRelativePaths(taskId);
  return [
    `brief=.devgod/work/briefs/brief-${taskId}.md`,
    `plan=.devgod/work/plans/plan-${taskId}.md`,
    `task=.devgod/work/tasks/task-${taskId}.md`,
    `reviewer=${reviewPaths.reviewer}`,
    `qa_engineer=${reviewPaths.qa_engineer}`,
    `security_reviewer=${reviewPaths.security_reviewer}`,
    workflowReviewExportsDefaultExampleLine
  ];
}

export function renderReviewGatePolicyDocument(): string {
  return [
    "# Review Gate Policy",
    "",
    workflowRuntimeCanonicalRecordsPolicyLine,
    workflowExportArtifactsPolicyLine,
    workflowRequiredReviewExportsPolicyLine,
    workflowRuntimeOptionalReviewExportsPolicyLine,
    workflowSpecialistVerifiedExportPolicyLine,
    workflowRequiredGateRolesPolicyLine,
    workflowCouncilVsReviewGatePolicyLine,
    workflowReleaseReadinessPolicyLine,
    workflowCompletionAuditPolicyLine,
    workflowReviewExportsScopeAlignmentPolicyLine,
    workflowAuthenticatedGatePolicyLine,
    workflowPassedStatePolicyLine,
    workflowWaiverPolicyLine,
    workflowBlockingStatePolicyLine,
    workflowHandoffPolicyLine,
    workflowLegacyBackfillPolicyLine,
    workflowUnauthorizedWaiverPolicyLine,
    ""
  ].join("\n");
}

export const liveTaskRequiredHeadings = [
  "## Owner role",
  "## Completion standard",
  "## Required specialist roles",
  "## Quality gates",
  "## Reasoning quality",
  "## Goal",
  "## Inputs",
  "## Dependencies",
  "## Outputs",
  "## Required runtime traces",
  "## Progress proof",
  "## Workflow artifact refs",
  "## Allowed write scope",
  "## Out of scope",
  "## Assumptions",
  "## Acceptance criteria",
  "## Verification steps",
  "## Required reviews",
  "## Security checks",
  "## Rollback notes"
] as const;

export const liveTaskRequiredReasoningHeadings = [
  "### Approved assumptions",
  "### Blocked assumptions",
  "### Claim",
  "### Facts",
  "### Assumptions",
  "### Hypotheses and alternatives",
  "### Evidence refs",
  "### Counter-evidence",
  "### Confidence",
  "### Open questions",
  "### Verification plan",
  "### Research and debug budgets"
] as const;

export const liveTaskReasoningPolicyHeadings = [
  "## Reasoning policy",
  "### Mode",
  "### Requirements",
  "### Max attempts",
  "## Reasoning attempts",
  "### Attempt records",
  "### Verification records",
  "### Verdict"
] as const;

export const liveTaskRequiredNonEmptyHeadings = [
  "## Required specialist roles",
  "## Quality gates",
  "## Goal",
  "## Inputs",
  "## Dependencies",
  "## Outputs",
  "## Required runtime traces",
  "## Progress proof",
  "## Workflow artifact refs",
  "## Allowed write scope",
  "## Out of scope",
  "## Acceptance criteria",
  "## Verification steps",
  "## Required reviews",
  "## Security checks",
  "## Rollback notes"
] as const;

export const liveTaskRequiredNonEmptyReasoningHeadings = [
  "### Claim",
  "### Facts",
  "### Assumptions",
  "### Hypotheses and alternatives",
  "### Evidence refs",
  "### Counter-evidence",
  "### Confidence",
  "### Verification plan",
  "### Research and debug budgets"
] as const;

export interface WorkflowSchemaArtifact {
  qualityGates: readonly string[];
  uiSurfaces: readonly string[];
  reasoningWorkflowModes: readonly string[];
  workflowTemplateReviewRoles: readonly string[];
  workflowReviewFilenameAliases: readonly string[];
  workflowReviewActorRoles: readonly string[];
  workflowReviewProvenanceStatuses: readonly string[];
  workflowReviewExportPolicies: readonly string[];
  workflowArtifactRefKeys: readonly string[];
  workflowArtifactRefGuidanceLine: string;
  workflowArtifactRefFormatIntroLine: string;
  workflowArtifactRefExampleLines: readonly string[];
  workflowReviewExportsRuntimeOptionalGuidanceLine: string;
  playwrightRequirementStates: readonly string[];
  strongerArtifactQualityGates: readonly string[];
  liveTaskRequiredHeadings: readonly string[];
  liveTaskRequiredReasoningHeadings: readonly string[];
  liveTaskReasoningPolicyHeadings: readonly string[];
  liveTaskRequiredNonEmptyHeadings: readonly string[];
  liveTaskRequiredNonEmptyReasoningHeadings: readonly string[];
}

export function buildWorkflowSchemaArtifact(): WorkflowSchemaArtifact {
  return {
    qualityGates,
    uiSurfaces,
    reasoningWorkflowModes,
    workflowTemplateReviewRoles,
    workflowReviewFilenameAliases,
    workflowReviewActorRoles,
    workflowReviewProvenanceStatuses,
    workflowReviewExportPolicies,
    workflowArtifactRefKeys,
    workflowArtifactRefGuidanceLine,
    workflowArtifactRefFormatIntroLine,
    workflowArtifactRefExampleLines: buildWorkflowArtifactRefExampleLines("<task-id>"),
    workflowReviewExportsRuntimeOptionalGuidanceLine,
    playwrightRequirementStates: workflowPlaywrightRequirementStates,
    strongerArtifactQualityGates,
    liveTaskRequiredHeadings,
    liveTaskRequiredReasoningHeadings,
    liveTaskReasoningPolicyHeadings,
    liveTaskRequiredNonEmptyHeadings,
    liveTaskRequiredNonEmptyReasoningHeadings
  };
}

export function renderWorkflowSchemaArtifactJson(): string {
  return JSON.stringify(buildWorkflowSchemaArtifact(), null, 2) + "\n";
}

function section(heading: string, ...lines: string[]): string[] {
  return lines.length === 0 ? [heading, ""] : [heading, "", ...lines, ""];
}

function joinValues(values: readonly string[]): string {
  return values.join(" | ");
}

export function renderIntakeBriefTemplate(): string {
  return [
    "# Intake Brief Template",
    "",
    ...section("## Brief ID", "`brief-<task-id>`"),
    ...section("## Task ID", "`<task-id>`"),
    ...section("## Request", "Original user ask:"),
    ...section("## Goal"),
    ...section("## Intended outcome"),
    ...section("## User"),
    ...section("## Problem"),
    ...section("## Value"),
    ...section("## Audience"),
    ...section("## Constraints"),
    ...section("## Risks"),
    ...section("## Unknowns"),
    ...section("## Clarifying questions"),
    ...section("## Council need", `\`${joinValues(workflowCouncilNeeds)}\``),
    ...section("## Council rationale"),
    ...section("## Assumptions"),
    ...section("### Approved assumptions"),
    ...section("### Blocked assumptions"),
    ...section("## Evidence"),
    ...section("## Reasoning quality"),
    ...section("### Facts"),
    ...section("### Hypotheses and alternatives"),
    ...section("### Counter-evidence"),
    ...section("### Confidence"),
    ...section("### Research and debug budget"),
    ...section("### Verification plan"),
    ...section("## Success Criteria"),
    ...section("## Completion bar"),
    ...section("## Good-path outcomes"),
    ...section("## Bad-path or edge-case outcomes"),
    ...section("## Non-goals"),
    ...section("## Out of scope"),
    ...section("## Council handoff target", `\`${joinValues(workflowCouncilHandoffTargets)}\``),
    ...section("## Trust boundaries"),
    ...section("## Stop Go", `\`${joinValues(workflowStopGoStates)}\``),
    ...section("## Next step", "Planner action required:")
  ].join("\n").trimEnd() + "\n";
}

export function renderReviewGateTemplate(): string {
  return [
    "# Review Gate Template",
    "",
    ...section("## Task ID", "`<task-id>`"),
    ...section("## Reviewer role", `\`${joinValues(workflowTemplateReviewRoles)}\``),
    ...section("## Actor", "`<recorded-actor-id>`"),
    ...section("## Actor role", `\`${joinValues(workflowReviewActorRoles)}\``),
    ...section("## Provenance status", `\`${joinValues(workflowReviewProvenanceStatuses)}\``),
    "This markdown file is a manager-written summary. `runtime_verified` means the handoff cites a trusted runtime or authenticated source elsewhere. `summary_only` and `legacy_backfill` are documentation states, not gate proof by themselves.",
    "",
    ...section("## Review state", `\`${joinValues(reviewStates)}\``),
    "This template records summary state only. The workflow checker validates state, decision, and waiver-field consistency, but trusted reviewer authority and final blocking decisions still come from runtime evidence plus manager/reviewer policy. `pending` and `blocked` remain blocking states for completion.",
    "",
    ...section("## Severity", `\`${joinValues(reviewSeverities)}\``),
    ...section("## Specialist execution evidence", "List the evidence used to trust the claimed specialist ownership for this task."),
    ...section("## Quality gate evidence", "List the evidence used to trust the declared quality gates for this task.", "", "When `council_review_required` applies, cite the DAC decision packet, recorded outcome, dissent owner, and any approval conditions or exception expiry carried into implementation.", "", "When `completion_audit_required` applies, explicitly state that a completion audit was performed and that the touched scope is complete, clean, and has no unresolved in-scope follow-up work."),
    ...section("## Reasoning quality findings", "Call out weak assumptions, missing alternatives, contradictory evidence, low confidence, or exhausted budgets here."),
    ...section("## Findings"),
    ...section("## Residual risk"),
    ...section("## Verification evidence", "List exact commands, fixtures, or repro steps used for this gate.", "", "When `Provenance status` is `runtime_verified` for `specialist_verified` work, include at least one `Runtime proof:` line here that names the authenticated runtime artifact or check summarized by this markdown.", "", "For `qa_engineer` reviews on tasks with `playwright_required = true`, cite Playwright evidence refs here, including the desktop/mobile coverage and any browser artifact paths or runtime evidence refs used to support approval.", "", "For `reviewer` and `qa_engineer` reviews on tasks with `completion_audit_required`, include a completion-audit statement here that confirms the touched scope is complete, clean, and has no unresolved in-scope follow-up work."),
    ...section("## Waiver authority", `\`${joinValues(reviewWaiverAuthorities)}\``),
    "Use `none` for `pending`, `passed`, and `blocked` reviews. Use `manager` for waived `reviewer` or `qa_engineer` gates recorded by `planner` or `solution_architect`. Use `security_exception` for waived `security_reviewer` gates recorded by `security_reviewer`.",
    "",
    ...section("## Waiver reason", "Do not waive a required gate without actor, actor role, authority, and explicit reason. Unauthorized waivers remain blocking."),
    ...section("## Decision", `\`${joinValues(approvalDecisions)}\``),
    ...section("## Source handoff", "Manager-written summary of reviewer output. Cite the trusted source here when `Provenance status` is `runtime_verified`, because the markdown file alone is not proof.", "", "For `specialist_verified` work with `runtime_verified` provenance, include a `Runtime proof:` line here that points to the same authenticated runtime artifact summarized above.")
  ].join("\n").trimEnd() + "\n";
}

export function renderTaskPacketTemplate(): string {
  return [
    "# Task Packet Template",
    "",
    ...section("## Task ID", "`<task-id>`"),
    ...section("## Owner role", "`<owner-role>`"),
    ...section("## Completion standard", `\`${joinValues(completionStandards)}\``),
    ...section("## Required specialist roles", "List the specialist roles whose execution must be evidenced before completion."),
    ...section("## Quality gates", "List the task-type gates that apply, for example:", "", "Only assign file-backed gates when the task can actually produce or update the required artifacts inside its allowed write scope.", "", ...qualityGates.map((gate) => `- \`${gate}\``)),
    ...section("## Goal"),
    ...section("## Inputs"),
    ...section("## UI surface", "Declare the touched UI shape for this task.", "", "Declare one:", "", ...uiSurfaces.map((value) => `- \`${value}\``)),
    ...section("## Playwright requirement", `\`${joinValues(workflowPlaywrightRequirementStates)}\``),
    ...section("## Browser evidence expectations", "State the browser evidence expectations for this task.", "", "For UI surfaces other than `none`, QA reviews must cite Playwright evidence."),
    ...section("## Frontend workflow entrypoint", "Required for substantive frontend work.", "", "State the repo-local frontend routing skill or say `not_applicable`."),
    ...section("## Visual direction package", "Required for substantive `visual_change` work and broad redesigns.", "", "- inspiration sources and reference URLs", "- visual exploration artifact refs", "- reference translation brief", "- design variants explored", "- chosen direction", "- rejected alternatives and why", "- chosen direction artifact ref", "- rejected direction artifact refs", "- opposite-direction artifact ref", "- named signature move", "- named impressiveness hypothesis", "- design-family reset", "- repeated primitive ban", "- media-first concept decision", "- generated asset decision", "- surface-language continuity plan", "- semantic charm map", "- asset strategy", "- motion strategy", "- idle/background motion rationale", "- media strategy", "- generated imagery or illustration rationale", "- 3D or no-3D rationale", "- technical-fit rationale", "- reduced-motion fallback", "- performance containment plan", "- critical control inventory", "- control visibility map", "- inheritance cutoff", "- legacy carryover ban", "- remake-vs-edit decision", "- functionality-preservation checks", "- screenshot critique loop plan"),
    ...section("## Dependencies"),
    ...section("## Outputs"),
    ...section("## Required runtime traces"),
    ...section("## Progress proof"),
    ...section(
      "## Workflow artifact refs",
      workflowArtifactRefGuidanceLine,
      "",
      workflowArtifactRefFormatIntroLine,
      "",
      ...buildWorkflowTaskTemplateArtifactRefExampleLines("<task-id>"),
      "",
      workflowReviewExportsAllowedValuesGuidanceLine,
      "",
      workflowReviewExportsRuntimeOptionalGuidanceLine,
      "",
      workflowReviewExportsScopeAlignmentGuidanceLine
    ),
    ...section(
      workflowTaskPacketExportPolicyHeading,
      workflowTaskPacketExportRequiredLine,
      "",
      workflowTaskPacketReviewExportsRequiredLine,
      "",
      workflowTaskPacketReviewExportsRuntimeOptionalLine,
      "",
      workflowTaskPacketRequiredExportsValidationLine,
      "",
      workflowTaskPacketProductStateAdvisoryLine,
      "",
      workflowTaskPacketExportBlockingLine
    ),
    ...section("## Council review", "Declare the council state for this task."),
    ...section("### Required", `\`${joinValues(workflowCouncilRequiredStates)}\``),
    ...section("### Trigger rationale", "State why the council is required, inherited from a parent decision, or intentionally bypassed as trivial/local work."),
    ...section("### Decision packet", "Use a repo-relative path when a packet exists, for example:", "", "- `.devgod/work/council/dac-<task-id>.md`", "- `.devgod/work/council/adr-<task-id>.md`"),
    ...section("### Council members", "List the roles participating in the council review when required."),
    ...section("### Dissent owner", "Name the role responsible for arguing at least one serious alternative and recording unresolved objections."),
    ...section("### Outcome", `\`${joinValues(workflowCouncilOutcomes)}\``),
    ...section("### Exception expiry", "State `none` when no exception applies."),
    ...section("## Allowed write scope"),
    ...section("## Allowed successor task scope", "Declare zero or more pre-authorized follow-on task packet paths when the manager may need to prepare the next slice without reopening the full workflow contract.", "", "Use repo-relative paths, for example:", "", "- `.devgod/work/tasks/task-next-slice.md`"),
    ...section("## Scope expansion protocol", "If an otherwise valid implementation step falls outside the allowed write scope:", "", "- stop immediately", "- name the exact blocked paths", "- record the minimum safe scope expansion using `blocked_paths`, `requested_write_scope`, and a short reason", "- prefer narrow expansions or explicit follow-on slices over widening the entire task"),
    ...section("## Out of scope"),
    ...section("## Assumptions"),
    ...section("### Approved assumptions"),
    ...section("### Inheritance policy", "For remake work, state which visible structures from the current surface are intentionally discarded and which functional elements must survive in a new form."),
    ...section("### Blocked assumptions"),
    ...section("## Reasoning quality"),
    ...section("### Claim"),
    ...section("### Facts"),
    ...section("### Assumptions"),
    ...section("### Hypotheses and alternatives"),
    ...section("### Evidence refs"),
    ...section("### Counter-evidence"),
    ...section("### Confidence"),
    ...section("### Open questions"),
    ...section("### Verification plan"),
    ...section("### Research and debug budgets"),
    ...section("## Completion audit", `${workflowSpecialistVerifiedCompletionAuditRequirementLine}.`),
    ...section("### Audit claim", "State what must be true for the task to count as actually complete, not merely green on tests."),
    ...section("### Audit evidence expectations", "List the evidence that reviewer and QA outputs must cite to prove the touched scope is complete, clean, and free of unresolved in-scope follow-up work."),
    ...section("### Loop-back trigger", "State the condition that forces the task back to implementation instead of allowing review approval, for example uncovered edge cases, polish gaps, stale TODOs, or user-visible incompleteness."),
    ...section("## Reasoning policy"),
    ...section("### Mode", `\`${joinValues(reasoningWorkflowModes)}\``),
    "Use `strict` by default. Use `dual` or `legacy` only when compatibility needs are explicit.",
    "",
    ...section("### Requirements", "State whether this task requires explicit reasoning blocks, attempts, trace refs, verifications, critic verification, and a final verdict."),
    ...section("### Max attempts", "Record the bounded attempt budget when strict or dual mode is used."),
    ...section("## Reasoning attempts"),
    ...section("### Attempt records", "List each bounded reasoning attempt with:", "", "- id", "- label", "- hypothesis", "- alternatives", "- evidence refs", "- verification refs", "- trace ref", "- outcome", "- summary"),
    ...section("### Verification records", "List each verification record with:", "", "- id", "- kind", "- ref", "- status", "- summary"),
    ...section("### Verdict", "Record the current verdict and why:", "", "- status: `supported | insufficient_evidence | contradicted | budget_exhausted | needs_review`", "- summary", "- supporting attempt ids", "- blocking issues"),
    ...section("## Behavior to preserve", "Required for refactors, migrations, command rewrites, and other behavior-preserving changes."),
    ...section("## Acceptance criteria", "For broad frontend remakes, include one criterion that proves the result does not remain in the prior concept family."),
    ...section("## Verification steps", "List the exact commands, checks, fixtures, runtime proofs, and review evidence required to defend completion."),
    ...section("## Required reviews", "List the gate roles that must approve this task before completion.", "", "Examples:", "", ...workflowTemplateReviewRoles.map((role) => `- \`${role}\``)),
    ...section("## Security checks"),
    ...section("## Rollback notes", "Record the fastest safe way to revert or abandon the slice if verification fails or the task is superseded."),
    ...section("## Residual risk disposition", "Record the remaining risks, owner, and whether they are accepted, deferred, or require a follow-on task.")
  ].join("\n").trimEnd() + "\n";
}
