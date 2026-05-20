import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutonomousOperatorSummary,
  classifyContinueAnalysisDirective
} from "../src/admin/autonomous-summary.ts";
import {
  getCheckpointSurface,
  getCoverageSurface,
  getGapsSurface,
  getLoopSurface,
  getPlanContextSurface,
  getResumeSurface
} from "../src/admin/runtime-surface.ts";
import { dbInternals, withClientUsing } from "../src/admin/db.ts";
import type { CoverageItemCategory, RunExecutionPlan, RunStatusSnapshot } from "../src/domain/types.ts";

function buildRunSnapshot(
  overrides: Partial<RunStatusSnapshot> = {}
): RunStatusSnapshot {
  return {
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
      status: "ready",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    },
    tasks: [],
    activeLocks: [],
    blockers: [],
    nextTaskIds: [],
    ...overrides
  };
}

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
            },
            async getProjectRuntimeRegistration(projectId: string) {
              assert.equal(projectId, "project-1");
              return {
                projectId,
                workspaceId: "workspace-1",
                repoPath: process.cwd(),
                runtimeProfile: "managed",
                dataRoot: process.cwd(),
                qdrantUrl: "http://127.0.0.1:6333",
                qdrantCollection: "devgod-memory",
                installManifestPath: ".devgod/install-manifest.json",
                manifest: {},
                provenance: {},
                createdAt: "2026-05-13T00:00:00.000Z",
                updatedAt: "2026-05-13T00:00:00.000Z"
              };
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
        },
        async inspectQdrant() {
          return {
            ok: true,
            summary: "qdrant reachable"
          };
        },
        async inspectReviewIdentity() {
          return {
            authorityLabel: "derived_only" as const,
            adapterConfigured: true,
            adapterExists: true,
            adapterModulePath: "review-identity-adapter.ts",
            selectedBackend: "devgod_local_seed",
            availableBackends: ["devgod_local_seed"],
            bindingsPresent: true,
            bindingsPath: ".devgod/review-identity-bindings.json",
            bindingsUseShippedTemplate: false,
            liveTrustReady: true,
            notes: []
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
    ["getStatus", "getExecutionPlan", "applyRecovery", "getExecutionPlan", "executeDirectiveStep"]
  );
});

test("getLoopSurface rethrows database connectivity failures as runtime preflight errors", async () => {
  await assert.rejects(
    getLoopSurface(["--run-id", "run-1", "--format", "json"], {
      dependencies: {
        async loadDotEnv() {},
        async withClient() {
          throw new Error("connect ECONNREFUSED 127.0.0.1:55432");
        }
      }
    }),
    /runtime execution preflight failed: database unavailable: connect ECONNREFUSED 127\.0\.0\.1:55432/i
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

test("buildAutonomousOperatorSummary handles unconfigured, checkpoint, progress-proof, and execution-plan resume states", () => {
  const unconfigured = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot()
  });
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.resume.status, "not_configured");
  assert.equal(unconfigured.resume.source, "none");

  const checkpointSummary = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [
            {
              runId: "run-1",
              checkpointId: "cp-2",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:resume"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: ["resume at task:resume"],
              compressedContextRef: "memory://cp-2",
              createdAt: "2026-05-15T00:02:00.000Z"
            }
          ],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:02:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    })
  });
  assert.equal(checkpointSummary.resume.status, "ready");
  assert.equal(checkpointSummary.resume.source, "checkpoint");
  assert.deepEqual(checkpointSummary.resume.nextActions, ["resume at task:resume"]);

  const progressSummary = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [
            {
              cycle: 2,
              proofId: "proof-2",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:validate",
              whyNext: "validate the recovered slice",
              createdAt: "2026-05-15T00:03:00.000Z"
            }
          ],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:03:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    })
  });
  assert.equal(progressSummary.resume.source, "progress_proof");
  assert.deepEqual(progressSummary.resume.nextActions, ["validate the recovered slice"]);

  const planSummary = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:04:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "ready",
      directive: {
        kind: "dispatch_reviews",
        recommendations: [
          {
            taskId: "task-1",
            taskStatus: "review_blocked",
            recommendation: "review_dispatch",
            authorityLabel: "derived_only",
            targetReviewRole: "qa_engineer",
            rationale: ["qa still needed"],
            blockers: [],
            allowedWriteScope: [],
            retrievalGuidance: [],
            approvalCheckpoints: []
          }
        ],
        rationale: ["qa still needed"]
      }
    }
  });
  assert.equal(planSummary.resume.source, "execution_plan");
  assert.deepEqual(planSummary.resume.nextActions, ["request qa_engineer for task-1"]);

  const genericReviewPlan = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:04:15.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "review_blocked",
      directive: {
        kind: "dispatch_reviews",
        recommendations: [
          {
            taskId: "task-generic-review",
            taskStatus: "review_blocked",
            recommendation: "review_dispatch",
            authorityLabel: "derived_only",
            rationale: ["generic review needed"],
            blockers: [],
            allowedWriteScope: [],
            retrievalGuidance: [],
            approvalCheckpoints: []
          }
        ],
        rationale: ["generic review needed"]
      }
    }
  });
  assert.deepEqual(genericReviewPlan.resume.nextActions, ["request review for task-generic-review"]);

  const ownerFallbackPlan = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:04:30.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "ready",
      directive: {
        kind: "dispatch_owner",
        recommendation: {
          taskId: "task-2",
          taskStatus: "ready",
          recommendation: "owner_dispatch",
          authorityLabel: "derived_only",
          rationale: ["owner fallback"],
          blockers: [],
          allowedWriteScope: [],
          retrievalGuidance: [],
          approvalCheckpoints: []
        },
        rationale: ["owner fallback"]
      }
    }
  });
  assert.deepEqual(ownerFallbackPlan.resume.nextActions, ["dispatch task-2 to owner"]);

  const completePlanSummary = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [
            {
              runId: "run-1",
              checkpointId: "cp-a",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:first"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: [],
              compressedContextRef: "memory://cp-a",
              createdAt: "2026-05-15T00:10:00.000Z"
            },
            {
              runId: "run-1",
              checkpointId: "cp-z",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:latest"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: [],
              compressedContextRef: "memory://cp-z",
              createdAt: "2026-05-15T00:10:00.000Z"
            }
          ],
          progressProofs: [
            {
              cycle: 7,
              proofId: "proof-older",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:older",
              whyNext: "older proof",
              createdAt: "2026-05-15T00:10:00.000Z"
            },
            {
              cycle: 7,
              proofId: "proof-latest",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:latest-proof",
              whyNext: "latest proof",
              createdAt: "2026-05-15T00:11:00.000Z"
            }
          ],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:11:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "done",
      directive: {
        kind: "complete",
        rationale: ["done"]
      }
    }
  });
  assert.equal(completePlanSummary.latestProgressProof?.proofId, "proof-latest");
  assert.equal(completePlanSummary.latestCheckpoint?.checkpointId, "cp-z");
  assert.equal(completePlanSummary.resume.source, "checkpoint");
  assert.deepEqual(completePlanSummary.resume.nextActions, []);
});

test("buildAutonomousOperatorSummary derives blocked fallback sources and execution-plan next actions", () => {
  const blockedFromCheckpoint = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "blocked",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [
            {
              runId: "run-1",
              checkpointId: "cp-fallback",
              authorityLabel: "runtime_authoritative",
              phase: "blocked",
              activeTargets: ["task:stalled"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: [],
              compressedContextRef: "memory://cp-fallback",
              createdAt: "2026-05-15T00:06:00.000Z"
            }
          ],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:06:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "blocked",
          status: "blocked",
          reasons: ["manual step required"]
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "review_blocked",
      directive: {
        kind: "blocked",
        blockers: ["manual step required"],
        rationale: ["manual step required"]
      }
    }
  });
  assert.equal(blockedFromCheckpoint.resume.status, "ready");
  assert.equal(blockedFromCheckpoint.resume.source, "checkpoint");
  assert.deepEqual(blockedFromCheckpoint.resume.nextActions, ["manual step required"]);

  const continueAnalysisPlan = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [
            {
              cycle: 3,
              proofId: "proof-3",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:resume-proof",
              whyNext: "",
              createdAt: "2026-05-15T00:07:00.000Z"
            }
          ],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:07:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "ready",
      directive: {
        kind: "continue_analysis",
        targetId: "task:resume-proof",
        source: "progress_proof",
        actions: [{ kind: "run_workflow_proof", taskId: "task:resume-proof" }],
        nextActions: [],
        blockers: [],
        rationale: ["resume proof"]
      }
    }
  });
  assert.equal(continueAnalysisPlan.resume.source, "progress_proof");
  assert.deepEqual(continueAnalysisPlan.resume.nextActions, ["continue at task:resume-proof"]);
  assert.equal(continueAnalysisPlan.resume.executionMode, "runtime_executable");

  const recoveryPlan = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:08:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "review_blocked",
      directive: {
        kind: "apply_recovery",
        actions: [
          {
            id: "recover-1",
            authorityLabel: "derived_only",
            kind: "reset_task_to_ready",
            taskId: "task-1",
            safeToApply: true,
            rationale: ["recovery"]
          }
        ],
        rationale: ["recovery"]
      }
    }
  });
  assert.equal(recoveryPlan.resume.source, "execution_plan");
  assert.deepEqual(recoveryPlan.resume.nextActions, ["apply recovery recover-1"]);

  const proofFallbackPlan = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [
            {
              cycle: 4,
              proofId: "proof-4",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "",
              whyNext: "",
              createdAt: "2026-05-15T00:09:00.000Z"
            }
          ],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:09:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "ready",
      directive: {
        kind: "continue_analysis",
        targetId: "task:follow-up",
        source: "progress_proof",
        actions: [{ kind: "run_workflow_proof", taskId: "task:follow-up" }],
        nextActions: ["resume follow-up analysis"],
        blockers: [],
        rationale: ["analysis remains"]
      }
    }
  });
  assert.equal(proofFallbackPlan.resume.source, "progress_proof");
  assert.deepEqual(proofFallbackPlan.resume.nextActions, ["resume follow-up analysis"]);
});

test("classifyContinueAnalysisDirective covers typed continuation actions and persisted resume validation", () => {
  const state = {
    enabled: true,
    profile: "standard_delivery" as const,
    phase: "validation" as const,
    manifest: {
      runId: "run-1",
      profile: "standard_delivery" as const,
      requiredCategories: ["tests"] as CoverageItemCategory[],
      thresholds: {
        criticalItemCoverage: 0.8,
        criticalItemValidation: 0.8,
        callsiteCoverage: 0.8,
        runtimeTraceCoverage: 0.8
      }
    },
    coverageItems: [],
    gaps: [],
    checkpoints: [
      {
        runId: "run-1",
        checkpointId: "cp-1",
        authorityLabel: "runtime_authoritative" as const,
        phase: "validation" as const,
        activeTargets: ["checkpoint:cp-1"],
        recentEvidenceRefs: [],
        openGaps: [],
        nextActions: [],
        compressedContextRef: "memory://cp-1",
        createdAt: "2026-05-15T00:05:00.000Z"
      }
    ],
    progressProofs: [
      {
        cycle: 1,
        proofId: "proof-1",
        phaseBefore: "implementation" as const,
        phaseAfter: "validation" as const,
        evidenceRefs: [],
        coverageDelta: {},
        blockingGapDelta: { closed: 0, opened: 0 },
        nextTarget: "proof:proof-1",
        whyNext: "",
        createdAt: "2026-05-15T00:05:00.000Z"
      }
    ],
    pendingInvestigations: [],
    executionEpoch: 1,
    updatedAt: "2026-05-15T00:05:00.000Z"
  };

  const noAction = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "task:missing",
      source: "blocking_gap",
      actions: [],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(noAction.executionMode, "operator_required");

  const workflowProof = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "task:proof",
      source: "blocking_gap",
      actions: [{ kind: "run_workflow_proof", taskId: "task:proof" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(workflowProof.executionMode, "runtime_executable");

  const taskGap = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "task:gap",
      source: "blocking_gap",
      actions: [{ kind: "resolve_blocking_gap", gapId: "gap-1", targetId: "task:gap" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(taskGap.executionMode, "runtime_executable");

  const advisoryGap = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "doc:gap",
      source: "blocking_gap",
      actions: [{ kind: "resolve_blocking_gap", gapId: "gap-2", targetId: "doc:gap" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(advisoryGap.executionMode, "operator_required");

  const taskResume = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "task:resume",
      source: "checkpoint",
      actions: [{ kind: "resume_target", targetId: "task:resume", source: "checkpoint", sourceId: "cp-1" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(taskResume.executionMode, "runtime_executable");

  const authenticatedResume = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "review:authenticated",
      source: "checkpoint",
      actions: [
        { kind: "resume_target", targetId: "review:authenticated", source: "checkpoint", sourceId: "cp-1" }
      ],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(authenticatedResume.executionMode, "runtime_executable");

  const missingProofSource = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "proof:proof-1",
      source: "progress_proof",
      actions: [{ kind: "resume_target", targetId: "proof:proof-1", source: "progress_proof" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(missingProofSource.executionMode, "operator_required");

  const staleProofSource = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "proof:stale",
      source: "progress_proof",
      actions: [
        { kind: "resume_target", targetId: "proof:stale", source: "progress_proof", sourceId: "proof-1" }
      ],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(staleProofSource.executionMode, "operator_required");

  const matchingProofSource = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "proof:proof-1",
      source: "progress_proof",
      actions: [
        { kind: "resume_target", targetId: "proof:proof-1", source: "progress_proof", sourceId: "proof-1" }
      ],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(matchingProofSource.executionMode, "runtime_executable");

  const matchingCheckpointSource = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "checkpoint:cp-1",
      source: "checkpoint",
      actions: [
        { kind: "resume_target", targetId: "checkpoint:cp-1", source: "checkpoint", sourceId: "cp-1" }
      ],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(matchingCheckpointSource.executionMode, "runtime_executable");

  const missingCheckpointSource = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "checkpoint:cp-1",
      source: "checkpoint",
      actions: [{ kind: "resume_target", targetId: "checkpoint:cp-1", source: "checkpoint" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(missingCheckpointSource.executionMode, "operator_required");

  const staleCheckpointSource = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "checkpoint:stale",
      source: "checkpoint",
      actions: [
        { kind: "resume_target", targetId: "checkpoint:stale", source: "checkpoint", sourceId: "cp-1" }
      ],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(staleCheckpointSource.executionMode, "operator_required");

  const advisoryResume = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "doc:followup",
      source: "blocking_gap",
      actions: [{ kind: "resume_target", targetId: "doc:followup", source: "blocking_gap", sourceId: "gap-1" }],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(advisoryResume.executionMode, "operator_required");

  const unknownAction = classifyContinueAnalysisDirective({
    directive: {
      kind: "continue_analysis",
      targetId: "task:unknown",
      source: "blocking_gap",
      actions: [{ kind: "unsupported_action" } as never],
      nextActions: [],
      blockers: [],
      rationale: []
    },
    state
  });
  assert.equal(unknownAction.executionMode, "operator_required");
  assert.match(unknownAction.summary, /task:unknown/);
});

test("buildAutonomousOperatorSummary covers blocked fallback sources and autonomous helper defaults", () => {
  const blockedFromCheckpointActions = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      tasks: [
        {
          id: "task-coverage",
          runId: "run-1",
          workspaceId: "workspace-1",
          projectId: "project-1",
          status: "ready",
          packet: {
            id: "task-coverage",
            title: "Checkpoint task",
            goal: "Resume from checkpoint",
            ownerRole: "backend_engineer",
            status: "ready",
            allowedWriteScope: [],
            outOfScope: [],
            dependencies: [],
            acceptanceCriteria: [],
            verificationSteps: [],
            qualityGates: ["memory_compaction_required"],
            requiredReviews: [],
            securityChecks: [],
            antiPatterns: [],
            rollbackNotes: [],
            handoffNotes: []
          }
        } as never
      ],
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [
            {
              runId: "run-1",
              checkpointId: "cp-with-actions",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:checkpoint"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: ["use checkpoint evidence"],
              createdAt: "2026-05-15T00:12:00.000Z"
            }
          ],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:12:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "blocked",
          reasons: ["memory compaction required but the latest checkpoint lacks compressed context"]
        },
        blockingGaps: []
      }
    })
  });
  assert.equal(blockedFromCheckpointActions.resume.status, "blocked");
  assert.equal(blockedFromCheckpointActions.resume.source, "checkpoint");
  assert.deepEqual(blockedFromCheckpointActions.resume.nextActions, ["use checkpoint evidence"]);

  const blockedFromProgressProof = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      tasks: [
        {
          id: "task-proof-blocked",
          runId: "run-1",
          workspaceId: "workspace-1",
          projectId: "project-1",
          status: "ready",
          packet: {
            id: "task-proof-blocked",
            title: "Proof blocker",
            goal: "Require checkpoint compaction",
            ownerRole: "backend_engineer",
            status: "ready",
            allowedWriteScope: [],
            outOfScope: [],
            dependencies: [],
            acceptanceCriteria: [],
            verificationSteps: [],
            qualityGates: ["memory_compaction_required"],
            requiredReviews: [],
            securityChecks: [],
            antiPatterns: [],
            rollbackNotes: [],
            handoffNotes: []
          }
        } as never
      ],
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [
            {
              cycle: 4,
              proofId: "proof-blocked",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:proof-blocked",
              whyNext: "",
              createdAt: "2026-05-15T00:13:00.000Z"
            }
          ],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:13:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "blocked",
          reasons: ["manual review still required"]
        },
        blockingGaps: []
      }
    })
  });
  assert.equal(blockedFromProgressProof.resume.source, "progress_proof");
  assert.equal(blockedFromProgressProof.resume.nextActions.length, 0);

  const blockedFromExecutionPlan = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      tasks: [
        {
          id: "task-owner-blocked",
          runId: "run-1",
          workspaceId: "workspace-1",
          projectId: "project-1",
          status: "ready",
          packet: {
            id: "task-owner-blocked",
            title: "Owner blocker",
            goal: "Require checkpoint compaction",
            ownerRole: "backend_engineer",
            status: "ready",
            allowedWriteScope: [],
            outOfScope: [],
            dependencies: [],
            acceptanceCriteria: [],
            verificationSteps: [],
            qualityGates: ["memory_compaction_required"],
            requiredReviews: [],
            securityChecks: [],
            antiPatterns: [],
            rollbackNotes: [],
            handoffNotes: []
          }
        } as never
      ],
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:14:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "blocked",
          reasons: ["approval required"]
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "ready",
      directive: {
        kind: "dispatch_owner",
        recommendation: {
          taskId: "task-owner-blocked",
          taskStatus: "ready",
          recommendation: "owner_dispatch",
          authorityLabel: "derived_only",
          rationale: ["approval required"],
          blockers: [],
          allowedWriteScope: [],
          retrievalGuidance: [],
          approvalCheckpoints: []
        },
        rationale: ["approval required"]
      }
    }
  });
  assert.equal(blockedFromExecutionPlan.resume.source, "execution_plan");
  assert.deepEqual(blockedFromExecutionPlan.resume.nextActions, ["dispatch task-owner-blocked to owner"]);

  const blockedWithoutFallback = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      tasks: [
        {
          id: "task-no-fallback",
          runId: "run-1",
          workspaceId: "workspace-1",
          projectId: "project-1",
          status: "ready",
          packet: {
            id: "task-no-fallback",
            title: "No fallback blocker",
            goal: "Require checkpoint compaction",
            ownerRole: "backend_engineer",
            status: "ready",
            allowedWriteScope: [],
            outOfScope: [],
            dependencies: [],
            acceptanceCriteria: [],
            verificationSteps: [],
            qualityGates: ["memory_compaction_required"],
            requiredReviews: [],
            securityChecks: [],
            antiPatterns: [],
            rollbackNotes: [],
            handoffNotes: []
          }
        } as never
      ],
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:15:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "blocked",
          reasons: ["manual intervention required"]
        },
        blockingGaps: []
      }
    })
  });
  assert.equal(blockedWithoutFallback.resume.source, "none");
  assert.deepEqual(blockedWithoutFallback.resume.nextActions, []);

  const checkpointWithoutPlanActions = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [
            {
              runId: "run-1",
              checkpointId: "cp-summary-only",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:summary-only"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: [],
              compressedContextRef: "memory://cp-summary-only",
              createdAt: "2026-05-15T00:16:00.000Z"
            }
          ],
          progressProofs: [],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:16:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    })
  });
  assert.equal(checkpointWithoutPlanActions.resume.source, "checkpoint");
  assert.equal(checkpointWithoutPlanActions.resume.summary, "resume at task:summary-only");
  assert.deepEqual(checkpointWithoutPlanActions.resume.nextActions, []);

  const invalidPlanFallback = buildAutonomousOperatorSummary({
    snapshot: buildRunSnapshot({
      autonomousExecution: {
        state: {
          enabled: true,
          profile: "standard_delivery",
          phase: "validation",
          manifest: {
            runId: "run-1",
            profile: "standard_delivery",
            requiredCategories: ["tests"],
            thresholds: {
              criticalItemCoverage: 0.8,
              criticalItemValidation: 0.8,
              callsiteCoverage: 0.8,
              runtimeTraceCoverage: 0.8
            }
          },
          coverageItems: [],
          gaps: [],
          checkpoints: [
            {
              runId: "run-1",
              checkpointId: "cp-old",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:old"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: [],
              compressedContextRef: "memory://cp-old",
              createdAt: "2026-05-15T00:17:00.000Z"
            },
            {
              runId: "run-1",
              checkpointId: "cp-new",
              authorityLabel: "runtime_authoritative",
              phase: "validation",
              activeTargets: ["task:new"],
              recentEvidenceRefs: [],
              openGaps: [],
              nextActions: [],
              compressedContextRef: "memory://cp-new",
              createdAt: "2026-05-15T00:18:00.000Z"
            }
          ],
          progressProofs: [
            {
              cycle: 1,
              proofId: "proof-lower-cycle",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:low",
              whyNext: "",
              createdAt: "2026-05-15T00:18:00.000Z"
            },
            {
              cycle: 2,
              proofId: "proof-higher-cycle",
              phaseBefore: "implementation",
              phaseAfter: "validation",
              evidenceRefs: [],
              coverageDelta: {},
              blockingGapDelta: { closed: 0, opened: 0 },
              nextTarget: "task:high",
              whyNext: "",
              createdAt: "2026-05-15T00:17:00.000Z"
            }
          ],
          pendingInvestigations: [],
          executionEpoch: 1,
          updatedAt: "2026-05-15T00:18:00.000Z"
        },
        coverageSummary: {
          totalItems: 0,
          discoveredItems: 0,
          partiallyAnalyzedItems: 0,
          fullyAnalyzedItems: 0,
          validatedItems: 0,
          migratedItems: 0,
          blockedItems: 0,
          criticalItemCoverage: 1,
          criticalItemValidation: 1,
          callsiteCoverage: 1,
          runtimeTraceCoverage: 1,
          openGapCount: 0,
          blockingGapCount: 0
        },
        phaseReadiness: {
          phase: "validation",
          status: "ready",
          reasons: []
        },
        blockingGaps: []
      }
    }),
    executionPlan: {
      mode: "runtime_authoritative",
      runId: "run-1",
      runStatus: "ready",
      directive: {
        kind: "unknown_directive"
      } as never
    } as RunExecutionPlan
  });
  assert.equal(invalidPlanFallback.latestProgressProof?.proofId, "proof-higher-cycle");
  assert.equal(invalidPlanFallback.latestCheckpoint?.checkpointId, "cp-new");
  assert.equal(invalidPlanFallback.resume.source, "checkpoint");
  assert.deepEqual(invalidPlanFallback.resume.nextActions, []);
});

test("withClientUsing rejects missing database configuration", async () => {
  await assert.rejects(
    withClientUsing(async () => "unreachable", {
      env: {},
      createClient() {
        assert.fail("createClient should not be called when the database url is missing");
      }
    }),
    /DEVGOD_CORE_DATABASE_URL is required/
  );
});

test("withClientUsing rethrows the original connect error when repo-local startup declines and cleanup fails closed", async () => {
  const connectError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:55432"), {
    code: "ECONNREFUSED"
  });
  let endCalls = 0;

  await assert.rejects(
    withClientUsing(async () => "unreachable", {
      cwd: process.cwd(),
      env: {
        DEVGOD_CORE_DATABASE_URL: "postgres://127.0.0.1:55432/devgod"
      },
      createClient() {
        return {
          async connect() {
            throw connectError;
          },
          async end() {
            endCalls += 1;
            throw new Error("cleanup failure should be ignored");
          }
        };
      },
      async startRepoLocalPostgres(input) {
        assert.equal(input.connectionString, "postgres://127.0.0.1:55432/devgod");
        return false;
      }
    }),
    /ECONNREFUSED/
  );

  assert.equal(endCalls, 1);
});

test("withClientUsing rethrows the retry connect error after repo-local startup succeeds", async () => {
  const firstError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:55432"), {
    code: "ECONNREFUSED"
  });
  const retryError = new Error("retry failed");
  const created: string[] = [];

  await assert.rejects(
    withClientUsing(async () => "unreachable", {
      cwd: process.cwd(),
      env: {
        DEVGOD_CORE_DATABASE_URL: "postgres://127.0.0.1:55432/devgod"
      },
      createClient() {
        const label = `client-${created.length + 1}`;
        created.push(label);
        return {
          async connect() {
            if (label === "client-1") {
              throw firstError;
            }
            throw retryError;
          },
          async end() {}
        };
      },
      async startRepoLocalPostgres() {
        return true;
      }
    }),
    /retry failed/
  );

  assert.deepEqual(created, ["client-1", "client-2"]);
});

test("withClientUsing closes the client after callback success and callback failure", async () => {
  let successEndCalls = 0;
  const successValue = await withClientUsing(
    async () => "ok",
    {
      cwd: process.cwd(),
      env: {
        DEVGOD_CORE_DATABASE_URL: "postgres://127.0.0.1:55432/devgod"
      },
      createClient() {
        return {
          async connect() {},
          async end() {
            successEndCalls += 1;
          }
        };
      }
    }
  );
  assert.equal(successValue, "ok");
  assert.equal(successEndCalls, 1);

  let failureEndCalls = 0;
  await assert.rejects(
    withClientUsing(
      async () => {
        throw new Error("callback failed");
      },
      {
        cwd: process.cwd(),
        env: {
          DEVGOD_CORE_DATABASE_URL: "postgres://127.0.0.1:55432/devgod"
        },
        createClient() {
          return {
            async connect() {},
            async end() {
              failureEndCalls += 1;
            }
          };
        }
      }
    ),
    /callback failed/
  );
  assert.equal(failureEndCalls, 1);
});

test("dbInternals expose connection-refusal, loopback-target, and command parsing helpers", () => {
  const env: NodeJS.ProcessEnv = {
    KEEP_EXISTING: "already-set"
  };
  dbInternals.applyDotEnvText(
    `
    # comment
    EMPTY_LINE
    =ignored

    KEEP_EXISTING=overwritten
    PLAIN=value
    QUOTED="quoted value"
    WITH_EQUALS="a=b=c"
    `,
    env
  );
  assert.equal(env.KEEP_EXISTING, "already-set");
  assert.equal(env.PLAIN, "value");
  assert.equal(env.QUOTED, "quoted value");
  assert.equal(env.WITH_EQUALS, "a=b=c");

  assert.equal(
    dbInternals.isConnectionRefusedError(Object.assign(new Error("socket hangup"), { code: "ECONNREFUSED" })),
    true
  );
  assert.equal(dbInternals.isConnectionRefusedError(new Error("connect ECONNREFUSED localhost")), true);
  assert.equal(dbInternals.isConnectionRefusedError(new Error("permission denied")), false);
  assert.equal(dbInternals.isConnectionRefusedError({ code: "EOTHER" }), false);

  assert.equal(dbInternals.resolveLoopbackDatabaseTarget("not a url"), undefined);
  assert.equal(dbInternals.resolveLoopbackDatabaseTarget("mysql://127.0.0.1/db"), undefined);
  assert.equal(dbInternals.resolveLoopbackDatabaseTarget("postgres://db.example.com:5432/devgod"), undefined);
  assert.deepEqual(dbInternals.resolveLoopbackDatabaseTarget("postgres://127.0.0.1/devgod"), {
    host: "127.0.0.1",
    port: "5432"
  });
  assert.deepEqual(dbInternals.resolveLoopbackDatabaseTarget("postgresql://localhost:55432/devgod"), {
    host: "localhost",
    port: "55432"
  });
  assert.deepEqual(dbInternals.resolveLoopbackDatabaseTarget("postgresql://[::1]:55432/devgod"), {
    host: "[::1]",
    port: "55432"
  });

  assert.equal(dbInternals.parseLeadingCommand(""), undefined);
  assert.equal(dbInternals.parseLeadingCommand('   "/tmp/pg bin/postgres" -D data'), "/tmp/pg bin/postgres");
  assert.equal(dbInternals.parseLeadingCommand("postgres -D data"), "postgres");
});
