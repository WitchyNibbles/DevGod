import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOperatorStatusReport } from "../src/admin/status.ts";
import { executeDoctorCommandFromArgs, executeStatusCommandFromArgs } from "../src/admin.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { RuntimeProjectRegistrationRecord, TaskPacketInput } from "../src/domain/types.ts";
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
        label: "status report fixture reasoning",
        hypothesis: "the status fixture should remain runnable under strict defaults",
        alternatives: ["downgrade explicitly for compatibility-only cases"],
        evidenceRefs: ["tests/status-report.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://status-task-packet",
        outcome: "supported",
        summary: "default status fixture includes strict reasoning evidence"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://status-task-packet",
        status: "passed",
        summary: "default status fixture includes critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "default status fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? {
      claim: "the status fixture has sufficient evidence",
      facts: ["status report is under test"],
      assumptions: ["task scope remains bounded"],
      hypotheses: ["strict-ready task packets should keep status reporting green"],
      evidenceRefs: ["tests/status-report.test.ts"],
      counterEvidence: [],
      openQuestions: [],
      verificationPlan: ["npm test"],
      fallbacks: ["narrow the status fixture if a weaker mode is required"],
      budgets: { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
      confidence: "medium",
      decision: "supported"
    }
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

function runtimeRegistration(overrides: Partial<RuntimeProjectRegistrationRecord> = {}): RuntimeProjectRegistrationRecord {
  return {
    projectId: overrides.projectId ?? "project:team:devgod",
    workspaceId: overrides.workspaceId ?? "workspace:team",
    repoPath: overrides.repoPath ?? "/repo/devgod",
    runtimeProfile: overrides.runtimeProfile ?? "local-docker",
    dataRoot: overrides.dataRoot ?? "/home/eimi/.local/share/devgod/devgod",
    qdrantUrl: overrides.qdrantUrl ?? "http://127.0.0.1:6333",
    qdrantCollection: overrides.qdrantCollection ?? "devgod-memory",
    installManifestPath: overrides.installManifestPath ?? ".devgod/install-manifest.json",
    manifest: overrides.manifest ?? { version: 1 },
    provenance: overrides.provenance ?? { authority: "runtime_authoritative" },
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z"
  };
}

test("buildOperatorStatusReport labels authoritative and derived sections clearly", async () => {
  const service = new DevgodCoreService(new MemoryStore());
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

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: false,
      adapterExists: false,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: false,
      notes: ["adapter module not configured"]
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 0,
    now: "2100-01-01T00:00:00.000Z"
  });

  assert.equal(report.run.authorityLabel, "runtime_authoritative");
  assert.equal(report.tasks.authorityLabel, "runtime_authoritative");
  assert.equal(report.orchestration.authorityLabel, "derived_only");
  assert.equal(report.reviewIdentity.authorityLabel, "derived_only");
  assert.equal(report.run.taskCounts.in_progress, 1);
  assert.deepEqual(report.tasks.byStatus.in_progress, ["plan"]);
  assert.deepEqual(report.tasks.byStatus.ready, ["build"]);
  assert.deepEqual(report.tasks.activeLocks, [
    {
      taskId: "plan",
      scopePaths: ["src/core"]
    }
  ]);
  assert.equal(report.orchestration.freshness.status, "stale");
  assert.deepEqual(report.orchestration.nextTaskIds, []);
  assert.equal(report.autonomous.configured, false);
  assert.equal(report.autonomous.resume.status, "not_configured");
  assert.equal(report.reviewIdentity.liveTrustReady, false);
  assert.equal(report.gitNexus.state, "unconfigured");
  assert.deepEqual(report.reviewIdentity.notes, ["adapter module not configured"]);
});

test("buildOperatorStatusReport exposes autonomous coverage and resume guidance from runtime state", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Deep rewrite",
    request: "Show what coverage is complete and where resume starts."
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
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-15T10:00:00.000Z"
    }
  ]);
  await service.upsertCoverageGaps(run.id, [
    {
      id: "gap:resume-proof",
      targetId: "task:runtime-proof",
      kind: "missing_validation",
      severity: "high",
      description: "Authenticated runtime review proof is still pending.",
      blocking: true,
      evidenceRefs: ["src/admin.ts:1"],
      createdBy: "qa_engineer",
      suggestedNextActions: ["resolve the blocking runtime proof gap"],
      status: "open"
    }
  ]);
  await service.recordProgressProof(run.id, {
    cycle: 2,
    proofId: "proof-2",
    phaseBefore: "validation",
    phaseAfter: "final_verification",
    evidenceRefs: ["src/admin.ts:1"],
    coverageDelta: { validated: 1 },
    blockingGapDelta: { closed: 0, opened: 1 },
    nextTarget: "review:authenticated",
    whyNext: "Authenticated review proof is the remaining continuation target.",
    createdAt: "2026-05-15T10:05:00.000Z"
  });
  await service.checkpointRun(run.id, {
    checkpointId: "cp-2",
    phase: "final_verification",
    activeTargets: ["review:authenticated"],
    recentEvidenceRefs: ["src/admin.ts:1"],
    openGaps: ["gap:resume-proof"],
    nextActions: ["stale checkpoint action"],
    compressedContextRef: "memory://cp-2",
    createdAt: "2026-05-15T10:06:00.000Z"
  });

  const snapshot = await service.getStatus(run.id);
  const report = buildOperatorStatusReport({
    snapshot,
    reviewIdentity: {
      authorityLabel: "derived_only",
      adapterConfigured: true,
      adapterExists: true,
      availableBackends: [],
      bindingsPresent: true,
      bindingsPath: "/repo/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: true,
      notes: []
    },
    gitNexus: gitNexusObservation(),
    staleAfterDays: 1,
    now: "2026-05-15T10:07:00.000Z"
  });

  assert.equal(report.autonomous.configured, true);
  assert.equal(report.autonomous.profile, "legacy_rewrite");
  assert.equal(report.autonomous.coverageSummary?.criticalItemCoverage, 1);
  assert.equal(report.autonomous.blockers[0], "blocking gaps remain open: 1");
  assert.equal(report.autonomous.latestProgressProof?.proofId, "proof-2");
  assert.equal(report.autonomous.latestCheckpoint?.checkpointId, "cp-2");
  assert.equal(report.autonomous.resume.status, "blocked");
  assert.equal(report.autonomous.resume.source, "blocking_gap");
  assert.equal(report.autonomous.resume.nextTarget, "task:runtime-proof");
  assert.deepEqual(report.autonomous.resume.nextActions, ["resolve the blocking runtime proof gap"]);
});

test("executeStatusCommandFromArgs parses flags and reports env-derived review identity posture", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-command-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(path.join(directory, "review-identity-adapter.ts"), "export default async () => ({ verified: true });\n");
    await writeFile(
      path.join(directory, ".devgod/review-identity-bindings.json"),
      JSON.stringify(
        {
          bindings: [
            {
              principal: {
                provider: "github",
                subject: "replace-with-authenticated-user-id"
              },
              actors: [
                {
                  actor: "replace-with-review-actor",
                  roles: ["reviewer"]
                }
              ]
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id, "--stale-after-days", "0"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () =>
        gitNexusObservation({
          state: "missing_index",
          configured: true,
          configuredScopes: ["project"],
          configPaths: [path.join(directory, ".codex/config.toml")],
          notes: ["gitnexus MCP is configured but this repo has not been indexed yet"]
        })
    });

    assert.equal(report.run.id, run.id);
    assert.equal(report.run.authorityLabel, "runtime_authoritative");
    assert.equal(report.reviewIdentity.authorityLabel, "derived_only");
    assert.equal(report.reviewIdentity.adapterConfigured, true);
    assert.deepEqual(report.reviewIdentity.availableBackends, []);
    assert.equal(report.reviewIdentity.bindingsPresent, true);
    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.equal(report.gitNexus.state, "missing_index");
    assert.match(
      report.reviewIdentity.notes.join(" "),
      /still contains shipped placeholder values/
    );
    assert.equal(report.orchestration.freshness.status, "fresh");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs degrades malformed bindings into a derived warning", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-command-invalid-bindings-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(path.join(directory, "review-identity-adapter.ts"), "export default async () => ({ verified: true });\n");
    await writeFile(path.join(directory, ".devgod/review-identity-bindings.json"), "{ invalid json\n", "utf8");

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.equal(report.gitNexus.state, "unconfigured");
    assert.match(report.reviewIdentity.notes.join(" "), /bindings file is invalid and cannot be trusted/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs marks advisory continuation as operator-required when an execution plan is available", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Advisory continuation",
    request: "Show when status should stop at operator-required continuation."
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
      evidenceRefs: ["src/core/service.ts:1"],
      verificationRefs: ["tests/status-report.test.ts"],
      lastUpdatedAt: "2026-05-15T10:00:00.000Z"
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
    createdAt: "2026-05-15T10:05:00.000Z"
  });

  const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
    env: process.env,
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
    inspectGitNexus: async () => gitNexusObservation()
  });

  assert.equal(report.autonomous.resume.executionMode, "operator_required");
  assert.match(
    report.autonomous.resume.executionSummary,
    /operator input is required for advisory continuation target artifact:resume/
  );
});

test("executeStatusCommandFromArgs exposes daemon continuation status when local daemon state is blocked", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-daemon-continuation-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon continuation visibility",
    request: "Surface the daemon continuation blocker through status."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  const otherRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor visibility other run",
    request: "Keep a second run around to verify filtered history views."
  });
  await service.createTaskGraph(otherRun.id, [taskPacket({ taskId: "stabilize" })]);

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

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.daemon.continuation?.state, "blocked");
    assert.equal(report.daemon.continuation?.executionMode, "operator_required");
    assert.equal(report.daemon.continuation?.targetId, "artifact:resume");
    assert.equal(report.daemon.continuation?.source, "progress_proof");
    assert.equal(report.daemon.continuation?.sourceId, "proof-1");
    assert.equal(report.daemon.continuation?.actionKind, "resume_target");
    assert.deepEqual(report.daemon.continuation?.nextActions, [
      "consult operator evidence before resuming the artifact target"
    ]);
    assert.deepEqual(report.daemon.continuation?.blockers, ["blocking gaps remain open"]);
    assert.equal(report.daemon.handoff?.state, "blocked");
    assert.equal(report.daemon.handoff?.blockerKind, "operator_required_continuation");
    assert.equal(
      report.daemon.handoff?.reason,
      "operator input is required for advisory continuation target artifact:resume from progress_proof (proof-1)"
    );
    assert.equal(report.daemon.handoff?.activeRunId, run.id);
    assert.equal(report.daemon.handoff?.activeTaskId, "rewrite");
    assert.equal(report.daemon.handoff?.directiveKind, "continue_analysis");
    assert.deepEqual(report.daemon.handoff?.nextActions, [
      "consult operator evidence before resuming the artifact target"
    ]);
    assert.equal(
      report.daemon.handoff?.detailFiles.continuationStatus,
      ".devgod/work/daemon/continuation-status.json"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs exposes daemon supervisor state with action history and missing review actors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-daemon-supervisor-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor visibility",
    request: "Surface the supervisor blocker through status."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "rewrite" })]);
  const otherRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Daemon supervisor visibility other run",
    request: "Keep a second run around to verify filtered history views."
  });
  await service.createTaskGraph(otherRun.id, [taskPacket({ taskId: "stabilize" })]);

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
              action: "enqueue_operator_continuation",
              targetId: "artifact:resume",
              filePath: ".devgod/operator-actions/action-1.json",
              summary: "queued trusted continuation follow-up"
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
          recordedAt: "2026-05-16T11:45:00.000Z",
          state: "completed",
          reason: "other run completed after a clean supervisor pass",
          workspaceSlug: "team",
          projectSlug: "devgod",
          activeRunId: otherRun.id,
          activeTaskId: "stabilize",
          sessionId: "session-supervisor-other",
          supervisorCycles: 1,
          nextActions: [],
          missingReviewRoles: [],
          actions: []
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
              action: "enqueue_operator_continuation",
              targetId: "artifact:resume",
              filePath: ".devgod/operator-actions/action-1.json",
              summary: "queued trusted continuation follow-up"
            }
          ]
        }
      )}\n`,
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () => gitNexusObservation()
    });

    assert.equal(report.daemon.supervisor?.state, "blocked");
    assert.equal(report.daemon.supervisor?.blockerKind, "missing_review_actor_bindings");
    assert.equal(
      report.daemon.supervisor?.reason,
      "supervisor is missing review actor bindings for: security_reviewer, qa_engineer"
    );
    assert.equal(report.daemon.supervisor?.activeRunId, run.id);
    assert.equal(report.daemon.supervisor?.activeTaskId, "rewrite");
    assert.equal(report.daemon.supervisor?.sessionId, "session-supervisor");
    assert.equal(report.daemon.supervisor?.supervisorCycles, 1);
    assert.deepEqual(report.daemon.supervisor?.missingReviewRoles, ["security_reviewer", "qa_engineer"]);
    assert.deepEqual(report.daemon.supervisor?.nextActions, [
      "provide --review-actor security_reviewer=<actor>",
      "provide --review-actor qa_engineer=<actor>"
    ]);
    assert.deepEqual(report.daemon.supervisor?.actions, [
      {
        cycle: 1,
        action: "enqueue_operator_continuation",
        targetId: "artifact:resume",
        taskId: undefined,
        reviewRole: undefined,
        filePath: ".devgod/operator-actions/action-1.json",
        summary: "queued trusted continuation follow-up"
      }
    ]);
    assert.deepEqual(report.daemon.supervisor?.history, [
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
    assert.deepEqual(report.daemon.supervisor?.historyView, {
      scope: "run",
      runId: run.id,
      limit: 5,
      retainedCount: 3,
      filteredCount: 2,
      returnedCount: 2,
      truncated: false
    });

    const allRunsReport = await executeStatusCommandFromArgs(
      [
        "--run-id",
        run.id,
        "--daemon-supervisor-history-scope",
        "all",
        "--daemon-supervisor-history-limit",
        "1"
      ],
      {
        cwd: directory,
        env: process.env,
        getStatusSnapshot(runId) {
          return service.getStatus(runId);
        },
        inspectGitNexus: async () => gitNexusObservation()
      }
    );
    assert.deepEqual(allRunsReport.daemon.supervisor?.history, [
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
    assert.deepEqual(allRunsReport.daemon.supervisor?.historyView, {
      scope: "all",
      runId: undefined,
      limit: 1,
      retainedCount: 3,
      filteredCount: 3,
      returnedCount: 1,
      truncated: true
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs reports multi-backend review adapters and requires selection", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-status-command-multi-backend-"));
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, ".devgod"), { recursive: true });
    await writeFile(
      path.join(directory, "review-identity-adapter.ts"),
      `export const reviewIdentityAdapters = {
  one: async () => ({ provider: "test", subject: "one", verified: true }),
  two: async () => ({ provider: "test", subject: "two", verified: true })
};
`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod/review-identity-bindings.json"),
      JSON.stringify(
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
      ),
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE: "./review-identity-adapter.ts",
        DEVGOD_REVIEW_IDENTITY_BINDINGS: ".devgod/review-identity-bindings.json"
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      inspectGitNexus: async () =>
        gitNexusObservation({
          state: "ready",
          configured: true,
          configuredScopes: ["user"],
          configPaths: [path.join(directory, ".codex/config.toml")],
          repoIndexed: true,
          indexedAt: "2026-05-06T00:00:00.000Z",
          indexedCommit: "abc123",
          headCommit: "abc123",
          notes: ["gitnexus advisory context is ready"]
        })
    });

    assert.deepEqual(report.reviewIdentity.availableBackends, ["one", "two"]);
    assert.equal(report.reviewIdentity.selectedBackend, undefined);
    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.match(report.reviewIdentity.notes.join(" "), /multiple review backends are available but none is selected/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeStatusCommandFromArgs rejects missing run ids and invalid stale-after-days flags", async () => {
  await assert.rejects(
    executeStatusCommandFromArgs([], {
      env: process.env,
      async getStatusSnapshot() {
        assert.fail("status should not resolve a snapshot without --run-id");
      }
    }),
    /status-like commands require --run-id/
  );

  await assert.rejects(
    executeStatusCommandFromArgs(["--run-id", "run-123", "--stale-after-days", "nope"], {
      env: process.env,
      async getStatusSnapshot() {
        assert.fail("status should not resolve a snapshot for invalid stale-after-days");
      }
    }),
    /Invalid --stale-after-days value: nope/
  );
});

test("executeDoctorCommandFromArgs fails when a bootstrapped project has no runtime registration", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  const report = await executeDoctorCommandFromArgs(["--run-id", run.id], {
    cwd: "/repo/devgod",
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getProjectRuntimeRegistration(projectId) {
      return store.getProjectRuntimeRegistration(projectId);
    },
    inspectGitNexus: async () => gitNexusObservation(),
    inspectReviewIdentity: async () => ({
      authorityLabel: "derived_only",
      adapterConfigured: false,
      adapterExists: false,
      availableBackends: [],
      bindingsPresent: false,
      bindingsPath: "/repo/devgod/.devgod/review-identity-bindings.json",
      bindingsUseShippedTemplate: false,
      liveTrustReady: false,
      notes: ["review identity bindings file missing"]
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.registration.ok, false);
  assert.equal(report.checks.repoPath.ok, false);
  assert.equal(report.checks.reviewIdentity.ok, false);
  assert.deepEqual(report.advisories, ["review identity bindings file missing"]);
  assert.match(report.checks.registration.summary, /not runtime-registered/);
});

test("executeDoctorCommandFromArgs works without a run id when a project is bootstrapped", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-zero-run-"));
  const store = new MemoryStore();

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const report = await executeDoctorCommandFromArgs([], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("doctor should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: false,
        adapterExists: false,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    assert.equal(report.ok, true);
    assert.equal(report.run, undefined);
    assert.equal(report.project.workspaceSlug, "team");
    assert.equal(report.project.projectSlug, "devgod");
    assert.equal(report.checks.reviewIdentity.ok, false);
    assert.deepEqual(report.blockers, []);
    assert.deepEqual(report.advisories, ["review identity bindings file missing"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorCommandFromArgs reports runtime mode derived from registration profile", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-runtime-mode-"));
  const store = new MemoryStore();

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root"),
        runtimeProfile: "local-native"
      })
    );

    const report = await executeDoctorCommandFromArgs([], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      async getStatusSnapshot() {
        assert.fail("doctor should not require a run snapshot for bootstrapped projects");
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: false,
        adapterExists: false,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    assert.equal(report.runtime.runtimeProfile, "local-native");
    assert.equal(report.runtime.runtimeMode, "native");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeDoctorCommandFromArgs reports repo-path mismatch and missing review bindings as separate findings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-doctor-command-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket({ taskId: "plan", allowedWriteScope: ["src/core"] })]);

  try {
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: run.projectId,
        workspaceId: run.workspaceId,
        repoPath: "/other/repo",
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const report = await executeDoctorCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectGitNexus: async () => gitNexusObservation(),
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only",
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: false,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: false,
        notes: ["review identity bindings file missing"]
      }),
      inspectQdrant: async () => ({
        ok: true,
        summary: "qdrant reachable"
      })
    });

    assert.equal(report.ok, false);
    assert.equal(report.checks.registration.ok, true);
    assert.equal(report.checks.dataRoot.ok, true);
    assert.equal(report.checks.qdrant.ok, true);
    assert.equal(report.checks.repoPath.ok, false);
    assert.equal(report.checks.reviewIdentity.ok, false);
    assert.deepEqual(report.advisories, ["review identity bindings file missing"]);
    assert.match(report.checks.repoPath.summary, /repo path mismatch/);
    assert.match(report.checks.reviewIdentity.summary, /bindings file missing/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
