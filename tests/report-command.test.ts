import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReviewActionContextResolver,
  type AuthenticatedPrincipal,
  type ReviewIdentityBindings
} from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { ReviewActionContext, TaskPacketInput } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { executeReportCommandFromArgs } from "../src/admin.ts";
import { formatRunEvidenceReportMarkdown } from "../src/admin/report.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function taskPacket(overrides: Partial<TaskPacketInput> = {}): TaskPacketInput {
  return {
    taskId: overrides.taskId ?? "task-1",
    title: overrides.title ?? "Create task graph",
    ownerRole: overrides.ownerRole ?? "planner",
    completionStandard: overrides.completionStandard ?? "specialist_verified",
    requiredSpecialistRoles:
      overrides.requiredSpecialistRoles ??
      [((overrides.ownerRole ?? "planner") as TaskPacketInput["requiredSpecialistRoles"][number])],
    qualityGates: overrides.qualityGates ?? ["product_acceptance"],
    goal: overrides.goal ?? "Build task graph",
    inputs: overrides.inputs ?? ["intake brief"],
    outputs: overrides.outputs ?? ["task packets"],
    dependencies: overrides.dependencies ?? [],
    allowedWriteScope: overrides.allowedWriteScope ?? [".devgod/work/tasks"],
    outOfScope: overrides.outOfScope ?? ["production deploys"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["task packet exists"],
    verificationSteps: overrides.verificationSteps ?? ["review generated packet"],
    requiredReviews: overrides.requiredReviews ?? ["reviewer", "security_reviewer", "qa_engineer"],
    securityChecks: overrides.securityChecks ?? ["ensure write scope is narrow"],
    antiPatterns: overrides.antiPatterns ?? ["broad repo edits"],
    rollbackNotes: overrides.rollbackNotes ?? "delete the generated task packet",
    handoffFormat: overrides.handoffFormat ?? "summary + blockers + changed files",
    reasoningPolicy: overrides.reasoningPolicy ?? {
      mode: "strict",
      requireBlock: true,
      requireAttempts: true,
      requireTraceRefs: true,
      requireVerification: true,
      requireCriticVerification: true,
      maxAttempts: 3
    },
    reasoningAttempts: overrides.reasoningAttempts ?? [
      {
        id: "attempt-1",
        label: "report fixture reasoning",
        hypothesis: "the report fixture should be strict-complete by default",
        alternatives: ["downgrade only when a compatibility-specific report is under test"],
        evidenceRefs: ["tests/report-command.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://report-task-packet",
        outcome: "supported",
        summary: "default report fixture includes strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://report-task-packet",
        status: "passed",
        summary: "default report fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default report fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? {
      claim: "the report fixture has sufficient evidence",
      facts: ["report output is under test"],
      assumptions: ["the task packet remains bounded"],
      hypotheses: ["strict-ready packets should still render correctly"],
      evidenceRefs: ["tests/report-command.test.ts"],
      counterEvidence: [],
      openQuestions: [],
      verificationPlan: ["npm test"],
      fallbacks: ["make compatibility mode explicit in report fixtures when required"],
      budgets: { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
      confidence: "medium",
      decision: "supported"
    }
  };
}

function createService(store: MemoryStore = new MemoryStore()) {
  const registeredContexts = new Map<string, ReviewActionContext>();
  const registeredPrincipals = new Map<string, AuthenticatedPrincipal>();
  const bindings: ReviewIdentityBindings = { bindings: [] };

  function upsertBinding(actor: string, context: ReviewActionContext, principal: AuthenticatedPrincipal) {
    let principalBinding = bindings.bindings.find(
      (binding) =>
        binding.principal.provider === principal.provider && binding.principal.subject === principal.subject
    );

    if (!principalBinding) {
      principalBinding = {
        principal: {
          provider: principal.provider,
          subject: principal.subject
        },
        actors: []
      };
      bindings.bindings.push(principalBinding);
    }

    const actorBinding = principalBinding.actors.find((binding) => binding.actor === actor);
    const nextActorBinding = {
      actor,
      roles: [context.actorRole],
      waiverAuthorities:
        context.waiverAuthority && context.waiverAuthority !== "none"
          ? [context.waiverAuthority]
          : undefined
    };

    if (!actorBinding) {
      principalBinding.actors.push(nextActorBinding);
      return;
    }

    actorBinding.roles = nextActorBinding.roles;
    actorBinding.waiverAuthorities = nextActorBinding.waiverAuthorities;
  }

  return {
    store,
    service: new DevgodCoreService(store, {
      resolveReviewActionContext: createReviewActionContextResolver({
        bindings,
        resolveAuthenticatedPrincipal(input) {
          const context = registeredContexts.get(input.actor) ?? {
            actor: input.actor,
            actorRole: "reviewer" as const,
            waiverAuthority: "none" as const
          };
          const principal = registeredPrincipals.get(input.actor) ?? {
            provider: "test",
            subject: input.actor,
            verified: true
          };
          upsertBinding(input.actor, context, principal);
          return principal;
        }
      })
    }),
    registerReviewContext(
      context: ReviewActionContext,
      principal: AuthenticatedPrincipal = {
        provider: "test",
        subject: context.actor,
        verified: true
      }
    ) {
      registeredContexts.set(context.actor, context);
      registeredPrincipals.set(context.actor, principal);
      upsertBinding(context.actor, context, principal);
      return context.actor;
    }
  };
}

test("executeReportCommandFromArgs builds an evidence report with timeline and gate history", async () => {
  const { service, store, registerReviewContext } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Ship milestone slices",
    request: "Implement runtime and operator surface slices."
  });

  await service.createPlan({
    runId: run.id,
    title: "Roadmap slice",
    summary: "Ship the first packaged surfaces.",
    milestones: ["runtime wrapper", "operator reporting"],
    decisions: ["keep GitHub intake advisory"],
    residualRisks: ["hosted UI still out of scope"],
    acceptanceCriteria: ["operator report exists", "task graph exists"]
  });
  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "plan",
      title: "Plan runtime wrapper",
      allowedWriteScope: ["src/admin"]
    }),
    taskPacket({
      taskId: "build",
      title: "Implement wrapper",
      ownerRole: "backend_engineer",
      requiredSpecialistRoles: ["backend_engineer"],
      dependencies: ["plan"],
      allowedWriteScope: ["src/admin/devgod.ts"]
    })
  ]);

  await service.claimTask(run.id, "plan", "planner-owner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner-owner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "Defined the wrapper scope and execution constraints.",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["checked scope boundaries"],
    executionEvidence: ["task packet filled", "review scope narrowed"],
    qualityGateEvidence: ["acceptance criteria enumerated"],
    contextRefs: ["brief://roadmap"]
  });

  registerReviewContext({ actor: "reviewer-actor", actorRole: "reviewer", waiverAuthority: "none" });
  registerReviewContext({
    actor: "security-actor",
    actorRole: "security_reviewer",
    waiverAuthority: "none"
  });
  registerReviewContext({ actor: "qa-actor", actorRole: "qa_engineer", waiverAuthority: "none" });

  await service.recordReview(run.id, "plan", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", "security-actor", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", "qa-actor", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "markdown"], {
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
    }
  });

  assert.equal(result.format, "markdown");
  assert.equal(result.report.summary.totalTasks, 2);
  assert.equal(result.report.summary.totalHandoffs, 1);
  assert.equal(result.report.summary.totalReviews, 3);
  assert.equal(result.report.summary.totalApprovals, 3);
  assert.equal(result.report.reasoningQuality.status, "pass");
  assert.equal(result.report.reasoningQuality.warningCount, 0);
  assert.deepEqual(result.report.reasoningQuality.legacyTaskIds, []);
  assert.ok(result.report.reasoningQuality.strictTaskIds.includes("plan"));
  assert.ok(result.report.reasoningQuality.strictTaskIds.includes("build"));
  assert.deepEqual(result.report.reasoningQuality.taskIdsWithWarnings, []);
  assert.deepEqual(result.report.summary.reviewBlockedTaskIds, []);
  assert.ok(result.report.timeline.some((entry) => entry.kind === "handoff_recorded"));
  assert.ok(result.report.timeline.some((entry) => entry.kind === "review_recorded"));
  assert.ok(result.report.timeline.some((entry) => entry.kind === "approval_recorded"));
  assert.deepEqual(
    result.report.tasks.map((task) => [task.taskId, task.status]),
    [
      ["plan", "approved"],
      ["build", "ready"]
    ]
  );

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /# devgod run report/);
  assert.match(markdown, /Plan runtime wrapper/);
  assert.match(markdown, /## Reasoning Quality/);
  assert.match(markdown, /strict tasks:/);
  assert.match(markdown, /reasoning-quality: pass/);
  assert.match(markdown, /approval_recorded task=`plan`/);
});

test("executeReportCommandFromArgs includes autonomous coverage, gap, checkpoint, and resume summaries", async () => {
  const { service, store, registerReviewContext } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous follow-through",
    request: "Do not stop at shallow summaries."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      ownerRole: "backend_engineer",
      requiredSpecialistRoles: ["backend_engineer"],
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  registerReviewContext({ actor: "reviewer-actor", actorRole: "reviewer", waiverAuthority: "none" });
  registerReviewContext({
    actor: "security-actor",
    actorRole: "security_reviewer",
    waiverAuthority: "none"
  });
  registerReviewContext({ actor: "qa-actor", actorRole: "qa_engineer", waiverAuthority: "none" });
  await service.claimTask(run.id, "rewrite", "backend_engineer");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "backend_engineer",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["backend handoff recorded"],
    qualityGateEvidence: ["autonomous continuation evidence recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", "security-actor", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", "qa-actor", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:core-loop",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 3,
      callsitesAnalyzed: 3,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-15T11:00:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:checkpoint-proof",
      targetId: "task:rewrite",
      kind: "missing_validation",
      severity: "high",
      description: "Checkpoint follow-through still needs live workflow proof.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "reviewer",
      suggestedNextActions: ["run workflow-proof after authenticated reviews"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-autonomous",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Authenticated workflow proof is still blocking completion.",
    createdAt: "2026-05-15T11:03:00.000Z"
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-autonomous",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/admin.ts:1"],
    openGaps: ["gap:checkpoint-proof"],
    nextActions: ["run workflow-proof after authenticated reviews"],
    compressedContextRef: "memory://cp-autonomous",
    createdAt: "2026-05-15T11:04:00.000Z"
  });

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.configured, true);
  assert.equal(result.report.autonomous.latestCheckpoint?.checkpointId, "cp-autonomous");
  assert.equal(result.report.autonomous.latestProgressProof?.proofId, "proof-autonomous");
  assert.equal(result.report.autonomous.blockingGaps[0]?.id, "gap:checkpoint-proof");
  assert.equal(result.report.autonomous.resume.status, "blocked");
  assert.equal(result.report.autonomous.resume.source, "blocking_gap");

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /## Autonomous Execution/);
  assert.match(markdown, /latest checkpoint: cp-autonomous/);
  assert.match(markdown, /latest proof: proof-autonomous/);
  assert.match(markdown, /resume: blocked\/blocking_gap/);
});

test("executeReportCommandFromArgs marks advisory continuation targets as operator-required", async () => {
  const { service, store, registerReviewContext } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Advisory continuation report",
    request: "Show when autonomous continuation needs operator input."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      ownerRole: "backend_engineer",
      requiredSpecialistRoles: ["backend_engineer"],
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  registerReviewContext({ actor: "reviewer-actor", actorRole: "reviewer", waiverAuthority: "none" });
  registerReviewContext({
    actor: "security-actor",
    actorRole: "security_reviewer",
    waiverAuthority: "none"
  });
  registerReviewContext({ actor: "qa-actor", actorRole: "qa_engineer", waiverAuthority: "none" });
  await service.claimTask(run.id, "rewrite", "backend_engineer");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "backend_engineer",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["backend handoff recorded"],
    qualityGateEvidence: ["autonomous continuation evidence recorded"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "rewrite", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", "security-actor", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "rewrite", "qa-actor", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:core-loop",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 3,
      callsitesAnalyzed: 3,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-15T11:00:00.000Z"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-advisory",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "artifact:resume",
    whyNext: "This remains advisory-only.",
    createdAt: "2026-05-15T11:03:00.000Z"
  });

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.resume.executionMode, "operator_required");
  assert.match(
    result.report.autonomous.resume.executionSummary,
    /operator input is required for advisory continuation target artifact:resume/
  );

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /resume execution: operator_required/);
});

test("formatRunEvidenceReportMarkdown clarifies workflow-proof-only runs without autonomous state", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Workflow-proof only report",
    request: "Explain a valid run that has no autonomous continuation state."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.configured, false);
  assert.match(
    result.report.autonomous.resume.summary,
    /workflow proof for the run can still be valid, but this run does not prove active autonomous continuation/
  );

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /configured: no/);
  assert.match(
    markdown,
    /workflow proof can still be valid; this report has no active autonomous continuation evidence for the run/
  );
});

test("executeReportCommandFromArgs surfaces generated code-backed inventory in the autonomous report section", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Generated inventory report",
    request: "Expose generated understanding state through the report surface."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "inventory",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "inventory",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "tests"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1
      }
    }
  });
  await service.generateRepoInventory(run.id, {
    repoRoot,
    now: "2026-05-20T12:33:00.000Z"
  });

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.ok((result.report.autonomous.comprehensionSummary?.inventoryCompleteness ?? 0) > 0);
  assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("repo_map"));
  assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("domain_map"));
  assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("symbol_graph"));
  assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("dependency_graph"));

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /comprehension: inventory=/);
});

test("executeReportCommandFromArgs surfaces generated inventory gaps from ambiguous repo code", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "devgod-report-inventory-"));
  const { service, store } = createService();

  try {
    await mkdir(path.join(fixtureRoot, "src", "admin"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "core"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "mcp"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "policy"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "domain"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "src", "config"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "scripts"), { recursive: true });

    await writeFile(path.join(fixtureRoot, "package.json"), '{"name":"fixture","version":"1.0.0"}\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "admin", "router.ts"), 'export function handle(command: string) { if (command === "status") return "ok"; return "missing"; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "admin", "dynamic.ts"), 'export function run(command: string, handlers: Record<string, () => string>) { const handler = handlers[command]; return handler?.() ?? "missing"; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "core", "service.ts"), 'import { RecordModel } from "../domain/model"; export class BillingService { run(model: RecordModel) { return model.id; } }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "mcp", "client.ts"), 'export async function syncRemote() { return fetch("https://example.com/health"); }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "policy", "access.ts"), 'export function authorizeUser(token: string, permission: string) { return token.length > 0 && permission === "read"; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "domain", "model.ts"), 'export interface RecordModel { id: string; }\n', "utf8");
    await writeFile(path.join(fixtureRoot, "src", "config", "runtime.ts"), 'export const apiUrl = process.env.API_URL ?? "https://example.com";\n', "utf8");
    await writeFile(path.join(fixtureRoot, "scripts", "sync.sh"), 'echo sync\n', "utf8");

    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Ambiguous inventory command report",
      request: "Expose generated inventory gaps through the report command."
    });

    await service.createTaskGraph(run.id, [
      taskPacket({
        taskId: "inventory",
        qualityGates: ["product_acceptance", "coverage_ledger_required"]
      })
    ]);
    await service.configureAutonomousExecution(run.id, {
      profile: "legacy_rewrite",
      phase: "inventory",
      manifest: {
        runId: run.id,
        profile: "legacy_rewrite",
        requiredCategories: ["services", "external_integrations", "configuration", "authorization"],
        thresholds: {
          criticalItemCoverage: 0.8,
          criticalItemValidation: 0.6,
          callsiteCoverage: 0.85,
          runtimeTraceCoverage: 0.75,
          inventoryCompleteness: 1
        }
      }
    });
    await service.generateRepoInventory(run.id, {
      repoRoot: fixtureRoot,
      now: "2026-05-20T16:03:00.000Z"
    });

    const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
      }
    });

    assert.ok(result.report.autonomous.openGaps.some((gap) => gap.targetId === "file:src/admin/dynamic.ts"));
    assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("route_map"));
    assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("integration_map"));
    assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("domain_map"));
    assert.ok(result.report.autonomous.comprehensionSummary?.presentUnderstandingKinds.includes("dependency_graph"));

    const markdown = formatRunEvidenceReportMarkdown(result.report);
    assert.match(markdown, /gaps: open=/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("executeReportCommandFromArgs includes runtime trace registry summaries and missing risky targets", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Runtime trace report",
    request: "Expose runtime trace registry evidence through the report."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "trace-registry",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services", "external_integrations"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: isoHoursAgo(2)
    },
    {
      id: "service:core-loop",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 1,
      callsitesAnalyzed: 1,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: isoHoursAgo(2)
    },
    {
      id: "integration:payments",
      category: "external_integrations",
      state: "fully_analyzed",
      criticality: "high",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 1,
      callsitesAnalyzed: 1,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: isoHoursAgo(2)
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:core-loop-trace",
      targetId: "service:core-loop",
      kind: "missing_runtime_trace",
      severity: "high",
      description: "Core loop still lacks a recorded risky runtime trace.",
      blocking: true,
      evidenceRefs: ["tests/report-command.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["record core loop runtime trace"],
      status: "open"
    },
    {
      id: "gap:payments-trace",
      targetId: "integration:payments",
      kind: "missing_runtime_trace",
      severity: "high",
      description: "Payment integration still lacks a risky runtime trace.",
      blocking: true,
      evidenceRefs: ["tests/report-command.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["record payment runtime trace"],
      status: "open"
    }
  ]);
  await service.captureRuntimeTrace(run.id, {
    traceId: "trace:workflow-proof-side-effect",
    targetId: "service:workflow-proof",
    kind: "side_effect",
    risky: true,
    sideEffects: ["records workflow proof completion"],
    evidenceRefs: ["tests/report-command.test.ts"],
    createdAt: isoHoursAgo(1)
  });
  await service.importRuntimeTrace(run.id, {
    traceId: "trace:payments-import",
    targetId: "integration:payments",
    kind: "integration",
    risky: true,
    sideEffects: ["submits a payment provider charge"],
    evidenceRefs: ["tests/report-command.test.ts"],
    createdAt: isoHoursAgo(49)
  });

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.traceRegistry?.riskyTraceCount, 2);
  assert.deepEqual(result.report.traceRegistry?.riskyTargetsMissingTrace, ["service:core-loop"]);
  assert.deepEqual(result.report.traceRegistry?.openMissingTraceGapIds, ["gap:core-loop-trace"]);
  assert.deepEqual(result.report.traceRegistry?.operatorImportTargetIds, ["integration:payments"]);
  assert.equal(
    result.report.traceRegistry?.targets.find((target) => target.targetId === "integration:payments")
      ?.latestAuthorityLabel,
    "operator_import"
  );

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /## Runtime Trace Registry/);
  assert.match(markdown, /freshness window: 24h reference=/);
  assert.match(markdown, /missing risky targets: service:core-loop/);
  assert.match(markdown, /operator-import trace targets: integration:payments/);
  assert.match(markdown, /open missing-trace gaps: gap:core-loop-trace/);
  assert.match(markdown, /service:workflow-proof\[trace:workflow-proof-side-effect\]\{freshness=fresh provenance=runtime_capture\}/);
  assert.match(markdown, /integration:payments\[trace:payments-import\]\{freshness=stale provenance=operator_import\}/);
});

test("executeReportCommandFromArgs includes checkpoint compaction evidence and self-referential checkpoint resume guidance", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint compaction report",
    request: "Expose operational compressed context evidence through the report."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "resume",
      qualityGates: ["product_acceptance", "memory_compaction_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "standard_delivery",
    phase: "validation",
    manifest: {
      runId: run.id,
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-generated",
    phase: "validation",
    activeTargets: [],
    recentEvidenceRefs: ["src/core/service.ts:1", "tests/report-command.test.ts"],
    openGaps: [],
    nextActions: ["resume generated checkpoint context"],
    createdAt: "2026-05-20T13:45:00.000Z"
  });

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.status.compaction.status, "present");
  assert.equal(result.report.status.compaction.checkpointId, "cp-generated");

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /## Checkpoint Compaction/);
  assert.match(markdown, /memory:\/\/checkpoint\/cp-generated\/compressed-context/);
  assert.match(markdown, /summary: phase=validation; targets=checkpoint:cp-generated; open-gaps=none/);
});

test("executeReportCommandFromArgs carries profile-limited readiness for standard delivery runs", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Profile-limited report",
    request: "Surface task-scoped readiness without pretending it is broad rewrite proof."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "delivery",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "standard_delivery",
    phase: "validation",
    manifest: {
      runId: run.id,
      profile: "standard_delivery",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:delivery-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["delivery sequencing must preserve runtime authority"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-20T15:02:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "integration_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/report-command.test.ts"],
    updatedAt: "2026-05-20T15:02:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:delivery-core",
      targetId: "service:delivery-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists task-scoped delivery evidence"],
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-20T15:02:00.000Z"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.comprehensionSummary?.readinessScope, "profile_limited");
  assert.equal(result.report.autonomous.comprehensionSummary?.rewriteReadiness, "profile_limited");
  assert.match(
    result.report.autonomous.comprehensionSummary?.profileLimitations.join(" | ") ?? "",
    /does not establish broad rewrite readiness/
  );
});

test("executeReportCommandFromArgs explains withheld rewrite readiness when inventory ambiguity remains open", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Rewrite gating command report",
    request: "Explain why rewrite readiness was withheld in the report command."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1,
        businessRuleCoverage: 1,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 1
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:rewrite-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["rewrite planning must require grounded repo comprehension"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-20T16:22:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/report-command.test.ts"],
    updatedAt: "2026-05-20T16:22:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:rewrite-core",
      targetId: "service:rewrite-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists rewrite planning state"],
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-20T16:22:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:rewrite-ambiguity",
      targetId: "file:src/admin/dynamic.ts",
      kind: "missing_inventory",
      severity: "medium",
      description: "dynamic discovery signals in src/admin/dynamic.ts require manual follow-up before rewrite planning is safe",
      blocking: false,
      evidenceRefs: ["tests/report-command.test.ts"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["inspect src/admin/dynamic.ts and record the concrete handler surface"],
      status: "open"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.comprehensionSummary?.rewriteReadiness, "blocked");
  assert.match(
    result.report.autonomous.comprehensionSummary?.missingEvidence.join(" | ") ?? "",
    /inventory gap open: dynamic discovery signals in src\/admin\/dynamic.ts require manual follow-up/
  );
  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /rewrite=blocked/);
});

test("executeReportCommandFromArgs treats invariants as business-rule coverage evidence", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Invariant-backed report",
    request: "Surface invariants as semantic rewrite evidence in the report command."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75,
        inventoryCompleteness: 1,
        businessRuleCoverage: 1,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:rewrite-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      invariants: ["authenticated review authority must hold before rewrite completion"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-21T11:05:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/report-command.test.ts"],
    updatedAt: "2026-05-21T11:05:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:rewrite-core",
      targetId: "service:rewrite-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists rewrite gating evidence"],
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-21T11:05:00.000Z"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.comprehensionSummary?.businessRuleCoverage, 1);
  assert.equal(result.report.autonomous.comprehensionSummary?.rewriteReadiness, "ready");
  assert.equal(
    result.report.autonomous.comprehensionSummary?.missingEvidence.some((entry) =>
      /business rule or invariant coverage/.test(entry)
    ),
    false
  );
  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /business-rules=1/);
});

test("executeReportCommandFromArgs exposes duplicate family counts and centralization candidates", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Duplicate family report",
    request: "Expose duplicate-family centralization evidence in the report command."
  });

  await service.configureAutonomousExecution(run.id, {
    profile: "modernization_program",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertDuplicateFamilies(run.id, [
    {
      familyId: "duplicate:approval-policy",
      capability: "approval policy evaluation",
      members: [
        { itemId: "service:approval-policy", kind: "shared_core", role: "service policy engine" },
        { itemId: "route:approval-policy", kind: "intentional_variant", role: "route adapter" }
      ],
      sharedAbstraction: "ApprovalPolicyEngine",
      intentionalVariants: ["route adapter emits extra audit metadata"],
      accidentalDivergences: [],
      centralizationCandidate: "route approval checks through ApprovalPolicyEngine",
      parityRequirements: ["prove both variants reach identical approval decisions for matching claims"],
      evidenceRefs: ["tests/report-command.test.ts"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-21T11:25:00.000Z"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.comprehensionSummary?.duplicateFamilyCount, 1);
  assert.equal(result.report.autonomous.comprehensionSummary?.duplicateFamilyMemberCount, 2);
  assert.equal(result.report.autonomous.comprehensionSummary?.centralizationCandidateCount, 1);
});

test("executeReportCommandFromArgs exposes architecture and migration evidence counts", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Architecture and migration report",
    request: "Expose architecture-fit and migration evidence counts in the report command."
  });

  await service.configureAutonomousExecution(run.id, {
    profile: "modernization_program",
    phase: "migration_sequencing",
    manifest: {
      runId: run.id,
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertArchitectureDecisions(run.id, [
    {
      decisionId: "adr:auth-boundary",
      title: "Keep auth policy in a modular monolith boundary first",
      status: "accepted",
      options: ["extract auth service now", "stabilize auth boundary inside modular monolith"],
      chosenOption: "stabilize auth boundary inside modular monolith",
      boundedContexts: ["auth", "workflow-proof"],
      consistencyNeeds: ["strong authorization decisions", "low-latency proof checks"],
      rationale: ["tight consistency beats premature extraction during the first migration wave"],
      evidenceRefs: ["tests/report-command.test.ts"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-21T11:50:00.000Z"
    }
  ]);
  await service.upsertMigrationLedgerEntries(run.id, [
    {
      entryId: "migration:auth-policies",
      boundedContext: "auth",
      sourceModels: ["legacy_policy_rules"],
      targetModels: ["policy_rule_snapshots"],
      strategy: "expand_contract",
      consistencyClass: "strong",
      ownership: "backend_engineer",
      rolloutSteps: ["add snapshot table", "dual-write policy changes", "cut reads after parity pass"],
      rollbackPlan: ["stop reads from snapshot table", "keep dual-write flag disabled"],
      evidenceRefs: ["tests/report-command.test.ts"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-21T11:51:00.000Z"
    }
  ]);
  await service.upsertParityRequirements(run.id, [
    {
      requirementId: "parity:auth-policies",
      capability: "auth policy evaluation",
      status: "planned",
      legacyRefs: ["legacy_policy_rules"],
      targetRefs: ["policy_rule_snapshots"],
      acceptanceChecks: ["prove legacy and snapshot-backed decisions match for the seeded policy corpus"],
      evidenceRefs: ["tests/report-command.test.ts"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-21T11:52:00.000Z"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.comprehensionSummary?.architectureDecisionCount, 1);
  assert.equal(result.report.autonomous.comprehensionSummary?.migrationLedgerCount, 1);
  assert.equal(result.report.autonomous.comprehensionSummary?.parityRequirementCount, 1);
});

test("executeReportCommandFromArgs includes missing modernization artifact classes for modernization_program", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Modernization artifact report",
    request: "Expose missing modernization artifact classes in the report command."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "modernize",
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    })
  ]);
  await service.configureAutonomousExecution(run.id, {
    profile: "modernization_program",
    phase: "modernization_strategy",
    manifest: {
      runId: run.id,
      profile: "modernization_program",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.9,
        criticalItemValidation: 0.75,
        callsiteCoverage: 0.9,
        runtimeTraceCoverage: 0.85,
        inventoryCompleteness: 1,
        businessRuleCoverage: 0.9,
        maxContradictionGapCount: 0,
        maxOpenBlockers: 0
      }
    }
  });
  await service.upsertCoverageItems(run.id, [
    {
      id: "service:modernization-core",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["modernization planning must remain evidence-backed"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/report-command.test.ts"],
      lastUpdatedAt: "2026-05-21T10:10:00.000Z"
    }
  ]);
  await service.upsertUnderstandingMaps(run.id, [
    "repo_map",
    "subsystems",
    "route_map",
    "model_map",
    "integration_map",
    "authz_map",
    "config_coupling",
    "runtime_side_effects"
  ].map((kind) => ({
    kind,
    itemCount: 1,
    analyzedCount: 1,
    sourceRefs: ["src/core/service.ts:1"],
    evidenceRefs: ["tests/report-command.test.ts"],
    updatedAt: "2026-05-21T10:10:00.000Z"
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:modernization-core",
      targetId: "service:modernization-core",
      kind: "side_effect",
      risky: true,
      sideEffects: ["persists modernization report evidence"],
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-21T10:10:00.000Z"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.autonomous.profile, "modernization_program");
  assert.equal(result.report.autonomous.comprehensionSummary?.readinessScope, "broad");
  assert.equal(result.report.autonomous.comprehensionSummary?.rewriteReadiness, "blocked");
  assert.ok(result.report.autonomous.comprehensionSummary?.missingArtifactKinds.includes("domain_map"));
  assert.ok(result.report.autonomous.comprehensionSummary?.missingArtifactKinds.includes("migration_ledger"));
  assert.ok(result.report.autonomous.comprehensionSummary?.missingArtifactKinds.includes("parity_matrix"));
  assert.match(
    result.report.autonomous.comprehensionSummary?.missingEvidence.join(" | ") ?? "",
    /modernization artifact missing: migration_ledger/
  );
});

test("executeReportCommandFromArgs includes eval posture and review controls sections", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Eval posture report",
    request: "Expose external eval posture and sensitive-action controls."
  });

  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId: run.id,
      profile: "legacy_rewrite",
      requiredCategories: ["services"],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.6,
        callsiteCoverage: 0.85,
        runtimeTraceCoverage: 0.75
      }
    }
  });
  await service.upsertExternalEvals(run.id, [
    {
      evalId: "eval:orchestration-replay",
      label: "Replay-grade orchestration baseline",
      scope: "repo_local",
      harness: "replay_grade_orchestration",
      artifactRef: "replay://orchestration/generated-baseline",
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-20T14:04:00.000Z"
    },
    {
      evalId: "eval:agent-evals",
      label: "OpenAI agent eval sample",
      scope: "external",
      harness: "openai_agent_evals",
      artifactRef: "https://developers.openai.com/api/docs/guides/agent-evals",
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-20T14:05:00.000Z"
    }
  ]);
  await service.upsertSensitiveActionControls(run.id, [
    {
      controlId: "control:security-waiver-blocked",
      actionType: "waiver",
      enforcement: "waiver_blocked",
      summary: "security review waivers remain blocked by runtime policy",
      evidenceRefs: ["tests/report-command.test.ts"],
      createdAt: "2026-05-20T14:06:00.000Z"
    }
  ]);

  const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
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
    }
  });

  assert.equal(result.report.status.evalPosture.status, "external_ready");
  assert.deepEqual(result.report.status.evalPosture.repoLocalLabels, ["Replay-grade orchestration baseline"]);
  assert.deepEqual(result.report.status.evalPosture.broaderEvidenceLabels, ["OpenAI agent eval sample"]);
  assert.match(result.report.status.evalPosture.boundarySummary, /Repo-local eval evidence and broader replay-grade or external evidence are both present/);
  assert.equal(result.report.status.reviewControls.status, "explicit");

  const markdown = formatRunEvidenceReportMarkdown(result.report);
  assert.match(markdown, /## Eval Posture/);
  assert.match(markdown, /boundary:/);
  assert.match(markdown, /repo-local labels: Replay-grade orchestration baseline/);
  assert.match(markdown, /broader evidence labels: OpenAI agent eval sample/);
  assert.match(markdown, /## Review Controls/);
  assert.match(markdown, /control:security-waiver-blocked: action=waiver enforcement=waiver_blocked/);
});

test("executeReportCommandFromArgs surfaces blocked daemon continuation state in json and markdown", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-report-daemon-continuation-"));
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon continuation report",
    request: "Expose daemon continuation blockers through the report surface."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      ownerRole: "backend_engineer",
      requiredSpecialistRoles: ["backend_engineer"]
    })
  ]);

  try {
    await mkdir(path.join(directory, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "continuation-status.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          directiveKind: "continue_analysis",
          executionMode: "operator_required",
          targetId: "artifact:resume",
          source: "progress_proof",
          sourceId: "proof-1",
          actionKind: "resume_target",
          summary: "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)",
          nextActions: ["consult operator evidence before resuming the artifact target"],
          blockers: ["blocking gaps remain open"],
          updatedAt: "2026-05-16T10:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "operator-handoff.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          blockerKind: "operator_required_continuation",
          reason: "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: null,
          cycle: 1,
          directiveKind: "continue_analysis",
          nextActions: ["consult operator evidence before resuming the artifact target"],
          detailFiles: {
            continuationStatus: ".devgod/work/daemon/continuation-status.json"
          },
          updatedAt: "2026-05-16T10:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
      cwd: directory,
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
      }
    });

    assert.equal(result.report.status.daemon.continuation?.state, "blocked");
    assert.equal(result.report.status.daemon.continuation?.targetId, "artifact:resume");
    assert.equal(
      result.report.status.daemon.continuation?.summary,
      "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)"
    );
    assert.equal(result.report.status.daemon.handoff?.state, "blocked");
    assert.equal(result.report.status.daemon.handoff?.blockerKind, "operator_required_continuation");
    assert.equal(result.report.status.daemon.handoff?.activeRunId, run.id);
    assert.equal(result.report.status.daemon.handoff?.directiveKind, "continue_analysis");
    assert.deepEqual(result.report.status.daemon.handoff?.nextActions, [
      "consult operator evidence before resuming the artifact target"
    ]);

    const markdown = formatRunEvidenceReportMarkdown(result.report);
    assert.match(markdown, /daemon continuation: blocked operator_required artifact:resume/);
    assert.match(markdown, /daemon continuation summary: operator input is required for advisory continuation target artifact:resume/);
    assert.match(markdown, /daemon handoff: blocked operator_required_continuation operator input is required for advisory continuation target artifact:resume/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeReportCommandFromArgs surfaces daemon supervisor state in json and markdown", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-report-daemon-supervisor-"));
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor report",
    request: "Expose daemon supervisor decisions through the report surface."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      ownerRole: "backend_engineer",
      requiredSpecialistRoles: ["backend_engineer"]
    })
  ]);

  try {
    await mkdir(path.join(directory, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "supervisor-status.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: "session-supervisor",
          supervisorCycles: 1,
          nextActions: [
            "provide --review-actor security_reviewer=<actor>",
            "provide --review-actor qa_engineer=<actor>"
          ],
          missingReviewRoles: ["security_reviewer", "qa_engineer"],
          actions: [
            {
              cycle: 1,
              action: "enqueue_review_action",
              taskId: "rewrite",
              reviewRole: "security_reviewer",
              filePath: ".devgod/review-actions/security.json",
              summary: "queued trusted security review action via security-actor"
            }
          ],
          updatedAt: "2026-05-16T12:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "supervisor-history.jsonl"),
      `${JSON.stringify(
        {
          recordedAt: "2026-05-16T11:30:00.000Z",
          state: "completed",
          reason: "previous supervisor run completed after enqueuing trusted review actions",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: "session-supervisor-previous",
          supervisorCycles: 2,
          nextActions: [],
          missingReviewRoles: [],
          actions: [
            {
              cycle: 1,
              action: "enqueue_review_action",
              taskId: "rewrite",
              reviewRole: "security_reviewer",
              filePath: ".devgod/review-actions/security.json",
              summary: "queued trusted security review action via security-actor"
            }
          ]
        }
      )}\n${JSON.stringify(
        {
          recordedAt: "2026-05-16T12:00:00.000Z",
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: run.id,
          activeTaskId: "rewrite",
          sessionId: "session-supervisor",
          supervisorCycles: 1,
          nextActions: [
            "provide --review-actor security_reviewer=<actor>",
            "provide --review-actor qa_engineer=<actor>"
          ],
          missingReviewRoles: ["security_reviewer", "qa_engineer"],
          actions: [
            {
              cycle: 1,
              action: "enqueue_review_action",
              taskId: "rewrite",
              reviewRole: "security_reviewer",
              filePath: ".devgod/review-actions/security.json",
              summary: "queued trusted security review action via security-actor"
            }
          ]
        }
      )}\n`,
      "utf8"
    );

    const result = await executeReportCommandFromArgs(["--run-id", run.id, "--format", "json"], {
      cwd: directory,
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
      }
    });

    assert.equal(result.report.status.daemon.supervisor?.state, "blocked");
    assert.equal(result.report.status.daemon.supervisor?.blockerKind, "missing_review_actor_bindings");
    assert.deepEqual(result.report.status.daemon.supervisor?.missingReviewRoles, [
      "security_reviewer",
      "qa_engineer"
    ]);
    assert.deepEqual(result.report.status.daemon.supervisor?.nextActions, [
      "provide --review-actor security_reviewer=<actor>",
      "provide --review-actor qa_engineer=<actor>"
    ]);
    assert.deepEqual(result.report.status.daemon.supervisor?.actions, [
      {
        cycle: 1,
        action: "enqueue_review_action",
        targetId: undefined,
        taskId: "rewrite",
        reviewRole: "security_reviewer",
        filePath: ".devgod/review-actions/security.json",
        summary: "queued trusted security review action via security-actor"
      }
    ]);
    assert.deepEqual(result.report.status.daemon.supervisor?.history, [
      {
        recordedAt: "2026-05-16T11:30:00.000Z",
        state: "completed",
        activeRunId: run.id,
        activeTaskId: "rewrite",
        blockerKind: undefined,
        reason: "previous supervisor run completed after enqueuing trusted review actions",
        supervisorCycles: 2,
        actionCount: 1
      },
      {
        recordedAt: "2026-05-16T12:00:00.000Z",
        state: "blocked",
        activeRunId: run.id,
        activeTaskId: "rewrite",
        blockerKind: "missing_review_actor_bindings",
        reason: "supervisor is missing review actor bindings for: security_reviewer, qa_engineer",
        supervisorCycles: 1,
        actionCount: 1
      }
    ]);
    assert.deepEqual(result.report.status.daemon.supervisor?.historyView, {
      scope: "run",
      runId: run.id,
      limit: 5,
      retainedCount: 2,
      filteredCount: 2,
      returnedCount: 2,
      truncated: false
    });

    const markdown = formatRunEvidenceReportMarkdown(result.report);
    assert.match(
      markdown,
      /daemon supervisor: blocked missing_review_actor_bindings supervisor is missing review actor bindings for: security_reviewer, qa_engineer/
    );
    assert.match(markdown, /daemon supervisor actions: enqueue_review_action:rewrite:security_reviewer/);
    assert.match(markdown, /daemon supervisor missing review roles: security_reviewer; qa_engineer/);
    assert.match(
      markdown,
      /daemon supervisor next actions: provide --review-actor security_reviewer=<actor>; provide --review-actor qa_engineer=<actor>/
    );
    assert.match(
      markdown,
      new RegExp(`daemon supervisor history view: scope=run run=${run.id} returned=2 filtered=2 retained=2 truncated=no`)
    );
    assert.match(
      markdown,
      new RegExp(`daemon supervisor history: 2026-05-16T11:30:00.000Z:${run.id}:completed:1; 2026-05-16T12:00:00.000Z:${run.id}:blocked:1`)
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
