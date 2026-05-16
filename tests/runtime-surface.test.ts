import test from "node:test";
import assert from "node:assert/strict";
import {
  getCheckpointSurface,
  getCoverageSurface,
  getGapsSurface,
  getLoopSurface,
  getPlanContextSurface,
  getResumeSurface
} from "../src/admin/runtime-surface.ts";
import type { CoverageItemCategory, RunExecutionPlan, RunStatusSnapshot } from "../src/domain/types.ts";

test("getPlanContextSurface wires query embedding through the runtime surface", async () => {
  let capturedInput:
    | {
        workspaceSlug: string;
        projectSlug: string;
        query: string;
        limit: number;
        includeGlobal: boolean;
        queryEmbedding?: readonly number[] | undefined;
        embeddingModel?: string | undefined;
        requesterRole?: string | undefined;
      }
    | undefined;

  const result = await getPlanContextSurface(["--query", "qdrant retrieval", "--format", "json"], {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod",
      DEVGOD_EMBEDDING_MODEL: "devgod-local-hash-1536"
    },
    dependencies: {
      async loadDotEnv() {},
      async withClient(callback) {
        return callback({ kind: "client" } as never);
      },
      createStore() {
        return { kind: "store" } as never;
      },
      createService() {
        return {
          async getStatus() {
            assert.fail("getStatus should not be called by plan-context");
          },
          async getExecutionPlan() {
            assert.fail("getExecutionPlan should not be called by plan-context");
          },
          async applyRecovery() {
            assert.fail("applyRecovery should not be called by plan-context");
          },
          async recommendRouting() {
            assert.fail("recommendRouting should not be called by plan-context");
          },
          async inspectRecovery() {
            assert.fail("inspectRecovery should not be called by plan-context");
          },
          async searchMemory(input) {
            capturedInput = input;
            return [];
          }
        };
      },
      async createPlanContextEmbedQuery(env) {
        assert.ok(env);
        assert.equal(env.DEVGOD_EMBEDDING_MODEL, "devgod-local-hash-1536");
        return async ({ model, text }) => {
          assert.equal(model, "devgod-local-hash-1536");
          assert.equal(text, "qdrant retrieval");
          return [0.25, 0.75];
        };
      }
    }
  });

  assert.equal(result.format, "json");
  assert.deepEqual(capturedInput?.queryEmbedding, [0.25, 0.75]);
  assert.equal(capturedInput?.embeddingModel, "devgod-local-hash-1536");
  assert.equal(capturedInput?.workspaceSlug, "team");
  assert.equal(capturedInput?.projectSlug, "devgod");
});

test("getLoopSurface wires execution-plan and optional safe recovery through the runtime surface", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const result = await getLoopSurface(
    [
      "--run-id",
      "run-1",
      "--format",
      "json",
      "--stale-after-hours",
      "12",
      "--apply-safe-recovery",
      "--execute-supported-directives",
      "--owner-actor",
      "planner"
    ],
    {
      dependencies: {
        async loadDotEnv() {},
        async withClient(callback) {
          return callback({ kind: "client" } as never);
        },
        createStore() {
          return {
            async findLatestRun() {
              assert.fail("findLatestRun should not be called with an explicit run id");
            }
          } as never;
        },
        createService() {
          return {
            async getStatus(runId: string) {
              calls.push({ method: "getStatus", args: [runId] });
              return {
                run: {
                  id: runId,
                  workspaceId: "workspace-1",
                  projectId: "project-1",
                  actor: "ceo",
                  title: "Build core",
                  request: "Ship it",
                  summary: {
                    goal: "Ship it",
                    audience: [],
                    constraints: [],
                    risks: [],
                    unknowns: [],
                    successCriteria: [],
                    outOfScope: [],
                    trustBoundaries: [],
                    destructiveActions: [],
                    externalIntegrations: [],
                    stopGo: "go"
                  },
                  status: "ready",
                  createdAt: "2026-05-13T00:00:00.000Z",
                  updatedAt: "2026-05-13T00:00:00.000Z"
                },
                tasks: [],
                activeLocks: [],
                blockers: [],
                nextTaskIds: []
              };
            },
            async getExecutionPlan(runId: string): Promise<RunExecutionPlan> {
              calls.push({ method: "getExecutionPlan", args: [runId] });
              if (calls.some((entry) => entry.method === "applyRecovery")) {
                return {
                  mode: "runtime_authoritative",
                  runId,
                  runStatus: "review_blocked",
                  directive: {
                    kind: "dispatch_owner",
                    recommendation: {
                      taskId: "build",
                      taskStatus: "ready",
                      recommendation: "owner_dispatch",
                      authorityLabel: "derived_only",
                      targetRole: "backend_engineer",
                      rationale: ["ready after recovery"],
                      blockers: [],
                      allowedWriteScope: ["src/core"],
                      retrievalGuidance: [],
                      approvalCheckpoints: []
                    },
                    rationale: ["ready after recovery"]
                  }
                };
              }

              return {
                mode: "runtime_authoritative",
                runId,
                runStatus: "review_blocked",
                directive: {
                  kind: "apply_recovery",
                  actions: [
                    {
                      id: "reset-task:plan",
                      authorityLabel: "derived_only",
                      kind: "reset_task_to_ready",
                      taskId: "plan",
                      safeToApply: true,
                      rationale: ["stalled task"]
                    }
                  ],
                  rationale: ["safe recovery available"]
                }
              };
            },
            async applyRecovery(runId: string, actionIds: readonly string[], options: { staleAfterHours: number }) {
              calls.push({ method: "applyRecovery", args: [runId, [...actionIds], options.staleAfterHours] });
              return {
                mode: "applied",
                runId,
                appliedActionIds: [...actionIds],
                skippedActionIds: [],
                snapshot: {
                  run: {
                    id: runId,
                    workspaceId: "workspace-1",
                    projectId: "project-1",
                    actor: "ceo",
                    title: "Build core",
                    request: "Ship it",
                    summary: {
                      goal: "Ship it",
                      audience: [],
                      constraints: [],
                      risks: [],
                      unknowns: [],
                      successCriteria: [],
                      outOfScope: [],
                      trustBoundaries: [],
                      destructiveActions: [],
                      externalIntegrations: [],
                      stopGo: "go"
                    },
                    status: "ready",
                    createdAt: "2026-05-13T00:00:00.000Z",
                    updatedAt: "2026-05-13T00:00:00.000Z"
                  },
                  tasks: [],
                  activeLocks: [],
                  blockers: [],
                  nextTaskIds: ["build"]
                }
              };
            },
            async executeDirectiveStep(
              runId: string,
              input: {
                staleAfterHours?: number | undefined;
                ownerActor?: string | undefined;
                executeReviewRecommendation?: unknown;
              }
            ) {
              calls.push({
                method: "executeDirectiveStep",
                args: [runId, input.staleAfterHours, input.ownerActor, Boolean(input.executeReviewRecommendation)]
              });
              return {
                runId,
                initialPlan: {
                  mode: "runtime_authoritative",
                  runId,
                  runStatus: "ready",
                  directive: {
                    kind: "dispatch_owner",
                    recommendation: {
                      taskId: "build",
                      taskStatus: "ready",
                      recommendation: "owner_dispatch",
                      authorityLabel: "derived_only",
                      targetRole: "backend_engineer",
                      rationale: ["ready after recovery"],
                      blockers: [],
                      allowedWriteScope: ["src/core"],
                      retrievalGuidance: [],
                      approvalCheckpoints: []
                    },
                    rationale: ["ready after recovery"]
                  }
                },
                steps: [
                  {
                    directiveKind: "dispatch_owner",
                    outcome: "executed",
                    taskId: "build",
                    actor: input.ownerActor ?? "planner",
                    evidence: ["claimed build"]
                  }
                ],
                finalPlan: {
                  mode: "runtime_authoritative",
                  runId,
                  runStatus: "in_progress",
                  directive: {
                    kind: "blocked",
                    blockers: ["task is already claimed by planner"],
                    rationale: ["runtime state has no executable next step"]
                  }
                },
                snapshot: {
                  run: {
                    id: runId,
                    workspaceId: "workspace-1",
                    projectId: "project-1",
                    actor: "ceo",
                    title: "Build core",
                    request: "Ship it",
                    summary: {
                      goal: "Ship it",
                      audience: [],
                      constraints: [],
                      risks: [],
                      unknowns: [],
                      successCriteria: [],
                      outOfScope: [],
                      trustBoundaries: [],
                      destructiveActions: [],
                      externalIntegrations: [],
                      stopGo: "go"
                    },
                    status: "in_progress",
                    createdAt: "2026-05-13T00:00:00.000Z",
                    updatedAt: "2026-05-13T00:00:00.000Z"
                  },
                  tasks: [],
                  activeLocks: [],
                  blockers: ["task is already claimed by planner"],
                  nextTaskIds: []
                }
              };
            },
            async recommendRouting() {
              assert.fail("recommendRouting should not be called by loop");
            },
            async inspectRecovery() {
              assert.fail("inspectRecovery should not be called by loop");
            },
            async searchMemory() {
              assert.fail("searchMemory should not be called by loop");
              return [];
            }
          };
        }
      }
    }
  );

  assert.equal(result.format, "json");
  assert.equal(result.result.mode, "executed");
  assert.equal(result.result.initialPlan.directive.kind, "apply_recovery");
  assert.deepEqual(result.result.appliedRecoveryActionIds, ["reset-task:plan"]);
  assert.equal(result.result.executedSteps[0]?.directiveKind, "dispatch_owner");
  assert.equal(result.result.executedSteps[0]?.outcome, "executed");
  assert.equal(result.result.finalPlan.directive.kind, "blocked");
  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["getExecutionPlan", "applyRecovery", "getExecutionPlan", "executeDirectiveStep"]
  );
});

test("autonomous runtime surfaces wire coverage, gaps, checkpoint, and resume through the runtime service", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const runtimeSnapshot: RunStatusSnapshot = {
    run: {
      id: "run-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      actor: "ceo",
      title: "Autonomous flow",
      request: "Keep going",
      summary: {
        goal: "Keep going",
        audience: [],
        constraints: [],
        risks: [],
        unknowns: [],
        successCriteria: [],
        outOfScope: [],
        trustBoundaries: [],
        destructiveActions: [],
        externalIntegrations: [],
        stopGo: "go"
      },
      status: "ready" as const,
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    },
    tasks: [],
    activeLocks: [],
    blockers: [],
    nextTaskIds: [],
    autonomousExecution: {
      state: {
        enabled: true,
        profile: "legacy_rewrite" as const,
        phase: "final_verification" as const,
        manifest: {
          runId: "run-1",
          profile: "legacy_rewrite" as const,
          requiredCategories: ["services", "tests"] as CoverageItemCategory[],
          thresholds: {
            criticalItemCoverage: 0.8,
            criticalItemValidation: 0.6,
            callsiteCoverage: 0.85,
            runtimeTraceCoverage: 0.75
          }
        },
        coverageItems: [
          {
            id: "service:runtime",
            category: "services" as const,
            state: "validated" as const,
            criticality: "critical" as const,
            sources: ["src/admin.ts:1"],
            evidenceRefs: ["src/admin.ts:1"],
            verificationRefs: ["tests/runtime-surface.test.ts"],
            callsiteCount: 1,
            callsitesAnalyzed: 1,
            runtimeTraced: true,
            lastUpdatedAt: "2026-05-15T00:00:00.000Z"
          }
        ],
        gaps: [
          {
            id: "gap:runtime",
            targetId: "task:proof",
            kind: "missing_validation" as const,
            severity: "high" as const,
            description: "Proof still missing.",
            blocking: true,
            evidenceRefs: ["src/admin.ts:1"],
            createdBy: "qa_engineer",
            suggestedNextActions: ["run workflow-proof"],
            status: "open" as const
          }
        ],
        checkpoints: [
          {
            runId: "run-1",
            checkpointId: "cp-1",
            authorityLabel: "runtime_authoritative",
            phase: "final_verification" as const,
            activeTargets: ["review:authenticated"],
            recentEvidenceRefs: ["src/admin.ts:1"],
            openGaps: ["gap:runtime"],
            nextActions: ["run workflow-proof"],
            compressedContextRef: "memory://cp-1",
            createdAt: "2026-05-15T00:02:00.000Z"
          }
        ],
        progressProofs: [
          {
            cycle: 1,
            proofId: "proof-1",
            phaseBefore: "validation" as const,
            phaseAfter: "final_verification" as const,
            evidenceRefs: ["src/admin.ts:1"],
            coverageDelta: { validated: 1 },
            blockingGapDelta: { closed: 0, opened: 1 },
            nextTarget: "review:authenticated",
            whyNext: "Proof is still pending.",
            createdAt: "2026-05-15T00:01:00.000Z"
          }
        ],
        pendingInvestigations: [],
        executionEpoch: 1,
        updatedAt: "2026-05-15T00:02:00.000Z"
      },
      coverageSummary: {
        totalItems: 1,
        discoveredItems: 0,
        partiallyAnalyzedItems: 0,
        fullyAnalyzedItems: 0,
        validatedItems: 1,
        migratedItems: 0,
        blockedItems: 0,
        criticalItemCoverage: 1,
        criticalItemValidation: 1,
        callsiteCoverage: 1,
        runtimeTraceCoverage: 1,
        openGapCount: 1,
        blockingGapCount: 1
      },
      phaseReadiness: {
        phase: "final_verification" as const,
        status: "blocked" as const,
        reasons: ["blocking gaps remain open: 1"]
      },
      blockingGaps: []
    }
  };

  const runtimePlan: RunExecutionPlan = {
    mode: "runtime_authoritative",
    runId: "run-1",
    runStatus: "ready",
    directive: {
      kind: "dispatch_owner",
      recommendation: {
        taskId: "rewrite",
        taskStatus: "ready",
        recommendation: "owner_dispatch",
        authorityLabel: "derived_only",
        targetRole: "backend_engineer",
        rationale: ["ready for continuation"],
        blockers: [],
        allowedWriteScope: ["src/admin.ts"],
        retrievalGuidance: [],
        approvalCheckpoints: []
      },
      rationale: ["ready for continuation"]
    },
    autonomousExecution: runtimeSnapshot.autonomousExecution
  };

  const dependencies = {
    async loadDotEnv() {},
    async withClient<T>(callback: (client: never) => Promise<T>): Promise<T> {
      return callback({ kind: "client" } as never);
    },
    createStore() {
      return {
        async findLatestRun() {
          return { id: "run-1" };
        }
      } as never;
    },
    createService() {
      return {
        async getStatus(runId: string) {
          calls.push({ method: "getStatus", args: [runId] });
          return runtimeSnapshot;
        },
        async getExecutionPlan() {
          assert.fail("getExecutionPlan should not be called by these surfaces");
        },
        async applyRecovery() {
          assert.fail("applyRecovery should not be called by these surfaces");
        },
        async recommendRouting() {
          assert.fail("recommendRouting should not be called by these surfaces");
        },
        async inspectRecovery() {
          assert.fail("inspectRecovery should not be called by these surfaces");
        },
        async searchMemory() {
          assert.fail("searchMemory should not be called by these surfaces");
          return [];
        },
        async checkpointRun(runId: string, checkpoint: { checkpointId: string }) {
          calls.push({ method: "checkpointRun", args: [runId, checkpoint.checkpointId] });
          return { ok: true };
        },
        async resumeRun(runId: string) {
          calls.push({ method: "resumeRun", args: [runId] });
          return {
            ...runtimeSnapshot,
            executionPlan: runtimePlan
          };
        }
      };
    }
  };

  const coverage = await getCoverageSurface(["--run-id", "run-1", "--format", "json"], {
    dependencies
  });
  const gaps = await getGapsSurface(["--run-id", "run-1", "--blocking-only", "--format", "json"], {
    dependencies
  });
  const checkpoint = await getCheckpointSurface(["--run-id", "run-1", "--format", "json"], {
    dependencies
  });
  const resume = await getResumeSurface(["--run-id", "run-1", "--format", "json"], {
    dependencies
  });

  assert.equal(coverage.report.autonomous.configured, true);
  assert.equal(coverage.report.items.length, 1);
  assert.deepEqual(gaps.report.gaps.map((gap) => gap.id), ["gap:runtime"]);
  assert.equal(checkpoint.report.latestCheckpoint?.checkpointId, "cp-1");
  assert.equal(resume.report.executionPlan.directive.kind, "dispatch_owner");
  assert.equal(resume.report.autonomous.resume.source, "blocking_gap");
  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["getStatus", "getStatus", "getStatus", "resumeRun"]
  );
});
