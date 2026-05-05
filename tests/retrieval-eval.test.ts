import test from "node:test";
import assert from "node:assert/strict";
import { mutateMemoryEntryWhere, runRetrievalMemoryBaseline } from "../src/evals/retrieval-memory-baseline.ts";
import type { MemoryEntryRecord } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

test("retrieval memory baseline passes all seeded cases", async () => {
  const report = await runRetrievalMemoryBaseline();

  assert.equal(report.summary.totalCases, 10);
  assert.equal(report.summary.failedCases, 0);
  assert.equal(report.summary.passedCases, 10);
  assert.equal(report.summary.passRate, 1);
});

test("retrieval memory baseline returns per-case results", async () => {
  const report = await runRetrievalMemoryBaseline();

  const caseIds = report.cases.map((testCase) => testCase.id);
  assert.deepEqual(caseIds, [
    "project_recall_precision",
    "project_provenance_present",
    "project_citation_present",
    "repo_markdown_context_present",
    "global_redaction",
    "role_filtered_retrieval",
    "freshness_fresh_status",
    "freshness_stale_status",
    "conflict_candidates_visible",
    "unprovenanced_blocked"
  ]);
});

test("mutateMemoryEntryWhere updates matching entries and rejects missing ones", () => {
  const store = new MemoryStore();
  const memoryEntries = (store as unknown as { memoryEntries: Map<string, MemoryEntryRecord> }).memoryEntries;
  memoryEntries.set("memory-1", {
    id: "memory-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: "run-1",
    taskId: "task-1",
    scope: "project",
    entryType: "decision",
    title: "Incident playbook",
    content: "rollback checklist",
    reviewer: "memory_curator",
    actor: "memory_curator",
    status: "approved",
    metadata: {},
    createdAt: "2026-05-05T00:00:00.000Z"
  });

  mutateMemoryEntryWhere(
    store,
    (entry) => entry.title === "Incident playbook",
    (entry) => ({
      ...entry,
      reviewer: ""
    })
  );
  assert.equal(memoryEntries.get("memory-1")?.reviewer, "");

  assert.throws(
    () =>
      mutateMemoryEntryWhere(
        store,
        (entry) => entry.title === "missing",
        (entry) => entry
      ),
    /expected matching memory entry/
  );
});
