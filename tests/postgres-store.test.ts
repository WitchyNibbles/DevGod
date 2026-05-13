import test from "node:test";
import assert from "node:assert/strict";
import type {
  LockRecord,
  MarkdownArtifactRecord,
  MemoryEntryRecord,
  PlanArtifact,
  RuntimeMigrationJournalRecord,
  RuntimeProjectRegistrationRecord,
  RunRecord,
  TaskRecord
} from "../src/domain/types.ts";
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

function createRunRecord(): RunRecord {
  return {
    id: "run-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    actor: "manager",
    title: "Ship feature",
    request: "Do the thing",
    summary: {
      goal: "Ship feature",
      audience: ["repo maintainer"],
      constraints: ["preserve policy"],
      risks: ["regression"],
      unknowns: [],
      successCriteria: ["works"],
      outOfScope: ["deploy"],
      trustBoundaries: ["repo-local policy"],
      destructiveActions: [],
      externalIntegrations: [],
      stopGo: "go"
    },
    status: "planned",
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z"
  };
}

function createPlanArtifact(): PlanArtifact {
  return {
    id: "plan-1",
    runId: "run-1",
    kind: "plan",
    title: "Plan",
    content: {
      runId: "run-1",
      title: "Plan",
      summary: "summary",
      milestones: ["m1"],
      decisions: ["d1"],
      residualRisks: ["r1"],
      acceptanceCriteria: ["a1"]
    },
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

function createTaskRecord(): TaskRecord {
  return {
    id: "task-record-1",
    runId: "run-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    packet: {
      taskId: "task-1",
      title: "Implement task",
      ownerRole: "backend_engineer",
      completionStandard: "specialist_verified",
      requiredSpecialistRoles: ["backend_engineer"],
      qualityGates: ["tdd_required"],
      goal: "Implement the thing",
      inputs: ["brief"],
      outputs: ["code"],
      dependencies: ["dep-1"],
      allowedWriteScope: ["src/core"],
      outOfScope: ["deploy"],
      acceptanceCriteria: ["works"],
      verificationSteps: ["npm test"],
      requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
      securityChecks: ["no secrets"],
      antiPatterns: ["broad edits"],
      rollbackNotes: "revert patch",
      handoffFormat: "summary"
    },
    status: "ready",
    claimedBy: undefined,
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z"
  };
}

function createLockRecord(): LockRecord {
  return {
    id: "lock-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: "run-1",
    taskId: "task-1",
    scopePaths: ["src/core/service.ts"],
    status: "active",
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

function createMemoryEntryRecord(): MemoryEntryRecord {
  return {
    id: "memory-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: "run-1",
    taskId: "task-1",
    scope: "project",
    entryType: "decision",
    title: "Decision log",
    content: "Use the contract-first path.",
    reviewer: "reviewer-1",
    actor: "memory_curator",
    status: "approved",
    sourcePath: ".devgod/memory/decision-log.md",
    sourceAnchor: "decision-log",
    metadata: {
      retrievalRoles: ["planner"],
      tags: ["decision"]
    },
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

function createMarkdownArtifactRecord(): MarkdownArtifactRecord {
  return {
    id: "artifact-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: "run-1",
    kind: "markdown_chunk",
    title: "Runbook",
    content: "Rollback steps",
    sourcePath: "docs/runbook.md",
    sourceAnchor: "runbook",
    metadata: {
      retrievalRoles: ["reviewer"],
      chunkIndex: 0
    },
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

function createRuntimeProjectRegistrationRecord(): RuntimeProjectRegistrationRecord {
  return {
    projectId: "project:team:devgod",
    workspaceId: "workspace:team",
    repoPath: "/repo/devgod",
    runtimeProfile: "local-docker",
    dataRoot: "/home/eimi/.local/share/devgod",
    qdrantUrl: "http://127.0.0.1:6333",
    qdrantCollection: "devgod-memory",
    installManifestPath: ".devgod/install-manifest.json",
    manifest: {
      version: 1,
      files: ["AGENTS.md", ".codex/config.toml"]
    },
    provenance: {
      authority: "runtime_authoritative",
      source: "install-upgrade",
      version: "0.1.0"
    },
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  };
}

function createRuntimeMigrationJournalRecord(): RuntimeMigrationJournalRecord {
  return {
    id: "journal-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: "run-1",
    phase: "legacy-upgrade",
    status: "completed",
    backupManifestPath: ".devgod/install-backups/runtime-backup.json",
    verificationReportPath: ".devgod/runtime/verification-report.json",
    rollbackState: "legacy-safe",
    details: {
      registeredProject: true,
      cleanupRecommendation: "archive legacy managed files"
    },
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  };
}

test("sqlClientWithRows supports single-response mode without capture", async () => {
  const client = sqlClientWithRows([{ id: "row-1" }]);
  const result = await client.query<{ id: string }>("select 1");

  assert.deepEqual(result.rows, [{ id: "row-1" }]);
  assert.equal(result.rowCount, 1);
});

test("sqlClientWithRows reuses the final batch when calls exceed seeded responses", async () => {
  const capture: QueryCapture[] = [];
  const client = sqlClientWithRows(
    [
      [{ id: "row-1" }],
      [{ id: "row-2" }]
    ],
    capture
  );

  const first = await client.query<{ id: string }>("select first");
  const second = await client.query<{ id: string }>("select second");
  const third = await client.query<{ id: string }>("select third");

  assert.deepEqual(first.rows, [{ id: "row-1" }]);
  assert.deepEqual(second.rows, [{ id: "row-2" }]);
  assert.deepEqual(third.rows, [{ id: "row-2" }]);
  assert.deepEqual(
    capture.map((query) => query.text),
    ["select first", "select second", "select third"]
  );
});

test("PostgresStore.ensureProjectContext upserts workspace and project metadata", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  const result = await store.ensureProjectContext({
    workspaceSlug: "team",
    workspaceName: "Team Workspace",
    projectSlug: "devgod",
    projectName: "Devgod",
    repoPath: "/repo/devgod"
  });

  assert.equal(result.workspace.id, "workspace:team");
  assert.equal(result.project.id, "project:team:devgod");
  assert.match(capture[0]?.text ?? "", /insert into workspaces/);
  assert.match(capture[0]?.text ?? "", /do update set name = excluded.name/);
  assert.deepEqual(capture[0]?.values, ["workspace:team", "team", "Team Workspace"]);
  assert.match(capture[1]?.text ?? "", /insert into projects/);
  assert.match(capture[1]?.text ?? "", /repo_path = excluded.repo_path/);
  assert.deepEqual(capture[1]?.values, [
    "project:team:devgod",
    "workspace:team",
    "devgod",
    "Devgod",
    "/repo/devgod"
  ]);
});

test("PostgresStore.saveProjectRuntimeRegistration persists canonical repo registration and manifest provenance", async () => {
  const capture: QueryCapture[] = [];
  const registration = createRuntimeProjectRegistrationRecord();
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [{ payload: registration }]
      ],
      capture
    )
  );

  await store.saveProjectRuntimeRegistration(registration);
  const loaded = await store.getProjectRuntimeRegistration(registration.projectId);

  assert.deepEqual(loaded, registration);
  assert.match(capture[0]?.text ?? "", /insert into runtime_project_registrations/);
  assert.match(capture[0]?.text ?? "", /on conflict \(project_id\) do update/);
  assert.deepEqual(capture[0]?.values, [
    registration.projectId,
    registration.workspaceId,
    registration.repoPath,
    registration.runtimeProfile,
    registration.dataRoot,
    registration.qdrantUrl,
    registration.qdrantCollection,
    registration.installManifestPath,
    JSON.stringify(registration.manifest),
    JSON.stringify(registration.provenance)
  ]);
  assert.match(capture[1]?.text ?? "", /from runtime_project_registrations/);
  assert.deepEqual(capture[1]?.values, [registration.projectId]);
});

test("PostgresStore.saveRuntimeMigrationJournal records backup manifest, verification report, and rollback state", async () => {
  const capture: QueryCapture[] = [];
  const journal = createRuntimeMigrationJournalRecord();
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [{ payload: journal }]
      ],
      capture
    )
  );

  await store.saveRuntimeMigrationJournal(journal);
  const loaded = await store.listRuntimeMigrationJournals(journal.projectId);

  assert.deepEqual(loaded, [journal]);
  assert.match(capture[0]?.text ?? "", /insert into runtime_migration_journals/);
  assert.match(capture[0]?.text ?? "", /on conflict \(id\) do update/);
  assert.deepEqual(capture[0]?.values, [
    journal.id,
    journal.workspaceId,
    journal.projectId,
    journal.runId,
    journal.phase,
    journal.status,
    journal.backupManifestPath,
    journal.verificationReportPath,
    journal.rollbackState,
    JSON.stringify(journal.details)
  ]);
  assert.match(capture[1]?.text ?? "", /from runtime_migration_journals/);
  assert.deepEqual(capture[1]?.values, [journal.projectId]);
});

test("PostgresStore.createRun, getRun, and updateRun persist run summaries", async () => {
  const run = createRunRecord();
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [{ payload: run }],
        []
      ],
      capture
    )
  );

  await store.createRun(run);
  const loaded = await store.getRun(run.id);
  await store.updateRun({
    ...run,
    actor: "manager-2",
    status: "in_progress"
  });

  assert.deepEqual(loaded, run);
  assert.match(capture[0]?.text ?? "", /insert into runs/);
  assert.equal(capture[0]?.values?.[6], JSON.stringify(run.summary));
  assert.match(capture[1]?.text ?? "", /from runs/);
  assert.deepEqual(capture[1]?.values, ["run-1"]);
  assert.match(capture[2]?.text ?? "", /update runs/);
  assert.equal(capture[2]?.values?.[1], "manager-2");
  assert.equal(capture[2]?.values?.[5], "in_progress");
});

test("PostgresStore.savePlan and getPlan round-trip plan artifacts", async () => {
  const plan = createPlanArtifact();
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [{ payload: plan }]
      ],
      capture
    )
  );

  await store.savePlan(plan);
  const loaded = await store.getPlan(plan.runId);

  assert.deepEqual(loaded, plan);
  assert.match(capture[0]?.text ?? "", /insert into artifacts/);
  assert.deepEqual(capture[0]?.values, [
    "plan-1",
    "run-1",
    "Plan",
    JSON.stringify(plan.content),
    JSON.stringify({ kind: "plan" })
  ]);
  assert.match(capture[1]?.text ?? "", /where run_id = \$1 and kind = 'plan'/);
});

test("PostgresStore.replaceTasks rewrites tasks and dependencies", async () => {
  const task = createTaskRecord();
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([[], [], [], []], capture));

  await store.replaceTasks([task]);

  assert.match(capture[0]?.text ?? "", /delete from task_dependencies/);
  assert.deepEqual(capture[0]?.values, ["run-1"]);
  assert.match(capture[1]?.text ?? "", /delete from tasks/);
  assert.deepEqual(capture[1]?.values, ["run-1"]);
  assert.match(capture[2]?.text ?? "", /insert into tasks/);
  assert.equal(capture[2]?.values?.[17], JSON.stringify(task.packet));
  assert.equal(capture[2]?.values?.[18], null);
  assert.match(capture[3]?.text ?? "", /insert into task_dependencies/);
  assert.deepEqual(capture[3]?.values, ["task-record-1", "dep-1"]);
});

test("PostgresStore.replaceTasks ignores empty task lists", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.replaceTasks([]);

  assert.equal(capture.length, 0);
});

test("PostgresStore.getTasksByRun, getTask, and updateTask preserve claimed ownership", async () => {
  const task = createTaskRecord();
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [{ payload: task }],
        [{ payload: task }],
        []
      ],
      capture
    )
  );

  const tasks = await store.getTasksByRun(task.runId);
  const loaded = await store.getTask(task.runId, task.packet.taskId);
  await store.updateTask({
    ...task,
    status: "in_progress",
    claimedBy: "backend-1"
  });

  assert.deepEqual(tasks, [task]);
  assert.deepEqual(loaded, task);
  assert.match(capture[0]?.text ?? "", /where run_id = \$1/);
  assert.deepEqual(capture[0]?.values, ["run-1"]);
  assert.match(capture[1]?.text ?? "", /where run_id = \$1 and task_key = \$2/);
  assert.deepEqual(capture[1]?.values, ["run-1", "task-1"]);
  assert.match(capture[2]?.text ?? "", /update tasks/);
  assert.deepEqual(capture[2]?.values, [
    "task-record-1",
    "in_progress",
    "backend-1",
    JSON.stringify(task.packet)
  ]);
});

test("PostgresStore lock methods persist and release active locks", async () => {
  const lock = createLockRecord();
  const capture: QueryCapture[] = [];
  const releasedLock: LockRecord = {
    ...lock,
    releasedAt: "2026-05-05T01:00:00.000Z"
  };
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [],
        [{ payload: releasedLock }]
      ],
      capture
    )
  );

  await store.createLock(lock);
  await store.releaseLocksForTask("run-1", "task-1", "2026-05-05T01:00:00.000Z");
  const locks = await store.getActiveLocks(lock.projectId);

  assert.match(capture[0]?.text ?? "", /insert into locks/);
  assert.deepEqual(capture[0]?.values, [
    "lock-1",
    "workspace:team",
    "project:team:devgod",
    "run-1",
    "task-1",
    ["src/core/service.ts"],
    "active"
  ]);
  assert.match(capture[1]?.text ?? "", /set status = 'released'/);
  assert.deepEqual(capture[1]?.values, ["run-1", "task-1", "2026-05-05T01:00:00.000Z"]);
  assert.deepEqual(locks, [releasedLock]);
});

test("PostgresStore.saveMemoryEntry serializes metadata and optional fields", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));
  const entry = createMemoryEntryRecord();

  await store.saveMemoryEntry(entry);

  assert.match(capture[0]?.text ?? "", /insert into memory_entries/);
  assert.deepEqual(capture[0]?.values, [
    "memory-1",
    "workspace:team",
    "project:team:devgod",
    "run-1",
    "task-1",
    "project",
    "decision",
    "Decision log",
    "Use the contract-first path.",
    "reviewer-1",
    "memory_curator",
    "approved",
    ".devgod/memory/decision-log.md",
    "decision-log",
    JSON.stringify(entry.metadata)
  ]);
});

test("PostgresStore.replaceMarkdownArtifacts replaces stale rows inside a transaction", async () => {
  const capture: QueryCapture[] = [];
  const artifact = createMarkdownArtifactRecord();
  const store = new PostgresStore(sqlClientWithRows([[], [], [], [], []], capture));

  await store.replaceMarkdownArtifacts({
    workspaceId: artifact.workspaceId,
    projectId: artifact.projectId,
    runId: artifact.runId,
    artifacts: [artifact]
  });

  assert.equal(capture[0]?.text, "begin");
  assert.match(capture[1]?.text ?? "", /delete from embedding_jobs/);
  assert.deepEqual(capture[1]?.values, ["project:team:devgod"]);
  assert.match(capture[2]?.text ?? "", /delete from artifacts/);
  assert.deepEqual(capture[2]?.values, ["project:team:devgod"]);
  assert.match(capture[3]?.text ?? "", /insert into artifacts/);
  assert.deepEqual(capture[3]?.values, [
    "artifact-1",
    "workspace:team",
    "project:team:devgod",
    "run-1",
    "Runbook",
    JSON.stringify({ text: "Rollback steps" }),
    JSON.stringify({
      retrievalRoles: ["reviewer"],
      chunkIndex: 0,
      sourcePath: "docs/runbook.md",
      sourceAnchor: "runbook"
    })
  ]);
  assert.equal(capture[4]?.text, "commit");
});

test("PostgresStore.replaceMarkdownArtifacts rolls back when artifact persistence fails", async () => {
  const capture: QueryCapture[] = [];
  const artifact = createMarkdownArtifactRecord();
  const client: SqlClient = {
    async query<Row>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>> {
      capture.push({ text, values });
      if (text.includes("insert into artifacts")) {
        throw new Error("insert failed");
      }
      return {
        rows: [],
        rowCount: 0
      };
    }
  };
  const store = new PostgresStore(client);

  await assert.rejects(
    store.replaceMarkdownArtifacts({
      workspaceId: artifact.workspaceId,
      projectId: artifact.projectId,
      runId: artifact.runId,
      artifacts: [artifact]
    }),
    /insert failed/
  );

  assert.equal(capture[0]?.text, "begin");
  assert.equal(capture[capture.length - 1]?.text, "rollback");
});

test("PostgresStore.replaceMarkdownArtifacts does not clear Qdrant when the transaction rolls back", async () => {
  const capture: QueryCapture[] = [];
  const qdrantCalls: Array<{ projectId: string; collection: string }> = [];
  const artifact = createMarkdownArtifactRecord();
  const client: SqlClient = {
    async query<Row>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>> {
      capture.push({ text, values });
      if (text.includes("insert into artifacts")) {
        throw new Error("insert failed");
      }
      return {
        rows: [],
        rowCount: 0
      };
    }
  };
  const store = new PostgresStore(client, {
    artifactVectorIndex: {
      async upsertArtifactPoint() {
        assert.fail("replaceMarkdownArtifacts should not upsert vectors");
      },
      async deleteProjectArtifacts(input) {
        qdrantCalls.push({
          projectId: input.projectId,
          collection: input.collection
        });
      },
      async queryArtifactMatches() {
        return [];
      }
    }
  });

  await assert.rejects(
    store.replaceMarkdownArtifacts({
      workspaceId: artifact.workspaceId,
      projectId: artifact.projectId,
      runId: artifact.runId,
      artifacts: [artifact]
    }),
    /insert failed/
  );

  assert.deepEqual(qdrantCalls, []);
  assert.equal(capture[0]?.text, "begin");
  assert.equal(capture[capture.length - 1]?.text, "rollback");
});

test("PostgresStore.replaceMarkdownArtifacts clears configured project vectors from Qdrant", async () => {
  const capture: QueryCapture[] = [];
  const qdrantCalls: Array<{ projectId: string; collection: string }> = [];
  const artifact = createMarkdownArtifactRecord();
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [],
        [],
        [],
        [
          {
            runtimeProfile: "local-native",
            qdrantUrl: "http://127.0.0.1:6333",
            qdrantCollection: "devgod-memory"
          }
        ]
      ],
      capture
    ),
    {
      artifactVectorIndex: {
        async upsertArtifactPoint() {
          assert.fail("replaceMarkdownArtifacts should not upsert vectors");
        },
        async deleteProjectArtifacts(input) {
          qdrantCalls.push({
            projectId: input.projectId,
            collection: input.collection
          });
        },
        async queryArtifactMatches() {
          return [];
        }
      }
    }
  );

  await store.replaceMarkdownArtifacts({
    workspaceId: artifact.workspaceId,
    projectId: artifact.projectId,
    runId: artifact.runId,
    artifacts: [artifact]
  });

  assert.deepEqual(qdrantCalls, [
    {
      projectId: "project:team:devgod",
      collection: "devgod-memory"
    }
  ]);
  assert.equal(capture[0]?.text, "begin");
  assert.equal(capture[4]?.text, "commit");
  assert.match(capture[5]?.text ?? "", /from runtime_project_registrations/);
});

test("PostgresStore.saveReview persists actor provenance and waiver authority", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.saveReview({
    id: "review-1",
    runId: "run-1",
    taskId: "task-1",
    reviewerRole: "qa_engineer",
    actor: "planner-1",
    actorRole: "planner",
    identityAssurance: "authenticated",
    state: "waived",
    severity: "low",
    findings: ["waiver recorded"],
    waiverReason: "managed exception",
    waiverAuthority: "manager",
    createdAt: "2026-05-05T00:00:00.000Z"
  });

  assert.match(capture[0]?.text ?? "", /actor_role/);
  assert.deepEqual(capture[0]?.values?.slice(3), [
    "qa_engineer",
    "planner-1",
    "planner",
    "authenticated",
    "waived",
    "low",
    ["waiver recorded"],
    "managed exception",
    "manager"
  ]);
});

test("PostgresStore.saveApproval persists actor role", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.saveApproval({
    id: "approval-1",
    runId: "run-1",
    taskId: "task-1",
    actor: "planner-1",
    actorRole: "planner",
    identityAssurance: "authenticated",
    decision: "approved",
    rationale: "All required reviews passed",
    createdAt: "2026-05-05T00:00:00.000Z"
  });

  assert.match(capture[0]?.text ?? "", /actor_role/);
  assert.deepEqual(capture[0]?.values?.slice(3), [
    "planner-1",
    "planner",
    "authenticated",
    "approved",
    "All required reviews passed"
  ]);
});

test("PostgresStore.saveHandoff persists specialist execution evidence", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.saveHandoff({
    id: "handoff-1",
    runId: "run-1",
    taskId: "task-1",
    actor: "backend-1",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    summary: "Implemented the runtime change",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["backend engineer handoff with owned scope"],
    qualityGateEvidence: ["product acceptance and TDD evidence captured"],
    contextRefs: [".devgod/work/tasks/task-1.md"],
    createdAt: "2026-05-05T00:00:00.000Z"
  });

  assert.match(capture[0]?.text ?? "", /owner_role/);
  assert.match(capture[0]?.text ?? "", /execution_evidence/);
  assert.match(capture[0]?.text ?? "", /quality_gate_evidence/);
  assert.deepEqual(capture[0]?.values?.slice(3), [
    "backend-1",
    "backend_engineer",
    "specialist_verified",
    "Implemented the runtime change",
    ["src/core/service.ts"],
    [],
    ["npm test"],
    ["backend engineer handoff with owned scope"],
    ["product acceptance and TDD evidence captured"],
    [".devgod/work/tasks/task-1.md"]
  ]);
});

test("PostgresStore.getHandoffs returns specialist execution evidence", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      [
        {
          payload: {
            id: "handoff-1",
            runId: "run-1",
            taskId: "task-1",
            actor: "backend-1",
            ownerRole: "backend_engineer",
            completionStandard: "specialist_verified",
            summary: "Implemented the runtime change",
            changedFiles: ["src/core/service.ts"],
            blockers: [],
            verificationNotes: ["npm test"],
            executionEvidence: ["backend engineer handoff with owned scope"],
            qualityGateEvidence: ["product acceptance and TDD evidence captured"],
            contextRefs: [".devgod/work/tasks/task-1.md"],
            createdAt: "2026-05-05T00:00:00.000Z"
          }
        }
      ]
    ])
  );

  const handoffs = await store.getHandoffs("run-1", "task-1");

  assert.deepEqual(handoffs, [
    {
      id: "handoff-1",
      runId: "run-1",
      taskId: "task-1",
      actor: "backend-1",
      ownerRole: "backend_engineer",
      completionStandard: "specialist_verified",
      summary: "Implemented the runtime change",
      changedFiles: ["src/core/service.ts"],
      blockers: [],
      verificationNotes: ["npm test"],
      executionEvidence: ["backend engineer handoff with owned scope"],
      qualityGateEvidence: ["product acceptance and TDD evidence captured"],
      contextRefs: [".devgod/work/tasks/task-1.md"],
      createdAt: "2026-05-05T00:00:00.000Z"
    }
  ]);
});

test("PostgresStore.getReviews scopes reads by run and task", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.getReviews("run-1", "task-1");

  assert.match(capture[0]?.text ?? "", /where run_id = \$1/);
  assert.match(capture[0]?.text ?? "", /and task_id = \$2/);
  assert.deepEqual(capture[0]?.values, ["run-1", "task-1"]);
});

test("PostgresStore.getApprovals scopes reads by run and task", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(sqlClientWithRows([], capture));

  await store.getApprovals("run-1", "task-1");

  assert.match(capture[0]?.text ?? "", /where run_id = \$1/);
  assert.match(capture[0]?.text ?? "", /and task_id = \$2/);
  assert.deepEqual(capture[0]?.values, ["run-1", "task-1"]);
});

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
        sourcePath: null,
        sourceAnchor: null,
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
        sourcePath: ".devgod/memory/decision-log.md",
        sourceAnchor: "incident-playbook",
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
  assert.equal(results[0]?.citation.sourcePath, ".devgod/memory/decision-log.md");
  assert.equal(results[0]?.citation.sourceAnchor, "incident-playbook");
  assert.equal(results[0]?.citation.canonicalRef, ".devgod/memory/decision-log.md#incident-playbook");
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
  assert.equal(result?.citation.sourcePath, undefined);
  assert.equal(result?.citation.sourceAnchor, undefined);
  assert.equal(result?.citation.canonicalRef, `memory://entry/${result?.citation.memoryId}`);
  assert.equal(result?.citation.runId, undefined);
  assert.equal(result?.citation.taskId, undefined);
  assert.equal(result?.provenance.actor, undefined);
  assert.equal(result?.provenance.reviewer, undefined);
  assert.equal(result?.provenance.runId, undefined);
  assert.equal(result?.provenance.taskId, undefined);
});

test("PostgresStore.searchMemory keeps a source path canonical ref when no anchor exists", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      [
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
          sourcePath: ".devgod/memory/decision-log.md",
          sourceAnchor: null,
          projectId: "project:team:devgod",
          createdAt: "2026-05-03T00:00:00.000Z"
        }
      ],
      []
    ])
  );

  const [result] = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook",
    limit: 5,
    includeGlobal: false
  });

  assert.equal(result?.citation.sourcePath, ".devgod/memory/decision-log.md");
  assert.equal(result?.citation.sourceAnchor, undefined);
  assert.equal(result?.citation.canonicalRef, ".devgod/memory/decision-log.md");
});

test("PostgresStore.searchMemory filters restricted rows by requesterRole", async () => {
  const rows = [
    [
      {
        id: "project-1",
        title: "Security-only note",
        content: "incident response details",
        scope: "project",
        metadata: {
          retrievalRoles: ["security_reviewer"],
          tags: ["incident"]
        },
        entryType: "pattern",
        actor: "memory_curator",
        reviewer: "memory_curator",
        runId: "run-project",
        taskId: null,
        sourcePath: ".devgod/memory/security.md",
        sourceAnchor: null,
        projectId: "project:team:devgod",
        createdAt: "2026-05-03T00:00:00.000Z"
      }
    ],
    [],
    [],
    []
  ];

  const plannerStore = new PostgresStore(sqlClientWithRows(rows));
  const plannerResults = await plannerStore.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident response details",
    limit: 5,
    includeGlobal: false
  });
  assert.equal(plannerResults.length, 0);

  const securityStore = new PostgresStore(sqlClientWithRows(rows));
  const securityResults = await securityStore.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident response details",
    limit: 5,
    includeGlobal: false,
    requesterRole: "security_reviewer"
  });

  assert.equal(securityResults[0]?.title, "Security-only note");
  assert.deepEqual(securityResults[0]?.metadata.allowedRoles, ["security_reviewer"]);
  assert.deepEqual(securityResults[0]?.metadata.tags, ["incident"]);
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

  assert.equal(capture.length, 4);
  assert.match(capture[0]?.text ?? "", /with project_context as/);
  assert.match(capture[0]?.text ?? "", /where w\.slug = \$1 and p\.slug = \$2/);
  assert.match(capture[0]?.text ?? "", /join project_context pc on true/);
  assert.match(capture[0]?.text ?? "", /\$3::boolean and m\.scope = 'global'/);
  assert.match(capture[0]?.text ?? "", /limit \$4/);
  assert.deepEqual(capture[0]?.values, ["team", "devgod", false, 25]);
  assert.match(capture[1]?.text ?? "", /ilike/);
  assert.match(capture[1]?.text ?? "", /limit \$7/);
  assert.deepEqual(capture[1]?.values, ["team", "devgod", false, "%shared orchestration%", "%shared%", "%orchestration%", 15]);
  assert.match(capture[2]?.text ?? "", /from artifacts a/);
  assert.match(capture[2]?.text ?? "", /where a\.kind = 'markdown_chunk'/);
  assert.deepEqual(capture[2]?.values, ["team", "devgod", 25]);
  assert.match(capture[3]?.text ?? "", /coalesce\(a\.content->>'text', a\.content::text\) ilike/);
  assert.deepEqual(capture[3]?.values, ["team", "devgod", "%shared orchestration%", "%shared%", "%orchestration%", 15]);
});

test("PostgresStore.searchMemory issues a vector query when query embeddings are supplied", async () => {
  const capture: QueryCapture[] = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [],
        [
          {
            id: "vector-best",
            title: "Shared retrieval note",
            content: "candidate alpha",
            scope: "project",
            entryType: "pattern",
            actor: "memory_curator",
            reviewer: "memory_curator",
            runId: "run-vector",
            taskId: null,
            sourcePath: null,
            sourceAnchor: null,
            projectId: "project:team:devgod",
            createdAt: "2026-05-03T00:00:00.000Z",
            vectorScore: 0.95
          }
        ]
      ],
      capture
    )
  );

  const [result] = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "shared retrieval",
    limit: 5,
    includeGlobal: false,
    queryEmbedding: [0.1, 0.2],
    embeddingModel: "text-embedding-3-small"
  });

  assert.equal(result?.id, "vector-best");
  assert.equal(capture.length, 6);
  assert.match(capture[2]?.text ?? "", /m\.embedding <=> \$4::vector/);
  assert.match(capture[2]?.text ?? "", /m\.embedding_model = \$5/);
  assert.deepEqual(capture[2]?.values, [
    "team",
    "devgod",
    false,
    "[0.1,0.2]",
    "text-embedding-3-small",
    15
  ]);
  assert.match(capture[5]?.text ?? "", /a\.embedding <=> \$3::vector/);
  assert.match(capture[5]?.text ?? "", /a\.embedding_model = \$4/);
  assert.deepEqual(capture[5]?.values, ["team", "devgod", "[0.1,0.2]", "text-embedding-3-small", 15]);
});

test("PostgresStore.searchMemory augments artifact vector retrieval with configured Qdrant matches", async () => {
  const capture: QueryCapture[] = [];
  const qdrantQueries: Array<{ projectId: string; collection: string; limit: number }> = [];
  const store = new PostgresStore(
    sqlClientWithRows(
      [
        [],
        [],
        [],
        [],
        [],
        [],
        [
          {
            runtimeProfile: "local-native",
            qdrantUrl: "http://127.0.0.1:6333",
            qdrantCollection: "devgod-memory"
          }
        ],
        [
          {
            id: "artifact-1",
            runId: "run-1",
            kind: "markdown_chunk",
            title: "Qdrant Runbook",
            content: "Skill context retrieval lives in Qdrant.",
            sourcePath: ".agents/skills/devgod-test/SKILL.md",
            sourceAnchor: "devgod-test-skill",
            metadata: {
              retrievalRoles: ["planner"],
              tags: ["repo_markdown", "skills"]
            },
            createdAt: "2026-05-11T00:00:00.000Z"
          }
        ]
      ],
      capture
    ),
    {
      artifactVectorIndex: {
        async upsertArtifactPoint() {
          assert.fail("searchMemory should not upsert vectors");
        },
        async deleteProjectArtifacts() {
          assert.fail("searchMemory should not clear vectors");
        },
        async queryArtifactMatches(input) {
          qdrantQueries.push({
            projectId: input.projectId,
            collection: input.collection,
            limit: input.limit
          });
          return [{ id: "artifact-1", score: 0.99 }];
        }
      }
    }
  );

  const [result] = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "skill context retrieval",
    limit: 5,
    includeGlobal: false,
    queryEmbedding: [0.1, 0.2],
    embeddingModel: "text-embedding-3-small",
    requesterRole: "planner"
  });

  assert.equal(result?.id, "artifact-1");
  assert.equal(result?.authority.source, "repo_artifact");
  assert.equal(result?.citation.sourcePath, ".agents/skills/devgod-test/SKILL.md");
  assert.deepEqual(qdrantQueries, [
    {
      projectId: "project:team:devgod",
      collection: "devgod-memory",
      limit: 15
    }
  ]);
  assert.match(capture[6]?.text ?? "", /from runtime_project_registrations/);
  assert.match(capture[7]?.text ?? "", /from artifacts a/);
  assert.match(capture[7]?.text ?? "", /a\.id::text = any\(\$2::text\[\]\)/);
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

test("PostgresStore.getEmbeddingSource delegates memory and artifact lookups", async () => {
  const store = new PostgresStore(
    sqlClientWithRows([
      [
        {
          sourceTable: "memory_entries",
          sourceId: "memory-1",
          title: "Memory title",
          content: "Memory content"
        }
      ],
      [
        {
          sourceTable: "artifacts",
          sourceId: "artifact-1",
          title: "Artifact title",
          content: "Artifact content"
        }
      ]
    ])
  );

  const memorySource = await store.getEmbeddingSource("memory_entries", "memory-1");
  const artifactSource = await store.getEmbeddingSource("artifacts", "artifact-1");

  assert.deepEqual(memorySource, {
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    title: "Memory title",
    content: "Memory content"
  });
  assert.deepEqual(artifactSource, {
    sourceTable: "artifacts",
    sourceId: "artifact-1",
    title: "Artifact title",
    content: "Artifact content"
  });
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

  assert.equal(capture.length, 5);
  assert.equal(capture[0]?.text, "begin");
  assert.match(capture[1]?.text ?? "", /from embedding_jobs/);
  assert.match(capture[2]?.text ?? "", /update memory_entries/);
  assert.match(capture[2]?.text ?? "", /embedding = \$2::vector/);
  assert.deepEqual(capture[2]?.values, ["memory-1", "[0.1,0.2,0.3]", "text-embedding-3-small"]);
  assert.match(capture[3]?.text ?? "", /update embedding_jobs/);
  assert.match(capture[3]?.text ?? "", /status = 'done'/);
  assert.match(capture[3]?.text ?? "", /status = 'processing'/);
  assert.deepEqual(capture[3]?.values, ["job-1", "memory_entries", "memory-1", "text-embedding-3-small"]);
  assert.equal(capture[4]?.text, "commit");
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

  assert.equal(capture.length, 5);
  assert.equal(capture[0]?.text, "begin");
  assert.match(capture[1]?.text ?? "", /from embedding_jobs/);
  assert.match(capture[2]?.text ?? "", /update artifacts/);
  assert.match(capture[2]?.text ?? "", /embedding = \$2::vector/);
  assert.deepEqual(capture[2]?.values, ["artifact-1", "[0.4,0.5]", "text-embedding-3-small"]);
  assert.match(capture[3]?.text ?? "", /update embedding_jobs/);
  assert.deepEqual(capture[3]?.values, ["job-artifact", "artifacts", "artifact-1", "text-embedding-3-small"]);
  assert.equal(capture[4]?.text, "commit");
});

test("PostgresStore.completeEmbeddingJob syncs artifact vectors to the configured Qdrant index", async () => {
  const capture: QueryCapture[] = [];
  const qdrantCalls: Array<{ id: string; collection: string; vector: readonly number[] }> = [];
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
            status: "processing",
            errorMessage: null,
            createdAt: "2026-05-03T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ],
        [{}],
        [
          {
            id: "artifact-1",
            workspaceId: "workspace:team",
            projectId: "project:team:devgod",
            title: "Runbook",
            content: "Rollback steps",
            sourcePath: "docs/runbook.md",
            sourceAnchor: "runbook",
            retrievalRoles: ["reviewer"],
            tags: ["repo_markdown"],
            runtimeProfile: "local-native",
            qdrantUrl: "http://127.0.0.1:6333",
            qdrantCollection: "devgod-memory"
          }
        ],
        [{}],
        []
      ],
      capture
    ),
    {
      artifactVectorIndex: {
        async upsertArtifactPoint(input) {
          qdrantCalls.push({
            id: input.point.id,
            collection: input.collection,
            vector: input.point.vector
          });
        },
        async deleteProjectArtifacts() {
          assert.fail("completeEmbeddingJob should not clear the whole collection");
        },
        async queryArtifactMatches() {
          return [];
        }
      }
    }
  );

  await store.completeEmbeddingJob({
    jobId: "job-artifact",
    sourceTable: "artifacts",
    sourceId: "artifact-1",
    embeddingModel: "text-embedding-3-small",
    embedding: [0.4, 0.5]
  });

  assert.deepEqual(qdrantCalls, [
    {
      id: "artifact-1",
      collection: "devgod-memory",
      vector: [0.4, 0.5]
    }
  ]);
  assert.match(capture[1]?.text ?? "", /from embedding_jobs/);
  assert.match(capture[2]?.text ?? "", /update artifacts/);
  assert.match(capture[3]?.text ?? "", /from artifacts a/);
  assert.match(capture[4]?.text ?? "", /update embedding_jobs/);
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
