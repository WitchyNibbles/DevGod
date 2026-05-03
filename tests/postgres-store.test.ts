import test from "node:test";
import assert from "node:assert/strict";
import { PostgresStore, type SqlClient, type SqlQueryResult } from "../src/store/postgres-store.ts";

interface QueryCapture {
  text: string;
  values: readonly unknown[] | undefined;
}

function sqlClientWithRows<Row>(
  rows: Row[] | Row[][],
  capture?: QueryCapture[]
): SqlClient {
  const responses = Array.isArray(rows[0]) ? (rows as Row[][]) : [rows as Row[]];
  let callIndex = 0;

  return {
    async query<T>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<T>> {
      if (capture) {
        capture.push({ text, values });
      }

      const currentRows = responses[Math.min(callIndex, responses.length - 1)] ?? [];
      callIndex += 1;

      return {
        rows: currentRows as unknown as T[],
        rowCount: currentRows.length
      };
    }
  };
}

test("PostgresStore.searchMemory maps and ranks results consistently", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      {
        id: "global-1",
        title: "Global notes",
        content: "incident playbook for shared services",
        scope: "global",
        entryType: "pattern",
        actor: "memory_curator",
        reviewer: "memory_curator",
        runId: "run-global",
        taskId: null,
        projectId: null,
        createdAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "project-1",
        title: "Incident playbook",
        content: "rollback notes",
        scope: "project",
        entryType: "pattern",
        actor: "memory_curator",
        reviewer: "memory_curator",
        runId: "run-project",
        taskId: null,
        projectId: "project:team:devgod",
        createdAt: "2026-05-03T00:00:00.000Z"
      }
    ])
  );

  const results = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook",
    limit: 5,
    includeGlobal: true
  });

  assert.equal(results[0]?.title, "Incident playbook");
  assert.equal(results[0]?.projectSlug, "devgod");
  assert.equal(results[0]?.authority.scope, "project");
  assert.equal(results[0]?.authority.precedence, "retrieval_hint");
  assert.equal(results[0]?.citation.runId, "run-project");
  assert.equal(results[0]?.citation.taskId, undefined);
  assert.equal(results[0]?.provenance.entryType, "pattern");
  assert.equal(results[0]?.freshness.createdAt, "2026-05-03T00:00:00.000Z");
});

test("PostgresStore.searchMemory redacts sensitive provenance for global results", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      [
        {
          id: "global-1",
          title: "Global notes",
          content: "shared orchestration",
          scope: "global",
          entryType: "pattern",
          actor: "memory_curator@example.com",
          reviewer: "memory_curator@example.com",
          runId: "run-global",
          taskId: "task-global",
          projectId: null,
          createdAt: "2026-05-03T00:00:00.000Z"
        }
      ],
      []
    ])
  );

  const [result] = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    limit: 5,
    includeGlobal: true
  });

  assert.equal(result?.authority.reviewedBy, undefined);
  assert.equal(result?.citation.runId, undefined);
  assert.equal(result?.citation.taskId, undefined);
  assert.equal(result?.provenance.actor, undefined);
  assert.equal(result?.provenance.reviewer, undefined);
  assert.equal(result?.provenance.runId, undefined);
  assert.equal(result?.provenance.taskId, undefined);
});

test("PostgresStore.searchMemory uses a stable id tie-break when titles match", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      {
        id: "z-id",
        title: "Shared pattern",
        content: "shared orchestration",
        scope: "global",
        entryType: "pattern",
        actor: "memory_curator",
        reviewer: "memory_curator",
        runId: "run-z",
        taskId: null,
        projectId: null,
        createdAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "a-id",
        title: "Shared pattern",
        content: "shared orchestration",
        scope: "global",
        entryType: "pattern",
        actor: "memory_curator",
        reviewer: "memory_curator",
        runId: "run-a",
        taskId: null,
        projectId: null,
        createdAt: "2026-05-01T00:00:00.000Z"
      }
    ])
  );

  const results = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    limit: 5,
    includeGlobal: true
  });

  assert.equal(results[0]?.id, "a-id");
  assert.equal(results[1]?.id, "z-id");
});

test("PostgresStore.searchMemory sends the expected SQL parameters", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    limit: 5,
    includeGlobal: false
  });

  assert.equal(capture.length, 2);
  assert.match(capture[0]?.text ?? "", /with project_context as/);
  assert.match(capture[0]?.text ?? "", /where w\.slug = \$1 and p\.slug = \$2/);
  assert.match(capture[0]?.text ?? "", /join project_context pc on true/);
  assert.match(capture[0]?.text ?? "", /\$3::boolean and m\.scope = 'global'/);
  assert.match(capture[0]?.text ?? "", /limit \$4/);
  assert.deepEqual(capture[0]?.values, ["team", "devgod", false, 25]);
  assert.match(capture[1]?.text ?? "", /ilike/);
  assert.match(capture[1]?.text ?? "", /limit \$7/);
  assert.deepEqual(capture[1]?.values, ["team", "devgod", false, "%shared orchestration%", "%shared%", "%orchestration%", 15]);
});

test("PostgresStore.searchMemory backfills older lexical matches outside the recent window", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      [
        {
          id: "recent-1",
          title: "Recent note",
          content: "incident only",
          scope: "project",
          entryType: "pattern",
          actor: "memory_curator",
          reviewer: "memory_curator",
          runId: "run-recent",
          taskId: null,
          projectId: "project:team:devgod",
          createdAt: "2026-05-03T00:00:00.000Z"
        }
      ],
      [
        {
          id: "older-best",
          title: "Incident playbook",
          content: "release rollback runbook",
          scope: "project",
          entryType: "pattern",
          actor: "memory_curator",
          reviewer: "memory_curator",
          runId: "run-older",
          taskId: "task-older",
          projectId: "project:team:devgod",
          createdAt: "2026-05-01T00:00:00.000Z"
        }
      ]
    ])
  );

  const results = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook",
    limit: 5,
    includeGlobal: true
  });

  assert.equal(results[0]?.id, "older-best");
  assert.equal(results[0]?.citation.taskId, "task-older");
});

test("PostgresStore.searchMemory de-duplicates recent and backfill candidates", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      [
        {
          id: "same-id",
          title: "Incident playbook",
          content: "recent copy",
          scope: "project",
          entryType: "pattern",
          actor: "memory_curator",
          reviewer: "memory_curator",
          runId: "run-1",
          taskId: null,
          projectId: "project:team:devgod",
          createdAt: "2026-05-03T00:00:00.000Z"
        }
      ],
      [
        {
          id: "same-id",
          title: "Incident playbook",
          content: "recent copy",
          scope: "project",
          entryType: "pattern",
          actor: "memory_curator",
          reviewer: "memory_curator",
          runId: "run-1",
          taskId: null,
          projectId: "project:team:devgod",
          createdAt: "2026-05-03T00:00:00.000Z"
        }
      ]
    ])
  );

  const results = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook",
    limit: 5,
    includeGlobal: true
  });

  assert.equal(results.length, 1);
});

test("PostgresStore.queueEmbeddingJob clears derived embeddings and inserts a pending job", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [
          {
            id: "job-1",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            sourceTable: "memory_entries",
            sourceId: "memory-1",
            embeddingModel: "text-embedding-3-small",
            status: "pending",
            errorMessage: null,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ]
      ],
      capture
    )
  );

  const job = await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small"
  });

  assert.equal(job.id, "job-1");
  assert.equal(job.status, "pending");
  assert.equal(capture.length, 2);
  assert.match(capture[0]?.text ?? "", /update memory_entries/);
  assert.match(capture[0]?.text ?? "", /set embedding = null/);
  assert.deepEqual(capture[0]?.values, ["memory-1"]);
  assert.match(capture[1]?.text ?? "", /insert into embedding_jobs/);
  assert.match(capture[1]?.text ?? "", /on conflict \(source_table, source_id, embedding_model\) do update/);
  assert.match(capture[1]?.text ?? "", /status = 'pending'/);
  assert.deepEqual(capture[1]?.values, [
    "workspace:team",
    "project:team:devgod",
    "memory_entries",
    "memory-1",
    "text-embedding-3-small"
  ]);
});

test("PostgresStore.queueEmbeddingJob reuses an existing job for the same source and model", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [
          {
            id: "job-existing",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            sourceTable: "memory_entries",
            sourceId: "memory-1",
            embeddingModel: "text-embedding-3-small",
            status: "pending",
            errorMessage: null,
            createdAt: "2026-05-03T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ]
      ],
      capture
    )
  );

  const job = await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small"
  });

  assert.equal(job.id, "job-existing");
  assert.equal(job.status, "pending");
  assert.equal(capture.length, 2);
  assert.match(capture[1]?.text ?? "", /insert into embedding_jobs/);
  assert.match(capture[1]?.text ?? "", /on conflict \(source_table, source_id, embedding_model\) do update/);
});

test("PostgresStore.queueEmbeddingJob clears derived artifact embeddings before enqueueing", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [
          {
            id: "job-artifact",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            sourceTable: "artifacts",
            sourceId: "artifact-1",
            embeddingModel: "text-embedding-3-small",
            status: "pending",
            errorMessage: null,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ]
      ],
      capture
    )
  );

  const job = await store.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "artifacts",
    sourceId: "artifact-1",
    embeddingModel: "text-embedding-3-small"
  });

  assert.equal(job.sourceTable, "artifacts");
  assert.match(capture[0]?.text ?? "", /update artifacts/);
  assert.match(capture[0]?.text ?? "", /set embedding = null/);
  assert.deepEqual(capture[0]?.values, ["artifact-1"]);
});

test("PostgresStore.leaseEmbeddingJobs marks pending jobs as processing", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [
          {
            id: "job-1",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            sourceTable: "memory_entries",
            sourceId: "memory-1",
            embeddingModel: "text-embedding-3-small",
            status: "processing",
            errorMessage: null,
            createdAt: "2026-05-03T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ]
      ],
      capture
    )
  );

  const jobs = await store.leaseEmbeddingJobs({ limit: 2 });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.status, "processing");
  assert.match(capture[0]?.text ?? "", /with leased as/);
  assert.match(capture[0]?.text ?? "", /for update skip locked/);
  assert.match(capture[0]?.text ?? "", /status = 'processing'/);
  assert.deepEqual(capture[0]?.values, [2]);
});

test("PostgresStore.completeEmbeddingJob writes the vector and marks the job done", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [
          {
            id: "job-1",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            sourceTable: "memory_entries",
            sourceId: "memory-1",
            embeddingModel: "text-embedding-3-small",
            status: "done",
            errorMessage: null,
            createdAt: "2026-05-03T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ],
        [{}],
        []
      ],
      capture
    )
  );

  await store.completeEmbeddingJob({
    jobId: "job-1",
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small",
    embedding: [0.1, 0.2, 0.3]
  });

  assert.equal(capture.length, 4);
  assert.equal(capture[0]?.text, "begin");
  assert.match(capture[1]?.text ?? "", /update embedding_jobs/);
  assert.match(capture[1]?.text ?? "", /status = 'done'/);
  assert.match(capture[1]?.text ?? "", /status = 'processing'/);
  assert.deepEqual(capture[1]?.values, ["job-1", "memory_entries", "memory-1", "text-embedding-3-small"]);
  assert.match(capture[2]?.text ?? "", /update memory_entries/);
  assert.match(capture[2]?.text ?? "", /embedding = \$2::vector/);
  assert.deepEqual(capture[2]?.values, ["memory-1", "[0.1,0.2,0.3]", "text-embedding-3-small"]);
  assert.equal(capture[3]?.text, "commit");
});

test("PostgresStore.completeEmbeddingJob writes artifact vectors and marks the job done", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [
          {
            id: "job-artifact",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            sourceTable: "artifacts",
            sourceId: "artifact-1",
            embeddingModel: "text-embedding-3-small",
            status: "done",
            errorMessage: null,
            createdAt: "2026-05-03T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ],
        [{}],
        []
      ],
      capture
    )
  );

  await store.completeEmbeddingJob({
    jobId: "job-artifact",
    sourceTable: "artifacts",
    sourceId: "artifact-1",
    embeddingModel: "text-embedding-3-small",
    embedding: [0.4, 0.5]
  });

  assert.equal(capture.length, 4);
  assert.equal(capture[0]?.text, "begin");
  assert.match(capture[1]?.text ?? "", /update embedding_jobs/);
  assert.deepEqual(capture[1]?.values, ["job-artifact", "artifacts", "artifact-1", "text-embedding-3-small"]);
  assert.match(capture[2]?.text ?? "", /update artifacts/);
  assert.match(capture[2]?.text ?? "", /embedding = \$2::vector/);
  assert.deepEqual(capture[2]?.values, ["artifact-1", "[0.4,0.5]", "text-embedding-3-small"]);
  assert.equal(capture[3]?.text, "commit");
});

test("PostgresStore.failEmbeddingJob records failures without changing the source vector", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([[], [{}], []], capture));

  await store.failEmbeddingJob("job-1", "provider timeout");

  assert.equal(capture.length, 3);
  assert.equal(capture[0]?.text, "begin");
  assert.match(capture[1]?.text ?? "", /update embedding_jobs/);
  assert.match(capture[1]?.text ?? "", /status = 'failed'/);
  assert.match(capture[1]?.text ?? "", /status = 'processing'/);
  assert.deepEqual(capture[1]?.values, ["job-1", "provider timeout"]);
  assert.equal(capture[2]?.text, "commit");
});
