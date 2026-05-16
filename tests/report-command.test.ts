import test from "node:test";
import assert from "node:assert/strict";
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
  const { service, store } = createService();
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
