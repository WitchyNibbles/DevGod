import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createSupportedContinuationExecutor,
  executeLoopCommandFromArgs,
  executeOpsCommandFromArgs,
  executeRecoverCommandFromArgs
} from "../src/admin.ts";
import { formatOperatorDashboardReport } from "../src/admin/ops.ts";
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
        label: "ops recovery fixture reasoning",
        hypothesis: "the fixture task is valid under strict defaults",
        alternatives: ["mark compatibility mode explicitly if needed"],
        evidenceRefs: ["tests/ops-recovery.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://ops-task-packet",
        outcome: "supported",
        summary: "default ops fixture includes strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://ops-task-packet",
        status: "passed",
        summary: "default ops fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default ops fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? reasoningQualityBlock({
      confidence: "medium",
      decision: "supported"
    })
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

async function seedHealthyLoopRuntimeRegistration(
  store: MemoryStore,
  repoPath: string = process.cwd()
): Promise<void> {
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod",
    repoPath
  });
  const dataRoot = path.join(repoPath, ".devgod", "runtime", "data");
  await mkdir(dataRoot, { recursive: true });
  await store.saveProjectRuntimeRegistration({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    repoPath,
    runtimeProfile: "managed",
    dataRoot,
    qdrantUrl: "http://127.0.0.1:6333",
    qdrantCollection: "devgod-memory",
    installManifestPath: path.join(repoPath, ".devgod", "install-manifest.json"),
    manifest: {},
    provenance: { authority: "runtime_authoritative" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function buildHealthyLoopPreflightOptions(store: MemoryStore, cwd: string = process.cwd()) {
  return {
    cwd,
    env: process.env,
    findProjectContext(workspaceSlug: string, projectSlug: string) {
      return store.getProjectContext({ workspaceSlug, projectSlug });
    },
    async getProjectRuntimeRegistration(projectId: string) {
      const existing = await store.getProjectRuntimeRegistration(projectId);
      if (existing?.repoPath === cwd) {
        return existing;
      }
      const projectContext = await store.ensureProjectContext({
        workspaceSlug: "team",
        projectSlug: "devgod",
        repoPath: cwd
      });
      if (!projectContext || projectContext.project.id !== projectId) {
        return undefined;
      }
      const dataRoot = path.join(cwd, ".devgod", "runtime", "data");
      await mkdir(dataRoot, { recursive: true });
      const registration = {
        projectId,
        workspaceId: projectContext.workspace.id,
        repoPath: cwd,
        runtimeProfile: "managed",
        dataRoot,
        qdrantUrl: "http://127.0.0.1:6333",
        qdrantCollection: "devgod-memory",
        installManifestPath: path.join(cwd, ".devgod", "install-manifest.json"),
        manifest: {},
        provenance: { authority: "runtime_authoritative" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await store.saveProjectRuntimeRegistration(registration);
      return registration;
    },
    async inspectQdrant() {
      return {
        ok: true,
        summary: "qdrant reachable"
      };
    },
    async inspectReviewIdentity() {
      return {
        authorityLabel: "derived_only" as const,
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: ["devgod_local_seed"],
        selectedBackend: "devgod_local_seed",
        bindingsPresent: true,
        bindingsPath: path.join(cwd, ".devgod", "review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      };
    }
  };
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

test("executeLoopCommandFromArgs rejects mutating execution without runtime preflight hooks", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Guard low-level loop execution",
    request: "Reject direct mutating loop execution without runtime preflight context."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", ownerRole: "planner" })]);

  await assert.rejects(
    executeLoopCommandFromArgs(
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
    ),
    /runtime execution preflight hooks are required for this execution path/
  );
});

test("executeLoopCommandFromArgs rejects externally forced skipRuntimePreflight", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Guard preflight bypass",
    request: "Reject callers that try to force skipRuntimePreflight directly."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  await assert.rejects(
    executeLoopCommandFromArgs(["--run-id", run.id, "--format", "json"], {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getExecutionPlan(runId, staleAfterHours) {
        return service.getExecutionPlan(runId, { staleAfterHours });
      },
      applyRecovery(runId, actionIds, staleAfterHours) {
        return service.applyRecovery(runId, actionIds, { staleAfterHours });
      },
      skipRuntimePreflight: true
    }),
    /skipRuntimePreflight is reserved for internal runtime execution orchestration/
  );
});

test("executeLoopCommandFromArgs rejects execution when runtime preflight fails review identity readiness", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Guard loop execution",
    request: "Do not start directive execution until runtime setup is healthy."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const dataRoot = await mkdtemp(path.join(tmpdir(), "devgod-loop-preflight-data-"));

  await store.saveProjectRuntimeRegistration({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    repoPath: process.cwd(),
    runtimeProfile: "managed",
    dataRoot,
    qdrantUrl: "http://127.0.0.1:6333",
    qdrantCollection: "devgod-memory",
    installManifestPath: path.join(process.cwd(), ".devgod", "install-manifest.json"),
    manifest: {},
    provenance: { authority: "runtime_authoritative" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    await assert.rejects(
      executeLoopCommandFromArgs(["--run-id", run.id, "--format", "json"], {
        env: process.env,
        findProjectContext(workspaceSlug, projectSlug) {
          return store.getProjectContext({ workspaceSlug, projectSlug });
        },
        getProjectRuntimeRegistration(projectId) {
          return store.getProjectRuntimeRegistration(projectId);
        },
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        getExecutionPlan(runId, staleAfterHours) {
          return service.getExecutionPlan(runId, { staleAfterHours });
        },
        applyRecovery(runId, actionIds, staleAfterHours) {
          return service.applyRecovery(runId, actionIds, { staleAfterHours });
        },
        async inspectQdrant() {
          return {
            ok: true,
            summary: "qdrant reachable"
          };
        },
        async inspectReviewIdentity() {
          return {
            authorityLabel: "derived_only" as const,
            adapterConfigured: false,
            adapterExists: false,
            availableBackends: [],
            bindingsPresent: false,
            bindingsPath: path.join(process.cwd(), ".devgod", "review-identity-bindings.json"),
            bindingsUseShippedTemplate: false,
            liveTrustReady: false,
            notes: ["review identity bindings file missing"]
          };
        }
      }),
      /runtime execution preflight failed: review identity bindings file missing/
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test("executeLoopCommandFromArgs can auto-apply safe recovery and advance to the next directive", async () => {
  const { service, store } = createService();
  await seedHealthyLoopRuntimeRegistration(store);
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
      ...buildHealthyLoopPreflightOptions(store),
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
  const { service, store } = createService();
  await seedHealthyLoopRuntimeRegistration(store);
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
      ...buildHealthyLoopPreflightOptions(store),
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
  const { service, store } = createService();
  await seedHealthyLoopRuntimeRegistration(store);
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
        ...buildHealthyLoopPreflightOptions(store, directory),
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

test("executeOpsCommandFromArgs surfaces continue_analysis guidance when autonomous work still has a next target", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous continuation",
    request: "Keep moving while autonomous work remains."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["workflow proof completion remains gated by authenticated reviews"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:autonomous-proof",
      targetId: "task:rewrite",
      kind: "missing_validation",
      severity: "high",
      description: "Runtime proof still needs to run.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["run workflow-proof after authenticated reviews"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Runtime proof is the next autonomous target.",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: ["gap:autonomous-proof"],
    nextActions: ["stale checkpoint action"],
    compressedContextRef: "memory://cp-1",
    createdAt: new Date().toISOString()
  });

  const result = await executeOpsCommandFromArgs(["--run-id", run.id, "--format", "json"], {
    inspectReviewIdentity: async () => ({
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
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

  assert.equal(result.report.executionPlan.directive.kind, "continue_analysis");
  assert.match(result.report.nextActions.join(" "), /run workflow-proof after authenticated reviews/);
  assert.match(result.report.alerts.join(" "), /autonomous blocker: blocking gaps remain open: 1/);
});

test("executeOpsCommandFromArgs surfaces operator-required continuation guidance for advisory targets", async () => {
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Advisory continuation",
    request: "Show when autonomous continuation needs operator input."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["workflow proof completion remains gated by authenticated reviews"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "artifact:resume",
    whyNext: "This remains advisory-only.",
    createdAt: new Date().toISOString()
  });

  const result = await executeOpsCommandFromArgs(["--run-id", run.id, "--format", "json"], {
    inspectReviewIdentity: async () => ({
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
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
    getExecutionPlan() {
        return Promise.resolve({
          mode: "runtime_authoritative",
          runId: run.id,
          runStatus: "approved",
          autonomousExecution: undefined,
          directive: {
          kind: "continue_analysis",
          targetId: "artifact:resume",
          source: "progress_proof",
          actions: [
            {
              kind: "resume_target",
              targetId: "artifact:resume",
              source: "progress_proof",
              sourceId: "proof-1"
            }
          ],
          nextActions: ["This remains advisory-only."],
          blockers: [],
          rationale: ["operator evidence is still required"]
        }
      });
    },
    getRoutingReport(runId) {
      return service.recommendRouting(runId);
    },
    inspectRecovery(runId, staleAfterHours) {
      return service.inspectRecovery(runId, { staleAfterHours });
    }
  });

  assert.equal(result.report.executionPlan.directive.kind, "continue_analysis");
  assert.ok(
    result.report.alerts.includes(
      "autonomous continuation requires operator input: operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)"
    )
  );
  assert.deepEqual(result.report.nextActions, [
    "operator intervention required: operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)"
  ]);
});

test("executeOpsCommandFromArgs surfaces blocked daemon continuation state even when the runtime plan is otherwise complete", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-ops-daemon-continuation-"));
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon continuation ops visibility",
    request: "Show blocked daemon continuation through the ops surface."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);

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

    const result = await executeOpsCommandFromArgs(["--run-id", run.id, "--format", "json"], {
      cwd: directory,
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
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
      getExecutionPlan() {
        return Promise.resolve({
          mode: "runtime_authoritative",
          runId: run.id,
          runStatus: "approved",
          autonomousExecution: undefined,
          directive: {
            kind: "complete",
            rationale: ["runtime plan is otherwise complete"]
          }
        });
      },
      getRoutingReport(runId) {
        return service.recommendRouting(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      }
    });

    assert.ok(
      result.report.alerts.includes(
        "daemon continuation blocked: operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)"
      )
    );
    assert.ok(
      result.report.nextActions.includes(
        "operator intervention required for daemon continuation: consult operator evidence before resuming the artifact target"
      )
    );

    const text = formatOperatorDashboardReport(result.report);
    assert.match(text, /daemon-continuation: blocked operator_required artifact:resume/);
    assert.match(
      text,
      /daemon continuation blocked: operator input is required for advisory continuation target artifact:resume/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeOpsCommandFromArgs surfaces daemon supervisor blockers and follow-up actions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-ops-daemon-supervisor-"));
  const { service } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor ops visibility",
    request: "Show blocked daemon supervisor state through the ops surface."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);

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
          actions: [],
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
          actions: []
        }
      )}\n`,
      "utf8"
    );

    const result = await executeOpsCommandFromArgs(["--run-id", run.id, "--format", "json"], {
      cwd: directory,
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: ".devgod/review-identity-bindings.json",
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
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

    assert.ok(
      result.report.alerts.includes(
        "daemon supervisor blocked: supervisor is missing review actor bindings for: security_reviewer, qa_engineer"
      )
    );
    assert.ok(
      result.report.alerts.includes("daemon supervisor missing review actors: security_reviewer, qa_engineer")
    );
    assert.ok(
      result.report.nextActions.includes(
        "supervisor follow-up: provide --review-actor security_reviewer=<actor>"
      )
    );
    assert.ok(
      result.report.nextActions.includes("supervisor follow-up: provide --review-actor qa_engineer=<actor>")
    );
    assert.ok(
      result.report.alerts.includes(`daemon supervisor history: ${run.id}:completed/1, ${run.id}:blocked/0`)
    );

    const text = formatOperatorDashboardReport(result.report);
    assert.match(
      text,
      /daemon-supervisor: blocked missing_review_actor_bindings supervisor is missing review actor bindings for: security_reviewer, qa_engineer/
    );
    assert.match(
      text,
      new RegExp(`daemon-supervisor-history-view: run:${run.id} returned=2 filtered=2 retained=2 truncated=no`)
    );
    assert.match(
      text,
      new RegExp(`daemon-supervisor-history: 2026-05-16T11:30:00.000Z:${run.id}:completed:1, 2026-05-16T12:00:00.000Z:${run.id}:blocked:0`)
    );
    assert.match(text, /supervisor follow-up: provide --review-actor security_reviewer=<actor>/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeLoopCommandFromArgs executes supported continue_analysis workflow-proof actions and persists history", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous continuation",
    request: "Keep moving while autonomous work remains."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["workflow proof completion remains gated by authenticated reviews"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/ops-recovery.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:ops-recovery-workflow-proof-gap",
      targetId: "service:workflow-proof",
      kind: "side_effect",
      risky: true,
      sideEffects: ["approves runtime workflow proof"],
      evidenceRefs: ["tests/ops-recovery.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:autonomous-proof",
      targetId: "task:rewrite",
      kind: "missing_validation",
      severity: "high",
      description: "Runtime proof still needs to run.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["run workflow-proof after authenticated reviews"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Runtime proof is the next autonomous target.",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: ["gap:autonomous-proof"],
    nextActions: ["stale checkpoint action"],
    compressedContextRef: "memory://cp-1",
    createdAt: new Date().toISOString()
  });

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            }
          })
        });
      }
    }
  );

  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.initialPlan.directive.kind, "continue_analysis");
  assert.equal(result.result.executedSteps[0]?.directiveKind, "continue_analysis");
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "complete");
  assert.ok(history[0]?.metadata.tags.includes("directive:continue_analysis"));
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("executeLoopCommandFromArgs resolves task-target blocking gaps through workflow-proof inference", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous gap resolution",
    request: "Keep moving while a blocking task-target gap remains."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      businessRules: ["workflow proof completion remains gated by authenticated reviews"],
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
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
    evidenceRefs: ["tests/ops-recovery.test.ts"],
    updatedAt: new Date().toISOString()
  })));
  await service.upsertRuntimeTraces(run.id, [
    {
      traceId: "trace:ops-recovery-workflow-proof-inference",
      targetId: "service:workflow-proof",
      kind: "side_effect",
      risky: true,
      sideEffects: ["approves runtime workflow proof"],
      evidenceRefs: ["tests/ops-recovery.test.ts"],
      createdAt: new Date().toISOString()
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:autonomous-proof",
      targetId: "task:rewrite",
      kind: "missing_validation",
      severity: "high",
      description: "Runtime proof still needs to run.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["resolve the blocking task proof gap"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Task-target proof is the next autonomous action.",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: ["gap:autonomous-proof"],
    nextActions: ["stale checkpoint action"],
    compressedContextRef: "memory://cp-1",
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  if (prePlan.directive.kind === "continue_analysis") {
    assert.equal(prePlan.directive.actions[0]?.kind, "resolve_blocking_gap");
  }

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            }
          })
        });
      }
    }
  );

  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.executedSteps[0]?.directiveKind, "continue_analysis");
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "complete");
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("executeLoopCommandFromArgs resumes checkpoint task targets through workflow-proof inference", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous checkpoint resume",
    request: "Resume a checkpoint task target while another autonomous blocker remains."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "   ",
    whyNext: undefined,
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["task:rewrite"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: ["resume the approved task target"],
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  if (prePlan.directive.kind === "continue_analysis") {
    assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");
    assert.equal(prePlan.directive.source, "checkpoint");
  }

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            }
          })
        });
      }
    }
  );

  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.executedSteps[0]?.directiveKind, "continue_analysis");
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "continue_analysis");
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("executeLoopCommandFromArgs clears stale checkpoint review targets and falls back to inventory rebuild", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous checkpoint normalization",
    request: "Clear a stale checkpoint review target without fabricating progress."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "   ",
    whyNext: undefined,
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: ["confirm authenticated reviews"],
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  if (prePlan.directive.kind === "continue_analysis") {
    assert.equal(prePlan.directive.source, "checkpoint");
    assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");
  }

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            },
            recordProgressProof(runId, proof) {
              return service.recordProgressProof(runId, proof);
            },
            checkpointRun(runId, checkpoint, checkpointOptions) {
              return service.checkpointRun(runId, checkpoint, checkpointOptions);
            }
          })
        });
      }
    }
  );

  const status = await service.getStatus(run.id);
  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "rebuild_inventory");
  if (result.result.finalPlan.directive.kind === "rebuild_inventory") {
    assert.ok(result.result.finalPlan.directive.missingUnderstandingKinds.includes("repo_map"));
  }
  assert.equal(status.autonomousExecution?.state.checkpoints.at(-1)?.activeTargets.length, 0);
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("executeLoopCommandFromArgs clears stale progress-proof review targets and falls back to inventory rebuild", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous progress normalization",
    request: "Clear a stale progress-proof review target without fabricating progress."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "review:authenticated",
    whyNext: "Confirm authenticated reviews before closing the loop.",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: [],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: [],
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  if (prePlan.directive.kind === "continue_analysis") {
    assert.equal(prePlan.directive.source, "progress_proof");
    assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");
  }

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            },
            recordProgressProof(runId, proof) {
              return service.recordProgressProof(runId, proof);
            },
            checkpointRun(runId, checkpoint, checkpointOptions) {
              return service.checkpointRun(runId, checkpoint, checkpointOptions);
            }
          })
        });
      }
    }
  );

  const status = await service.getStatus(run.id);
  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "rebuild_inventory");
  if (result.result.finalPlan.directive.kind === "rebuild_inventory") {
    assert.ok(result.result.finalPlan.directive.missingUnderstandingKinds.includes("repo_map"));
  }
  assert.equal(status.autonomousExecution?.state.progressProofs.at(-1)?.nextTarget.trim(), "");
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("executeLoopCommandFromArgs clears self-referential progress-proof targets and falls back to inventory rebuild", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous progress normalization",
    request: "Clear a self-referential progress-proof target without fabricating progress."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "proof:resume",
    whyNext: "Resume the saved proof target.",
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: [],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: [],
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  if (prePlan.directive.kind === "continue_analysis") {
    assert.equal(prePlan.directive.source, "progress_proof");
    assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");
  }

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            },
            recordProgressProof(runId, proof) {
              return service.recordProgressProof(runId, proof);
            },
            checkpointRun(runId, checkpoint, checkpointOptions) {
              return service.checkpointRun(runId, checkpoint, checkpointOptions);
            }
          })
        });
      }
    }
  );

  const status = await service.getStatus(run.id);
  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "rebuild_inventory");
  if (result.result.finalPlan.directive.kind === "rebuild_inventory") {
    assert.ok(result.result.finalPlan.directive.missingUnderstandingKinds.includes("repo_map"));
  }
  assert.equal(status.autonomousExecution?.state.progressProofs.at(-1)?.nextTarget.trim(), "");
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("executeLoopCommandFromArgs clears self-referential checkpoint targets and falls back to inventory rebuild", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous checkpoint normalization",
    request: "Clear a self-referential checkpoint target without fabricating progress."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "   ",
    whyNext: undefined,
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["checkpoint:resume"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: ["Resume the saved checkpoint target."],
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  if (prePlan.directive.kind === "continue_analysis") {
    assert.equal(prePlan.directive.source, "checkpoint");
    assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");
  }

  const result = await executeLoopCommandFromArgs(
    ["--run-id", run.id, "--format", "json", "--execute-supported-directives"],
    {
      ...buildHealthyLoopPreflightOptions(store),
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
        return service.executeDirectiveStep(runId, {
          ...input,
          executeContinuationAction: createSupportedContinuationExecutor({
            getStatusSnapshot(runId) {
              return service.getStatus(runId);
            },
            getReviews(runId, taskId) {
              return store.getReviews(runId, taskId);
            },
            getApprovals(runId, taskId) {
              return store.getApprovals(runId, taskId);
            },
            upsertCoverageGaps(runId, gaps) {
              return service.upsertCoverageGaps(runId, gaps);
            },
            recordProgressProof(runId, proof) {
              return service.recordProgressProof(runId, proof);
            },
            checkpointRun(runId, checkpoint, checkpointOptions) {
              return service.checkpointRun(runId, checkpoint, checkpointOptions);
            }
          })
        });
      }
    }
  );

  const status = await service.getStatus(run.id);
  const history = await service.getLoopExecutionHistory(run.id, { limit: 5 });
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "rebuild_inventory");
  if (result.result.finalPlan.directive.kind === "rebuild_inventory") {
    assert.ok(result.result.finalPlan.directive.missingUnderstandingKinds.includes("repo_map"));
  }
  assert.equal(status.autonomousExecution?.state.checkpoints.at(-1)?.activeTargets.length, 0);
  assert.ok(history[0]?.metadata.tags.includes("outcome:executed"));
});

test("createSupportedContinuationExecutor rejects stale progress-proof source bindings", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous progress binding validation",
    request: "Reject stale proof bindings instead of normalizing the wrong source."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "proof:resume",
    whyNext: "Resume the saved proof target.",
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");

  const executor = createSupportedContinuationExecutor({
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getReviews(runId, taskId) {
      return store.getReviews(runId, taskId);
    },
    getApprovals(runId, taskId) {
      return store.getApprovals(runId, taskId);
    },
    upsertCoverageGaps(runId, gaps) {
      return service.upsertCoverageGaps(runId, gaps);
    },
    recordProgressProof(runId, proof) {
      return service.recordProgressProof(runId, proof);
    },
    checkpointRun(runId, checkpoint, checkpointOptions) {
      return service.checkpointRun(runId, checkpoint, checkpointOptions);
    }
  });

  if (prePlan.directive.kind !== "continue_analysis" || prePlan.directive.actions[0]?.kind !== "resume_target") {
    throw new Error("expected continue_analysis resume_target directive");
  }

  const result = await executor({
    runId: run.id,
    directive: prePlan.directive,
    action: {
      ...prePlan.directive.actions[0],
      sourceId: "proof-stale"
    }
  });

  assert.equal(result.executed, false);
  assert.match(result.evidence[0] ?? "", /references missing progress proof proof-stale/);
});

test("createSupportedContinuationExecutor rejects stale checkpoint source bindings", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous checkpoint binding validation",
    request: "Reject stale checkpoint bindings instead of normalizing the wrong source."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "   ",
    whyNext: undefined,
    createdAt: new Date().toISOString()
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-1",
    phase: "final_verification",
    activeTargets: ["checkpoint:resume"],
    recentEvidenceRefs: ["src/core/service.ts:1"],
    openGaps: [],
    nextActions: ["Resume the saved checkpoint target."],
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");

  const executor = createSupportedContinuationExecutor({
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getReviews(runId, taskId) {
      return store.getReviews(runId, taskId);
    },
    getApprovals(runId, taskId) {
      return store.getApprovals(runId, taskId);
    },
    upsertCoverageGaps(runId, gaps) {
      return service.upsertCoverageGaps(runId, gaps);
    },
    recordProgressProof(runId, proof) {
      return service.recordProgressProof(runId, proof);
    },
    checkpointRun(runId, checkpoint, checkpointOptions) {
      return service.checkpointRun(runId, checkpoint, checkpointOptions);
    }
  });

  if (prePlan.directive.kind !== "continue_analysis" || prePlan.directive.actions[0]?.kind !== "resume_target") {
    throw new Error("expected continue_analysis resume_target directive");
  }

  const result = await executor({
    runId: run.id,
    directive: prePlan.directive,
    action: {
      ...prePlan.directive.actions[0],
      sourceId: "cp-stale"
    }
  });

  assert.equal(result.executed, false);
  assert.match(result.evidence[0] ?? "", /references missing checkpoint cp-stale/);
});

test("createSupportedContinuationExecutor reports unsupported non-runtime resume targets explicitly", async () => {
  const { service, store } = createService();
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Unsupported resume target evidence",
    request: "Explain why an advisory-only resume target was not executed."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "rewrite",
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    })
  ]);
  await service.claimTask(run.id, "rewrite", "planner");
  await service.submitHandoff(run.id, "rewrite", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: [".devgod/work/tasks/task-rewrite.md"],
    blockers: [],
    verificationNotes: ["all reviews passed"],
    executionEvidence: ["planner handoff recorded"],
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
      id: "service:workflow-proof",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/core/service.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/ops-recovery.test.ts"],
      lastUpdatedAt: new Date().toISOString()
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 1,
    proofId: "proof-1",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/core/service.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 1, opened: 0 },
    nextTarget: "artifact:resume",
    whyNext: "This remains advisory-only.",
    createdAt: new Date().toISOString()
  });

  const prePlan = await service.getExecutionPlan(run.id);
  assert.equal(prePlan.directive.kind, "continue_analysis");
  assert.equal(prePlan.directive.actions[0]?.kind, "resume_target");

  const executor = createSupportedContinuationExecutor({
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getReviews(runId, taskId) {
      return store.getReviews(runId, taskId);
    },
    getApprovals(runId, taskId) {
      return store.getApprovals(runId, taskId);
    }
  });

  if (prePlan.directive.kind !== "continue_analysis" || prePlan.directive.actions[0]?.kind !== "resume_target") {
    throw new Error("expected continue_analysis resume_target directive");
  }

  const result = await executor({
    runId: run.id,
    directive: prePlan.directive,
    action: prePlan.directive.actions[0]
  });

  assert.equal(result.executed, false);
  assert.match(
    result.evidence[0] ?? "",
    /no supported continuation executor is available for resume_target target=artifact:resume source=progress_proof sourceId=proof-1/
  );
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
