import test from "node:test";
import assert from "node:assert/strict";
import { SEARCH_MEMORY_STALE_AFTER_DAYS } from "../src/core/policy.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { MemoryEntryRecord, TaskPacketInput } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

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

function mutateOnlyMemoryEntry(
  store: MemoryStore,
  mutate: (entry: MemoryEntryRecord) => MemoryEntryRecord
): MemoryEntryRecord {
  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  const [entry] = [...memoryEntries.values()];

  if (!entry) {
    assert.fail("expected one memory entry");
  }

  const nextEntry = mutate(entry);
  memoryEntries.set(nextEntry.id, nextEntry);
  return nextEntry;
}

function mutateMemoryEntryWhere(
  store: MemoryStore,
  predicate: (entry: MemoryEntryRecord) => boolean,
  mutate: (entry: MemoryEntryRecord) => MemoryEntryRecord
): MemoryEntryRecord {
  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  const entry = [...memoryEntries.values()].find(predicate);

  if (!entry) {
    assert.fail("expected matching memory entry");
  }

  const nextEntry = mutate(entry);
  memoryEntries.set(nextEntry.id, nextEntry);
  return nextEntry;
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

test("searchMemory favors title matches over content-only matches", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Notes",
    content: "incident playbook for release recoveries",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Incident playbook",
    content: "release recoveries and rollback notes",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(results[0]?.title, "Incident playbook");
});

test("searchMemory returns provenance, authority, freshness, and citation metadata", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Incident playbook",
    content: "release recoveries and rollback notes",
    sourceRunId: run.id,
    sourceTaskId: "task-1",
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    sourcePath: ".devgod/memory/decision-log.md",
    sourceAnchor: "incident-playbook"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(results[0]?.authority.source, "shared_backend_memory");
  assert.equal(results[0]?.authority.precedence, "retrieval_hint");
  assert.equal(results[0]?.authority.reviewedBy, "memory_curator");
  assert.equal(results[0]?.citation.kind, "memory_entry");
  assert.equal(results[0]?.citation.label, "Incident playbook");
  assert.equal(results[0]?.citation.sourcePath, ".devgod/memory/decision-log.md");
  assert.equal(results[0]?.citation.sourceAnchor, "incident-playbook");
  assert.equal(results[0]?.citation.canonicalRef, ".devgod/memory/decision-log.md#incident-playbook");
  assert.equal(results[0]?.citation.runId, run.id);
  assert.equal(results[0]?.citation.taskId, "task-1");
  assert.equal(results[0]?.provenance.entryType, "decision");
  assert.equal(results[0]?.provenance.runId, run.id);
  assert.equal(results[0]?.provenance.taskId, "task-1");
  assert.equal(results[0]?.freshness.staleAfterDays, SEARCH_MEMORY_STALE_AFTER_DAYS);
  assert.equal(results[0]?.freshness.createdAt, results[0]?.provenance.createdAt);
  assert.ok((results[0]?.freshness.ageDays ?? -1) >= 0);
});

test("searchMemory marks old entries as stale", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Old incident playbook",
    content: "legacy release recoveries and rollback notes",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    createdAt: "2000-01-01T00:00:00.000Z"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(results[0]?.freshness.status, "stale");
  assert.equal(results[0]?.freshness.staleAfterDays, SEARCH_MEMORY_STALE_AFTER_DAYS);
  assert.ok((results[0]?.freshness.ageDays ?? 0) > SEARCH_MEMORY_STALE_AFTER_DAYS);
});

test("searchMemory falls back to a memory URI canonical ref when only an anchor exists", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Anchor-only note",
    content: "canonical citation fallback",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const updatedEntry = mutateOnlyMemoryEntry(store, (entry) => ({
    ...entry,
    sourceAnchor: "anchor-only"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "anchor-only note"
  });

  assert.equal(results[0]?.citation.sourcePath, undefined);
  assert.equal(results[0]?.citation.sourceAnchor, "anchor-only");
  assert.equal(results[0]?.citation.canonicalRef, `memory://entry/${updatedEntry.id}#anchor-only`);
});

test("searchMemory demotes invalid timestamps and returns explicit freshness status", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Shared orchestration note",
    content: "valid marker",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Shared orchestration note",
    content: "shared orchestration invalid marker",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateMemoryEntryWhere(store, (entry) => entry.content === "shared orchestration invalid marker", (entry) => ({
    ...entry,
    createdAt: "not-a-date"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration"
  });

  assert.equal(results[0]?.content, "valid marker");
  assert.equal(results[0]?.freshness.status, "fresh");
  assert.equal(results[1]?.content, "shared orchestration invalid marker");
  assert.equal(results[1]?.freshness.status, "invalid_timestamp");
  assert.equal(results[1]?.freshness.ageDays, undefined);
});

test("searchMemory demotes future timestamps and returns explicit freshness status", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Release runbook",
    content: "valid runbook",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Release runbook",
    content: "release runbook future marker",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateMemoryEntryWhere(store, (entry) => entry.content === "release runbook future marker", (entry) => ({
    ...entry,
    createdAt: "9999-01-01T00:00:00.000Z"
  }));

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "release runbook"
  });

  assert.equal(results[0]?.content, "valid runbook");
  assert.equal(results[1]?.content, "release runbook future marker");
  assert.equal(results[1]?.freshness.status, "future_timestamp");
  assert.equal(results[1]?.freshness.ageDays, undefined);
});

test("searchMemory redacts sensitive provenance for global results", async () => {
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
    title: "Shared pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    sourceTaskId: "task-global",
    reviewer: "memory_curator@example.com",
    actor: "memory_curator@example.com"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.equal(results[0]?.scope, "global");
  assert.equal(results[0]?.authority.reviewedBy, undefined);
  assert.equal(results[0]?.citation.sourcePath, undefined);
  assert.equal(results[0]?.citation.sourceAnchor, undefined);
  assert.equal(results[0]?.citation.canonicalRef, `memory://entry/${results[0]?.citation.memoryId}`);
  assert.equal(results[0]?.citation.runId, undefined);
  assert.equal(results[0]?.citation.taskId, undefined);
  assert.equal(results[0]?.provenance.actor, undefined);
  assert.equal(results[0]?.provenance.reviewer, undefined);
  assert.equal(results[0]?.provenance.runId, undefined);
  assert.equal(results[0]?.provenance.taskId, undefined);
});

test("searchMemory prefers fuller lexical coverage over partial matches", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Backend orchestration guide",
    content: "shared orchestration backend planning flow",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Backend notes",
    content: "backend only",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration backend"
  });

  assert.equal(results[0]?.title, "Backend orchestration guide");
});

test("searchMemory uses a stable tie-break for equivalent scores", async () => {
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
    title: "Zeta pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Alpha pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.equal(results[0]?.title, "Alpha pattern");
  assert.equal(results[1]?.title, "Zeta pattern");
});

test("searchMemory excludes project memory from other projects", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  const otherRun = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "other-project",
    actor: "ceo",
    title: "Build other core",
    request: "Ship another backend."
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "pattern",
    title: "Local pattern",
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(otherRun.id, {
    scope: "project",
    entryType: "pattern",
    title: "Foreign pattern",
    content: "shared orchestration",
    sourceRunId: otherRun.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.equal(results.some((result) => result.title === "Foreign pattern"), false);
});

test("searchMemory rejects blank queries", async () => {
  const service = new DevgodCoreService(new MemoryStore());

  await assert.rejects(
    service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "   "
    }),
    /search query is required/
  );
});

test("searchMemory returns no globals for an unknown project", async () => {
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
    content: "shared orchestration",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "missing-project",
    query: "shared orchestration",
    includeGlobal: true
  });

  assert.deepEqual(results, []);
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
