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
