import test from "node:test";
import assert from "node:assert/strict";
import { buildEmbeddingText, runEmbeddingJobs } from "../src/index.ts";
import type { MemoryEntryRecord } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import type { EmbeddingJobRecord } from "../src/store/types.ts";

function getEmbeddingJobs(store: MemoryStore): Map<string, EmbeddingJobRecord> {
  return (store as unknown as { embeddingJobs: Map<string, EmbeddingJobRecord> }).embeddingJobs;
}

function getMemoryEntryEmbeddings(
  store: MemoryStore
): Map<string, { embedding: readonly number[]; embeddingModel: string }> {
  return (store as unknown as {
    memoryEntryEmbeddings: Map<string, { embedding: readonly number[]; embeddingModel: string }>;
  }).memoryEntryEmbeddings;
}

async function saveMemoryEntry(store: MemoryStore, id: string, title: string, content: string): Promise<MemoryEntryRecord> {
  const context = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });

  const entry: MemoryEntryRecord = {
    id,
    workspaceId: context.workspace.id,
    projectId: context.project.id,
    runId: "run-1",
    taskId: "task-1",
    scope: "project",
    entryType: "decision",
    title,
    content,
    reviewer: "memory_curator",
    actor: "memory_curator",
    status: "approved",
    metadata: {},
    createdAt: "2026-05-04T00:00:00.000Z"
  };

  await store.saveMemoryEntry(entry);
  return entry;
}

test("buildEmbeddingText combines title and content", () => {
  const text = buildEmbeddingText({
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    title: "Incident playbook",
    content: "rollback notes"
  });

  assert.equal(text, "Incident playbook\n\nrollback notes");
});

test("runEmbeddingJobs completes leased jobs through the injected provider", async () => {
  const store = new MemoryStore();
  await saveMemoryEntry(store, "memory-1", "Incident playbook", "rollback notes");
  await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small"
  });

  const seenTexts: string[] = [];
  const result = await runEmbeddingJobs({
    store,
    limit: 5,
    provider: {
      async embed(input) {
        seenTexts.push(input.text);
        return [0.1, 0.2, 0.3];
      }
    }
  });

  assert.deepEqual(result, {
    leased: 1,
    completed: 1,
    failed: 0
  });
  assert.deepEqual(seenTexts, ["Incident playbook\n\nrollback notes"]);
  assert.equal(getEmbeddingJobs(store).get("embedding-job:memory_entries:memory-1:text-embedding-3-small")?.status, "done");
  assert.deepEqual(getMemoryEntryEmbeddings(store).get("memory-1")?.embedding, [0.1, 0.2, 0.3]);
});

test("runEmbeddingJobs fails missing sources without crashing the batch", async () => {
  const store = new MemoryStore();
  await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "missing-memory",
    embeddingModel: "text-embedding-3-small"
  });

  const result = await runEmbeddingJobs({
    store,
    limit: 5,
    provider: {
      async embed() {
        assert.fail("provider should not run for missing sources");
      }
    }
  });

  assert.deepEqual(result, {
    leased: 1,
    completed: 0,
    failed: 1
  });
  assert.equal(
    getEmbeddingJobs(store).get("embedding-job:memory_entries:missing-memory:text-embedding-3-small")?.errorMessage,
    "embedding source missing: memory_entries:missing-memory"
  );
});

test("runEmbeddingJobs sanitizes provider errors and can retry failed jobs safely", async () => {
  const store = new MemoryStore();
  await saveMemoryEntry(store, "memory-2", "Release runbook", "deploy rollback checklist");
  await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "memory-2",
    embeddingModel: "text-embedding-3-small"
  });

  const failedResult = await runEmbeddingJobs({
    store,
    limit: 5,
    provider: {
      async embed() {
        throw new Error("Bearer super-secret sk-secret-token provider timeout");
      }
    }
  });

  assert.deepEqual(failedResult, {
    leased: 1,
    completed: 0,
    failed: 1
  });
  const failedJob = getEmbeddingJobs(store).get("embedding-job:memory_entries:memory-2:text-embedding-3-small");
  assert.equal(failedJob?.status, "failed");
  assert.equal(failedJob?.errorMessage, "Bearer [REDACTED] sk-[REDACTED] provider timeout");

  await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "memory-2",
    embeddingModel: "text-embedding-3-small"
  });

  const retriedResult = await runEmbeddingJobs({
    store,
    limit: 5,
    provider: {
      async embed() {
        return [0.9, 0.8];
      }
    }
  });

  assert.deepEqual(retriedResult, {
    leased: 1,
    completed: 1,
    failed: 0
  });
  assert.equal(failedJob?.id, "embedding-job:memory_entries:memory-2:text-embedding-3-small");
  assert.equal(getEmbeddingJobs(store).get("embedding-job:memory_entries:memory-2:text-embedding-3-small")?.status, "done");
});
