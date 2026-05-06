import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOperatorStatusReport } from "../src/admin/status.ts";
import { executeStatusCommandFromArgs } from "../src/admin.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { TaskPacketInput } from "../src/domain/types.ts";
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
  assert.equal(report.reviewIdentity.liveTrustReady, false);
  assert.deepEqual(report.reviewIdentity.notes, ["adapter module not configured"]);
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
      }
    });

    assert.equal(report.run.id, run.id);
    assert.equal(report.run.authorityLabel, "runtime_authoritative");
    assert.equal(report.reviewIdentity.authorityLabel, "derived_only");
    assert.equal(report.reviewIdentity.adapterConfigured, true);
    assert.deepEqual(report.reviewIdentity.availableBackends, []);
    assert.equal(report.reviewIdentity.bindingsPresent, true);
    assert.equal(report.reviewIdentity.liveTrustReady, false);
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
      }
    });

    assert.equal(report.reviewIdentity.liveTrustReady, false);
    assert.match(report.reviewIdentity.notes.join(" "), /bindings file is invalid and cannot be trusted/);
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
      }
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
