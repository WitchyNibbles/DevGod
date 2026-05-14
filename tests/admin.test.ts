import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  executeAdvanceActiveTaskCommandFromArgs,
  executeIndexRepoMarkdownCommand,
  executeReportCommandFromArgs,
  executeRecordReviewCommand,
  executeRecordReviewCommandFromArgs,
  executeSeedWorkflowProofCommandFromArgs,
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
    handoffFormat: overrides.handoffFormat ?? "summary + blockers + changed files"
  };
}

async function createApprovedRuntimeTask(options: {
  store: MemoryStore;
  service: DevgodCoreService;
  taskId: string;
  title: string;
  request: string;
}): Promise<{ runId: string }> {
  const run = await options.service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: options.title,
    request: options.request
  });

  await options.service.createTaskGraph(run.id, [taskPacket({ taskId: options.taskId })]);
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
  const cwd = await mkdtemp(path.join(tmpdir(), "devgod-advance-active-task-"));

  try {
    const { runId } = await createApprovedRuntimeTask({
      store,
      service,
      taskId: "task-001",
      title: "Advance current task",
      request: "Use runtime proof to move the queue forward."
    });

    await mkdir(path.join(cwd, ".devgod", "work"), { recursive: true });
    await writeFile(
      path.join(cwd, ".devgod", "ACTIVE"),
      "task_id=task-001\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify(
        {
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
        null,
        2
      )}\n`,
      "utf8"
    );

    const preview = await executeAdvanceActiveTaskCommandFromArgs(["--run-id", runId], {
      cwd,
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

    const previewQueue = JSON.parse(await readFile(path.join(cwd, ".devgod", "work", "task-queue.json"), "utf8")) as {
      current_task_id: string;
      tasks: Array<{ id: string; status: string }>;
    };
    assert.equal(previewQueue.current_task_id, "task-001");
    assert.equal(previewQueue.tasks.find((task) => task.id === "task-001")?.status, "in_progress");

    const applied = await executeAdvanceActiveTaskCommandFromArgs(["--run-id", runId, "--apply"], {
      cwd,
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

    assert.equal(applied.format, "json");
    assert.equal(applied.result.mode, "applied");
    assert.equal(applied.result.taskId, "task-001");
    assert.equal(applied.result.nextTaskId, "task-002");

    const appliedQueue = JSON.parse(await readFile(path.join(cwd, ".devgod", "work", "task-queue.json"), "utf8")) as {
      current_task_id: string | null;
      tasks: Array<{ id: string; status: string }>;
    };
    assert.equal(appliedQueue.current_task_id, "task-002");
    assert.equal(appliedQueue.tasks.find((task) => task.id === "task-001")?.status, "done");
    assert.equal(appliedQueue.tasks.find((task) => task.id === "task-002")?.status, "in_progress");

    const activeContent = await readFile(path.join(cwd, ".devgod", "ACTIVE"), "utf8");
    assert.match(activeContent, /^task_id=task-002$/m);
  } finally {
    await rm(cwd, { recursive: true, force: true });
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
  const cwd = await mkdtemp(path.join(tmpdir(), "devgod-advance-active-task-reject-"));

  try {
    const run = await service.intakeRequest({
      workspaceSlug: "team",
      projectSlug: "devgod",
      actor: "ceo",
      title: "Reject unapproved advance",
      request: "Do not move the queue without runtime approval."
    });
    await service.createTaskGraph(run.id, [taskPacket({ taskId: "task-001" })]);

    const originalQueue = {
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

    await mkdir(path.join(cwd, ".devgod", "work"), { recursive: true });
    await writeFile(
      path.join(cwd, ".devgod", "ACTIVE"),
      "task_id=task-001\nworkflow=devgod\nstate=active\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, ".devgod", "work", "task-queue.json"),
      `${JSON.stringify(originalQueue, null, 2)}\n`,
      "utf8"
    );

    await assert.rejects(
      executeAdvanceActiveTaskCommandFromArgs(["--run-id", run.id, "--apply"], {
        cwd,
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

    assert.deepEqual(
      JSON.parse(await readFile(path.join(cwd, ".devgod", "work", "task-queue.json"), "utf8")),
      originalQueue
    );
    assert.equal(
      await readFile(path.join(cwd, ".devgod", "ACTIVE"), "utf8"),
      "task_id=task-001\nworkflow=devgod\nstate=active\n"
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
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
  const cwd = await mkdtemp(path.join(tmpdir(), "devgod-seed-workflow-proof-"));

  try {
    await mkdir(path.join(cwd, ".devgod"), { recursive: true });
    await writeFile(
      path.join(cwd, ".devgod", "ACTIVE"),
      "task_id=active-proof-task\nworkflow=devgod\nstate=active\n",
      "utf8"
    );

    const result = await executeSeedWorkflowProofCommandFromArgs(
      ["--workspace-slug", "team", "--project-slug", "devgod"],
      {
        cwd,
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
  } finally {
    await rm(cwd, { recursive: true, force: true });
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
  const cwd = await mkdtemp(path.join(tmpdir(), "devgod-seed-workflow-proof-missing-task-"));

  try {
    await assert.rejects(
      executeSeedWorkflowProofCommandFromArgs(["--workspace-slug", "team", "--project-slug", "devgod"], {
        cwd,
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
      /requires --task-id or an active \.devgod\/ACTIVE task_id/
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
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
