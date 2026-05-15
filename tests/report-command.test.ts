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
    reasoningPolicy: overrides.reasoningPolicy,
    reasoningAttempts: overrides.reasoningAttempts,
    reasoningVerifications: overrides.reasoningVerifications,
    reasoningVerdict: overrides.reasoningVerdict,
    reasoningQuality: overrides.reasoningQuality
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
  assert.equal(result.report.reasoningQuality.status, "warn");
  assert.ok(result.report.reasoningQuality.warningCount >= 2);
  assert.ok(result.report.reasoningQuality.legacyTaskIds.includes("build"));
  assert.ok(result.report.reasoningQuality.taskIdsWithWarnings.includes("plan"));
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
  assert.match(markdown, /legacy tasks:/);
  assert.match(markdown, /reasoning-quality: warn/);
  assert.match(markdown, /approval_recorded task=`plan`/);
});
