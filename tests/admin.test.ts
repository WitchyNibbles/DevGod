import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TaskQueue } from "../src/devgod/task-queue.ts";
import {
  executeDaemonCommandFromArgs,
  executeAdvanceActiveTaskCommandFromArgs,
  executeCheckpointCommandFromArgs,
  executeCoverageCommandFromArgs,
  executeGapsCommandFromArgs,
  executeIndexRepoMarkdownCommand,
  executeReportCommandFromArgs,
  executeRecordReviewCommand,
  executeRecordReviewCommandFromArgs,
  executeResumeCommandFromArgs,
  executeSeedWorkflowProofCommandFromArgs,
  executeSyncRuntimeExportsCommandFromArgs,
  executeSupervisorCommandFromArgs,
  executeSupervisorHistoryCommandFromArgs,
  executeVerifyReviewIdentityCommand,
  executeWorkflowProofCommandFromArgs
} from "../src/admin.ts";
import { createReviewActionContextResolver } from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { TaskPacketInput, TrustedReviewActionContext } from "../src/domain/types.ts";
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
        label: "admin task default reasoning",
        hypothesis: "the admin fixture task is ready for workflow operations",
        alternatives: ["narrow the workflow surface before proceeding"],
        evidenceRefs: ["tests/admin.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://admin-task-packet",
        outcome: "supported",
        summary: "default admin fixture includes strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://admin-task-packet",
        status: "passed",
        summary: "default admin fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default admin fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? {
      claim: "the admin fixture task has sufficient evidence",
      facts: ["admin command path is under test"],
      assumptions: ["task fixture remains scoped"],
      hypotheses: ["the command should accept a strict-ready task packet"],
      evidenceRefs: ["tests/admin.test.ts"],
      counterEvidence: [],
      openQuestions: [],
      verificationPlan: ["npm test"],
      fallbacks: ["tighten the fixture if a command relies on weaker semantics"],
      budgets: { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
      confidence: "medium",
      decision: "supported"
    }
  };
}

async function createApprovedRuntimeTask(options: {
  store: MemoryStore;
  service: DevgodCoreService;
  taskId: string;
  title: string;
  request: string;
  qualityGates?: TaskPacketInput["qualityGates"];
}): Promise<{ runId: string }> {
  const run = await options.service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: options.title,
    request: options.request
  });

  await options.service.createTaskGraph(run.id, [
    taskPacket({
      taskId: options.taskId,
      ...(options.qualityGates ? { qualityGates: options.qualityGates } : {})
    })
  ]);
  await options.service.claimTask(run.id, options.taskId, "planner");
  await options.service.submitHandoff(run.id, options.taskId, {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: `Prepared approved task ${options.taskId}.`,
    changedFiles: ["src/admin.ts"],
    blockers: [],
    verificationNotes: ["verified command boundaries"],
    executionEvidence: ["task packet written"],
    qualityGateEvidence: ["tdd scenarios listed"],
    contextRefs: [`brief://${options.taskId}`]
  });

  await options.service.recordReview(run.id, options.taskId, "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await options.service.recordReview(run.id, options.taskId, "security-actor", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await options.service.recordReview(run.id, options.taskId, "qa-actor", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  return { runId: run.id };
}

async function seedAutonomousState(
  service: DevgodCoreService,
  runId: string,
  options: {
    includeCheckpoint?: boolean;
    includeClosedGap?: boolean;
    gapTargetId?: string;
    gapNextActions?: string[];
    progressNextTarget?: string;
    progressWhyNext?: string;
    checkpointTarget?: string;
  } = {}
) {
  await service.configureAutonomousExecution(runId, {
    profile: "legacy_rewrite",
    phase: "final_verification",
    manifest: {
      runId,
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
  await service.upsertCoverageItems(runId, [
    {
      id: "service:admin-runtime",
      category: "services",
      state: "validated",
      criticality: "critical",
      sources: ["src/admin.ts:1"],
      callsiteCount: 2,
      callsitesAnalyzed: 2,
      runtimeTraced: true,
      evidenceRefs: ["src/admin.ts:1"],
      verificationRefs: ["tests/admin.test.ts"],
      lastUpdatedAt: "2026-05-15T12:00:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(runId, [
    {
      id: "gap:admin-open",
      targetId: options.gapTargetId ?? "task:runtime-proof",
      kind: "missing_validation",
      severity: "high",
      description: "Runtime proof is still pending.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: options.gapNextActions ?? ["run workflow-proof after authenticated reviews"],
      status: "open"
    },
    ...(options.includeClosedGap
      ? [
          {
            id: "gap:admin-closed",
            targetId: "task:old-gap",
            kind: "missing_inventory" as const,
            severity: "low" as const,
            description: "Old inventory gap already closed.",
            blocking: false,
            evidenceRefs: ["src/admin.ts:1"],
            createdBy: "reviewer",
            suggestedNextActions: [],
            status: "closed" as const
          }
        ]
      : [])
  ]);
  await service.recordProgressProof(runId, {
    cycle: 1,
    proofId: "proof-admin",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: options.progressNextTarget ?? "review:authenticated",
    whyNext: options.progressWhyNext ?? "Runtime proof remains the next autonomous target.",
    createdAt: "2026-05-15T12:03:00.000Z"
  });
  if (options.includeCheckpoint) {
    await service.checkpointRun(runId, {
      checkpointId: "cp-admin",
      phase: "final_verification",
      activeTargets: [options.checkpointTarget ?? options.progressNextTarget ?? "review:authenticated"],
      recentEvidenceRefs: ["src/admin.ts:1"],
      openGaps: ["gap:admin-open"],
      nextActions: options.gapNextActions ?? ["run workflow-proof after authenticated reviews"],
      compressedContextRef: "memory://cp-admin",
      createdAt: "2026-05-15T12:04:00.000Z"
    });
  }
}

test("verify-review-identity command validates adapter, bindings, and fixtures", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-review-identity-"));
  const adminPath = path.join(sourceRoot, "src/admin.ts");
  const adapterImportUrl = pathToFileURL(path.join(sourceRoot, "src/index.ts")).href;

  const adapterModule = `import { createReviewPrincipalAdapter } from ${JSON.stringify(adapterImportUrl)};

export default createReviewPrincipalAdapter(async ({ authContext }) => ({
  provider: String(authContext.provider),
  subject: String(authContext.subject),
  verified: authContext.verified === true
}));
`;

  const bindings = {
    bindings: [
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["reviewer"]
          }
        ]
      }
    ]
  };

  const fixtures = {
    fixtures: [
      {
        name: "allow reviewer principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "allow",
          principal: {
            provider: "github",
            subject: "alice",
            verified: true
          },
          context: {
            actor: "alice-reviewer",
            actorRole: "reviewer",
            waiverAuthority: "none"
          }
        }
      },
      {
        name: "deny unverified principal",
        authContext: {
          provider: "github",
          subject: "alice",
          verified: false
        },
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "deny",
          errorIncludes: ["not verified"]
        }
      }
    ]
  };

  try {
    await writeFile(path.join(directory, "review-identity-adapter.ts"), adapterModule, "utf8");
    await writeFile(
      path.join(directory, "review-identity-bindings.json"),
      `${JSON.stringify(bindings, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, "review-identity-adapter.fixture.json"),
      `${JSON.stringify(fixtures, null, 2)}\n`,
      "utf8"
    );

    const result = await executeVerifyReviewIdentityCommand({
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: "./review-identity-bindings.json",
        DEVGOD_REVIEW_IDENTITY_FIXTURES: "./review-identity-adapter.fixture.json"
      }
    });

    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeWorkflowProofCommandFromArgs returns runtime-authoritative proof for an approved task", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Ship workflow proof",
    request: "Make live checks trust runtime state."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "Prepared runtime workflow proof slice.",
    changedFiles: ["src/admin.ts"],
    blockers: [],
    verificationNotes: ["verified command boundaries"],
    executionEvidence: ["task packet written"],
    qualityGateEvidence: ["tdd scenarios listed"],
    contextRefs: ["brief://workflow-proof"]
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

  const result = await executeWorkflowProofCommandFromArgs(
    ["--run-id", run.id, "--task-id", "plan"],
    {
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    }
  );

  assert.equal(result.authorityLabel, "runtime_authoritative");
  assert.equal(result.runId, run.id);
  assert.equal(result.taskId, "plan");
  assert.equal(result.taskStatus, "approved");
  assert.equal(result.reviewDecision, "approved");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.latestReviews.length, 3);
  assert.equal(result.latestApproval?.decision, "approved");
  assert.equal(result.latestApproval?.identityAssurance, "authenticated");
});

test("executeAdvanceActiveTaskCommandFromArgs previews and applies runtime-gated queue rollover", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });
  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-001",
    title: "Advance current task",
    request: "Use runtime proof to move the queue forward."
  });
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const exportCwd = await mkdtemp(path.join(tmpdir(), "devgod-advance-export-"));
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-001",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-001",
      tasks: [
        {
          id: "task-001",
          title: "Current task",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        },
        {
          id: "task-002",
          title: "Next task",
          status: "pending",
          class: "release_candidate",
          depends_on: ["task-001"],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: runId,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    const preview = await executeAdvanceActiveTaskCommandFromArgs(["--workspace-slug", "team", "--project-slug", "devgod", "--run-id", runId], {
        cwd: exportCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        }
      });

    assert.equal(preview.format, "json");
    assert.equal(preview.result.mode, "dry_run");
    assert.equal(preview.result.taskId, "task-001");
    assert.equal(preview.result.nextTaskId, "task-002");

    const previewState = await store.getProjectRuntimeState(projectContext.project.id);
    assert.equal((previewState?.taskQueue as { current_task_id?: string }).current_task_id, "task-001");

    const applied = await executeAdvanceActiveTaskCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--run-id", runId, "--apply"],
      {
        cwd: exportCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        }
      }
    );

    assert.equal(applied.format, "json");
    assert.equal(applied.result.mode, "applied");
    assert.equal(applied.result.taskId, "task-001");
    assert.equal(applied.result.nextTaskId, "task-002");

    const appliedState = await store.getProjectRuntimeState(projectContext.project.id);
    const appliedQueue = appliedState?.taskQueue as
      | { current_task_id?: string | null; tasks?: Array<{ id: string; status: string }> }
      | undefined;
    assert.equal(appliedState?.activeTaskId, "task-002");
    assert.equal(appliedQueue?.current_task_id, "task-002");
    assert.equal(appliedQueue?.tasks?.find((task) => task.id === "task-001")?.status, "done");
    assert.equal(appliedQueue?.tasks?.find((task) => task.id === "task-002")?.status, "in_progress");

    const exportedActive = await readFile(path.join(exportCwd, ".devgod", "ACTIVE"), "utf8");
    const exportedQueue = JSON.parse(
      await readFile(path.join(exportCwd, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { current_task_id?: string | null; tasks?: Array<{ id: string; status: string }> };
    assert.equal(exportedActive, "task_id=task-002\nworkflow=devgod\nstate=active\n");
    assert.equal(exportedQueue.current_task_id, "task-002");
    assert.equal(exportedQueue.tasks?.find((task) => task.id === "task-001")?.status, "done");
    assert.equal(exportedQueue.tasks?.find((task) => task.id === "task-002")?.status, "in_progress");
  } finally {
    await rm(exportCwd, { recursive: true, force: true });
  }
});

test("executeAdvanceActiveTaskCommandFromArgs refuses queue mutation when runtime proof is missing", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: { bindings: [] },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Reject unapproved advance",
    request: "Do not move the queue without runtime approval."
  });
  await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-001" })]);
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);

  const originalQueue: TaskQueue = {
    project_status: "in_progress",
    current_task_id: "task-001",
    tasks: [
      {
        id: "task-001",
        title: "Current task",
        status: "in_progress",
        class: "release_candidate",
        depends_on: [],
        acceptance_criteria: [],
        verification: [],
        evidence: [],
        blocker: null
      }
    ]
  };
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: run.id,
    activeTaskId: "task-001",
    taskQueue: originalQueue,
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await assert.rejects(
      executeAdvanceActiveTaskCommandFromArgs(["--workspace-slug", "team", "--project-slug", "devgod", "--run-id", run.id, "--apply"], {
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        }
      }),
      /not approved in runtime|runtime status must be approved/i
    );

  assert.deepEqual((await store.getProjectRuntimeState(projectContext.project.id))?.taskQueue, originalQueue);
  assert.equal((await store.getProjectRuntimeState(projectContext.project.id))?.activeTaskId, "task-001");
});

test("executeSeedWorkflowProofCommandFromArgs seeds an approved latest runtime run from the active task", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "devgod-local-seed", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "devgod-local-seed", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "devgod-local-seed", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "devgod-local-seed",
          subject: input.actor,
          verified: true
        };
      }
    })
  });
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  const exportCwd = await mkdtemp(path.join(tmpdir(), "devgod-seed-export-"));
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: undefined,
    activeTaskId: "active-proof-task",
    taskQueue: {
      project_status: "ready",
      current_task_id: null,
      tasks: []
    },
    productState: { status: "ready", items: [] },
    lastVerifiedRunId: undefined,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    const result = await executeSeedWorkflowProofCommandFromArgs(
        ["--workspace-slug", "team", "--project-slug", "devgod"],
        {
          cwd: exportCwd,
          getProjectContext(params) {
            return store.getProjectContext(params);
          },
          getProjectRuntimeState(projectId) {
            return store.getProjectRuntimeState(projectId);
          },
          saveProjectRuntimeState(state) {
            return store.saveProjectRuntimeState(state);
          },
          intakeRequest(input) {
            return service.intakeRequest(input);
          },
          createTaskGraph(runId, taskPackets) {
            return service.createTaskGraph(runId, taskPackets);
          },
          claimTask(runId, taskId, actor) {
            return service.claimTask(runId, taskId, actor);
          },
          submitHandoff(runId, taskId, handoff) {
            return service.submitHandoff(runId, taskId, handoff);
          },
          recordReview(runId, taskId, actor, review) {
            return service.recordReview(runId, taskId, actor, review);
          },
          getStatusSnapshot(runId) {
            return service.getStatus(runId);
          },
          getReviews(runId, taskId) {
            return store.getReviews(runId, taskId);
          },
          getApprovals(runId, taskId) {
            return store.getApprovals(runId, taskId);
          }
        }
      );

    assert.equal(result.mode, "local_workflow_proof_seed");
    assert.equal(result.workspaceSlug, "team");
    assert.equal(result.projectSlug, "devgod");
    assert.equal(result.taskId, "active-proof-task");
    assert.equal(result.taskStatus, "approved");
    assert.equal(result.reviewDecision, "approved");
    assert.equal(result.latestApproval.decision, "approved");
    assert.equal(result.latestApproval.identityAssurance, "authenticated");

    const latestRun = await store.findLatestRun({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.equal(latestRun?.id, result.runId);
    const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
    assert.equal(runtimeState?.activeTaskId, "active-proof-task");
    assert.equal(runtimeState?.lastVerifiedRunId, result.runId);
    const queue = runtimeState?.taskQueue as
      | { current_task_id?: string | null; project_status?: string; tasks?: Array<{ id: string; status: string }> }
      | undefined;
    assert.equal(queue?.project_status, "in_progress");
    assert.equal(queue?.current_task_id, "active-proof-task");
    assert.equal(queue?.tasks?.find((task) => task.id === "active-proof-task")?.status, "in_progress");

    const exportedActive = await readFile(path.join(exportCwd, ".devgod", "ACTIVE"), "utf8");
    const exportedQueue = JSON.parse(
      await readFile(path.join(exportCwd, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { current_task_id?: string | null; project_status?: string };
    assert.equal(exportedActive, "task_id=active-proof-task\nworkflow=devgod\nstate=active\n");
    assert.equal(exportedQueue.project_status, "in_progress");
    assert.equal(exportedQueue.current_task_id, "active-proof-task");
  } finally {
    await rm(exportCwd, { recursive: true, force: true });
  }
});

test("executeSeedWorkflowProofCommandFromArgs requires a task id when no active workflow exists", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: { bindings: [] },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "devgod-local-seed",
          subject: input.actor,
          verified: true
        };
      }
    })
  });
  await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });

  await assert.rejects(
      executeSeedWorkflowProofCommandFromArgs(["--workspace-slug", "team", "--project-slug", "devgod"], {
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        intakeRequest(input) {
          return service.intakeRequest(input);
        },
        createTaskGraph(runId, taskPackets) {
          return service.createTaskGraph(runId, taskPackets);
        },
        claimTask(runId, taskId, actor) {
          return service.claimTask(runId, taskId, actor);
        },
        submitHandoff(runId, taskId, handoff) {
          return service.submitHandoff(runId, taskId, handoff);
        },
        recordReview(runId, taskId, actor, review) {
          return service.recordReview(runId, taskId, actor, review);
        },
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        getReviews(runId, taskId) {
          return store.getReviews(runId, taskId);
        },
        getApprovals(runId, taskId) {
          return store.getApprovals(runId, taskId);
        }
      }),
      /requires --task-id or an active runtime task/
    );
});

test("executeSyncRuntimeExportsCommandFromArgs rewrites stale local workflow exports from runtime state", async () => {
  const store = new MemoryStore();
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: "run-123",
    activeTaskId: undefined,
    taskQueue: {
      project_status: "complete",
      current_task_id: null,
      tasks: [
        {
          id: "task-finished",
          title: "Finished task",
          status: "done",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "complete", items: [] },
    lastVerifiedRunId: "run-123",
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const exportCwd = await mkdtemp(path.join(tmpdir(), "devgod-sync-export-"));
  try {
    await mkdir(path.join(exportCwd, ".devgod", "work"), { recursive: true });
    await writeFile(
      path.join(exportCwd, ".devgod", "ACTIVE"),
      "task_id=task-stale\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      path.join(exportCwd, ".devgod", "work", "task-queue.json"),
      JSON.stringify(
        {
          project_status: "in_progress",
          current_task_id: "task-stale",
          tasks: []
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const synced = await executeSyncRuntimeExportsCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod"],
      {
        cwd: exportCwd,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        }
      }
    );

    assert.equal(synced.format, "json");
    assert.equal(synced.result.mode, "runtime_export_sync");
    assert.equal(synced.result.activeTaskId, null);
    assert.equal(synced.result.queue.project_status, "complete");
    assert.equal(synced.result.queue.current_task_id, null);

    const exportedActive = await readFile(path.join(exportCwd, ".devgod", "ACTIVE"), "utf8");
    const exportedQueue = JSON.parse(
      await readFile(path.join(exportCwd, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { current_task_id?: string | null; project_status?: string };
    assert.equal(exportedActive, "workflow=devgod\nstate=complete\n");
    assert.equal(exportedQueue.project_status, "complete");
    assert.equal(exportedQueue.current_task_id, null);
  } finally {
    await rm(exportCwd, { recursive: true, force: true });
  }
});

test("executeWorkflowProofCommandFromArgs resolves --run-id latest against the latest run containing the task", async () => {
  const store = new MemoryStore();
  const resolver = createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: { provider: "test", subject: "reviewer-actor" },
          actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
        },
        {
          principal: { provider: "test", subject: "security-actor" },
          actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
        },
        {
          principal: { provider: "test", subject: "qa-actor" },
          actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
        }
      ]
    },
    async resolveAuthenticatedPrincipal(input) {
      return {
        provider: "test",
        subject: input.actor,
        verified: true
      };
    }
  });
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: resolver
  });

  const approvedRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Approved workflow proof run",
    request: "Seed the task-bearing run first."
  });

  await service.createTaskGraph(approvedRun.id, [taskPacket({ taskId: "carry-task" })]);
  await service.claimTask(approvedRun.id, "carry-task", "planner");
  await service.submitHandoff(approvedRun.id, "carry-task", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "Approved task-bearing run.",
    changedFiles: ["src/admin.ts"],
    blockers: [],
    verificationNotes: ["approved task-bearing run verified"],
    executionEvidence: ["handoff submitted"],
    qualityGateEvidence: ["reviews pending"],
    contextRefs: ["brief://carry-task"]
  });
  await service.recordReview(approvedRun.id, "carry-task", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(approvedRun.id, "carry-task", "security-actor", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(approvedRun.id, "carry-task", "qa-actor", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const unrelatedRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Newer unrelated run",
    request: "Create a later run in the same project."
  });
  await service.createTaskGraph(unrelatedRun.id, [taskPacket({ taskId: "other-task" })]);

  const result = await executeWorkflowProofCommandFromArgs(
    ["--run-id", "latest", "--workspace-slug", "team", "--project-slug", "devgod", "--task-id", "carry-task"],
    {
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      findLatestRunForTask(workspaceSlug, projectSlug, taskId) {
        return store.findLatestRunForTask({ workspaceSlug, projectSlug, taskId });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    }
  );

  assert.equal(result.runId, approvedRun.id);
  assert.equal(result.taskId, "carry-task");
  assert.equal(result.taskStatus, "approved");
});

test("autonomous admin commands expose coverage, gap, checkpoint, and resume surfaces", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: { bindings: [] },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Autonomous admin surfaces",
    request: "Expose coverage, gaps, checkpoint, and resume."
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
  await seedAutonomousState(service, run.id, { includeCheckpoint: true, includeClosedGap: true });

  const coverage = await executeCoverageCommandFromArgs(["--run-id", run.id], {
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    }
  });
  assert.equal(coverage.report.items.length, 1);
  assert.equal(coverage.report.autonomous.coverageSummary?.criticalItemCoverage, 1);

  const gaps = await executeGapsCommandFromArgs(["--run-id", run.id, "--blocking-only"], {
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    }
  });
  assert.deepEqual(gaps.report.gaps.map((gap) => gap.id), ["gap:admin-open"]);

  const resume = await executeResumeCommandFromArgs(["--run-id", run.id], {
    getResumeSnapshot(runId) {
      return service.resumeRun(runId);
    }
  });
  assert.equal(resume.report.executionPlan.directive.kind, "dispatch_owner");
  assert.equal(resume.report.autonomous.latestCheckpoint?.checkpointId, "cp-admin");
  assert.equal(resume.report.autonomous.resume.source, "blocking_gap");
});

test("executeGapsCommandFromArgs keeps closed blocking gaps when --all and --blocking-only are combined", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Gap filtering",
    request: "Preserve closed blocking gaps when explicitly requested."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  await service.configureAutonomousExecution(run.id, {
    profile: "legacy_rewrite",
    phase: "validation",
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
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:blocking-open",
      targetId: "task:open",
      kind: "missing_validation",
      severity: "high",
      description: "Open blocking gap.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["resolve open gap"],
      status: "open"
    },
    {
      id: "gap:blocking-closed",
      targetId: "task:closed",
      kind: "missing_inventory",
      severity: "medium",
      description: "Closed blocking gap retained for history.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "reviewer",
      suggestedNextActions: [],
      status: "closed"
    }
  ]);

  const result = await executeGapsCommandFromArgs(["--run-id", run.id, "--all", "--blocking-only"], {
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    }
  });

  assert.deepEqual(result.report.gaps.map((gap) => gap.id), ["gap:blocking-closed", "gap:blocking-open"]);
});

test("executeCheckpointCommandFromArgs validates and records checkpoint input", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-checkpoint-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint surface",
    request: "Persist a resumable checkpoint."
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
  await seedAutonomousState(service, run.id, { includeCheckpoint: false });

  try {
    const checkpointPath = path.join(directory, "checkpoint.json");
    await writeFile(
      checkpointPath,
      JSON.stringify(
        {
          checkpointId: "cp-new",
          phase: "final_verification",
          activeTargets: ["review:authenticated"],
          recentEvidenceRefs: ["src/admin.ts:1"],
          openGaps: ["gap:admin-open"],
          nextActions: ["run workflow-proof after authenticated reviews"],
          compressedContextRef: "memory://cp-new",
          createdAt: "2026-05-15T12:05:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await executeCheckpointCommandFromArgs(
      ["--run-id", run.id, "--input", checkpointPath],
      {
        cwd: directory,
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        checkpointRun(runId, checkpoint, checkpointOptions) {
          return service.checkpointRun(runId, checkpoint, checkpointOptions);
        }
      }
    );

    assert.equal(result.report.updatedCheckpointId, "cp-new");
    assert.equal(result.report.checkpoints.at(-1)?.checkpointId, "cp-new");
    assert.equal(result.report.checkpoints.at(-1)?.authorityLabel, "operator_import");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeCheckpointCommandFromArgs rejects poisoned future checkpoints and invalid context schemes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-checkpoint-invalid-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint validation",
    request: "Reject poisoned checkpoint payloads."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  await seedAutonomousState(service, run.id, { includeCheckpoint: false });

  try {
    const invalidPath = path.join(directory, "checkpoint-invalid.json");
    await writeFile(
      invalidPath,
      JSON.stringify(
        {
          checkpointId: "cp-poison",
          phase: "final_verification",
          activeTargets: ["review:authenticated"],
          recentEvidenceRefs: ["src/admin.ts:1"],
          openGaps: ["gap:admin-open"],
          nextActions: ["mislead operator"],
          compressedContextRef: "http://example.invalid/poison",
          createdAt: "2099-01-01T00:00:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );

    await assert.rejects(
      executeCheckpointCommandFromArgs(["--run-id", run.id, "--input", invalidPath], {
        cwd: directory,
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        checkpointRun(runId, checkpoint, checkpointOptions) {
          return service.checkpointRun(runId, checkpoint, checkpointOptions);
        }
      }),
      /createdAt too far in the future|invalid compressedContextRef scheme/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeCheckpointCommandFromArgs rejects checkpoint input outside the working tree", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-checkpoint-cwd-"));
  const outsideDirectory = await mkdtemp(path.join(tmpdir(), "devgod-admin-checkpoint-outside-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Checkpoint path guard",
    request: "Reject checkpoint imports outside the active working tree."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  await seedAutonomousState(service, run.id, { includeCheckpoint: false });

  try {
    const outsidePath = path.join(outsideDirectory, "checkpoint-outside.json");
    await writeFile(
      outsidePath,
      JSON.stringify(
        {
          checkpointId: "cp-outside",
          phase: "final_verification",
          activeTargets: ["review:authenticated"],
          recentEvidenceRefs: ["src/admin.ts:1"],
          openGaps: ["gap:admin-open"],
          nextActions: ["do not import me"],
          compressedContextRef: "memory://cp-outside",
          createdAt: "2026-05-15T12:05:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );

    await assert.rejects(
      executeCheckpointCommandFromArgs(["--run-id", run.id, "--input", outsidePath], {
        cwd: directory,
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        checkpointRun(runId, checkpoint, checkpointOptions) {
          return service.checkpointRun(runId, checkpoint, checkpointOptions);
        }
      }),
      /checkpoint input path must stay within/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});

test("executeReportCommandFromArgs exposes persisted loop history without writing new entries", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: { bindings: [] },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Ship loop history",
    request: "Persist bounded runtime loop execution evidence."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", ownerRole: "planner" })]);
  await service.executeDirectiveStep(run.id, {
    ownerActor: "planner"
  });

  const memoryEntries = (store as unknown as { memoryEntries: Map<string, unknown> }).memoryEntries;
  const beforeReportCount = memoryEntries.size;

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
    },
    getLoopHistory(runId) {
      return service.getLoopExecutionHistory(runId);
    }
  });

  assert.equal(result.format, "json");
  assert.equal(result.report.loopHistory.length, 1);
  assert.equal(result.report.loopHistory[0]?.taskId, "plan");
  assert.equal(result.report.loopHistory[0]?.directiveKind, "dispatch_owner");
  assert.equal(result.report.loopHistory[0]?.outcome, "executed");
  assert.equal(result.report.loopHistory[0]?.nextDirectiveKind, "blocked");
  assert.ok(result.report.timeline.some((entry) => entry.kind === "loop_execution_recorded"));
  assert.equal(memoryEntries.size, beforeReportCount);
});

test("verify-review-identity command uses repo template defaults when no env adapter is configured", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const env = { ...process.env };

  delete env.DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE;
  delete env.DEVGOD_REVIEW_IDENTITY_BINDINGS;
  delete env.DEVGOD_REVIEW_IDENTITY_FIXTURES;
  env.DEVGOD_REVIEW_IDENTITY_BINDINGS = ".devgod/templates/review-identity-bindings.json";
  env.DEVGOD_REVIEW_IDENTITY_FIXTURES = ".devgod/templates/review-identity-adapter.fixture.json";

  const result = await executeVerifyReviewIdentityCommand({
    cwd: sourceRoot,
    env
  });

  assert.equal(result.passed, 2);
  assert.equal(result.failed, 0);
});

test("executeRecordReviewCommand accepts a live authenticated principal and resolves bound review authority", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-"));
  const bindingsPath = path.join(directory, ".devgod/review-identity-bindings.json");

  const bindings = {
    bindings: [
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["reviewer"]
          }
        ]
      }
    ]
  };

  try {
    await mkdir(path.dirname(bindingsPath), { recursive: true });
    await writeFile(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`, "utf8");

    let resolvedContext: TrustedReviewActionContext | undefined;

    const result = await executeRecordReviewCommand(
      {
        runId: "run-123",
        taskId: "task-123",
        actor: "alice-reviewer",
        review: {
          reviewerRole: "reviewer",
          state: "passed",
          severity: "low",
          findings: []
        },
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true,
          displayName: "Alice"
        }
      },
      {
        adapterModulePath: path.join(directory, "devgod/review-identity-adapter.ts"),
        bindingsPath,
        adapter: async ({ authContext }) => ({
          provider: String((authContext as { provider: string }).provider),
          subject: String((authContext as { subject: string }).subject),
          verified: (authContext as { verified: boolean }).verified === true,
          displayName: String((authContext as { displayName: string }).displayName)
        }),
        async recordReview({ command, resolver }) {
          resolvedContext = await resolver({
            runId: command.runId,
            taskId: command.taskId,
            actor: command.actor,
            reviewerRole: command.review.reviewerRole,
            reviewState: command.review.state
          });

          return {
            review: {
              id: "rev-123",
              runId: command.runId,
              taskId: command.taskId,
              reviewerRole: command.review.reviewerRole,
              actor: resolvedContext.actor,
              actorRole: resolvedContext.actorRole,
              identityAssurance: "authenticated",
              state: command.review.state,
              severity: command.review.severity,
              findings: [...command.review.findings],
              waiverAuthority: resolvedContext.waiverAuthority ?? "none",
              createdAt: "2026-05-06T00:00:00.000Z"
            },
            blockers: ["qa pending"],
            task: {
              status: "review_blocked"
            }
          };
        }
      }
    );

    assert.equal(resolvedContext?.actor, "alice-reviewer");
    assert.equal(resolvedContext?.actorRole, "reviewer");
    assert.equal(resolvedContext?.waiverAuthority, "none");
    assert.equal(resolvedContext?.identityAssurance, "authenticated");
    assert.equal(result.mode, "live");
    assert.equal(result.bindingsPath, bindingsPath);
    assert.equal(result.principal.provider, "github");
    assert.equal(result.principal.subject, "alice");
    assert.equal(result.review.actorRole, "reviewer");
    assert.deepEqual(result.blockers, ["qa pending"]);
    assert.equal(result.taskStatus, "review_blocked");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommand rejects shipped template bindings for live review actions", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  await assert.rejects(
    executeRecordReviewCommand(
      {
        runId: "run-123",
        taskId: "task-123",
        actor: "alice-reviewer",
        review: {
          reviewerRole: "reviewer",
          state: "passed",
          severity: "low",
          findings: []
        },
        authContext: {
          provider: "github",
          subject: "alice",
          verified: true
        }
      },
      {
        adapterModulePath: path.join(sourceRoot, "devgod/review-identity-adapter.ts"),
        bindingsPath: path.join(sourceRoot, ".devgod/templates/review-identity-bindings.json"),
        adapter: async () => ({
          provider: "github",
          subject: "alice",
          verified: true
        }),
        async recordReview() {
          assert.fail("recordReview should not be called when template bindings are rejected");
        }
      }
    ),
    /live reviewed bindings file/
  );
});

test("executeDaemonCommandFromArgs runs an owner turn and persists the Codex session id", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Implement owner slice",
    request: "Finish the current implementation slice."
  });
  await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/core"] })]);

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: run.id,
    activeTaskId: "task-owner",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-owner",
      tasks: [
        {
          id: "task-owner",
          title: "task-owner",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-owner-"));
  try {
    let capturedPrompt = "";
    const result = await executeDaemonCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--max-cycles", "1", "--format", "json"],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
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
        getReviews(runId, taskId) {
          return store.getReviews(runId, taskId);
        },
        getApprovals(runId, taskId) {
          return store.getApprovals(runId, taskId);
        },
        async runCodexTurn(input) {
          capturedPrompt = input.prompt;
          return {
            sessionId: "thread-owner-1",
            finalMessage: "{\"summary\":\"owner slice worked\",\"status\":\"needs_followup\",\"blockers\":[]}",
            stdout: "",
            stderr: "",
            exitCode: 0
          };
        }
      }
    );

    assert.equal(result.result.status, "max_cycles_reached");
    assert.equal(result.result.sessionId, "thread-owner-1");
    assert.equal(result.result.cycles.length, 1);
    assert.equal(result.result.cycles[0]?.action, "run_codex_owner");
    assert.match(capturedPrompt, /Active task: task-owner/);
    const runtimeState = await store.getProjectRuntimeState(projectContext!.project.id);
    assert.equal(
      (runtimeState?.metadata.devgodDaemon as { sessionId?: string } | undefined)?.sessionId,
      "thread-owner-1"
    );
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs advances the final approved task to completion", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-final",
    title: "Ship final task",
    request: "Complete the last workflow task."
  });
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-final",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-final",
      tasks: [
        {
          id: "task-final",
          title: "task-final",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-complete-"));
  try {
    const result = await executeDaemonCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--max-cycles", "1", "--format", "json"],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        }
      }
    );

    assert.equal(result.result.status, "completed");
    assert.equal(result.result.cycles.length, 1);
    assert.equal(result.result.cycles[0]?.action, "complete");
    const runtimeState = await store.getProjectRuntimeState(projectContext!.project.id);
    assert.equal(runtimeState?.activeTaskId, undefined);
    assert.equal(runtimeState?.taskQueue.current_task_id, null);
    const exportedActive = await readFile(path.join(daemonCwd, ".devgod", "ACTIVE"), "utf8");
    const exportedQueue = JSON.parse(
      await readFile(path.join(daemonCwd, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { current_task_id?: string | null; project_status?: string };
    assert.equal(exportedActive, "workflow=devgod\nstate=complete\n");
    assert.equal(exportedQueue.current_task_id, null);
    assert.equal(exportedQueue.project_status, "done");
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs executes typed workflow-proof continuation before closing the queue", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-proof",
    title: "Ship workflow proof task",
    request: "Close the autonomous workflow-proof gap.",
    qualityGates: [
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required"
    ]
  });
  await seedAutonomousState(service, runId, {
    includeCheckpoint: true,
    gapTargetId: "task:task-proof",
    gapNextActions: ["run workflow-proof after authenticated reviews"],
    progressNextTarget: "task:task-proof",
    progressWhyNext: "Run workflow-proof for the approved task.",
    checkpointTarget: "task:task-proof"
  });

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const existingRuntimeState = await store.getProjectRuntimeState(projectContext!.project.id);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-proof",
      tasks: [
        {
          id: "task-proof",
          title: "task-proof",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: existingRuntimeState?.metadata ?? {},
    createdAt: existingRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const preDaemonStatus = await service.getStatus(runId);
  assert.ok(preDaemonStatus.tasks[0]?.packet.qualityGates.includes("coverage_ledger_required"));
  assert.equal(preDaemonStatus.autonomousExecution?.coverageSummary.blockingGapCount, 1);
  const preDaemonPlan = await service.getExecutionPlan(runId);
  assert.equal(preDaemonPlan.directive.kind, "continue_analysis");

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-proof-"));
  try {
    let codexTurnCalled = false;
    const result = await executeDaemonCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--max-cycles", "2", "--format", "json"],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        upsertCoverageGaps(candidateRunId, gaps) {
          return service.upsertCoverageGaps(candidateRunId, gaps);
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        },
        async runCodexTurn() {
          codexTurnCalled = true;
          return {
            sessionId: "should-not-run",
            finalMessage: "unexpected codex turn",
            stdout: "",
            stderr: "",
            exitCode: 0
          };
        }
      }
    );

    assert.equal(result.result.status, "completed");
    assert.equal(result.result.cycles.length, 2);
    assert.equal(result.result.cycles[0]?.action, "run_workflow_proof");
    assert.equal(result.result.cycles[1]?.action, "complete");
    assert.equal(codexTurnCalled, false);
    const runtimeState = await store.getProjectRuntimeState(projectContext!.project.id);
    assert.equal(runtimeState?.activeTaskId, undefined);
    const snapshot = await service.getStatus(runId);
    const openGap = snapshot.autonomousExecution?.state.gaps.find((gap) => gap.id === "gap:admin-open");
    assert.equal(openGap?.status, "closed");
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs blocks advisory-only continuation targets before launching a Codex turn", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-proof",
    title: "Advisory-only continuation",
    request: "Block advisory continuation before launching Codex.",
    qualityGates: [
      "product_acceptance",
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required"
    ]
  });
  await seedAutonomousState(service, runId, {
    includeCheckpoint: false,
    gapTargetId: "artifact:resume",
    gapNextActions: ["consult operator evidence before resuming the artifact target"],
    progressNextTarget: "artifact:resume",
    progressWhyNext: "This remains advisory-only."
  });

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const existingRuntimeState = await store.getProjectRuntimeState(projectContext!.project.id);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-proof",
      tasks: [
        {
          id: "task-proof",
          title: "task-proof",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: existingRuntimeState?.metadata ?? {},
    createdAt: existingRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const preDaemonPlan = await service.getExecutionPlan(runId);
  assert.equal(preDaemonPlan.directive.kind, "continue_analysis");

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-advisory-"));
  try {
    let codexTurnCalled = false;
    const result = await executeDaemonCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--max-cycles", "1", "--format", "json"],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        async executeDirectiveStep(candidateRunId, input) {
          return service.executeDirectiveStep(candidateRunId, {
            staleAfterHours: input.staleAfterHours
          });
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        },
        async runCodexTurn() {
          codexTurnCalled = true;
          return {
            sessionId: "should-not-run",
            finalMessage: "unexpected codex turn",
            stdout: "",
            stderr: "",
            exitCode: 0
          };
        }
      }
    );

    assert.equal(result.result.status, "blocked");
    assert.match(result.result.reason, /operator input is required for advisory continuation target artifact:resume/);
    assert.equal(result.result.cycles[0]?.action, "blocked");
    assert.equal(codexTurnCalled, false);
    const continuationStatus = JSON.parse(
      await readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "continuation-status.json"), "utf8")
    ) as {
      state: string;
      directiveKind: string;
      executionMode: string;
      targetId: string;
      source: string;
      sourceId?: string | undefined;
      summary: string;
      nextActions: string[];
      blockers: string[];
    };
    assert.equal(continuationStatus.state, "blocked");
    assert.equal(continuationStatus.directiveKind, "continue_analysis");
    assert.equal(continuationStatus.executionMode, "operator_required");
    assert.equal(continuationStatus.targetId, "artifact:resume");
    assert.equal(continuationStatus.source, "blocking_gap");
    assert.equal(continuationStatus.summary, result.result.reason);
    assert.deepEqual(continuationStatus.nextActions, ["consult operator evidence before resuming the artifact target"]);
    assert.ok(
      continuationStatus.blockers.some((blocker) => blocker.includes("blocking gaps remain open")),
      "expected blocked continuation status to retain autonomous blockers"
    );
    const operatorHandoff = JSON.parse(
      await readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "operator-handoff.json"), "utf8")
    ) as {
      state: string;
      blockerKind: string;
      reason: string;
      workspaceSlug: string;
      projectSlug: string;
      activeRunId: string;
      activeTaskId: string;
      sessionId: string | null;
      cycle: number;
      directiveKind: string;
      nextActions: string[];
      detailFiles: {
        continuationStatus?: string | undefined;
        reviewQueueStatus?: string | undefined;
      };
    };
    assert.equal(operatorHandoff.state, "blocked");
    assert.equal(operatorHandoff.blockerKind, "operator_required_continuation");
    assert.equal(operatorHandoff.reason, result.result.reason);
    assert.equal(operatorHandoff.workspaceSlug, "team");
    assert.equal(operatorHandoff.projectSlug, "devgod");
    assert.equal(operatorHandoff.activeRunId, runId);
    assert.equal(operatorHandoff.activeTaskId, "task-proof");
    assert.equal(operatorHandoff.sessionId, null);
    assert.equal(operatorHandoff.cycle, 1);
    assert.equal(operatorHandoff.directiveKind, "continue_analysis");
    assert.deepEqual(operatorHandoff.nextActions, ["consult operator evidence before resuming the artifact target"]);
    assert.equal(
      operatorHandoff.detailFiles.continuationStatus,
      ".devgod/work/daemon/continuation-status.json"
    );
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs consumes matching operator continuation actions and launches a Codex analysis turn", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-proof",
    title: "Operator continuation follow-up",
    request: "Consume a trusted operator action and continue with Codex analysis.",
    qualityGates: [
      "product_acceptance",
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required"
    ]
  });
  await seedAutonomousState(service, runId, {
    includeCheckpoint: false,
    gapTargetId: "artifact:resume",
    gapNextActions: ["consult operator evidence before resuming the artifact target"],
    progressNextTarget: "artifact:resume",
    progressWhyNext: "This remains advisory-only."
  });

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const existingRuntimeState = await store.getProjectRuntimeState(projectContext!.project.id);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-proof",
      tasks: [
        {
          id: "task-proof",
          title: "task-proof",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: existingRuntimeState?.metadata ?? {},
    createdAt: existingRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-operator-action-"));
  const operatorActionDir = path.join(daemonCwd, ".devgod", "operator-actions");
  await mkdir(operatorActionDir, { recursive: true });
  try {
    await writeFile(
      path.join(operatorActionDir, "resume.json"),
      `${JSON.stringify(
        {
          runId,
          taskId: "task-proof",
          blockerKind: "operator_required_continuation",
          action: {
            kind: "continue_with_analysis",
            targetId: "artifact:resume",
            source: "blocking_gap",
            operatorNotes: "Use the operator-supplied artifact evidence before continuing."
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    let codexPrompt: string | undefined;
    const result = await executeDaemonCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-cycles",
        "1",
        "--format",
        "json",
        "--operator-action-dir",
        operatorActionDir
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        async executeDirectiveStep(candidateRunId, input) {
          return service.executeDirectiveStep(candidateRunId, {
            staleAfterHours: input.staleAfterHours
          });
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        },
        async runCodexTurn(input) {
          codexPrompt = input.prompt;
          return {
            sessionId: "session-operator",
            finalMessage: "operator-guided continuation executed",
            stdout: "",
            stderr: "",
            exitCode: 0
          };
        }
      }
    );

    assert.equal(result.result.status, "max_cycles_reached");
    assert.equal(result.result.cycles[0]?.action, "run_codex_analysis");
    assert.match(result.result.cycles[0]?.summary ?? "", /operator-guided continuation executed/);
    assert.ok(codexPrompt, "expected a Codex analysis prompt");
    assert.match(codexPrompt, /Autonomous target: artifact:resume/);
    assert.match(codexPrompt, /Operator notes: Use the operator-supplied artifact evidence before continuing\./);
    const remainingQueueFiles = await readdir(operatorActionDir);
    assert.deepEqual(remainingQueueFiles, []);
    const processedOperatorAction = await readFile(
      path.join(daemonCwd, ".devgod", "work", "daemon", "processed-operator-actions", "resume.json"),
      "utf8"
    );
    assert.match(processedOperatorAction, /continue_with_analysis/);
    await assert.rejects(
      readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "continuation-status.json"), "utf8"),
      /ENOENT/
    );
    await assert.rejects(
      readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "operator-handoff.json"), "utf8"),
      /ENOENT/
    );
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs clears stale continuation status once runtime continuation succeeds", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-proof",
    title: "Ship workflow proof task",
    request: "Clear stale continuation status after runtime continuation succeeds.",
    qualityGates: [
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required"
    ]
  });
  await seedAutonomousState(service, runId, {
    includeCheckpoint: true,
    gapTargetId: "task:task-proof",
    gapNextActions: ["run workflow-proof after authenticated reviews"],
    progressNextTarget: "task:task-proof",
    progressWhyNext: "Run workflow-proof for the approved task.",
    checkpointTarget: "task:task-proof"
  });

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const existingRuntimeState = await store.getProjectRuntimeState(projectContext!.project.id);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-proof",
      tasks: [
        {
          id: "task-proof",
          title: "task-proof",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: existingRuntimeState?.metadata ?? {},
    createdAt: existingRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-continuation-clear-"));
  try {
    await mkdir(path.join(daemonCwd, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      path.join(daemonCwd, ".devgod", "work", "daemon", "continuation-status.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          directiveKind: "continue_analysis",
          executionMode: "operator_required",
          targetId: "artifact:resume",
          source: "blocking_gap",
          summary: "stale blocked continuation",
          nextActions: ["consult operator evidence"],
          blockers: ["blocking gaps remain open"],
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await executeDaemonCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--max-cycles", "2", "--format", "json"],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        upsertCoverageGaps(candidateRunId, gaps) {
          return service.upsertCoverageGaps(candidateRunId, gaps);
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        }
      }
    );

    assert.equal(result.result.status, "completed");
    await assert.rejects(
      readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "continuation-status.json"), "utf8"),
      /ENOENT/
    );
    await assert.rejects(
      readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "operator-handoff.json"), "utf8"),
      /ENOENT/
    );
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs quarantines invalid queued operator continuation actions", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-proof",
    title: "Invalid operator continuation input",
    request: "Quarantine malformed operator continuation files.",
    qualityGates: [
      "product_acceptance",
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required"
    ]
  });
  await seedAutonomousState(service, runId, {
    includeCheckpoint: false,
    gapTargetId: "artifact:resume",
    gapNextActions: ["consult operator evidence before resuming the artifact target"],
    progressNextTarget: "artifact:resume",
    progressWhyNext: "This remains advisory-only."
  });

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const existingRuntimeState = await store.getProjectRuntimeState(projectContext!.project.id);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-proof",
      tasks: [
        {
          id: "task-proof",
          title: "task-proof",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: existingRuntimeState?.metadata ?? {},
    createdAt: existingRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-operator-action-invalid-"));
  const operatorActionDir = path.join(daemonCwd, ".devgod", "operator-actions");
  await mkdir(operatorActionDir, { recursive: true });
  try {
    await writeFile(
      path.join(operatorActionDir, "invalid.json"),
      `${JSON.stringify(
        {
          runId,
          taskId: "task-proof",
          blockerKind: "operator_required_continuation",
          action: {
            kind: "continue_with_analysis",
            targetId: "artifact:resume"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    let codexTurnCalled = false;
    const result = await executeDaemonCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-cycles",
        "1",
        "--format",
        "json",
        "--operator-action-dir",
        operatorActionDir
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        async executeDirectiveStep(candidateRunId, input) {
          return service.executeDirectiveStep(candidateRunId, {
            staleAfterHours: input.staleAfterHours
          });
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        },
        async runCodexTurn() {
          codexTurnCalled = true;
          return {
            sessionId: "should-not-run",
            finalMessage: "unexpected codex turn",
            stdout: "",
            stderr: "",
            exitCode: 0
          };
        }
      }
    );

    assert.equal(result.result.status, "blocked");
    assert.match(result.result.reason, /operator input is required for advisory continuation target artifact:resume/);
    assert.equal(codexTurnCalled, false);
    const remainingQueueFiles = await readdir(operatorActionDir);
    assert.deepEqual(remainingQueueFiles, []);
    const failedDir = path.join(daemonCwd, ".devgod", "work", "daemon", "failed-operator-actions");
    const archivedInvalid = await readFile(path.join(failedDir, "invalid.json"), "utf8");
    assert.match(archivedInvalid, /artifact:resume/);
    const archivedError = JSON.parse(
      await readFile(path.join(failedDir, "invalid.json.error.json"), "utf8")
    ) as {
      file: string;
      error: string;
      archivedAt: string;
    };
    assert.equal(archivedError.file, "invalid.json");
    assert.match(archivedError.error, /operator action action\.operatorNotes is required/);
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeSupervisorCommandFromArgs synthesizes operator continuation actions and reruns the daemon", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const { runId } = await createApprovedRuntimeTask({
    store,
    service,
    taskId: "task-proof",
    title: "Supervisor continuation follow-up",
    request: "Supervisor should read a blocked handoff and synthesize a trusted continuation action.",
    qualityGates: [
      "product_acceptance",
      "coverage_ledger_required",
      "progress_proof_required",
      "checkpoint_resume_required"
    ]
  });
  await seedAutonomousState(service, runId, {
    includeCheckpoint: false,
    gapTargetId: "artifact:resume",
    gapNextActions: ["consult operator evidence before resuming the artifact target"],
    progressNextTarget: "artifact:resume",
    progressWhyNext: "This remains advisory-only."
  });

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const existingRuntimeState = await store.getProjectRuntimeState(projectContext!.project.id);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: runId,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "task-proof",
      tasks: [
        {
          id: "task-proof",
          title: "task-proof",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    lastVerifiedRunId: undefined,
    metadata: existingRuntimeState?.metadata ?? {},
    createdAt: existingRuntimeState?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-supervisor-"));
  try {
    let codexPrompt: string | undefined;
    const result = await executeSupervisorCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-supervisor-cycles",
        "2",
        "--max-cycles",
        "1",
        "--format",
        "json"
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        async executeDirectiveStep(candidateRunId, input) {
          return service.executeDirectiveStep(candidateRunId, {
            staleAfterHours: input.staleAfterHours
          });
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        },
        async runCodexTurn(input) {
          codexPrompt = input.prompt;
          return {
            sessionId: "session-supervisor",
            finalMessage: "supervisor-guided continuation executed",
            stdout: "",
            stderr: "",
            exitCode: 0
          };
        }
      }
    );

    assert.equal(result.result.status, "max_cycles_reached");
    assert.equal(result.result.daemonRuns.length, 2);
    assert.equal(result.result.daemonRuns[0]?.status, "blocked");
    assert.equal(result.result.daemonRuns[1]?.status, "max_cycles_reached");
    assert.equal(result.result.actions.length, 1);
    assert.equal(result.result.actions[0]?.action, "enqueue_operator_continuation");
    assert.equal(result.result.actions[0]?.targetId, "artifact:resume");
    assert.ok(codexPrompt, "expected supervisor to trigger a daemon Codex turn");
    assert.match(codexPrompt, /Operator notes: Local supervisor authorized advisory continuation for artifact:resume\./);
    assert.match(codexPrompt, /consult operator evidence before resuming the artifact target/);
    const operatorActionQueueDir = path.join(daemonCwd, ".devgod", "operator-actions");
    const remainingQueueFiles = await readdir(operatorActionQueueDir);
    assert.deepEqual(remainingQueueFiles, []);
    const processedOperatorDir = path.join(
      daemonCwd,
      ".devgod",
      "work",
      "daemon",
      "processed-operator-actions"
    );
    const processedFiles = await readdir(processedOperatorDir);
    assert.equal(processedFiles.length, 1);
    const processedOperatorAction = await readFile(path.join(processedOperatorDir, processedFiles[0]!), "utf8");
    assert.match(processedOperatorAction, /continue_with_analysis/);
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeSupervisorCommandFromArgs synthesizes trusted review actions and reruns the daemon", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Supervisor review follow-up",
    request: "Supervisor should synthesize trusted review actions from a review-queue handoff."
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

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: [
        {
          id: "plan",
          title: "plan",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-supervisor-review-queue-"));
  try {
    const executedRoles: string[] = [];
    const result = await executeSupervisorCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-supervisor-cycles",
        "2",
        "--max-cycles",
        "2",
        "--format",
        "json",
        "--review-actor",
        "security_reviewer=security-actor",
        "--review-actor",
        "qa_engineer=qa-actor"
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        getStatusSnapshot(candidateRunId) {
          return service.getStatus(candidateRunId);
        },
        getExecutionPlan(candidateRunId, staleAfterHours) {
          return service.getExecutionPlan(candidateRunId, { staleAfterHours });
        },
        applyRecovery(candidateRunId, actionIds, staleAfterHours) {
          return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
        },
        async executeDirectiveStep(candidateRunId, input) {
          return service.executeDirectiveStep(candidateRunId, {
            ...input,
            async executeReviewRecommendation({ directive }) {
              const command = input.reviewCommands.find((candidate) =>
                directive.recommendations.some(
                  (recommendation) =>
                    recommendation.taskId === candidate.taskId &&
                    recommendation.targetReviewRole === candidate.review.reviewerRole
                )
              );
              assert.ok(command, "expected a matching supervisor-generated review command");
              executedRoles.push(command.review.reviewerRole);
              await service.recordReview(candidateRunId, command.taskId, command.actor, command.review);
              return {
                executed: true,
                taskId: command.taskId,
                actor: command.actor,
                reviewRole: command.review.reviewerRole,
                evidence: [`recorded ${command.review.reviewerRole} for ${command.taskId}`]
              };
            }
          });
        },
        getReviews(candidateRunId, taskId) {
          return store.getReviews(candidateRunId, taskId);
        },
        getApprovals(candidateRunId, taskId) {
          return store.getApprovals(candidateRunId, taskId);
        }
      }
    );

    assert.equal(result.result.status, "completed");
    assert.equal(result.result.daemonRuns.length, 2);
    assert.equal(result.result.daemonRuns[0]?.status, "blocked");
    assert.equal(result.result.daemonRuns[1]?.status, "completed");
    assert.deepEqual([...executedRoles].sort(), ["qa_engineer", "security_reviewer"]);
    assert.equal(result.result.actions.length, 2);
    assert.deepEqual(
      result.result.actions.map((action) => action.action),
      ["enqueue_review_action", "enqueue_review_action"]
    );
    assert.deepEqual(
      result.result.actions.map((action) => action.reviewRole).sort(),
      ["qa_engineer", "security_reviewer"]
    );
    const reviewQueueDir = path.join(daemonCwd, ".devgod", "review-actions");
    const remainingQueueFiles = await readdir(reviewQueueDir);
    assert.deepEqual(remainingQueueFiles, []);
    const processedReviewDir = path.join(daemonCwd, ".devgod", "work", "daemon", "processed-review-actions");
    const processedFiles = await readdir(processedReviewDir);
    assert.equal(processedFiles.length, 2);
    const processedSecurity = await readFile(
      path.join(processedReviewDir, processedFiles.find((file) => file.includes("security_reviewer"))!),
      "utf8"
    );
    const processedQa = await readFile(
      path.join(processedReviewDir, processedFiles.find((file) => file.includes("qa_engineer"))!),
      "utf8"
    );
    assert.match(processedSecurity, /security-actor/);
    assert.match(processedQa, /qa-actor/);
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeSupervisorCommandFromArgs appends supervisor history across repeated runs", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Supervisor history trail",
    request: "Persist supervisor history across separate runs."
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

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: [
        {
          id: "plan",
          title: "plan",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const directory = await mkdtemp(path.join(tmpdir(), "devgod-supervisor-history-"));
  try {
    const baseOptions: Parameters<typeof executeSupervisorCommandFromArgs>[1] = {
      cwd: directory,
      env: process.env,
      getProjectContext(params: { workspaceSlug: string; projectSlug: string }) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId: string) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state: Parameters<typeof store.saveProjectRuntimeState>[0]) {
        return store.saveProjectRuntimeState(state);
      },
      getStatusSnapshot(candidateRunId: string) {
        return service.getStatus(candidateRunId);
      },
      getExecutionPlan(candidateRunId: string, staleAfterHours: number) {
        return service.getExecutionPlan(candidateRunId, { staleAfterHours });
      },
      applyRecovery(candidateRunId: string, actionIds: readonly string[], staleAfterHours: number) {
        return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
      },
      async executeDirectiveStep(candidateRunId, input) {
        return service.executeDirectiveStep(candidateRunId, {
          ...input,
          async executeReviewRecommendation({ directive }) {
            const command = input.reviewCommands.find((candidate) =>
              directive.recommendations.some(
                (recommendation) =>
                  recommendation.taskId === candidate.taskId &&
                  recommendation.targetReviewRole === candidate.review.reviewerRole
              )
            );
            assert.ok(command, "expected a matching supervisor-generated review command");
            await service.recordReview(candidateRunId, command.taskId, command.actor, command.review);
            return {
              executed: true,
              taskId: command.taskId,
              actor: command.actor,
              reviewRole: command.review.reviewerRole,
              evidence: [`recorded ${command.review.reviewerRole} for ${command.taskId}`]
            };
          }
        });
      },
      getReviews(candidateRunId: string, taskId: string) {
        return store.getReviews(candidateRunId, taskId);
      },
      getApprovals(candidateRunId: string, taskId: string) {
        return store.getApprovals(candidateRunId, taskId);
      }
    };

    const blocked = await executeSupervisorCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod", "--max-supervisor-cycles", "1", "--max-cycles", "1", "--format", "json"],
      baseOptions
    );
    assert.equal(blocked.result.status, "blocked");
    assert.match(blocked.result.reason, /missing review actor bindings/);

    const completed = await executeSupervisorCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-supervisor-cycles",
        "2",
        "--max-cycles",
        "2",
        "--format",
        "json",
        "--review-actor",
        "security_reviewer=security-actor",
        "--review-actor",
        "qa_engineer=qa-actor"
      ],
      baseOptions
    );
    assert.equal(completed.result.status, "completed");

    const historyLines = (
      await readFile(path.join(directory, ".devgod", "work", "daemon", "supervisor-history.jsonl"), "utf8")
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as {
        state: string;
        blockerKind?: string;
        reason: string;
        actions: { action: string }[];
      });
    assert.equal(historyLines.length, 2);
    assert.equal(historyLines[0]?.state, "blocked");
    assert.equal(historyLines[0]?.blockerKind, "missing_review_actor_bindings");
    assert.equal(historyLines[1]?.state, "completed");
    assert.equal(historyLines[1]?.actions.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeSupervisorCommandFromArgs trims supervisor history to the configured retention limit", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Trim supervisor history",
    request: "Keep supervisor history bounded."
  });
  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "Prepared review-blocked task for retention testing.",
    changedFiles: ["src/admin.ts"],
    blockers: [],
    verificationNotes: ["verified supervisor retention flow"],
    executionEvidence: ["task packet written"],
    qualityGateEvidence: ["reviews remain pending"],
    contextRefs: ["brief://plan"]
  });
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);

  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: [
        {
          id: "plan",
          title: "plan",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const directory = await mkdtemp(path.join(tmpdir(), "devgod-supervisor-history-retention-"));
  try {
    const baseOptions: Parameters<typeof executeSupervisorCommandFromArgs>[1] = {
      cwd: directory,
      env: process.env,
      getProjectContext(params: { workspaceSlug: string; projectSlug: string }) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId: string) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state: Parameters<typeof store.saveProjectRuntimeState>[0]) {
        return store.saveProjectRuntimeState(state);
      },
      getStatusSnapshot(candidateRunId: string) {
        return service.getStatus(candidateRunId);
      },
      getExecutionPlan(candidateRunId: string, staleAfterHours: number) {
        return service.getExecutionPlan(candidateRunId, { staleAfterHours });
      },
      applyRecovery(candidateRunId: string, actionIds: readonly string[], staleAfterHours: number) {
        return service.applyRecovery(candidateRunId, actionIds, { staleAfterHours });
      },
      async executeDirectiveStep(candidateRunId, input) {
        return service.executeDirectiveStep(candidateRunId, {
          ...input,
          async executeReviewRecommendation({ directive }) {
            const command = input.reviewCommands.find((candidate) =>
              directive.recommendations.some(
                (recommendation) =>
                  recommendation.taskId === candidate.taskId &&
                  recommendation.targetReviewRole === candidate.review.reviewerRole
              )
            );
            assert.ok(command, "expected a matching supervisor-generated review command");
            await service.recordReview(candidateRunId, command.taskId, command.actor, command.review);
            return {
              executed: true,
              taskId: command.taskId,
              actor: command.actor,
              reviewRole: command.review.reviewerRole,
              evidence: [`recorded ${command.review.reviewerRole} for ${command.taskId}`]
            };
          }
        });
      },
      getReviews(candidateRunId: string, taskId: string) {
        return store.getReviews(candidateRunId, taskId);
      },
      getApprovals(candidateRunId: string, taskId: string) {
        return store.getApprovals(candidateRunId, taskId);
      }
    };

    for (const index of [1, 2, 3]) {
      const result = await executeSupervisorCommandFromArgs(
        [
          "--workspace-slug",
          "team",
          "--project-slug",
          "devgod",
          "--max-supervisor-cycles",
          "1",
          "--max-cycles",
          "1",
          "--format",
          "json",
          "--supervisor-history-retention",
          "2"
        ],
        baseOptions
      );
      assert.equal(result.result.status, "blocked", `expected blocked supervisor result for cycle ${index}`);
    }

    const historyLines = (
      await readFile(path.join(directory, ".devgod", "work", "daemon", "supervisor-history.jsonl"), "utf8")
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { state: string; blockerKind?: string; activeRunId?: string | null });
    assert.equal(historyLines.length, 2);
    assert.deepEqual(
      historyLines.map((line) => ({
        state: line.state,
        blockerKind: line.blockerKind,
        activeRunId: line.activeRunId
      })),
      [
        {
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          activeRunId: run.id
        },
        {
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          activeRunId: run.id
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeSupervisorHistoryCommandFromArgs reads persisted supervisor history directly", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-supervisor-history-command-"));
  try {
    await mkdir(path.join(directory, ".devgod", "work", "daemon"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "supervisor-status.json"),
      `${JSON.stringify(
        {
          state: "blocked",
          blockerKind: "missing_review_actor_bindings",
          reason: "supervisor is missing review actor bindings for: qa_engineer",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: "run-1",
          activeTaskId: "rewrite",
          sessionId: "session-1",
          supervisorCycles: 3,
          nextActions: ["provide --review-actor qa_engineer=<actor>"],
          missingReviewRoles: ["qa_engineer"],
          actions: [],
          updatedAt: "2026-05-16T12:30:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "daemon", "supervisor-history.jsonl"),
      `${JSON.stringify({
        recordedAt: "2026-05-16T11:00:00.000Z",
        state: "completed",
        reason: "run 1 completed once before blocking again",
        workspaceSlug: "team",
        projectSlug: "devgod",
        activeRunId: "run-1",
        activeTaskId: "rewrite",
        sessionId: "session-0",
        supervisorCycles: 1,
        nextActions: [],
        missingReviewRoles: [],
        actions: []
      })}\n${JSON.stringify({
        recordedAt: "2026-05-16T11:30:00.000Z",
        state: "completed",
        reason: "run 2 completed cleanly",
        workspaceSlug: "team",
        projectSlug: "devgod",
        activeRunId: "run-2",
        activeTaskId: "stabilize",
        sessionId: "session-2",
        supervisorCycles: 2,
        nextActions: [],
        missingReviewRoles: [],
        actions: [{ cycle: 1, action: "enqueue_review_action", taskId: "stabilize", reviewRole: "reviewer", filePath: ".devgod/review-actions/reviewer.json", summary: "queued reviewer" }]
      })}\n${JSON.stringify({
        recordedAt: "2026-05-16T12:00:00.000Z",
        state: "blocked",
        blockerKind: "missing_review_actor_bindings",
        reason: "supervisor is missing review actor bindings for: qa_engineer",
        workspaceSlug: "team",
        projectSlug: "devgod",
        activeRunId: "run-1",
        activeTaskId: "rewrite",
        sessionId: "session-1",
        supervisorCycles: 3,
        nextActions: ["provide --review-actor qa_engineer=<actor>"],
        missingReviewRoles: ["qa_engineer"],
        actions: []
      })}\n`,
      "utf8"
    );

    const runScoped = await executeSupervisorHistoryCommandFromArgs(
      ["--run-id", "run-1", "--format", "json"],
      { cwd: directory }
    );
    assert.equal(runScoped.format, "json");
    assert.deepEqual(runScoped.result.entries, [
      {
        recordedAt: "2026-05-16T11:00:00.000Z",
        state: "completed",
        activeRunId: "run-1",
        activeTaskId: "rewrite",
        blockerKind: undefined,
        reason: "run 1 completed once before blocking again",
        supervisorCycles: 1,
        actionCount: 0
      },
      {
        recordedAt: "2026-05-16T12:00:00.000Z",
        state: "blocked",
        activeRunId: "run-1",
        activeTaskId: "rewrite",
        blockerKind: "missing_review_actor_bindings",
        reason: "supervisor is missing review actor bindings for: qa_engineer",
        supervisorCycles: 3,
        actionCount: 0
      }
    ]);
    assert.deepEqual(runScoped.result.latestStatus, {
      state: "blocked",
      blockerKind: "missing_review_actor_bindings",
      reason: "supervisor is missing review actor bindings for: qa_engineer",
      activeRunId: "run-1",
      activeTaskId: "rewrite",
      sessionId: "session-1",
      supervisorCycles: 3,
      updatedAt: "2026-05-16T12:30:00.000Z"
    });
    assert.equal(runScoped.result.scope, "run");
    assert.equal(runScoped.result.runId, "run-1");
    assert.equal(runScoped.result.retainedCount, 3);
    assert.equal(runScoped.result.filteredCount, 2);
    assert.equal(runScoped.result.returnedCount, 2);
    assert.equal(runScoped.result.truncated, false);

    const allRuns = await executeSupervisorHistoryCommandFromArgs(
      ["--format", "json", "--daemon-supervisor-history-scope", "all", "--daemon-supervisor-history-limit", "1"],
      { cwd: directory }
    );
    assert.equal(allRuns.result.scope, "all");
    assert.equal(allRuns.result.runId, undefined);
    assert.equal(allRuns.result.retainedCount, 3);
    assert.equal(allRuns.result.filteredCount, 3);
    assert.equal(allRuns.result.returnedCount, 1);
    assert.equal(allRuns.result.truncated, true);
    assert.deepEqual(allRuns.result.entries, [
      {
        recordedAt: "2026-05-16T12:00:00.000Z",
        state: "blocked",
        activeRunId: "run-1",
        activeTaskId: "rewrite",
        blockerKind: "missing_review_actor_bindings",
        reason: "supervisor is missing review actor bindings for: qa_engineer",
        supervisorCycles: 3,
        actionCount: 0
      }
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs consumes queued review actions and archives processed files", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: { provider: "test", subject: "reviewer-actor" },
            actors: [{ actor: "reviewer-actor", roles: ["reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "security-actor" },
            actors: [{ actor: "security-actor", roles: ["security_reviewer"] }]
          },
          {
            principal: { provider: "test", subject: "qa-actor" },
            actors: [{ actor: "qa-actor", roles: ["qa_engineer"] }]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "test",
          subject: input.actor,
          verified: true
        };
      }
    })
  });
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

  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext!.project.id,
    workspaceId: projectContext!.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: [
        {
          id: "plan",
          title: "plan",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-review-queue-"));
  const reviewQueueDir = path.join(daemonCwd, ".devgod", "review-actions");
  await mkdir(reviewQueueDir, { recursive: true });
  try {
    await writeFile(
      path.join(reviewQueueDir, "security.json"),
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
      path.join(reviewQueueDir, "qa.json"),
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
    const result = await executeDaemonCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-cycles",
        "2",
        "--format",
        "json",
        "--review-input-dir",
        reviewQueueDir
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
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
              assert.ok(command, "expected a matching queued review command");
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
        },
        getReviews(runId, taskId) {
          return store.getReviews(runId, taskId);
        },
        getApprovals(runId, taskId) {
          return store.getApprovals(runId, taskId);
        }
      }
    );

    assert.equal(result.result.status, "completed");
    assert.deepEqual([...executedRoles].sort(), ["qa_engineer", "security_reviewer"]);
    assert.equal(
      result.result.cycles.filter((cycle) => cycle.action === "record_review").length,
      2
    );
    const remainingQueueFiles = await readdir(reviewQueueDir);
    assert.deepEqual(remainingQueueFiles, []);
    const processedDir = path.join(daemonCwd, ".devgod", "work", "daemon", "processed-review-actions");
    const processedSecurity = await readFile(path.join(processedDir, "security.json"), "utf8");
    const processedQa = await readFile(path.join(processedDir, "qa.json"), "utf8");
    assert.match(processedSecurity, /security_reviewer/);
    assert.match(processedQa, /qa_engineer/);
    const runtimeState = await store.getProjectRuntimeState(projectContext!.project.id);
    assert.equal(runtimeState?.activeTaskId, undefined);
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs quarantines invalid queued review actions and writes failed queue status", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: {
              provider: "github",
              subject: "reviewer-actor"
            },
            actors: [
              {
                actor: "reviewer-actor",
                roles: ["reviewer"]
              }
            ]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "github",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Queued reviews pending",
    request: "Apply queued authenticated reviews."
  });
  await service.createTaskGraph(run.id, [
    taskPacket({
      taskId: "plan",
      ownerRole: "planner",
      qualityGates: ["release_readiness_required"]
    })
  ]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "Prepared plan task awaiting reviews.",
    changedFiles: ["src/admin.ts"],
    blockers: [],
    verificationNotes: ["runtime task prepared"],
    executionEvidence: ["task packet exists"],
    qualityGateEvidence: ["review queue required"],
    contextRefs: ["brief://plan"]
  });
  await service.recordReview(run.id, "plan", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const projectContext = await store.getProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: [
        {
          id: "plan",
          title: "plan",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-review-queue-invalid-"));
  const reviewQueueDir = path.join(daemonCwd, ".devgod", "review-actions");
  await mkdir(reviewQueueDir, { recursive: true });
  try {
    await writeFile(
      path.join(reviewQueueDir, "invalid.json"),
      `${JSON.stringify(
        {
          runId: run.id,
          taskId: "plan",
          actor: "security-actor",
          review: {
            reviewerRole: "not-a-gate-role",
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

    const result = await executeDaemonCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-cycles",
        "1",
        "--format",
        "json",
        "--review-input-dir",
        reviewQueueDir
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
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
        async executeDirectiveStep(runId, input) {
          return service.executeDirectiveStep(runId, {
            ...input,
            async executeReviewRecommendation() {
              assert.fail("invalid queued review actions should not reach live execution");
            }
          });
        },
        getReviews(runId, taskId) {
          return store.getReviews(runId, taskId);
        },
        getApprovals(runId, taskId) {
          return store.getApprovals(runId, taskId);
        }
      }
    );

    assert.equal(result.result.status, "blocked");
    const remainingQueueFiles = await readdir(reviewQueueDir);
    assert.deepEqual(remainingQueueFiles, []);

    const failedDir = path.join(daemonCwd, ".devgod", "work", "daemon", "failed-review-actions");
    const archivedReview = await readFile(path.join(failedDir, "invalid.json"), "utf8");
    const archivedError = JSON.parse(
      await readFile(path.join(failedDir, "invalid.json.error.json"), "utf8")
    ) as {
      file: string;
      error: string;
      archivedAt: string;
    };
    assert.match(archivedReview, /not-a-gate-role/);
    assert.equal(archivedError.file, "invalid.json");
    assert.match(archivedError.error, /review\.reviewerRole/);
    assert.match(archivedError.archivedAt, /^\d{4}-\d{2}-\d{2}T/);

    const queueStatus = JSON.parse(
      await readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "review-queue-status.json"), "utf8")
    ) as {
      state: string;
      reason: string;
      failedFiles: { file: string; error: string }[];
      expectedReviewTargets: string[];
    };
    assert.equal(queueStatus.state, "failed");
    assert.match(queueStatus.reason, /no usable review action files were found/);
    assert.deepEqual(queueStatus.expectedReviewTargets.sort(), ["plan:qa_engineer", "plan:security_reviewer"]);
    assert.deepEqual(queueStatus.failedFiles.map((entry) => entry.file), ["invalid.json"]);
    assert.match(queueStatus.failedFiles[0]?.error ?? "", /review\.reviewerRole/);
    const operatorHandoff = JSON.parse(
      await readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "operator-handoff.json"), "utf8")
    ) as {
      state: string;
      blockerKind: string;
      reason: string;
      directiveKind: string;
      nextActions: string[];
      detailFiles: {
        reviewQueueStatus?: string | undefined;
      };
    };
    assert.equal(operatorHandoff.state, "blocked");
    assert.equal(operatorHandoff.blockerKind, "review_queue");
    assert.equal(operatorHandoff.reason, "required authenticated reviews block the active run");
    assert.equal(operatorHandoff.directiveKind, "dispatch_reviews");
    assert.deepEqual(operatorHandoff.nextActions, []);
    assert.equal(operatorHandoff.detailFiles.reviewQueueStatus, ".devgod/work/daemon/review-queue-status.json");

    const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
    assert.equal(runtimeState?.activeTaskId, "plan");
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeDaemonCommandFromArgs archives stale queued review actions that no longer match runtime targets", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store, {
    resolveReviewActionContext: createReviewActionContextResolver({
      bindings: {
        bindings: [
          {
            principal: {
              provider: "github",
              subject: "reviewer-actor"
            },
            actors: [
              {
                actor: "reviewer-actor",
                roles: ["reviewer"]
              }
            ]
          }
        ]
      },
      async resolveAuthenticatedPrincipal(input) {
        return {
          provider: "github",
          subject: input.actor,
          verified: true
        };
      }
    })
  });

  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Queued reviews pending",
    request: "Apply queued authenticated reviews."
  });
  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan" })]);
  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "Prepared plan task awaiting reviews.",
    changedFiles: ["src/admin.ts"],
    blockers: [],
    verificationNotes: ["runtime task prepared"],
    executionEvidence: ["task packet exists"],
    qualityGateEvidence: ["review queue required"],
    contextRefs: ["brief://plan"]
  });
  await service.recordReview(run.id, "plan", "reviewer-actor", {
    reviewerRole: "reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });

  const projectContext = await store.getProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  assert.ok(projectContext);
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: run.id,
    activeTaskId: "plan",
    taskQueue: {
      project_status: "in_progress",
      current_task_id: "plan",
      tasks: [
        {
          id: "plan",
          title: "plan",
          status: "in_progress",
          class: "release_candidate",
          depends_on: [],
          acceptance_criteria: [],
          verification: [],
          evidence: [],
          blocker: null
        }
      ]
    },
    productState: { status: "in_progress", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const daemonCwd = await mkdtemp(path.join(tmpdir(), "devgod-daemon-review-queue-stale-"));
  const reviewQueueDir = path.join(daemonCwd, ".devgod", "review-actions");
  await mkdir(reviewQueueDir, { recursive: true });
  try {
    await writeFile(
      path.join(reviewQueueDir, "reviewer.json"),
      `${JSON.stringify(
        {
          runId: run.id,
          taskId: "plan",
          actor: "reviewer-actor",
          review: {
            reviewerRole: "reviewer",
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

    const result = await executeDaemonCommandFromArgs(
      [
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--max-cycles",
        "1",
        "--format",
        "json",
        "--review-input-dir",
        reviewQueueDir
      ],
      {
        cwd: daemonCwd,
        env: process.env,
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
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
              if (!command) {
                return {
                  executed: false,
                  evidence: ["no matching trusted review input was supplied for the remaining review directives"]
                };
              }
              assert.fail("stale queued review action should not reach live execution");
            }
          });
        },
        getReviews(runId, taskId) {
          return store.getReviews(runId, taskId);
        },
        getApprovals(runId, taskId) {
          return store.getApprovals(runId, taskId);
        }
      }
    );

    assert.equal(result.result.status, "blocked");
    const remainingQueueFiles = await readdir(reviewQueueDir);
    assert.deepEqual(remainingQueueFiles, []);

    const staleDir = path.join(daemonCwd, ".devgod", "work", "daemon", "stale-review-actions");
    const archivedReview = await readFile(path.join(staleDir, "reviewer.json"), "utf8");
    const archivedReason = JSON.parse(
      await readFile(path.join(staleDir, "reviewer.json.reason.json"), "utf8")
    ) as {
      file: string;
      reason: string;
      expectedReviewTargets: string[];
      archivedAt: string;
    };
    assert.match(archivedReview, /"reviewerRole": "reviewer"/);
    assert.equal(archivedReason.file, "reviewer.json");
    assert.match(archivedReason.reason, /no longer matched the active runtime review directives/);
    assert.deepEqual(archivedReason.expectedReviewTargets.sort(), ["plan:qa_engineer", "plan:security_reviewer"]);
    assert.match(archivedReason.archivedAt, /^\d{4}-\d{2}-\d{2}T/);

    const queueStatus = JSON.parse(
      await readFile(path.join(daemonCwd, ".devgod", "work", "daemon", "review-queue-status.json"), "utf8")
    ) as {
      state: string;
      reason: string;
      staleFiles: { file: string; reason: string }[];
      expectedReviewTargets: string[];
    };
    assert.equal(queueStatus.state, "blocked");
    assert.match(queueStatus.reason, /queued review actions did not match the pending runtime review directives/);
    assert.deepEqual(queueStatus.expectedReviewTargets.sort(), ["plan:qa_engineer", "plan:security_reviewer"]);
    assert.deepEqual(queueStatus.staleFiles.map((entry) => entry.file), ["reviewer.json"]);
    assert.match(queueStatus.staleFiles[0]?.reason ?? "", /no longer matched the active runtime review directives/);

    const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
    assert.equal(runtimeState?.activeTaskId, "plan");
  } finally {
    await rm(daemonCwd, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs loads --input relative to cwd and resolves a live binding file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-args-"));
  const bindingsPath = path.join(directory, ".devgod/review-identity-bindings.json");
  const inputPath = path.join(directory, ".devgod/review-action.json");

  try {
    await mkdir(path.dirname(bindingsPath), { recursive: true });
    await writeFile(
      bindingsPath,
      `${JSON.stringify(
        {
          bindings: [
            {
              principal: {
                provider: "github",
                subject: "alice"
              },
              actors: [
                {
                  actor: "alice-reviewer",
                  roles: ["reviewer"]
                }
              ]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      inputPath,
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "alice-reviewer",
          review: {
            reviewerRole: "reviewer",
            state: "passed",
            severity: "low",
            findings: []
          },
          authContext: {
            provider: "github",
            subject: "alice",
            verified: true
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      async createLiveAdapter() {
        return {
          modulePath: path.join(directory, "devgod/review-identity-adapter.ts"),
          adapter: async () => ({
            provider: "github",
            subject: "alice",
            verified: true
          })
        };
      },
      async recordReview({ command, resolver }) {
        const context = await resolver({
          runId: command.runId,
          taskId: command.taskId,
          actor: command.actor,
          reviewerRole: command.review.reviewerRole,
          reviewState: command.review.state
        });

        return {
          review: {
            id: "rev-args",
            runId: command.runId,
            taskId: command.taskId,
            reviewerRole: command.review.reviewerRole,
            actor: context.actor,
            actorRole: context.actorRole,
            identityAssurance: "authenticated",
            state: command.review.state,
            severity: command.review.severity,
            findings: [...command.review.findings],
            waiverAuthority: context.waiverAuthority ?? "none",
            createdAt: "2026-05-06T00:00:00.000Z"
          },
          blockers: [],
          task: {
            status: "approved"
          }
        };
      }
    });

    assert.equal(result.review.id, "rev-args");
    assert.equal(result.bindingsPath, bindingsPath);
    assert.equal(result.taskStatus, "approved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs rejects placeholder bindings copied into a live repo", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-placeholders-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod/review-identity-bindings.json"),
      await readFile(path.join(sourceRoot, ".devgod/templates/review-identity-bindings.json"), "utf8"),
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod/review-action.json"),
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "replace-with-review-actor",
          review: {
            reviewerRole: "reviewer",
            state: "passed",
            severity: "low",
            findings: []
          },
          authContext: {
            provider: "github",
            subject: "replace-with-authenticated-user-id",
            verified: true
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await assert.rejects(
      executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
        cwd: directory,
        env: {
          ...process.env,
          DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
        },
        async createLiveAdapter() {
          return {
            modulePath: path.join(directory, "devgod/review-identity-adapter.ts"),
            adapter: async () => ({
              provider: "github",
              subject: "replace-with-authenticated-user-id",
              verified: true
            })
          };
        },
        async recordReview() {
          assert.fail("recordReview should not run when placeholder bindings are rejected");
        }
      }),
      /without shipped placeholder values/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs rejects missing input and invalid review payload shapes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-invalid-"));

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });

    await assert.rejects(
      executeRecordReviewCommandFromArgs([], {
        cwd: directory,
        env: process.env,
        async recordReview() {
          assert.fail("recordReview should not run without --input");
        }
      }),
      /record-review requires --input/
    );

    await writeFile(
      path.join(directory, ".devgod/review-action.json"),
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "alice-reviewer",
          review: {
            reviewerRole: "not-a-role",
            state: "not-a-state",
            severity: "not-a-severity",
            findings: "not-an-array"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await assert.rejects(
      executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
        cwd: directory,
        env: process.env,
        async recordReview() {
          assert.fail("recordReview should not run for invalid review payloads");
        }
      }),
      /review\.reviewerRole to be a required gate role/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRecordReviewCommandFromArgs rejects missing live bindings before attempting review recording", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-record-review-missing-bindings-"));

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(
      path.join(directory, ".devgod/review-action.json"),
      `${JSON.stringify(
        {
          runId: "run-123",
          taskId: "task-123",
          actor: "alice-reviewer",
          review: {
            reviewerRole: "reviewer",
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

    await assert.rejects(
      executeRecordReviewCommandFromArgs(["--input", ".devgod/review-action.json"], {
        cwd: directory,
        env: process.env,
        async recordReview() {
          assert.fail("recordReview should not run when live bindings are missing");
        }
      }),
      /DEVGOD_REVIEW_IDENTITY_BINDINGS or \.devgod\/review-identity-bindings\.json is required/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeIndexRepoMarkdownCommand wires the runtime store into markdown indexing", async () => {
  const createdClients: unknown[] = [];
  const createdStores: object[] = [];

  const result = await executeIndexRepoMarkdownCommand({
    argv: ["node", "src/admin.ts", "index-repo-markdown", "docs"],
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_WORKSPACE_NAME: "Team Workspace",
      DEVGOD_PROJECT_SLUG: "devgod",
      DEVGOD_PROJECT_NAME: "Devgod",
      DEVGOD_EMBEDDING_MODEL: "devgod-local-hash-1536",
      DEVGOD_REPO_MARKDOWN_INCLUDE: "README.md,.agents/skills"
    },
    async withClient(callback) {
      const client = { kind: "client" };
      createdClients.push(client);
      return callback(client as never);
    },
    createStore(client) {
      const store = {
        kind: "store",
        client
      };
      createdStores.push(store);
      return store as never;
    },
    async indexRepoMarkdown(input) {
      assert.equal(input.repoRoot, path.resolve(process.cwd(), "docs"));
      assert.equal(input.workspaceSlug, "team");
      assert.equal(input.workspaceName, "Team Workspace");
      assert.equal(input.projectSlug, "devgod");
      assert.equal(input.projectName, "Devgod");
      assert.equal(input.embeddingModel, "devgod-local-hash-1536");
      assert.deepEqual(input.include, ["README.md", ".agents/skills"]);
      assert.equal(input.store, createdStores[0]);
      return {
        runId: "run-markdown",
        filesIndexed: 2,
        chunksStored: 4,
        jobsQueued: 4
      };
    }
  });

  assert.equal(createdClients.length, 1);
  assert.equal(createdStores.length, 1);
  assert.deepEqual(result, {
    runId: "run-markdown",
    filesIndexed: 2,
    chunksStored: 4,
    jobsQueued: 4
  });
});

test("executeIndexRepoMarkdownCommand accepts flags before the positional repo root", async () => {
  const result = await executeIndexRepoMarkdownCommand({
    argv: [
      "node",
      "src/admin.ts",
      "index-repo-markdown",
      "--workspace-slug",
      "team",
      "--workspace-name",
      "Team Workspace",
      "--project-slug",
      "devgod",
      "--project-name",
      "Devgod",
      "--embedding-model",
      "devgod-local-hash-1536",
      "docs"
    ],
    env: {},
    async withClient(callback) {
      return callback({ kind: "client" } as never);
    },
    createStore() {
      return { kind: "store" } as never;
    },
    async indexRepoMarkdown(input) {
      assert.equal(input.repoRoot, path.resolve(process.cwd(), "docs"));
      assert.equal(input.workspaceSlug, "team");
      assert.equal(input.workspaceName, "Team Workspace");
      assert.equal(input.projectSlug, "devgod");
      assert.equal(input.projectName, "Devgod");
      assert.equal(input.embeddingModel, "devgod-local-hash-1536");
      return {
        runId: "run-markdown",
        filesIndexed: 1,
        chunksStored: 2,
        jobsQueued: 2
      };
    }
  });

  assert.deepEqual(result, {
    runId: "run-markdown",
    filesIndexed: 1,
    chunksStored: 2,
    jobsQueued: 2
  });
});
