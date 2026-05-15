import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeLoopCommandFromArgs, executeOpsCommandFromArgs, executeRecoverCommandFromArgs } from "../src/admin.ts";
import { createReviewActionContextResolver } from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type {
  AuthenticatedPrincipal,
  ReviewIdentityBindings
} from "../src/core/review-context.ts";
import type {
  ReasoningQualityBlock,
  ReviewActionContext,
  TaskPacketInput,
  TaskRecord
} from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

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
    reasoningQuality: overrides.reasoningQuality
  };
}

function reasoningQualityBlock(
  overrides: Partial<ReasoningQualityBlock> = {}
): ReasoningQualityBlock {
  return {
    claim: overrides.claim ?? "The task still needs stronger reasoning evidence.",
    facts: overrides.facts ?? ["runtime status was inspected"],
    assumptions: overrides.assumptions ?? ["current proof is incomplete"],
    hypotheses: overrides.hypotheses ?? ["the weak evidence should remain visible in ops"],
    evidenceRefs: overrides.evidenceRefs ?? ["src/core/service.ts"],
    counterEvidence: overrides.counterEvidence ?? [],
    openQuestions: overrides.openQuestions ?? [],
    verificationPlan: overrides.verificationPlan ?? ["npm test"],
    fallbacks: overrides.fallbacks ?? ["escalate before declaring done"],
    budgets: overrides.budgets ?? { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
    confidence: overrides.confidence ?? "low",
    decision: overrides.decision ?? "continue"
  };
}

function gitNexusObservation(
  overrides: Partial<import("../src/admin/gitnexus.ts").GitNexusStatusObservation> = {}
): import("../src/admin/gitnexus.ts").GitNexusStatusObservation {
  return {
    authorityLabel: "derived_only",
    state: "unconfigured",
    configured: false,
    configuredScopes: [],
    configPaths: [],
    repoIndexed: false,
    indexRoot: "/repo/.gitnexus",
    metaPath: "/repo/.gitnexus/meta.json",
    recommendedCommand: "npx gitnexus analyze --skip-agents-md",
    notes: ["gitnexus MCP config was not detected in project or user Codex config"],
    ...overrides
  };
}

function deriveActorRole(actor: string): ReviewActionContext["actorRole"] {
  if (actor === "reviewer-actor") {
    return "reviewer";
  }
  if (actor === "security-actor") {
    return "security_reviewer";
  }
  if (actor === "qa-actor") {
    return "qa_engineer";
  }
  return "planner";
}

function createService(store: MemoryStore = new MemoryStore()) {
  const bindings: ReviewIdentityBindings = { bindings: [] };
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings,
      resolveAuthenticatedPrincipal(input) {
        const principal: AuthenticatedPrincipal = {
          provider: "test",
          subject: input.actor,
          verified: true
        };
        bindings.bindings.push({
          principal: {
            provider: principal.provider,
            subject: principal.subject
          },
          actors: [
            {
              actor: input.actor,
              roles: [deriveActorRole(input.actor)]
            }
          ]
        });
        return principal;
      }
    })
  });

  return { service, store };
}

function mutateTask(
  store: MemoryStore,
  taskId: string,
  mutate: (task: TaskRecord) => TaskRecord
): void {
  const tasks = (store as unknown as { tasks: Map<string, TaskRecord> }).tasks;
  const entry = [...tasks.entries()].find(([, task]) => task.packet.taskId === taskId);
  assert.ok(entry, `expected task ${taskId}`);
  const [recordId, task] = entry!;
  tasks.set(recordId, mutate(task));
}

function mutateReview(
  store: MemoryStore,
  predicate: (review: import("../src/domain/types.ts").ReviewRecord) => boolean,
  mutate: (review: import("../src/domain/types.ts").ReviewRecord) => import("../src/domain/types.ts").ReviewRecord
): void {
  const reviews = (store as unknown as { reviews: Map<string, import("../src/domain/types.ts").ReviewRecord> }).reviews;
  const entry = [...reviews.entries()].find(([, review]) => predicate(review));
  assert.ok(entry, "expected matching review");
  const [reviewId, review] = entry!;
  reviews.set(reviewId, mutate(review));
}

test("executeOpsCommandFromArgs surfaces stalled-task alerts and recovery next actions", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);
  await service.claimTask(run.id, "plan", "planner");
  mutateTask(store, "plan", (task) => ({
    ...task,
    updatedAt: "2026-05-01T00:00:00.000Z"
  }));

  const result = await executeOpsCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--stale-after-hours", "24"],
    {
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: false,
        adapterExists: false,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: ".devgod/review-identity-bindings.json",
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["adapter module not configured"]
      }),
      inspectGitNexus: async () =>
        gitNexusObservation({
          state: "stale",
          configured: true,
          configuredScopes: ["project"],
          configPaths: ["/repo/.codex/config.toml"],
          repoIndexed: true,
          indexedAt: "2026-05-01T00:00:00.000Z",
          indexedCommit: "abc123",
          headCommit: "def456",
          notes: ["gitnexus index is behind the current git HEAD"]
        }),
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
        return service.inspectRecovery(runId, {
          staleAfterHours,
          now: "2026-05-03T00:00:00.000Z"
        });
      }
    }
  );

  assert.equal(result.format, "json");
  assert.match(result.report.alerts.join(" "), /stalled task: plan/);
  assert.match(result.report.alerts.join(" "), /gitnexus advisory index is stale/);
  assert.match(result.report.nextActions.join(" "), /recover reset-task:plan/);
  assert.match(result.report.nextActions.join(" "), /npx gitnexus analyze --skip-agents-md/);
});

test("executeRecoverCommandFromArgs applies safe recovery to requeue stalled work", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);
  await service.claimTask(run.id, "plan", "planner");
  mutateTask(store, "plan", (task) => ({
    ...task,
    updatedAt: "2026-05-01T00:00:00.000Z"
  }));

  const advisory = await executeRecoverCommandFromArgs(
    ["--run-id", run.id, "--stale-after-hours", "24"],
    {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, {
          staleAfterHours,
          now: "2026-05-03T00:00:00.000Z"
        });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, {
          staleAfterHours,
          now: "2026-05-03T00:00:00.000Z"
        });
      }
    }
  );

  assert.equal(advisory.mode, "advisory_only");
  assert.equal(advisory.actions[0]?.id, "reset-task:plan");

  const applied = await executeRecoverCommandFromArgs(
    ["--run-id", run.id, "--apply-safe", "--stale-after-hours", "24"],
    {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, {
          staleAfterHours,
          now: "2026-05-03T00:00:00.000Z"
        });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, {
          staleAfterHours,
          now: "2026-05-03T00:00:00.000Z"
        });
      }
    }
  );

  assert.equal(applied.mode, "applied");
  assert.deepEqual(applied.appliedActionIds, ["reset-task:plan"]);
  assert.equal(applied.snapshot.tasks[0]?.status, "ready");
});

test("executeOpsCommandFromArgs surfaces reasoning warnings for complete runs", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Close reasoning slice",
    request: "Finish the current slice."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "plan",
      reasoningQuality: reasoningQualityBlock({
        openQuestions: ["tool query failed before stronger proof was gathered"],
        confidence: "low"
      })
    })
  ]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["tests written"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });

  for (const [role, actor] of [
    ["reviewer", "reviewer-actor"],
    ["security_reviewer", "security-actor"],
    ["qa_engineer", "qa-actor"]
  ] as const) {
    await service.recordReview(run.id, "plan", actor, {
      reviewerRole: role,
      state: "passed",
      severity: "low",
      findings: []
    });
  }

  const result = await executeOpsCommandFromArgs(["--run-id", run.id, "--format", "json"], {
    inspectReviewIdentity: async () => ({
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: ["devgod_local_seed"],
      bindingsPresent: true,
      bindingsPath: ".devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    }),
    inspectGitNexus: async () => gitNexusObservation(),
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
    }
  });

  assert.match(result.report.alerts.join(" "), /reasoning-quality/);
  assert.match(result.report.nextActions.join(" "), /review reasoning-quality warnings/);
});

test("executeOpsCommandFromArgs resolves latest runs and can return text output", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  const result = await executeOpsCommandFromArgs(["--run-id", "latest", "--format", "text"], {
    env: {
      ...process.env,
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    findLatestRun: async () => ({ id: run.id }),
    inspectReviewIdentity: async () => ({
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      selectedBackend: "forwarded_headers",
      availableBackends: ["forwarded_headers"],
      bindingsPresent: true,
      bindingsPath: ".devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    }),
    inspectGitNexus: async () =>
      gitNexusObservation({
        state: "ready",
        configured: true,
        configuredScopes: ["project"],
        configPaths: ["/repo/.codex/config.toml"],
        repoIndexed: true,
        indexedAt: "2026-05-06T00:00:00.000Z",
        indexedCommit: "abc123",
        headCommit: "abc123",
        notes: ["gitnexus advisory context is ready"]
      }),
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
    }
  });

  assert.equal(result.format, "text");
  assert.match(result.report.nextActions.join(" "), /route plan to planner/);
  assert.equal(result.report.executionPlan.directive.kind, "dispatch_owner");
});

test("executeLoopCommandFromArgs returns the authoritative owner dispatch step", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  const result = await executeLoopCommandFromArgs(["--run-id", run.id, "--format", "json"], {
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getExecutionPlan(runId, staleAfterHours) {
      return service.getExecutionPlan(runId, { staleAfterHours });
    },
    applyRecovery(runId, actionIds, staleAfterHours) {
      return service.applyRecovery(runId, actionIds, { staleAfterHours });
    }
  });

  assert.equal(result.format, "json");
  assert.equal(result.result.mode, "advisory_only");
  assert.equal(result.result.initialPlan.directive.kind, "dispatch_owner");
  assert.equal(result.result.finalPlan.directive.kind, "dispatch_owner");
});

test("executeLoopCommandFromArgs can auto-apply safe recovery and advance to the next directive", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"]
    })
  ]);
  await service.claimTask(run.id, "plan", "planner");
  mutateTask(store, "plan", (task) => ({
    ...task,
    updatedAt: "2026-05-01T00:00:00.000Z"
  }));

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--stale-after-hours", "24", "--apply-safe-recovery"],
    {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, {
          staleAfterHours,
          now: "2026-05-03T00:00:00.000Z"
        });
      }
    }
  );

  assert.equal(result.result.mode, "applied");
  assert.equal(result.result.initialPlan.directive.kind, "apply_recovery");
  assert.deepEqual(result.result.appliedRecoveryActionIds, ["reset-task:plan"]);
  assert.equal(result.result.finalPlan.directive.kind, "dispatch_owner");
  if (result.result.finalPlan.directive.kind === "dispatch_owner") {
    assert.equal(result.result.finalPlan.directive.recommendation.taskId, "plan");
  }
});

test("executeLoopCommandFromArgs can execute an owner dispatch after optional recovery", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", ownerRole: "planner" })]);

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      },
      executeDirectiveStep(runId, input) {
        return service.executeDirectiveStep(runId, input);
      }
    }
  );

  assert.equal(result.result.mode, "executed");
  assert.equal(result.result.initialPlan.directive.kind, "dispatch_owner");
  assert.equal(result.result.executedSteps.length, 1);
  assert.equal(result.result.executedSteps[0]?.directiveKind, "dispatch_owner");
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "blocked");
  assert.equal(result.result.snapshot.tasks[0]?.status, "in_progress");
});

test("executeLoopCommandFromArgs can execute supported review dispatch inputs and re-evaluate to completion", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-plan.md"],
    blockers: [],
    verificationNotes: ["review pending"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const directory = await mkdtemp(path.join(tmpdir(), "devgod-loop-review-inputs-"));

  try {
    await writeFile(
      path.join(directory, "security.json"),
      `${JSON.stringify(
        {
          runId: run.id,
          taskId: "plan",
          actor: "security-actor",
          review: {
            reviewerRole: "security_reviewer",
            state: "passed",
            severity: "low",
            findings: []
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, "qa.json"),
      `${JSON.stringify(
        {
          runId: run.id,
          taskId: "plan",
          actor: "qa-actor",
          review: {
            reviewerRole: "qa_engineer",
            state: "passed",
            severity: "low",
            findings: []
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const executedRoles: string[] = [];
    const result = await executeLoopCommandFromArgs(
      [
        "--run-id",
        run.id,
        "--format",
        "json",
        "--execute-supported-directives",
        "--review-input",
        "security.json",
        "--review-input",
        "qa.json"
      ],
      {
        cwd: directory,
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        getExecutionPlan(runId, staleAfterHours) {
          return service.getExecutionPlan(runId, { staleAfterHours });
        },
        applyRecovery(runId, actionIds, staleAfterHours) {
          return service.applyRecovery(runId, actionIds, { staleAfterHours });
        },
        async executeDirectiveStep(runId, input) {
          return service.executeDirectiveStep(runId, {
            ...input,
            async executeReviewRecommendation({ directive }) {
              const command = input.reviewCommands.find((candidate) =>
                directive.recommendations.some(
                  (recommendation) =>
                    recommendation.taskId === candidate.taskId &&
                    recommendation.targetReviewRole === candidate.review.reviewerRole
                )
              );
              assert.ok(command, "expected a matching review command");
              executedRoles.push(command.review.reviewerRole);
              await service.recordReview(runId, command.taskId, command.actor, command.review);
              return {
                executed: true,
                taskId: command.taskId,
                actor: command.actor,
                reviewRole: command.review.reviewerRole,
                evidence: [`recorded ${command.review.reviewerRole} for ${command.taskId}`]
              };
            }
          });
        }
      }
    );

    assert.deepEqual(executedRoles, ["security_reviewer", "qa_engineer"]);
    assert.equal(result.result.mode, "executed");
    assert.equal(result.result.initialPlan.directive.kind, "dispatch_reviews");
    assert.equal(result.result.executedSteps.length, 2);
    assert.equal(result.result.finalPlan.directive.kind, "complete");
    assert.equal(result.result.snapshot.tasks[0]?.status, "approved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecoverCommandFromArgs rejects conflicting apply flags", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await assert.rejects(
    executeRecoverCommandFromArgs(["--run-id", run.id, "--apply-safe", "--apply", "reset-task:plan"], {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      }
    }),
    /either --apply-safe or one\/more --apply/
  );
});

test("service inspectRecovery and applyRecovery handle stale approvals and orphan locks", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner handoff recorded"],
    qualityGateEvidence: ["product acceptance captured in intake artifacts"],
    contextRefs: ["brief-1"]
  });
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

  mutateReview(
    store,
    (review) => review.taskId === "plan" && review.reviewerRole === "qa_engineer",
    (review) => ({
      ...review,
      identityAssurance: "legacy_backfill"
    })
  );
  await store.createLock({
    id: "lock-orphan",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: run.id,
    taskId: "ghost-task",
    scopePaths: ["src/core"],
    status: "active",
    createdAt: "2026-05-01T00:00:00.000Z"
  });

  const inspection = await service.inspectRecovery(run.id, {
    staleAfterHours: 24,
    now: "2026-05-03T00:00:00.000Z"
  });
  assert.match(inspection.issues.map((issue) => issue.kind).join(" "), /stale_approval/);
  assert.match(inspection.issues.map((issue) => issue.kind).join(" "), /orphan_lock/);

  const applied = await service.applyRecovery(run.id, [], {
    staleAfterHours: 24,
    now: "2026-05-03T00:00:00.000Z"
  });
  assert.match(applied.appliedActionIds.join(" "), /reblock-approved:plan/);
  assert.match(applied.appliedActionIds.join(" "), /release-lock:ghost-task/);
});
