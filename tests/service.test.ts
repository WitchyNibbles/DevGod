import test from "node:test";
import assert from "node:assert/strict";
import { DevgodCoreService } from "../src/core/service.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import type { TaskPacketInput } from "../src/domain/types.ts";

function taskPacket(overrides: Partial<TaskPacketInput> = {}): TaskPacketInput {
  return {
    taskId: overrides.taskId ?? "task-1",
    title: overrides.title ?? "Create task graph",
    ownerRole: overrides.ownerRole ?? "planner",
    goal: overrides.goal ?? "Build task graph",
    inputs: overrides.inputs ?? ["intake brief"],
    outputs: overrides.outputs ?? ["task packets"],
    dependencies: overrides.dependencies ?? [],
    allowedWriteScope: overrides.allowedWriteScope ?? [".devgod/work/tasks"],
    outOfScope: overrides.outOfScope ?? ["production deploys"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["task packet exists"],
    verificationSteps: overrides.verificationSteps ?? ["review generated packet"],
    requiredReviews: overrides.requiredReviews ?? ["security_reviewer", "qa_engineer"],
    securityChecks: overrides.securityChecks ?? ["ensure write scope is narrow"],
    antiPatterns: overrides.antiPatterns ?? ["broad repo edits"],
    rollbackNotes: overrides.rollbackNotes ?? "delete the generated task packet",
    handoffFormat: overrides.handoffFormat ?? "summary + blockers + changed files"
  };
}

test("claimTask blocks overlapping write scopes", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "task-1", allowedWriteScope: ["src/core"] }),
    taskPacket({ taskId: "task-2", allowedWriteScope: ["src/core/service"] })
  ]);

  await service.claimTask(run.id, "task-1", "planner");

  await assert.rejects(
    service.claimTask(run.id, "task-2", "backend_engineer"),
    /write scope locked/
  );
});

test("recordReview keeps task blocked on high severity finding", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [taskPacket()]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    summary: "ready for review",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["tests written"],
    contextRefs: ["brief-1"]
  });

  const result = await service.recordReview(run.id, "task-1", {
    reviewerRole: "security_reviewer",
    state: "blocked",
    severity: "high",
    findings: ["write scope too broad"]
  });

  assert.equal(result.task.status, "review_blocked");
  assert.ok(result.blockers.some((blocker) => blocker.includes("high")));
});

test("searchMemory ranks project entries ahead of global ones", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Global pattern",
    content: "shared orchestration pattern",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "lesson",
    title: "Project pattern",
    content: "shared orchestration pattern",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration"
  });

  assert.equal(results[0]?.scope, "project");
});

test("resumeRun returns ready tasks with satisfied dependencies", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    taskPacket({ taskId: "plan" }),
    taskPacket({
      taskId: "build",
      dependencies: ["plan"],
      allowedWriteScope: ["src/store"]
    })
  ]);

  let status = await service.resumeRun(run.id);
  assert.deepEqual(status.nextTaskIds, ["plan"]);

  await service.claimTask(run.id, "plan", "planner");
  await service.submitHandoff(run.id, "plan", {
    actor: "planner",
    summary: "plan ready",
    changedFiles: [".devgod/work/plans/plan.md"],
    blockers: [],
    verificationNotes: ["plan reviewed"],
    contextRefs: ["brief-1"]
  });
  await service.recordReview(run.id, "plan", {
    reviewerRole: "security_reviewer",
    state: "passed",
    severity: "low",
    findings: []
  });
  await service.recordReview(run.id, "plan", {
    reviewerRole: "qa_engineer",
    state: "passed",
    severity: "low",
    findings: []
  });

  status = await service.resumeRun(run.id);
  assert.ok(status.nextTaskIds.includes("build"));
});
