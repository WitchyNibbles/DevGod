import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  executeDoctorRepairCommandFromArgs,
  executeSeedModernizationProofCommandFromArgs,
  executeSeedWorkflowProofCommandFromArgs,
  executeStatusCommandFromArgs
} from "../src/admin.ts";
import { createReviewActionContextResolver } from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { RuntimeProjectRegistrationRecord, TaskPacketInput } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

function taskPacket(overrides: Partial<TaskPacketInput> = {}): TaskPacketInput {
  const completionStandard = overrides.completionStandard ?? "specialist_verified";
  const qualityGates: TaskPacketInput["qualityGates"] = overrides.qualityGates ?? ["product_acceptance"];
  const normalizedQualityGates: TaskPacketInput["qualityGates"] =
    completionStandard === "specialist_verified" && !qualityGates.includes("completion_audit_required")
      ? [...qualityGates, "completion_audit_required"]
      : qualityGates;

  return {
    taskId: overrides.taskId ?? "task-1",
    title: overrides.title ?? "Workflow integrity task",
    ownerRole: overrides.ownerRole ?? "planner",
    completionStandard,
    requiredSpecialistRoles:
      overrides.requiredSpecialistRoles ??
      [((overrides.ownerRole ?? "planner") as TaskPacketInput["requiredSpecialistRoles"][number])],
    qualityGates: normalizedQualityGates,
    goal: overrides.goal ?? "Keep workflow state authoritative",
    inputs: overrides.inputs ?? ["intake brief"],
    outputs: overrides.outputs ?? ["task packet"],
    dependencies: overrides.dependencies ?? [],
    allowedWriteScope: overrides.allowedWriteScope ?? [".devgod/work/tasks"],
    outOfScope: overrides.outOfScope ?? ["production deploys"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["workflow state remains trustworthy"],
    verificationSteps: overrides.verificationSteps ?? ["run integrity regression tests"],
    uiSurface: overrides.uiSurface,
    playwrightRequired: overrides.playwrightRequired,
    requiredReviews: overrides.requiredReviews ?? ["reviewer", "security_reviewer", "qa_engineer"],
    securityChecks: overrides.securityChecks ?? ["ensure write scope is narrow"],
    antiPatterns: overrides.antiPatterns ?? ["manual runtime mutation without proof"],
    rollbackNotes: overrides.rollbackNotes ?? "remove the test fixture",
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
        label: "integrity regression reasoning",
        hypothesis: "the workflow must fail closed under interruption and contradiction",
        alternatives: ["allow drift and rely on operators to notice later"],
        evidenceRefs: ["tests/workflow-integrity.test.ts"],
        verificationRefs: ["verification-1"],
        traceRef: "test://workflow-integrity-task",
        outcome: "supported",
        summary: "the fixture encodes fail-closed workflow expectations"
      }
    ],
    reasoningVerifications: overrides.reasoningVerifications ?? [
      {
        id: "verification-1",
        kind: "critic_review",
        ref: "test://workflow-integrity-task",
        status: "passed",
        summary: "the fixture includes explicit critic verification"
      }
    ],
    reasoningVerdict: overrides.reasoningVerdict ?? {
      status: "supported",
      summary: "the integrity fixture is strict-complete",
      supportingAttemptIds: ["attempt-1"],
      blockingIssues: []
    },
    reasoningQuality: overrides.reasoningQuality ?? {
      claim: "the integrity fixture captures adversarial workflow scenarios",
      facts: ["runtime authority and local exports can drift"],
      assumptions: ["operators need deterministic repair behavior"],
      hypotheses: ["the runtime should fail safe and surface contradictions"],
      evidenceRefs: ["tests/workflow-integrity.test.ts"],
      counterEvidence: [],
      openQuestions: [],
      verificationPlan: ["node --experimental-strip-types --test tests/workflow-integrity.test.ts"],
      fallbacks: ["expand the suite with more interruption points"],
      budgets: { researchSteps: 1, debugSteps: 1, reviewPasses: 1, toolRetries: 1 },
      confidence: "medium",
      decision: "supported"
    }
  };
}

test("workflow integrity taskPacket auto-adds completion audit only for specialist_verified defaults", () => {
  const defaultPacket = taskPacket();
  const explicitGatePacket = taskPacket({
    qualityGates: ["product_acceptance", "completion_audit_required"]
  });
  const artifactCompletePacket = taskPacket({
    completionStandard: "artifact_complete",
    qualityGates: ["product_acceptance"]
  });

  assert.deepEqual(defaultPacket.qualityGates, ["product_acceptance", "completion_audit_required"]);
  assert.deepEqual(explicitGatePacket.qualityGates, ["product_acceptance", "completion_audit_required"]);
  assert.deepEqual(artifactCompletePacket.qualityGates, ["product_acceptance"]);
});

function runtimeRegistration(overrides: Partial<RuntimeProjectRegistrationRecord> = {}): RuntimeProjectRegistrationRecord {
  return {
    projectId: overrides.projectId ?? "project:team:devgod",
    workspaceId: overrides.workspaceId ?? "workspace:team",
    repoPath: overrides.repoPath ?? "/repo/devgod",
    runtimeProfile: overrides.runtimeProfile ?? "local-docker",
    dataRoot: overrides.dataRoot ?? "/tmp/devgod-runtime",
    installManifestPath: overrides.installManifestPath ?? ".devgod/install-manifest.json",
    manifest: overrides.manifest ?? { version: 1 },
    provenance: overrides.provenance ?? { authority: "runtime_authoritative" },
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z"
  };
}

function createSeedReviewService(store: MemoryStore): DevgodCoreService {
  return new DevgodCoreService(store, {
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
}

test("workflow integrity: proof seeding failure cleans up lock-bearing partial state", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const reviewFailure = new Error("review persistence exploded");
  await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });

  await assert.rejects(
    () =>
      executeSeedWorkflowProofCommandFromArgs(["--workspace-slug", "team", "--project-slug", "devgod", "--task-id", "task-proof"], {
        env: process.env,
        intakeRequest(input) {
          return service.intakeRequest(input);
        },
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        createTaskGraph(runId, tasks) {
          return service.createTaskGraph(runId, tasks);
        },
        claimTask(runId, taskId, actor) {
          return service.claimTask(runId, taskId, actor);
        },
        submitHandoff(runId, taskId, handoff) {
          return service.submitHandoff(runId, taskId, handoff);
        },
        async recordReview() {
          throw reviewFailure;
        },
        failTask(runId, taskId, reason) {
          return service.failTask(runId, taskId, reason);
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
    reviewFailure
  );

  const latestRun = await store.findLatestRun({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(latestRun);
  const snapshot = await service.getStatus(latestRun.id);
  const seededTask = snapshot.tasks.find((task) => task.packet.taskId === "task-proof");
  assert.ok(seededTask);
  assert.notEqual(seededTask.status, "review_blocked");
  assert.deepEqual(snapshot.activeLocks, []);
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
  assert.equal(runtimeState?.activeTaskId, undefined);
  assert.equal(runtimeState?.metadata?.seedFailure?.taskId, "task-proof");
  assert.match(String(runtimeState?.metadata?.seedFailure?.reason ?? ""), /review persistence exploded/i);

  const report = await executeStatusCommandFromArgs(["--run-id", latestRun.id], {
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getProjectRuntimeState(projectId) {
      return store.getProjectRuntimeState(projectId);
    }
  });
  assert.equal(report.integrity.runtimeState?.seedFailure?.taskId, "task-proof");
  assert.match(String(report.integrity.runtimeState?.seedFailure?.reason ?? ""), /review persistence exploded/i);
});

test("workflow integrity: modernization proof seeding failure cleans up lock-bearing partial state", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const configurationFailure = new Error("modernization configuration exploded");
  await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });

  await assert.rejects(
    () =>
      executeSeedModernizationProofCommandFromArgs(
        ["--workspace-slug", "team", "--project-slug", "devgod", "--task-id", "task-modernization"],
        {
          env: process.env,
          intakeRequest(input) {
            return service.intakeRequest(input);
          },
          getProjectContext(params) {
            return store.getProjectContext(params);
          },
          getProjectRuntimeState(projectId) {
            return store.getProjectRuntimeState(projectId);
          },
          saveProjectRuntimeState(state) {
            return store.saveProjectRuntimeState(state);
          },
          createTaskGraph(runId, tasks) {
            return service.createTaskGraph(runId, tasks);
          },
          claimTask(runId, taskId, actor) {
            return service.claimTask(runId, taskId, actor);
          },
          submitHandoff(runId, taskId, handoff) {
            return service.submitHandoff(runId, taskId, handoff);
          },
          async recordReview() {
            return undefined;
          },
          failTask(runId, taskId, reason) {
            return service.failTask(runId, taskId, reason);
          },
          async configureAutonomousExecution() {
            throw configurationFailure;
          },
          async upsertCoverageItems() {
            throw new Error("unexpected coverage upsert after configuration failure");
          },
          async upsertUnderstandingMaps() {
            throw new Error("unexpected understanding upsert after configuration failure");
          },
          async upsertRuntimeTraces() {
            throw new Error("unexpected trace upsert after configuration failure");
          },
          async upsertDuplicateFamilies() {
            throw new Error("unexpected duplicate-family upsert after configuration failure");
          },
          async upsertArchitectureDecisions() {
            throw new Error("unexpected architecture-decision upsert after configuration failure");
          },
          async upsertMigrationLedgerEntries() {
            throw new Error("unexpected migration-ledger upsert after configuration failure");
          },
          async upsertParityRequirements() {
            throw new Error("unexpected parity upsert after configuration failure");
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
      ),
    configurationFailure
  );

  const latestRun = await store.findLatestRun({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(latestRun);
  const snapshot = await service.getStatus(latestRun.id);
  const seededTask = snapshot.tasks.find((task) => task.packet.taskId === "task-modernization");
  assert.ok(seededTask);
  assert.notEqual(seededTask.status, "review_blocked");
  assert.deepEqual(snapshot.activeLocks, []);
  const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
  assert.ok(projectContext);
  const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
  assert.equal(runtimeState?.activeTaskId, undefined);
  assert.equal(runtimeState?.metadata?.seedFailure?.taskId, "task-modernization");
  assert.match(String(runtimeState?.metadata?.seedFailure?.reason ?? ""), /modernization configuration exploded/i);

  const report = await executeStatusCommandFromArgs(["--run-id", latestRun.id], {
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getProjectRuntimeState(projectId) {
      return store.getProjectRuntimeState(projectId);
    }
  });
  assert.equal(report.integrity.runtimeState?.seedFailure?.taskId, "task-modernization");
  assert.match(String(report.integrity.runtimeState?.seedFailure?.reason ?? ""), /modernization configuration exploded/i);
});

test("workflow integrity: workflow proof seeding carries the completion audit gate and clears stale residue", async () => {
  const store = new MemoryStore();
  const service = createSeedReviewService(store);
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  assert.ok(projectContext);

  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: undefined,
    activeTaskId: "task-proof",
    taskQueue: {
      project_status: "ready",
      current_task_id: null,
      tasks: []
    },
    productState: { status: "ready", items: [] },
    metadata: {
      seedFailure: {
        runId: "stale-run",
        taskId: "task-proof",
        reason: "stale workflow proof residue",
        failedAt: "2026-05-31T09:00:00.000Z",
        recoveryState: "stale_metadata"
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const result = await executeSeedWorkflowProofCommandFromArgs(
    ["--workspace-slug", "team", "--project-slug", "devgod"],
    {
      env: process.env,
      intakeRequest(input) {
        return service.intakeRequest(input);
      },
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      createTaskGraph(runId, tasks) {
        return service.createTaskGraph(runId, tasks);
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
      failTask(runId, taskId, reason) {
        return service.failTask(runId, taskId, reason);
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

  assert.equal(result.taskId, "task-proof");
  assert.equal(result.taskStatus, "approved");
  const snapshot = await service.getStatus(result.runId);
  const seededTask = snapshot.tasks.find((task) => task.packet.taskId === "task-proof");
  assert.ok(seededTask);
  assert.equal(seededTask.packet.completionStandard, "specialist_verified");
  assert.ok(seededTask.packet.qualityGates.includes("completion_audit_required"));

  const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
  assert.equal(runtimeState?.metadata?.seedFailure, undefined);
  assert.equal(runtimeState?.activeTaskId, "task-proof");

  const report = await executeStatusCommandFromArgs(["--run-id", result.runId], {
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getProjectRuntimeState(projectId) {
      return store.getProjectRuntimeState(projectId);
    }
  });
  assert.equal(report.integrity.runtimeState?.seedFailure, undefined);
});

test("workflow integrity: modernization proof seeding carries the completion audit gate and clears stale residue", async () => {
  const store = new MemoryStore();
  const service = createSeedReviewService(store);
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  assert.ok(projectContext);

  await store.saveProjectRuntimeRegistration(runtimeRegistration({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id
  }));
  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: undefined,
    activeTaskId: "task-modernization",
    taskQueue: {
      project_status: "ready",
      current_task_id: null,
      tasks: []
    },
    productState: { status: "ready", items: [] },
    metadata: {
      seedFailure: {
        runId: "stale-run",
        taskId: "task-modernization",
        reason: "stale modernization residue",
        failedAt: "2026-05-31T09:00:00.000Z",
        recoveryState: "stale_metadata"
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const result = await executeSeedModernizationProofCommandFromArgs(
    ["--workspace-slug", "team", "--project-slug", "devgod"],
    {
      env: process.env,
      intakeRequest(input) {
        return service.intakeRequest(input);
      },
      getProjectContext(params) {
        return store.getProjectContext(params);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      },
      saveProjectRuntimeState(state) {
        return store.saveProjectRuntimeState(state);
      },
      createTaskGraph(runId, tasks) {
        return service.createTaskGraph(runId, tasks);
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
      failTask(runId, taskId, reason) {
        return service.failTask(runId, taskId, reason);
      },
      configureAutonomousExecution(runId, config) {
        return service.configureAutonomousExecution(runId, config);
      },
      upsertCoverageItems(runId, items) {
        return service.upsertCoverageItems(runId, items);
      },
      upsertUnderstandingMaps(runId, maps) {
        return service.upsertUnderstandingMaps(runId, maps);
      },
      upsertRuntimeTraces(runId, traces) {
        return service.upsertRuntimeTraces(runId, traces);
      },
      upsertDuplicateFamilies(runId, records) {
        return service.upsertDuplicateFamilies(runId, records);
      },
      upsertArchitectureDecisions(runId, records) {
        return service.upsertArchitectureDecisions(runId, records);
      },
      upsertMigrationLedgerEntries(runId, records) {
        return service.upsertMigrationLedgerEntries(runId, records);
      },
      upsertParityRequirements(runId, records) {
        return service.upsertParityRequirements(runId, records);
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

  assert.equal(result.taskId, "task-modernization");
  assert.equal(result.taskStatus, "approved");
  const snapshot = await service.getStatus(result.runId);
  const seededTask = snapshot.tasks.find((task) => task.packet.taskId === "task-modernization");
  assert.ok(seededTask);
  assert.equal(seededTask.packet.completionStandard, "specialist_verified");
  assert.ok(seededTask.packet.qualityGates.includes("completion_audit_required"));

  const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
  assert.equal(runtimeState?.metadata?.seedFailure, undefined);
  assert.equal(runtimeState?.activeTaskId, "task-modernization");

  const report = await executeStatusCommandFromArgs(["--run-id", result.runId], {
    env: process.env,
    getStatusSnapshot(runId) {
      return service.getStatus(runId);
    },
    getProjectRuntimeState(projectId) {
      return store.getProjectRuntimeState(projectId);
    }
  });
  assert.equal(report.integrity.runtimeState?.seedFailure, undefined);
});

test("workflow integrity: workflow proof seeding writes matching local exports for an active task", async () => {
  const store = new MemoryStore();
  const service = createSeedReviewService(store);
  const projectContext = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  assert.ok(projectContext);

  await store.saveProjectRuntimeState({
    projectId: projectContext.project.id,
    workspaceId: projectContext.workspace.id,
    activeRunId: undefined,
    activeTaskId: "task-proof-export",
    taskQueue: {
      project_status: "ready",
      current_task_id: null,
      tasks: []
    },
    productState: { status: "ready", items: [] },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const exportCwd = await mkdtemp(path.join(tmpdir(), "devgod-proof-export-"));
  try {
    const result = await executeSeedWorkflowProofCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod"],
      {
        cwd: exportCwd,
        env: process.env,
        intakeRequest(input) {
          return service.intakeRequest(input);
        },
        getProjectContext(params) {
          return store.getProjectContext(params);
        },
        getProjectRuntimeState(projectId) {
          return store.getProjectRuntimeState(projectId);
        },
        saveProjectRuntimeState(state) {
          return store.saveProjectRuntimeState(state);
        },
        createTaskGraph(runId, tasks) {
          return service.createTaskGraph(runId, tasks);
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
        failTask(runId, taskId, reason) {
          return service.failTask(runId, taskId, reason);
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

    const activeExport = await readFile(path.join(exportCwd, ".devgod", "ACTIVE"), "utf8");
    const queueExport = JSON.parse(
      await readFile(path.join(exportCwd, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { current_task_id?: string | null; project_status?: string };
    const report = await executeStatusCommandFromArgs(["--run-id", result.runId], {
      cwd: exportCwd,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });

    assert.equal(activeExport, "task_id=task-proof-export\nworkflow=devgod\nstate=active\n");
    assert.equal(queueExport.project_status, "in_progress");
    assert.equal(queueExport.current_task_id, "task-proof-export");
    assert.equal(report.integrity.status, "consistent");
  } finally {
    await rm(exportCwd, { recursive: true, force: true });
  }
});

test("workflow integrity: status surfaces contradictory local completion claims over runtime authority", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-integrity-status-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Contradiction drift",
      request: "Expose local completion claims that outrun runtime proof."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-owner", "planner");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await store.saveProjectRuntimeState({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      activeRunId: run.id,
      activeTaskId: "task-owner",
      taskQueue: {
        project_status: "in_progress",
        current_task_id: "task-owner",
        tasks: []
      },
      productState: { status: "in_progress", items: [] },
      lastVerifiedRunId: undefined,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await writeFile(path.join(directory, ".devgod", "ACTIVE"), "workflow=devgod\nstate=complete\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify({ project_status: "complete", current_task_id: null, tasks: [] }, null, 2)}\n`,
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });

    assert.equal(report.integrity.status, "contradicted");
    assert.equal(report.integrity.runtimeState?.lastVerifiedRunId, null);
    assert.match(report.integrity.contradictions.join(" | "), /local exports claim complete/i);
    assert.match(report.integrity.contradictions.join(" | "), /runtime run status is in_progress/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow integrity: approved tasks with malformed exported task packets surface contradictions even when local workflow is idle", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-integrity-approved-export-invalid-"));
  const store = new MemoryStore();
  const service = createSeedReviewService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Approved malformed export",
      request: "Fail closed when an approved task packet export is malformed."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-proof", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-proof", "planner");
    await service.submitHandoff(run.id, "task-proof", {
      actor: "planner",
      ownerRole: "planner",
      completionStandard: "specialist_verified",
      summary: "Prepared approved task.",
      changedFiles: ["src/admin.ts"],
      blockers: [],
      verificationNotes: ["malformed local export is intentional"],
      executionEvidence: ["runtime approval remains authoritative"],
      qualityGateEvidence: ["approved reviews are persisted in runtime"],
      contextRefs: ["brief://task-proof"]
    });
    await service.recordReview(run.id, "task-proof", "reviewer-actor", {
      reviewerRole: "reviewer",
      state: "passed",
      severity: "low",
      findings: []
    });
    await service.recordReview(run.id, "task-proof", "security-actor", {
      reviewerRole: "security_reviewer",
      state: "passed",
      severity: "low",
      findings: []
    });
    await service.recordReview(run.id, "task-proof", "qa-actor", {
      reviewerRole: "qa_engineer",
      state: "passed",
      severity: "low",
      findings: []
    });

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    const runtimeState = await store.getProjectRuntimeState(context.project.id);
    assert.ok(runtimeState);

    await mkdir(path.join(directory, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(path.join(directory, ".devgod", "ACTIVE"), "workflow=devgod\nstate=idle\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify(runtimeState.taskQueue, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "tasks", "task-task-proof.md"),
      "## Task ID\n\n`task-proof`\n\n## Required reviews\n\n- reviewer\n- qa_engineer\n- security_reviewer\n",
      "utf8"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });

    assert.equal(report.run.status, "approved");
    assert.equal(report.integrity.localExports?.activeState, "idle");
    assert.equal(report.integrity.status, "contradicted");
    assert.equal(report.integrity.taskProofObligations?.tasks[0]?.exportState, "invalid");
    assert.ok(
      report.integrity.taskProofObligations?.tasks[0]?.issues.some((issue) => /missing heading ## Goal/i.test(issue))
    );
    assert.match(
      report.integrity.contradictions.join(" | "),
      /local workflow export is idle while approved task task-proof still has failing exported artifact checks/i
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow integrity: conflicting local exports are advisory and do not override runtime truth", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-integrity-local-export-drift-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Keep runtime authoritative",
      request: "Check that local export drift does not override runtime truth."
    });
    await service.createTaskGraph(run.id, [
      taskPacket({
        taskId: "task-runtime",
        ownerRole: "planner",
        qualityGates: [
          "product_acceptance",
          "completion_audit_required",
          "reasoning_strict_required",
          "progress_proof_required"
        ]
      })
    ]);
    await service.claimTask(run.id, "task-runtime", "planner");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);

    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await writeFile(path.join(directory, ".devgod", "ACTIVE"), ["task_id=task-local", "state=complete"].join("\n"));
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      JSON.stringify(
        {
          project_status: "in_progress",
          current_task_id: "task-local",
          tasks: [
            {
              id: "task-local",
              title: "Stale local export",
              status: "in_progress",
              class: "prototype_slice",
              depends_on: [],
              acceptance_criteria: ["local export says work is complete"],
              verification: ["export-only verification"],
              evidence: ["local queue export"],
              blocker: null
            }
          ]
        },
        null,
        2
      )
    );
    await writeFile(
      path.join(directory, ".devgod", "work", "product-state.md"),
      "# Product State\n\nThis export claims the task is done.\n"
    );

    const report = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });

    assert.equal(report.integrity.status, "contradicted");
    assert.equal(report.integrity.runtimeState?.authorityLabel, "runtime_authoritative");
    assert.equal(report.integrity.runtimeState?.activeTaskId, "task-runtime");
    assert.equal(report.integrity.localExports?.authorityLabel, "derived_only");
    assert.equal(report.integrity.localExports?.activeTaskId, "task-local");
    assert.equal(report.integrity.localExports?.queueCurrentTaskId, "task-local");
    assert.ok(
      report.integrity.contradictions.some((entry) =>
        /local exports claim complete but runtime state has no authoritative workflow proof/i.test(entry)
      )
    );
    assert.ok(
      report.integrity.contradictions.some((entry) =>
        /local active task task-local disagrees with runtime active task task-runtime/i.test(entry)
      )
    );
    assert.ok(
      report.integrity.contradictions.some((entry) =>
        /local queue current task task-local disagrees with runtime queue current task task-runtime/i.test(entry)
      )
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow integrity: doctor repair safely resyncs contradictory local exports from runtime state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-integrity-repair-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Repair drift",
      request: "Resync exports from runtime authority."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-owner", "planner");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await writeFile(path.join(directory, ".devgod", "ACTIVE"), "workflow=devgod\nstate=complete\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify({ project_status: "complete", current_task_id: null, tasks: [] }, null, 2)}\n`,
      "utf8"
    );
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const existingRuntimeState = await store.getProjectRuntimeState(context.project.id);
    assert.ok(existingRuntimeState);
    await store.saveProjectRuntimeState({
      ...existingRuntimeState,
      lastVerifiedRunId: undefined,
      metadata: {
        ...(existingRuntimeState.metadata ?? {}),
        seedFailure: {
          runId: run.id,
          taskId: "task-owner",
          reason: "synthetic persisted seed failure",
          failedAt: "2026-05-31T10:00:00.000Z",
          recoveryState: "requires_reproof"
        }
      },
      updatedAt: new Date().toISOString()
    });

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
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
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only" as const,
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
    });

    const activeExport = await readFile(path.join(directory, ".devgod", "ACTIVE"), "utf8");
    const queueExport = JSON.parse(
      await readFile(path.join(directory, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { project_status?: string; current_task_id?: string | null };
    const repairedRuntimeState = await store.getProjectRuntimeState(context.project.id);

    assert.equal(result.ok, true);
    assert.equal(result.executionReady, true);
    assert.equal(result.repair.status, "repaired");
    assert.ok(
      result.repair.stepsApplied.includes("sync local workflow exports from runtime state after persisted seed failure")
    );
    assert.deepEqual(result.repair.integrityRepairsAttempted, [
      "sync local workflow exports from runtime state after persisted seed failure"
    ]);
    assert.deepEqual(result.repair.integrityRepairsApplied, [
      "sync local workflow exports from runtime state after persisted seed failure"
    ]);
    assert.equal(repairedRuntimeState?.metadata?.lastIntegrityRepair?.kind, "local_export_resync");
    assert.match(String(repairedRuntimeState?.metadata?.lastIntegrityRepair?.summary ?? ""), /sync local workflow exports/i);
    assert.equal(activeExport, "task_id=task-owner\nworkflow=devgod\nstate=active\n");
    assert.equal(queueExport.project_status, "in_progress");
    assert.equal(queueExport.current_task_id, "task-owner");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow integrity: doctor repair recreates missing local exports from persisted seed failure residue", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-integrity-repair-seed-residue-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Repair seed residue",
      request: "Recreate local exports from authoritative persisted seed failure residue."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-owner", "planner");
    await service.failTask(run.id, "task-owner", "persisted interrupted proof seed");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );
    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
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
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only" as const,
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
    });

    const activeExport = await readFile(path.join(directory, ".devgod", "ACTIVE"), "utf8");
    const queueExport = JSON.parse(
      await readFile(path.join(directory, ".devgod", "work", "task-queue.json"), "utf8")
    ) as { project_status?: string; current_task_id?: string | null };
    const runtimeState = await store.getProjectRuntimeState(context.project.id);

    assert.equal(result.ok, true);
    assert.equal(result.executionReady, true);
    assert.equal(result.repair.status, "repaired");
    assert.ok(
      result.repair.stepsApplied.includes("sync local workflow exports from runtime state after persisted seed failure")
    );
    assert.deepEqual(result.repair.integrityRepairsAttempted, [
      "sync local workflow exports from runtime state after persisted seed failure"
    ]);
    assert.deepEqual(result.repair.integrityRepairsApplied, [
      "sync local workflow exports from runtime state after persisted seed failure"
    ]);
    assert.equal(runtimeState?.metadata?.lastIntegrityRepair?.kind, "local_export_resync");
    assert.match(String(runtimeState?.metadata?.lastIntegrityRepair?.summary ?? ""), /sync local workflow exports/i);
    assert.equal(activeExport, "workflow=devgod\nstate=idle\n");
    assert.equal(queueExport.project_status, "ready");
    assert.equal(queueExport.current_task_id, null);
    assert.equal(queueExport.project_status, runtimeState?.taskQueue.project_status);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow integrity: doctor repair clears stale persisted seed failure metadata after authoritative proof", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-integrity-clear-stale-seed-failure-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Clear stale residue",
      request: "Clear stale persisted seed-failure metadata after authoritative proof exists."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-proof", allowedWriteScope: ["src/runtime"] })]);
    await service.claimTask(run.id, "task-proof", "planner");

    const context = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(context);
    await mkdir(path.join(directory, ".devgod", "work"), { recursive: true });
    await mkdir(path.join(directory, "runtime-root"), { recursive: true });
    await store.saveProjectRuntimeRegistration(
      runtimeRegistration({
        projectId: context.project.id,
        workspaceId: context.workspace.id,
        repoPath: directory,
        dataRoot: path.join(directory, "runtime-root")
      })
    );

    const existingRuntimeState = await store.getProjectRuntimeState(context.project.id);
    assert.ok(existingRuntimeState);
    await store.saveProjectRuntimeState({
      ...existingRuntimeState,
      activeRunId: run.id,
      activeTaskId: undefined,
      taskQueue: {
        project_status: "done",
        current_task_id: null,
        tasks: []
      },
      productState: { status: "done", items: [] },
      lastVerifiedRunId: run.id,
      metadata: {
        ...(existingRuntimeState.metadata ?? {}),
        seedFailure: {
          runId: run.id,
          taskId: "task-proof",
          reason: "stale residue after proof",
          failedAt: "2026-05-31T10:00:00.000Z",
          recoveryState: "stale_metadata"
        }
      },
      updatedAt: new Date().toISOString()
    });

    const before = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });
    assert.equal(before.integrity.status, "contradicted");
    assert.equal(before.integrity.runtimeState?.seedFailure?.recoveryState, "stale_metadata");

    const result = await executeDoctorRepairCommandFromArgs(["--repair"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      async findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
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
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      },
      inspectReviewIdentity: async () => ({
        authorityLabel: "derived_only" as const,
        adapterConfigured: true,
        adapterExists: true,
        availableBackends: [],
        bindingsPresent: true,
        bindingsPath: path.join(directory, ".devgod/review-identity-bindings.json"),
        bindingsUseShippedTemplate: false,
        liveTrustReady: true,
        notes: []
      }),
    });

    const repairedRuntimeState = await store.getProjectRuntimeState(context.project.id);
    assert.equal(result.repair.status, "repaired");
    assert.ok(
      result.repair.stepsApplied.includes("clear stale persisted seed failure metadata after authoritative proof")
    );
    assert.deepEqual(result.repair.integrityRepairsAttempted, [
      "reconcile authoritative runtime task state",
      "clear stale persisted seed failure metadata after authoritative proof"
    ]);
    assert.deepEqual(result.repair.integrityRepairsApplied, [
      "reconcile authoritative runtime task state",
      "clear stale persisted seed failure metadata after authoritative proof"
    ]);
    assert.equal(repairedRuntimeState?.metadata?.seedFailure, undefined);
    assert.equal(repairedRuntimeState?.metadata?.lastIntegrityRepair?.kind, "runtime_metadata_cleanup");
    assert.match(
      String(repairedRuntimeState?.metadata?.lastIntegrityRepair?.summary ?? ""),
      /cleared stale persisted seed failure metadata/i
    );

    const after = await executeStatusCommandFromArgs(["--run-id", run.id], {
      cwd: directory,
      env: process.env,
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeState(projectId) {
        return store.getProjectRuntimeState(projectId);
      }
    });
    assert.notEqual(after.integrity.status, "contradicted");
    assert.equal(after.integrity.runtimeState?.seedFailure, undefined);
    assert.equal(after.integrity.runtimeState?.lastIntegrityRepair?.kind, "runtime_metadata_cleanup");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow integrity: orphan-lock recovery releases the owning lock across runs", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  const orphanRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Leave stale lock",
    request: "Create an orphaned write-scope lock."
  });
  await service.createTaskGraph(orphanRun.id, [taskPacket({ taskId: "task-owner", allowedWriteScope: [".devgod/work"] })]);
  await service.claimTask(orphanRun.id, "task-owner", "planner");

  const activeLocksBefore = await store.getActiveLocks(orphanRun.projectId);
  assert.equal(activeLocksBefore.length, 1);

  const currentRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Recover stale lock",
    request: "Inspect and recover cross-run orphan locks."
  });
  await service.createTaskGraph(currentRun.id, [taskPacket({ taskId: "recovery", allowedWriteScope: ["docs/plans"] })]);

  const inspection = await service.inspectRecovery(currentRun.id, { staleAfterHours: 1 });
  const orphanAction = inspection.actions.find((action) => action.kind === "release_orphan_lock");
  assert.ok(orphanAction);

  await service.applyRecovery(currentRun.id, [orphanAction.id], { staleAfterHours: 1 });

  const activeLocksAfter = await store.getActiveLocks(orphanRun.projectId);
  assert.deepEqual(activeLocksAfter, []);
});
