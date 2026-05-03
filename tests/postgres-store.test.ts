import test from "node:test";
import assert from "node:assert/strict";
import { PostgresStore, type SqlClient, type SqlQueryResult } from "../src/store/postgres-store.ts";

function sqlClientWithRows<Row>(
  rows: Row[],
  capture?: { text?: string; values?: readonly unknown[] | undefined }
): SqlClient {
  return {
    async query<T>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<T>> {
      if (capture) {
        capture.text = text;
        capture.values = values;
      }

      return {
        rows: rows as unknown as T[],
        rowCount: rows.length
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
  const capture: { text?: string; values?: readonly unknown[] | undefined } = {};
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared orchestration",
    limit: 5,
    includeGlobal: false
  });

  assert.match(capture.text ?? "", /with project_context as/);
  assert.match(capture.text ?? "", /where w\.slug = \$1 and p\.slug = \$2/);
  assert.match(capture.text ?? "", /join project_context pc on true/);
  assert.match(capture.text ?? "", /\$3::boolean and m\.scope = 'global'/);
  assert.match(capture.text ?? "", /limit \$4/);
  assert.deepEqual(capture.values, ["team", "devgod", false, 25]);
});
