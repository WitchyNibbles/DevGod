import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOperatorDashboardReport, formatOperatorDashboardReport } from "../src/admin/ops.ts";
import {
  buildPlanningContextReport,
  formatPlanningContextReportMarkdown,
  searchLocalWorkflowArtifacts
} from "../src/admin/planning-context.ts";
import { dbInternals, withClient, withClientUsing } from "../src/admin/db.ts";

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: "run-1",
      status: "active",
      taskCounts: {
        ready: 1,
        in_progress: 1,
        review_blocked: 0,
        approved: 0,
        done: 0,
        blocked: 0
      }
    },
    reviewIdentity: {
      liveTrustReady: true,
      notes: [],
      selectedBackend: "devgod_local_seed",
      availableBackends: ["devgod_local_seed"]
    },
    integrity: {
      status: "clean",
      contradictions: [],
      taskProofObligations: { tasks: [] },
      runtimeState: undefined
    },
    daemon: {
      continuation: undefined,
      handoff: undefined,
      supervisor: undefined
    },
    orchestration: {
      nextTaskIds: ["task-1"]
    },
    autonomous: {
      resume: {
        executionMode: "automatic",
        executionSummary: "continue the runtime workflow",
        provider: "none",
        wakeOwner: "planner"
      }
    },
    ...overrides
  } as any;
}

function makeRoutingReport(overrides: Record<string, unknown> = {}) {
  return {
    recommendations: [],
    ...overrides
  } as any;
}

function makeRecoveryReport(overrides: Record<string, unknown> = {}) {
  return {
    issues: [],
    summary: {
      totalIssues: 0,
      safeActions: 0
    },
    ...overrides
  } as any;
}

function makeExecutionPlan(overrides: Record<string, unknown> = {}) {
  return {
    directive: {
      kind: "dispatch_owner",
      recommendation: {
        taskId: "task-1",
        targetRole: "planner"
      },
      rationale: []
    },
    ...overrides
  } as any;
}

test("db internals parse dotenv, loopback targets, and command prefixes defensively", () => {
  const env: NodeJS.ProcessEnv = { EXISTING: "keep-me" };
  dbInternals.applyDotEnvText(
    [
      "",
      "# comment",
      "MALFORMED",
      "EXISTING=overwrite-attempt",
      'QUOTED="hello world"',
      "RAW=value=with=equals"
    ].join("\n"),
    env
  );

  assert.deepEqual(env, {
    EXISTING: "keep-me",
    QUOTED: "hello world",
    RAW: "value=with=equals"
  });
  assert.equal(dbInternals.resolveLoopbackDatabaseTarget("not a url"), undefined);
  assert.deepEqual(dbInternals.resolveLoopbackDatabaseTarget("postgres://user:pw@localhost/db"), {
    host: "localhost",
    port: "5432"
  });
  assert.equal(
    dbInternals.resolveLoopbackDatabaseTarget("postgres://user:pw@198.51.100.12:55432/db"),
    undefined
  );
  assert.equal(dbInternals.parseLeadingCommand(""), undefined);
  assert.equal(dbInternals.parseLeadingCommand('"/tmp/postgres/bin/postgres" -D data'), "/tmp/postgres/bin/postgres");
  assert.equal(dbInternals.parseLeadingCommand("postgres -D data"), "postgres");
  assert.equal(dbInternals.isConnectionRefusedError({ code: "ECONNREFUSED" }), true);
  assert.equal(dbInternals.isConnectionRefusedError("connect ECONNREFUSED 127.0.0.1:5432"), true);
  assert.equal(dbInternals.isConnectionRefusedError(new Error("something else")), false);
});

test("withClient and withClientUsing reject missing database URLs before opening a real connection", async () => {
  const previous = process.env.DEVGOD_CORE_DATABASE_URL;
  delete process.env.DEVGOD_CORE_DATABASE_URL;

  try {
    await assert.rejects(withClient(async () => "unused"), /DEVGOD_CORE_DATABASE_URL is required/);
    await assert.rejects(withClientUsing(async () => "unused", { env: {} }), /DEVGOD_CORE_DATABASE_URL is required/);
  } finally {
    if (previous === undefined) {
      delete process.env.DEVGOD_CORE_DATABASE_URL;
    } else {
      process.env.DEVGOD_CORE_DATABASE_URL = previous;
    }
  }
});

test("withClientUsing preserves callback success when client cleanup throws", async () => {
  let endCalls = 0;

  const result = await withClientUsing(
    async () => "connected",
    {
      env: {
        ...process.env,
        DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@127.0.0.1:55432/devgod"
      },
      async createClient() {
        return {
          async connect() {},
          async end() {
            endCalls += 1;
            throw new Error("cleanup failed");
          }
        };
      }
    }
  );

  assert.equal(result, "connected");
  assert.equal(endCalls, 1);
});

test("withClientUsing surfaces the retry connection error after repo-local bootstrap succeeds", async () => {
  let createClientCalls = 0;
  let endCalls = 0;

  await assert.rejects(
    withClientUsing(
      async () => "unused",
      {
        cwd: "/tmp/devgod-admin-submodules",
        env: {
          ...process.env,
          DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@127.0.0.1:55432/devgod"
        },
        async createClient() {
          createClientCalls += 1;
          return {
            async connect() {
              if (createClientCalls === 1) {
                const error = new Error("connect ECONNREFUSED 127.0.0.1:55432");
                Object.assign(error, { code: "ECONNREFUSED" });
                throw error;
              }
              throw new Error("retry failed");
            },
            async end() {
              endCalls += 1;
            }
          };
        },
        async startRepoLocalPostgres() {
          return true;
        }
      }
    ),
    /retry failed/
  );

  assert.equal(createClientCalls, 2);
  assert.equal(endCalls, 2);
});

test("withClientUsing keeps the original loopback connection error when repo-local postgres state is absent", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-db-no-state-"));
  let connectAttempts = 0;
  let endCalls = 0;

  try {
    await assert.rejects(
      withClientUsing(
        async () => "unused",
        {
          cwd: directory,
          env: {
            ...process.env,
            DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@127.0.0.1:55432/devgod"
          },
          async createClient() {
            return {
              async connect() {
                connectAttempts += 1;
                const error = new Error("connect ECONNREFUSED 127.0.0.1:55432");
                Object.assign(error, { code: "ECONNREFUSED" });
                throw error;
              },
              async end() {
                endCalls += 1;
              }
            };
          }
        }
      ),
      /ECONNREFUSED/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.equal(connectAttempts, 1);
  assert.equal(endCalls, 1);
});

test("withClientUsing surfaces repo-local pg_ctl spawn failures and non-zero exits", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-admin-db-spawn-"));
  const stateRoot = path.join(directory, ".devgod", "state", "local-postgres");
  const dataDir = path.join(stateRoot, "data");
  const binDir = path.join(directory, ".devgod", "cache", "local-pg-build", "runtime", "bin");

  try {
    await mkdir(dataDir, { recursive: true });
    await mkdir(binDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "postmaster.opts"),
      `${path.join(binDir, "postgres")} -D ${dataDir}\n`,
      "utf8"
    );

    const missingInterpreterPath = path.join(binDir, "pg_ctl");
    await writeFile(missingInterpreterPath, "#!/definitely/missing/interpreter\n", "utf8");
    await chmod(missingInterpreterPath, 0o755);

    await assert.rejects(
      withClientUsing(
        async () => "unused",
        {
          cwd: directory,
          env: {
            ...process.env,
            DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@127.0.0.1:55432/devgod"
          },
          async createClient() {
            return {
              async connect() {
                const error = new Error("connect ECONNREFUSED 127.0.0.1:55432");
                Object.assign(error, { code: "ECONNREFUSED" });
                throw error;
              },
              async end() {}
            };
          }
        }
      ),
      /ENOENT|spawn/i
    );

    await writeFile(missingInterpreterPath, "#!/usr/bin/env bash\nexit 9\n", "utf8");
    await chmod(missingInterpreterPath, 0o755);

    await assert.rejects(
      withClientUsing(
        async () => "unused",
        {
          cwd: directory,
          env: {
            ...process.env,
            DEVGOD_CORE_DATABASE_URL: "postgres://devgod:secret@127.0.0.1:55432/devgod"
          },
          async createClient() {
            return {
              async connect() {
                const error = new Error("connect ECONNREFUSED 127.0.0.1:55432");
                Object.assign(error, { code: "ECONNREFUSED" });
                throw error;
              },
              async end() {}
            };
          }
        }
      ),
      /pg_ctl exited with code 9/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("searchLocalWorkflowArtifacts indexes non-empty workflow exports and skips README or blank artifacts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-planning-artifacts-"));

  try {
    await mkdir(path.join(directory, ".devgod", "work", "briefs", "nested"), { recursive: true });
    await mkdir(path.join(directory, ".devgod", "work", "plans"), { recursive: true });
    await mkdir(path.join(directory, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(path.join(directory, ".devgod", "work", "reviews"), { recursive: true });
    await mkdir(path.join(directory, ".devgod", "work", "checkpoints"), { recursive: true });

    await writeFile(path.join(directory, ".devgod", "ACTIVE"), "task_id=task-1\n", "utf8");
    await writeFile(path.join(directory, ".devgod", "work", "product-state.md"), "# Product\n\nShipped.\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "task-queue.json"),
      '{ "project_status": "active" }\n',
      "utf8"
    );
    await writeFile(path.join(directory, ".devgod", "work", "briefs", "brief-1.md"), "# Brief\n\nScope.\n", "utf8");
    await writeFile(path.join(directory, ".devgod", "work", "plans", "plan-1.md"), "No heading here\n", "utf8");
    await writeFile(path.join(directory, ".devgod", "work", "tasks", "task-1.md"), "# Task\n\nDo it.\n", "utf8");
    await writeFile(path.join(directory, ".devgod", "work", "reviews", "review-1.md"), "# Review\n\nApproved.\n", "utf8");
    await writeFile(
      path.join(directory, ".devgod", "work", "checkpoints", "checkpoint-1.md"),
      "# Checkpoint\n\nSaved.\n",
      "utf8"
    );
    await writeFile(path.join(directory, ".devgod", "work", "checkpoints", "README.md"), "# Ignored\n", "utf8");
    await writeFile(path.join(directory, ".devgod", "work", "checkpoints", "blank.md"), "   \n\n", "utf8");

    const results = await searchLocalWorkflowArtifacts({
      cwd: directory,
      query: "workflow exports",
      projectSlug: "devgod",
      requesterRole: "planner",
      limit: 20
    });

    const citations = results.map((item) => item.citation.canonicalRef);
    assert.ok(citations.some((citation) => citation.includes(".devgod/ACTIVE")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/product-state.md")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/task-queue.json")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/briefs/brief-1.md")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/plans/plan-1.md")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/tasks/task-1.md")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/reviews/review-1.md")));
    assert.ok(citations.some((citation) => citation.includes(".devgod/work/checkpoints/checkpoint-1.md")));
    assert.ok(!citations.some((citation) => citation.includes("README.md")));
    assert.ok(!citations.some((citation) => citation.includes("blank.md")));

    const byCitation = new Map(results.map((item) => [item.citation.canonicalRef, item]));
    const activeMarker = [...byCitation.values()].find((item) => item.title === "Workflow active marker");
    const productState = [...byCitation.values()].find((item) => item.title === "Workflow product state");
    const taskQueue = [...byCitation.values()].find((item) => item.title === "Workflow task queue");
    const planArtifact = [...byCitation.values()].find((item) => item.citation.canonicalRef.includes("plan-1.md"));
    const reviewArtifact = [...byCitation.values()].find((item) => item.citation.canonicalRef.includes("review-1.md"));
    const checkpointArtifact = [...byCitation.values()].find((item) =>
      item.citation.canonicalRef.includes("checkpoint-1.md")
    );

    assert.ok(activeMarker?.metadata.tags.includes("active-marker"));
    assert.ok(productState?.metadata.tags.includes("product-state"));
    assert.ok(taskQueue?.metadata.tags.includes("task-queue"));
    assert.equal(planArtifact?.title, "plan-1.md");
    assert.ok(planArtifact?.metadata.tags.includes("plan"));
    assert.ok(reviewArtifact?.metadata.tags.includes("review"));
    assert.ok(checkpointArtifact?.metadata.tags.includes("checkpoint"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("buildPlanningContextReport truncates long previews for markdown-safe summaries", () => {
  const report = buildPlanningContextReport({
    query: "long summary",
    requesterRole: "planner",
    results: [
      {
        id: "memory-1",
        title: "Long artifact",
        content: `${"dense context ".repeat(30)}extra`,
        scope: "project",
        projectSlug: "devgod",
        score: 9.5,
        authority: {
          source: "repo_artifact",
          precedence: "repo_context",
          scope: "project",
          allowedRoles: ["planner"]
        },
        freshness: {
          status: "fresh",
          createdAt: "2026-06-13T00:00:00.000Z",
          ageDays: 0,
          staleAfterDays: 30
        },
        citation: {
          kind: "memory_entry",
          memoryId: "memory-1",
          label: "Long artifact",
          canonicalRef: "memory://memory-1"
        },
        provenance: {
          entryType: "note",
          runId: "run-1",
          createdAt: "2026-06-13T00:00:00.000Z"
        },
        metadata: {
          allowedRoles: ["planner"],
          tags: ["long"],
          staleAfterDays: 30,
          supersededBy: [],
          contradicts: []
        },
        conflict: {
          detected: false,
          relatedIds: []
        }
      }
    ] as any
  });

  assert.ok(report.items[0]?.preview.endsWith("..."));
  assert.match(formatPlanningContextReportMarkdown(report), /preview: .*\.{3}/);
});

test("buildOperatorDashboardReport covers stale metadata, review dispatches, and deduplicated follow-up actions", () => {
  const report = buildOperatorDashboardReport({
    status: makeStatus({
      integrity: {
        status: "clean",
        contradictions: [],
        taskProofObligations: {
          tasks: [
            {
              exportState: "missing",
              taskId: "task-1",
              artifactPath: ".devgod/work/tasks/task-1.md",
              verificationCommand: "npm test"
            }
          ]
        },
        runtimeState: {
          seedFailure: {
            recoveryState: "already_reproved",
            taskId: "task-1",
            runId: "run-1",
            reason: "proof already restored"
          },
          lastIntegrityRepair: {
            kind: "runtime_reconcile",
            source: "reconcile_runtime_state",
            summary: "reconciled queue state"
          }
        }
      },
      daemon: {
        continuation: {
          state: "blocked",
          summary: "need operator approval",
          provider: "none",
          wakeOwner: undefined,
          executionMode: "operator_required",
          targetId: undefined,
          nextActions: []
        },
        handoff: {
          detailFiles: {
            appAutomationRequest: ".devgod/app-request.json",
            cliSchedulerRequest: ".devgod/cli-request.json"
          }
        },
        supervisor: {
          state: "blocked",
          reason: "review roles missing",
          missingReviewRoles: ["reviewer", "qa_engineer"],
          nextActions: ["request missing reviewers", "request missing reviewers"],
          history: [
            {
              activeRunId: undefined,
              state: "blocked",
              actionCount: 2
            }
          ]
        }
      }
    }),
    executionPlan: makeExecutionPlan({
      directive: {
        kind: "dispatch_reviews",
        recommendations: [
          { taskId: "task-1", targetReviewRole: "reviewer" },
          { taskId: "task-2", targetReviewRole: undefined }
        ],
        rationale: []
      }
    }),
    routing: makeRoutingReport({
      recommendations: [
        {
          taskId: "task-1",
          rationale: ["reasoning-quality: gather stronger proof"]
        }
      ]
    }),
    recovery: makeRecoveryReport({
      issues: [
        { kind: "stale_review_block", taskId: "task-1" },
        { kind: "stale_approval", taskId: "task-2" },
        { kind: "orphan_lock", lockTaskId: "task-3" }
      ]
    })
  });

  assert.match(report.alerts.join(" "), /stale workflow seed failure metadata: task-1/);
  assert.match(report.alerts.join(" "), /integrity repair applied: runtime_reconcile via runtime reconcile command/);
  assert.match(report.alerts.join(" "), /stale review queue: task-1/);
  assert.match(report.alerts.join(" "), /stale approval: task-2/);
  assert.match(report.alerts.join(" "), /orphan lock: task-3/);
  assert.match(report.alerts.join(" "), /daemon continuation blocked: need operator approval/);
  assert.match(report.alerts.join(" "), /daemon supervisor missing review actors: reviewer, qa_engineer/);
  assert.match(report.alerts.join(" "), /daemon supervisor history: unknown-run:blocked\/2/);
  assert.match(report.alerts.join(" "), /reasoning-quality: task-1: gather stronger proof/);

  assert.match(report.nextActions.join(" "), /repair or regenerate approved task export for task-1/);
  assert.match(report.nextActions.join(" "), /verify approved task artifact for task-1: npm test/);
  assert.match(report.nextActions.join(" "), /inspect stale seed failure metadata for task-1/);
  assert.match(report.nextActions.join(" "), /review recent integrity repair evidence \(runtime reconcile command\): reconciled queue state/);
  assert.match(report.nextActions.join(" "), /operator intervention required for daemon continuation: need operator approval/);
  assert.match(report.nextActions.join(" "), /apply Codex app automation request: \.devgod\/app-request\.json/);
  assert.match(report.nextActions.join(" "), /apply CLI scheduler request: \.devgod\/cli-request\.json/);
  assert.match(report.nextActions.join(" "), /supervisor follow-up: request missing reviewers/);
  assert.match(report.nextActions.join(" "), /request reviewer for task-1/);
  assert.match(report.nextActions.join(" "), /strengthen reasoning evidence for task-1/);
  assert.equal(report.nextActions.filter((action) => action === "supervisor follow-up: request missing reviewers").length, 1);
});

test("buildOperatorDashboardReport handles continue-analysis automation and blocked execution branches", () => {
  const continueReport = buildOperatorDashboardReport({
    status: makeStatus({
      autonomous: {
        resume: {
          executionMode: "automatic",
          executionSummary: "resume workflow proof",
          provider: "codex",
          wakeOwner: "planner"
        }
      }
    }),
    executionPlan: makeExecutionPlan({
      directive: {
        kind: "continue_analysis",
        targetId: "workflow-proof:task-1",
        blockers: ["missing proof artifact"],
        nextActions: ["resume workflow proof", "refresh inventory"],
        rationale: []
      }
    }),
    routing: makeRoutingReport(),
    recovery: makeRecoveryReport()
  });

  assert.deepEqual(
    continueReport.nextActions.filter((action) => action === "resume workflow proof"),
    ["resume workflow proof"]
  );
  assert.ok(continueReport.nextActions.includes("refresh inventory"));
  assert.ok(continueReport.alerts.includes("autonomous blocker: missing proof artifact"));

  const blockedReport = buildOperatorDashboardReport({
    status: makeStatus(),
    executionPlan: makeExecutionPlan({
      directive: {
        kind: "blocked",
        blockers: ["manual review required"],
        rationale: []
      }
    }),
    routing: makeRoutingReport(),
    recovery: makeRecoveryReport()
  });

  assert.ok(blockedReport.alerts.includes("execution blocked: manual review required"));
});

test("formatOperatorDashboardReport renders optional operational sections", () => {
  const formatted = formatOperatorDashboardReport({
    authorityLabel: "derived_only",
    runId: "run-9",
    status: makeStatus({
      integrity: {
        status: "contradicted",
        contradictions: ["queue drift", "proof drift"],
        taskProofObligations: { tasks: [] },
        runtimeState: undefined
      },
      daemon: {
        continuation: {
          state: "blocked",
          executionMode: "operator_required",
          targetId: undefined,
          wakeOwner: undefined,
          provider: undefined,
          summary: "blocked until repaired",
          nextActions: []
        },
        supervisor: {
          state: "blocked",
          blockerKind: "review_gap",
          reason: "missing review evidence",
          historyView: {
            scope: "run",
            runId: "run-9",
            returnedCount: 4,
            filteredCount: 3,
            retainedCount: 2,
            truncated: true
          },
          history: [
            {
              recordedAt: "2026-06-13T12:00:00.000Z",
              activeRunId: undefined,
              state: "blocked",
              actionCount: 2
            }
          ]
        }
      }
    }),
    executionPlan: makeExecutionPlan({
      directive: {
        kind: "complete",
        rationale: []
      }
    }),
    routing: makeRoutingReport(),
    recovery: makeRecoveryReport({
      summary: {
        totalIssues: 2,
        safeActions: 1
      }
    }),
    alerts: ["first alert"],
    nextActions: ["first action"]
  } as any);

  assert.match(formatted, /^Run run-9/m);
  assert.match(formatted, /review-backend: devgod_local_seed/);
  assert.match(formatted, /available-backends: devgod_local_seed/);
  assert.match(formatted, /daemon-continuation: blocked operator_required unknown-target owner=unknown provider=unknown/);
  assert.match(formatted, /daemon-supervisor: blocked review_gap missing review evidence/);
  assert.match(formatted, /daemon-supervisor-history-view: run:run-9 returned=4 filtered=3 retained=2 truncated=yes/);
  assert.match(formatted, /daemon-supervisor-history: 2026-06-13T12:00:00.000Z:unknown-run:blocked:2/);
  assert.match(formatted, /integrity-contradictions:\n- queue drift\n- proof drift/);
  assert.match(formatted, /alerts:\n- first alert/);
  assert.match(formatted, /next-actions:\n- first action/);
});
