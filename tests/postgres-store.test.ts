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
        projectId: null
      },
      {
        id: "project-1",
        title: "Incident playbook",
        content: "rollback notes",
        scope: "project",
        projectId: "project:team:devgod"
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
});

test("PostgresStore.searchMemory uses a stable id tie-break when titles match", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      {
        id: "z-id",
        title: "Shared pattern",
        content: "shared orchestration",
        scope: "global",
        projectId: null
      },
      {
        id: "a-id",
        title: "Shared pattern",
        content: "shared orchestration",
        scope: "global",
        projectId: null
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
          projectId: "project:team:devgod"
        }
      ],
      [
        {
          id: "older-best",
          title: "Incident playbook",
          content: "release rollback runbook",
          scope: "project",
          projectId: "project:team:devgod"
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
          projectId: "project:team:devgod"
        }
      ],
      [
        {
          id: "same-id",
          title: "Incident playbook",
          content: "recent copy",
          scope: "project",
          projectId: "project:team:devgod"
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
