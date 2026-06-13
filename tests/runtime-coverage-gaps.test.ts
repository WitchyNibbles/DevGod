import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  LockRecord,
  MarkdownArtifactRecord,
  MemoryEntryRecord,
  PlanArtifact,
  RunRecord,
  RuntimeProjectRegistrationRecord,
  TaskRecord,
  WorkflowDocumentRecord
} from "../src/domain/types.ts";
import type { CompleteEmbeddingJobInput, EmbeddingJobRecord, EmbeddingSourceRecord } from "../src/store/types.ts";
import { embedQueryText, runEmbeddingJobs } from "../src/index.ts";
import {
  resolveRuntimeEnvironmentConfig,
  runtimeModeFromProfile,
  runtimeProfileForMode
} from "../src/runtime/config.ts";
import { createHashEmbeddingProvider, hashTextToEmbedding } from "../src/runtime/hash-embedding-provider.ts";
import { captureRepoMarkdownSnapshot } from "../src/runtime/repo-markdown-indexer.ts";
import { inspectRepoContextFreshness, probeRepoContextProfile } from "../src/runtime/repo-context-profile.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { PostgresEmbeddingJobs } from "../src/store/postgres-embedding-jobs.ts";
import { searchMemory as searchPostgresMemory } from "../src/store/postgres-memory-search.ts";

const WORKSPACE_ID = "workspace:team";
const PROJECT_ID = "project:team:devgod";
const BASE_TIME = "2026-06-13T12:00:00.000Z";

function createRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
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
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides
  };
}

function createPlan(overrides: Partial<PlanArtifact> = {}): PlanArtifact {
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
    createdAt: BASE_TIME,
    ...overrides
  };
}

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-record-1",
    runId: "run-1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
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
      dependencies: [],
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
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides
  };
}

function createLock(overrides: Partial<LockRecord> = {}): LockRecord {
  return {
    id: "lock-1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: "run-1",
    taskId: "task-1",
    scopePaths: ["src/core/service.ts"],
    status: "active",
    createdAt: BASE_TIME,
    ...overrides
  };
}

function createMemoryEntry(overrides: Partial<MemoryEntryRecord> = {}): MemoryEntryRecord {
  return {
    id: "memory-1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: "run-1",
    taskId: "task-1",
    scope: "project",
    entryType: "decision",
    title: "Rollback plan",
    content: "Use the contract-first path.",
    reviewer: "reviewer-1",
    actor: "memory_curator",
    status: "approved",
    metadata: {},
    createdAt: BASE_TIME,
    ...overrides
  };
}

function createWorkflowDocument(overrides: Partial<WorkflowDocumentRecord> = {}): WorkflowDocumentRecord {
  return {
    id: "workflow-1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: "run-1",
    taskId: "task-1",
    kind: "brief",
    title: "Rollback brief",
    body: "Capture rollback approvals before release.",
    metadata: {},
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides
  };
}

function createRegistration(overrides: Partial<RuntimeProjectRegistrationRecord> = {}): RuntimeProjectRegistrationRecord {
  return {
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    repoPath: "/repo/devgod",
    runtimeProfile: "local-docker",
    dataRoot: "/tmp/devgod",
    installManifestPath: ".devgod/install-manifest.json",
    manifest: {},
    provenance: { authority: "runtime_authoritative" },
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides
  };
}

async function withTempDir<T>(prefix: string, work: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("runtime config resolves explicit paths and rejects invalid profiles", () => {
  const config = resolveRuntimeEnvironmentConfig(
    {
      DEVGOD_RUNTIME_MODE: " managed ",
      DEVGOD_RUNTIME_DATA_ROOT: "runtime/data",
      DEVGOD_INSTALL_MANIFEST_PATH: "config/install.json"
    },
    {
      projectSlug: "devgod",
      cwd: "/repo/devgod"
    }
  );

  assert.equal(config.runtimeMode, "managed");
  assert.equal(config.runtimeProfile, "managed");
  assert.equal(config.dataRoot, "/repo/devgod/runtime/data");
  assert.equal(config.installManifestPath, "config/install.json");
  assert.equal(runtimeProfileForMode("native"), "local-native");
  assert.equal(runtimeModeFromProfile("local"), "docker");
  assert.equal(runtimeModeFromProfile("managed-preview"), "managed");
  assert.throws(() => runtimeModeFromProfile("unknown-profile"), /invalid runtime profile/);
  assert.throws(
    () =>
      resolveRuntimeEnvironmentConfig(
        { DEVGOD_RUNTIME_MODE: "mystery" },
        { projectSlug: "devgod", cwd: "/repo/devgod" }
      ),
    /invalid runtime mode/
  );
});

test("embedQueryText prefers query-specific embeddings and falls back to general embeddings", async () => {
  let embedCalls = 0;
  let embedQueryCalls = 0;
  const queryEmbedding = await embedQueryText({
    provider: {
      async embed() {
        embedCalls += 1;
        assert.fail("embed should not run when embedQuery is implemented");
      },
      async embedQuery(input) {
        embedQueryCalls += 1;
        assert.equal(input.model, "custom-model");
        assert.equal(input.text, "rollback");
        return [0.25, 0.75];
      }
    },
    model: "custom-model",
    text: "rollback"
  });

  assert.deepEqual(queryEmbedding, [0.25, 0.75]);
  assert.equal(embedQueryCalls, 1);
  assert.equal(embedCalls, 0);

  const fallbackTexts: string[] = [];
  const fallbackEmbedding = await embedQueryText({
    provider: {
      async embed(input) {
        fallbackTexts.push(input.text);
        return [0.1];
      }
    },
    model: "fallback-model",
    text: "release checklist"
  });

  assert.deepEqual(fallbackEmbedding, [0.1]);
  assert.deepEqual(fallbackTexts, ["release checklist"]);
});

test("runEmbeddingJobs rejects invalid vectors", async () => {
  const store = new MemoryStore();
  await store.saveMemoryEntry(
    createMemoryEntry({
      id: "memory-invalid-vector",
      title: "Runbook",
      content: "rollback checklist"
    })
  );
  await store.queueEmbeddingJob({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    sourceTable: "memory_entries",
    sourceId: "memory-invalid-vector",
    embeddingModel: "text-embedding-3-small"
  });

  const result = await runEmbeddingJobs({
    store,
    limit: 5,
    provider: {
      async embed() {
        return [Number.NaN];
      }
    }
  });

  assert.deepEqual(result, {
    leased: 1,
    completed: 0,
    failed: 1
  });
});

test("runEmbeddingJobs sanitizes provider failures before reporting them", async () => {
  const job: EmbeddingJobRecord = {
    id: "embedding-job:memory_entries:memory-secret:text-embedding-3-small",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    sourceTable: "memory_entries",
    sourceId: "memory-secret",
    embeddingModel: "text-embedding-3-small",
    status: "processing",
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  };
  const source: EmbeddingSourceRecord = {
    sourceTable: "memory_entries",
    sourceId: "memory-secret",
    title: "Release runbook",
    content: "api_key=visible-value postgres://db-user:db-pass@example.com/devgod"
  };
  const completedJobs: CompleteEmbeddingJobInput[] = [];
  const failedJobs: Array<{ jobId: string; errorMessage: string }> = [];

  const result = await runEmbeddingJobs({
    limit: 1,
    store: {
      async leaseEmbeddingJobs(input) {
        assert.equal(input.limit, 1);
        return [job];
      },
      async getEmbeddingSource(sourceTable, sourceId) {
        assert.equal(sourceTable, job.sourceTable);
        assert.equal(sourceId, job.sourceId);
        return source;
      },
      async completeEmbeddingJob(input) {
        completedJobs.push(input);
      },
      async failEmbeddingJob(jobId, errorMessage) {
        failedJobs.push({ jobId, errorMessage });
      }
    },
    provider: {
      async embed(input) {
        assert.equal(
          input.text,
          "Release runbook\n\napi_key=visible-value postgres://db-user:db-pass@example.com/devgod"
        );
        throw new Error(
          [
            "Bearer super-secret-token",
            "sk-secret-token-12345",
            "postgres://db-user:db-pass@example.com/devgod",
            "api_key=visible-value",
            "AKIAABCDEFGHIJKLMNOP",
            "ghp_abcdefghijklmnopqrstuvwxyz0123456789"
          ].join(" ")
        );
      }
    }
  });

  assert.deepEqual(result, {
    leased: 1,
    completed: 0,
    failed: 1
  });
  assert.deepEqual(completedJobs, []);
  assert.deepEqual(failedJobs, [
    {
      jobId: job.id,
      errorMessage:
        "Bearer [REDACTED] sk-[REDACTED] postgres://[REDACTED]@example.com/devgod [REDACTED_SECRET] [REDACTED_AWS_KEY] ghp_[REDACTED]"
    }
  ]);
});

test("hash embedding provider normalizes output and honors dimension rules", async () => {
  const emptyVector = hashTextToEmbedding("   ", { dimensions: 4 });
  assert.deepEqual(emptyVector, [0, 0, 0, 0]);

  const deterministicVector = hashTextToEmbedding("rollback rollback", { dimensions: 8 });
  const magnitude = Math.sqrt(deterministicVector.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(magnitude - 1) < 1e-9);

  const provider = createHashEmbeddingProvider({
    dimensions: 8,
    model: "local-hash-8"
  });
  const smallVector = await provider.embedQuery!({
    model: "local-hash-8",
    text: "rollback checklist"
  });
  const largeVector = await provider.embedQuery!({
    model: "foreign-model-1536",
    text: "rollback checklist"
  });

  assert.equal(smallVector.length, 8);
  assert.equal(largeVector.length, 1536);
  assert.throws(() => createHashEmbeddingProvider({ dimensions: -1 }), /invalid embedding dimensions/);
});

test("probeRepoContextProfile handles degraded and nested Python repo layouts", async () => {
  await withTempDir("devgod-repo-context-empty-", async (directory) => {
    const emptyProfile = await probeRepoContextProfile({ repoRoot: directory, now: BASE_TIME });
    assert.equal(emptyProfile.status, "degraded");
    assert.deepEqual(emptyProfile.slots, {});
  });

  await withTempDir("devgod-repo-context-nested-", async (directory) => {
    await mkdir(path.join(directory, "apps", "web"), { recursive: true });
    await mkdir(path.join(directory, "env"), { recursive: true });
    await writeFile(path.join(directory, "env", "pyvenv.cfg"), "home = /usr/bin/python3\n", "utf8");
    await writeFile(path.join(directory, "apps", "web", "manage.py"), "print('manage')\n", "utf8");
    await writeFile(
      path.join(directory, "apps", "web", "settings.py"),
      [
        "import os",
        "DB_ENV = os.environ.get('DB_TARGET')",
        "print(DB_ENV)"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify(
        {
          scripts: {
            test: "npm test",
            typecheck: "tsc --noEmit"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const profile = await probeRepoContextProfile({ repoRoot: directory, now: BASE_TIME });
    assert.equal(profile.status, "ready");
    assert.equal(profile.slots["python.virtualenvPath"]?.value, "env");
    assert.equal(profile.slots["django.managePyPath"]?.value, "apps/web/manage.py");
    assert.equal(profile.slots["django.dbEnvSelectorVariable"]?.value, "DB_TARGET");
    assert.equal(profile.slots["django.dbEnvSelectorVariable"]?.confidence, "medium");
    assert.equal(profile.slots["commands.typecheck"]?.value, "tsc --noEmit");
  });
});

test("inspectRepoContextFreshness reports missing and degraded registration states", async () => {
  const store = new MemoryStore();

  const missingContext = await inspectRepoContextFreshness({
    store,
    env: {}
  });
  assert.equal(missingContext.state, "degraded");

  await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });

  const missingRegistration = await inspectRepoContextFreshness({
    store,
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    }
  });
  assert.equal(missingRegistration.state, "missing");

  await store.saveProjectRuntimeRegistration(
    createRegistration({
      manifest: {}
    })
  );

  const missingProfile = await inspectRepoContextFreshness({
    store,
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    }
  });
  assert.equal(missingProfile.state, "missing");

  await store.saveProjectRuntimeRegistration(
    createRegistration({
      repoPath: "/definitely/missing/repo",
      manifest: {
        repoContextProfile: {
          status: "ready",
          repoRoot: "/definitely/missing/repo",
          fingerprint: "stale",
          refreshedAt: BASE_TIME,
          slots: {
            "commands.test": {
              slotKey: "commands.test",
              title: "Test command",
              value: "npm test",
              sourceKind: "derived_manifest",
              sourceRefs: ["package.json"],
              capturedAt: BASE_TIME,
              lastValidatedAt: BASE_TIME,
              staleAfterDays: 30,
              confidence: "high"
            }
          }
        }
      }
    })
  );

  const degraded = await inspectRepoContextFreshness({
    store,
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    }
  });
  assert.equal(degraded.state, "degraded");
  assert.match(degraded.summary, /freshness check failed/);
  assert.equal(degraded.items[0]?.freshness, "stale");
});

test("inspectRepoContextFreshness distinguishes fresh and stale repo snapshots", async () => {
  await withTempDir("devgod-freshness-", async (directory) => {
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } }, null, 2),
      "utf8"
    );

    const profile = await probeRepoContextProfile({ repoRoot: directory, now: BASE_TIME });
    const store = new MemoryStore();
    await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await store.saveProjectRuntimeRegistration(
      createRegistration({
        repoPath: directory,
        manifest: { repoContextProfile: profile }
      })
    );

    const fresh = await inspectRepoContextFreshness({
      cwd: directory,
      store,
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      now: () => new Date(BASE_TIME)
    });
    assert.equal(fresh.state, "fresh");

    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({ scripts: { test: "vitest", lint: "eslint ." } }, null, 2),
      "utf8"
    );

    const stale = await inspectRepoContextFreshness({
      cwd: directory,
      store,
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      now: () => new Date(BASE_TIME)
    });
    assert.equal(stale.state, "stale");
    assert.ok(stale.items.length > 0);
  });
});

test("captureRepoMarkdownSnapshot rejects includes outside the repo root", async () => {
  await withTempDir("devgod-markdown-escape-", async (directory) => {
    await assert.rejects(
      () =>
        captureRepoMarkdownSnapshot({
          repoRoot: directory,
          include: ["../outside.md"]
        }),
      /include path must stay within the repository root/
    );
  });
});

test("captureRepoMarkdownSnapshot refuses markdown symlinks that escape the repo", async () => {
  await withTempDir("devgod-markdown-symlink-", async (directory) => {
    const externalDirectory = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-external-"));
    try {
      const externalMarkdown = path.join(externalDirectory, "outside.md");
      await writeFile(externalMarkdown, "# Outside\n\nDo not index me.\n", "utf8");
      await symlink(externalMarkdown, path.join(directory, "linked.md"));

      await assert.rejects(
        () =>
          captureRepoMarkdownSnapshot({
            repoRoot: directory,
            include: ["linked.md"]
          }),
        /refusing to read markdown outside the repository root/
      );
    } finally {
      await rm(externalDirectory, { recursive: true, force: true });
    }
  });
});

test("captureRepoMarkdownSnapshot fingerprints default markdown content deterministically", async () => {
  await withTempDir("devgod-markdown-snapshot-", async (directory) => {
    await mkdir(path.join(directory, "docs"), { recursive: true });
    await mkdir(path.join(directory, ".agents", "skills", "retrieval"), { recursive: true });
    await writeFile(path.join(directory, "README.md"), "# Devgod\n\nRollback guidance.\n", "utf8");
    await writeFile(path.join(directory, "AGENTS.md"), "# Agents\n\nManager notes.\n", "utf8");
    await writeFile(path.join(directory, "docs", "runbook.md"), "# Runbook\n\nEscalate incidents.\n", "utf8");
    await writeFile(
      path.join(directory, ".agents", "skills", "retrieval", "SKILL.md"),
      "# Retrieval\n\nPrefer repo markdown first.\n",
      "utf8"
    );

    const first = await captureRepoMarkdownSnapshot({ repoRoot: directory });
    const second = await captureRepoMarkdownSnapshot({ repoRoot: directory });

    assert.equal(first.fileCount, 4);
    assert.equal(first.fingerprint, second.fingerprint);
    assert.deepEqual(first.include, ["README.md", "AGENTS.md", "docs", ".agents/skills"]);
  });
});

test("MemoryStore tracks activity, filters workflow documents, and releases locks immutably", async () => {
  const store = new MemoryStore();
  await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  await store.createRun(createRun());
  await store.createRun(
    createRun({
      id: "run-2",
      createdAt: "2026-06-14T12:00:00.000Z",
      updatedAt: "2026-06-14T12:00:00.000Z"
    })
  );
  await store.savePlan(createPlan());
  await store.replaceTasks([
    createTask(),
    createTask({
      id: "task-record-2",
      packet: {
        ...createTask().packet,
        taskId: "task-2",
        title: "Review task"
      },
      createdAt: "2026-06-14T12:00:00.000Z",
      updatedAt: "2026-06-14T12:00:00.000Z"
    })
  ]);
  await store.createLock(createLock());
  await store.createLock(
    createLock({
      id: "lock-2",
      taskId: "task-2",
      scopePaths: ["src/runtime/config.ts"]
    })
  );
  await store.saveHandoff({
    id: "handoff-1",
    runId: "run-1",
    taskId: "task-1",
    actor: "worker",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    summary: "done",
    changedFiles: ["src/core/service.ts"],
    blockers: [],
    verificationNotes: [],
    executionEvidence: [],
    qualityGateEvidence: [],
    contextRefs: [],
    createdAt: BASE_TIME
  });
  await store.saveMemoryEntry(createMemoryEntry());
  await store.saveWorkflowDocument(createWorkflowDocument());
  await store.saveWorkflowDocument(
    createWorkflowDocument({
      id: "workflow-2",
      kind: "plan",
      title: "Planning packet"
    })
  );

  const latestRun = await store.findLatestRun({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  assert.equal(latestRun?.id, "run-2");

  const latestRunForTask = await store.findLatestRunForTask({
    workspaceSlug: "team",
    projectSlug: "devgod",
    taskId: "task-1"
  });
  assert.equal(latestRunForTask?.id, "run-1");

  const activityRuns = await store.findRunsByProjectActivity({
    workspaceSlug: "team",
    projectSlug: "devgod",
    dateFrom: "2026-06-13",
    dateTo: "2026-06-13",
    timezone: "UTC"
  });
  assert.deepEqual(
    activityRuns.map((run) => run.id),
    ["run-1"]
  );

  const workflows = await store.listWorkflowDocuments({
    projectId: PROJECT_ID,
    kind: "brief"
  });
  assert.deepEqual(workflows.map((document) => document.id), ["workflow-1"]);

  await store.releaseLocksForTask("run-1", "task-1", "2026-06-13T13:00:00.000Z");
  const activeLocks = await store.getActiveLocks(PROJECT_ID);
  assert.deepEqual(activeLocks.map((lock) => lock.id), ["lock-2"]);
});

test("MemoryStore can source plan embeddings and rank search results with role and vector filters", async () => {
  const store = new MemoryStore();
  await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  await store.savePlan(
    createPlan({
      id: "plan-embed",
      title: "Plan embed"
    })
  );

  const planSource = await store.getEmbeddingSource("artifacts", "plan-embed");
  assert.equal(planSource?.title, "Plan embed");
  assert.match(planSource?.content ?? "", /"title":"Plan"/);

  await store.saveMemoryEntry(
    createMemoryEntry({
      id: "global-memory",
      projectId: undefined,
      scope: "global",
      title: "Shared rollback note",
      content: "Global operational rollback note."
    })
  );
  await store.saveMemoryEntry(
    createMemoryEntry({
      id: "planner-memory",
      title: "Planner rollback brief",
      content: "Planner-only rollback policy.",
      metadata: {
        retrievalRoles: ["planner"]
      }
    })
  );
  await store.saveWorkflowDocument(
    createWorkflowDocument({
      id: "workflow-search",
      title: "Rollback workflow",
      body: "Rollback workflow approvals and runbooks."
    })
  );

  const artifacts: MarkdownArtifactRecord[] = [
    {
      id: "artifact-1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      runId: "run-1",
      kind: "markdown_chunk",
      title: "Rollback guide",
      content: "Rollback workflow approvals.",
      sourcePath: "docs/rollback.md",
      sourceAnchor: "rollback-guide",
      metadata: {
        chunkIndex: 0,
        retrievalRoles: ["planner"],
        authorityLevel: "repo_context"
      },
      createdAt: BASE_TIME
    },
    {
      id: "artifact-2",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      runId: "run-1",
      kind: "markdown_chunk",
      title: "Secondary rollback guide",
      content: "Rollback workflow approvals.",
      sourcePath: "docs/rollback-secondary.md",
      sourceAnchor: "secondary",
      metadata: {
        chunkIndex: 1,
        retrievalRoles: ["planner"],
        authorityLevel: "repo_context"
      },
      createdAt: BASE_TIME
    }
  ];
  await store.replaceMarkdownArtifacts({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: "run-1",
    artifacts
  });

  for (const artifact of artifacts) {
    await store.queueEmbeddingJob({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      sourceTable: "artifacts",
      sourceId: artifact.id,
      embeddingModel: "hash-model"
    });
  }
  const leasedJobs = await store.leaseEmbeddingJobs({ limit: 2 });
  await store.completeEmbeddingJob({
    jobId: leasedJobs[0]!.id,
    sourceTable: "artifacts",
    sourceId: "artifact-1",
    embeddingModel: "hash-model",
    embedding: [1, 0]
  });
  await store.completeEmbeddingJob({
    jobId: leasedJobs[1]!.id,
    sourceTable: "artifacts",
    sourceId: "artifact-2",
    embeddingModel: "hash-model",
    embedding: [0, 1]
  });

  const plannerResults = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "rollback workflow",
    limit: 10,
    includeGlobal: true,
    requesterRole: "planner",
    queryEmbedding: [1, 0],
    embeddingModel: "hash-model"
  });
  const artifactOneIndex = plannerResults.findIndex((result) => result.citation.artifactId === "artifact-1");
  const artifactTwoIndex = plannerResults.findIndex((result) => result.citation.artifactId === "artifact-2");
  assert.ok(artifactOneIndex >= 0);
  assert.ok(artifactTwoIndex >= 0);
  assert.ok(artifactOneIndex < artifactTwoIndex);
  assert.ok(plannerResults.some((result) => result.citation.memoryId === "global-memory"));
  assert.ok(plannerResults.some((result) => result.citation.documentId === "workflow-search"));

  const defaultRoleResults = await store.searchMemory({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "planner rollback",
    limit: 10,
    includeGlobal: true,
    requesterRole: "backend_engineer"
  });
  assert.ok(defaultRoleResults.every((result) => result.citation.memoryId !== "planner-memory"));

  await assert.rejects(
    () =>
      store.completeEmbeddingJob({
        jobId: "missing-job",
        sourceTable: "artifacts",
        sourceId: "artifact-1",
        embeddingModel: "hash-model",
        embedding: [1, 0]
      }),
    /embedding job not found/
  );
  await assert.rejects(() => store.failEmbeddingJob("missing-job", "timeout"), /embedding job not found/);
});

test("PostgresEmbeddingJobs rolls back when completion or failure happens without a lease", async () => {
  const completionCalls: string[] = [];
  const completionClient = {
    async query<Row = Record<string, unknown>>(text: string): Promise<{ rows: Row[]; rowCount: number }> {
      completionCalls.push(text);
      if (text === "begin" || text === "rollback") {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("from embedding_jobs")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  };

  const completionStore = new PostgresEmbeddingJobs(completionClient);
  await assert.rejects(
    () =>
      completionStore.completeEmbeddingJob({
        jobId: "job-1",
        sourceTable: "memory_entries",
        sourceId: "memory-1",
        embeddingModel: "text-embedding-3-small",
        embedding: [0.1, 0.2]
      }),
    /embedding job is not leased for completion/
  );
  assert.deepEqual(completionCalls, ["begin", completionCalls[1]!, "rollback"]);

  const failureCalls: string[] = [];
  const failureClient = {
    async query<Row = Record<string, unknown>>(text: string): Promise<{ rows: Row[]; rowCount: number }> {
      failureCalls.push(text);
      if (text === "begin" || text === "rollback") {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("update embedding_jobs")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  };

  const failureStore = new PostgresEmbeddingJobs(failureClient);
  await assert.rejects(() => failureStore.failEmbeddingJob("job-1", "timeout"), /embedding job is not leased for failure/);
  assert.deepEqual(failureCalls, ["begin", failureCalls[1]!, "rollback"]);
});

test("Postgres memory search dedupes rows, filters by role, and uses vector queries when requested", async () => {
  const capturedQueries: string[] = [];
  const responses = [
    [
      {
        id: "memory-1",
        sourceKind: "memory_entry",
        title: "Rollback plan",
        content: "Rollback plan for release",
        scope: "project",
        metadata: { retrievalRoles: ["planner"] },
        entryType: "decision",
        actor: "memory_curator",
        reviewer: "reviewer",
        runId: "run-1",
        taskId: "task-1",
        sourcePath: ".devgod/memory/rollback.md",
        sourceAnchor: "rollback",
        projectId: PROJECT_ID,
        createdAt: BASE_TIME
      }
    ],
    [
      {
        id: "memory-1",
        sourceKind: "memory_entry",
        title: "Rollback plan",
        content: "Rollback plan for release",
        scope: "project",
        metadata: { retrievalRoles: ["planner"] },
        entryType: "decision",
        actor: "memory_curator",
        reviewer: "reviewer",
        runId: "run-1",
        taskId: "task-1",
        sourcePath: ".devgod/memory/rollback.md",
        sourceAnchor: "rollback",
        projectId: PROJECT_ID,
        createdAt: BASE_TIME
      }
    ],
    [
      {
        id: "memory-1",
        sourceKind: "memory_entry",
        title: "Rollback plan",
        content: "Rollback plan for release",
        scope: "project",
        metadata: { retrievalRoles: ["planner"] },
        entryType: "decision",
        actor: "memory_curator",
        reviewer: "reviewer",
        runId: "run-1",
        taskId: "task-1",
        sourcePath: ".devgod/memory/rollback.md",
        sourceAnchor: "rollback",
        projectId: PROJECT_ID,
        createdAt: BASE_TIME,
        vectorScore: 0.95
      }
    ],
    [
      {
        id: "artifact-1",
        sourceKind: "artifact",
        title: "Rollback guide",
        content: "Artifact rollback guide",
        scope: "project",
        metadata: { retrievalRoles: ["planner"], authorityLevel: "repo_context" },
        artifactKind: "markdown_chunk",
        runId: "run-1",
        taskId: null,
        sourcePath: "docs/rollback.md",
        sourceAnchor: "rollback-guide",
        projectId: PROJECT_ID,
        createdAt: BASE_TIME
      }
    ],
    [
      {
        id: "artifact-1",
        sourceKind: "artifact",
        title: "Rollback guide",
        content: "Artifact rollback guide",
        scope: "project",
        metadata: { retrievalRoles: ["planner"], authorityLevel: "repo_context" },
        artifactKind: "markdown_chunk",
        runId: "run-1",
        taskId: null,
        sourcePath: "docs/rollback.md",
        sourceAnchor: "rollback-guide",
        projectId: PROJECT_ID,
        createdAt: BASE_TIME
      }
    ],
    [
      {
        id: "artifact-1",
        sourceKind: "artifact",
        title: "Rollback guide",
        content: "Artifact rollback guide",
        scope: "project",
        metadata: { retrievalRoles: ["planner"], authorityLevel: "repo_context" },
        artifactKind: "markdown_chunk",
        runId: "run-1",
        taskId: null,
        sourcePath: "docs/rollback.md",
        sourceAnchor: "rollback-guide",
        projectId: PROJECT_ID,
        createdAt: BASE_TIME,
        vectorScore: 0.9
      }
    ],
    [
      {
        id: "workflow-1",
        sourceKind: "workflow_document",
        title: "Rollback brief",
        content: "Workflow rollback brief",
        scope: "project",
        metadata: {},
        workflowDocumentKind: "brief",
        runId: "run-1",
        taskId: "task-1",
        sourcePath: null,
        sourceAnchor: null,
        projectId: PROJECT_ID,
        createdAt: BASE_TIME
      }
    ]
  ];

  let callIndex = 0;
  const client = {
    async query<Row = Record<string, unknown>>(text: string): Promise<{ rows: Row[]; rowCount: number }> {
      capturedQueries.push(text);
      const rows = (responses[callIndex] ?? []) as Row[];
      callIndex += 1;
      return { rows, rowCount: rows.length };
    }
  };

  const results = await searchPostgresMemory(client, {
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "rollback plan",
    limit: 10,
    includeGlobal: true,
    requesterRole: "planner",
    queryEmbedding: [1, 0],
    embeddingModel: "hash-model"
  });

  assert.equal(capturedQueries.length, 7);
  assert.equal(results.length, 3);
  assert.equal(results[0]?.citation.memoryId, "memory-1");
  assert.equal(results[1]?.citation.artifactId, "artifact-1");
  assert.equal(results[2]?.citation.documentId, "workflow-1");

  callIndex = 0;
  capturedQueries.length = 0;
  const hiddenResults = await searchPostgresMemory(client, {
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "rollback plan",
    limit: 10,
    includeGlobal: true,
    requesterRole: "backend_engineer"
  });
  assert.equal(capturedQueries.length, 5);
  assert.ok(hiddenResults.every((result) => result.citation.memoryId !== "memory-1"));
});
