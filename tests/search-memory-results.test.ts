import test from "node:test";
import assert from "node:assert/strict";
import { annotateConflictSignals, isProvenancedSearchResult } from "../src/core/search-memory-results.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import type { MemoryEntryRecord, SearchMemoryResult } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

function buildResult(
  id: string,
  title: string,
  content: string,
  overrides: Partial<SearchMemoryResult> = {}
): SearchMemoryResult {
  return {
    id,
    title,
    content,
    scope: "project",
    projectSlug: "devgod",
    score: 1,
    authority: {
      source: "shared_backend_memory",
      precedence: "retrieval_hint",
      scope: "project",
      reviewedBy: "memory_curator",
      authorityLevel: "reviewed_memory",
      allowedRoles: []
    },
    freshness: {
      status: "fresh",
      createdAt: "2026-01-01T00:00:00.000Z",
      ageDays: 1,
      staleAfterDays: 30
    },
    citation: {
      kind: "memory_entry",
      memoryId: id,
      label: title,
      canonicalRef: `memory://${id}`
    },
    provenance: {
      entryType: "decision",
      actor: "memory_curator",
      reviewer: "memory_curator",
      runId: "run-1",
      taskId: "task-1",
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    metadata: {
      allowedRoles: [],
      tags: [],
      staleAfterDays: 30,
      supersededBy: [],
      contradicts: []
    },
    conflict: {
      detected: false,
      relatedIds: []
    },
    ...overrides
  };
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

test("isProvenancedSearchResult rejects blank canonical refs", () => {
  const result = buildResult("result-1", "Adopt pgvector", "enable pgvector", {
    citation: {
      kind: "memory_entry",
      memoryId: "result-1",
      label: "Adopt pgvector",
      canonicalRef: "   "
    }
  });

  assert.equal(isProvenancedSearchResult(result), false);
});

test("isProvenancedSearchResult requires reviewed project backend memory", () => {
  const projectBackendResult = buildResult("result-1", "Adopt pgvector", "enable pgvector", {
    authority: {
      source: "shared_backend_memory",
      precedence: "retrieval_hint",
      scope: "project",
      reviewedBy: "",
      authorityLevel: "reviewed_memory",
      allowedRoles: []
    }
  });

  const globalBackendResult = buildResult("result-2", "Global note", "enable logging", {
    scope: "global",
    authority: {
      source: "shared_backend_memory",
      precedence: "retrieval_hint",
      scope: "global",
      reviewedBy: "",
      authorityLevel: "reviewed_memory",
      allowedRoles: []
    }
  });

  assert.equal(isProvenancedSearchResult(projectBackendResult), false);
  assert.equal(isProvenancedSearchResult(globalBackendResult), true);
});

test("annotateConflictSignals marks explicit contradicts edges", () => {
  const left = buildResult("left", "Adopt pgvector", "enable pgvector", {
    metadata: {
      allowedRoles: [],
      tags: [],
      staleAfterDays: 30,
      supersededBy: [],
      contradicts: ["right"]
    }
  });
  const right = buildResult("right", "Keep lexical only", "avoid pgvector");

  const results = annotateConflictSignals([left, right]);

  assert.deepEqual(results.map((result) => result.conflict), [
    { detected: true, relatedIds: ["right"] },
    { detected: true, relatedIds: ["left"] }
  ]);
});

test("annotateConflictSignals marks explicit supersededBy edges", () => {
  const current = buildResult("current", "Current retrieval plan", "use hybrid retrieval");
  const superseded = buildResult("superseded", "Old retrieval plan", "use lexical retrieval only", {
    metadata: {
      allowedRoles: [],
      tags: [],
      staleAfterDays: 30,
      supersededBy: ["current"],
      contradicts: []
    }
  });

  const results = annotateConflictSignals([current, superseded]);

  assert.deepEqual(results.map((result) => result.conflict), [
    { detected: true, relatedIds: ["superseded"] },
    { detected: true, relatedIds: ["current"] }
  ]);
});

test("annotateConflictSignals detects heuristic conflicts for shared topics", () => {
  const adopt = buildResult(
    "adopt",
    "Adopt pgvector retrieval",
    "pgvector retrieval should be enabled for memory search"
  );
  const delay = buildResult(
    "delay",
    "Delay pgvector retrieval",
    "pgvector retrieval should stay disabled until backfill passes"
  );

  const results = annotateConflictSignals([adopt, delay]);

  assert.deepEqual(results.map((result) => result.conflict), [
    { detected: true, relatedIds: ["delay"] },
    { detected: true, relatedIds: ["adopt"] }
  ]);
});

test("annotateConflictSignals does not mark opposing verbs without a shared topic", () => {
  const adopt = buildResult("adopt", "Adopt pgvector retrieval", "enable pgvector immediately");
  const delay = buildResult("delay", "Delay backlog cleanup", "disable backlog later");

  const results = annotateConflictSignals([adopt, delay]);

  assert.deepEqual(results.map((result) => result.conflict), [
    { detected: false, relatedIds: [] },
    { detected: false, relatedIds: [] }
  ]);
});

test("searchMemory drops unprovenanced hits before conflict annotation", async () => {
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  const keptEntry = await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Adopt pgvector retrieval",
    content: "pgvector retrieval should be enabled for memory search",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Delay pgvector retrieval",
    content: "pgvector retrieval should stay disabled until backfill passes",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  mutateMemoryEntryWhere(
    store,
    (entry) => entry.title === "Delay pgvector retrieval",
    (entry) => ({
      ...entry,
      reviewer: ""
    })
  );

  const results = await service.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "pgvector retrieval"
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, keptEntry.id);
  assert.deepEqual(results[0]?.conflict, {
    detected: false,
    relatedIds: []
  });
});
