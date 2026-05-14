import test from "node:test";
import assert from "node:assert/strict";
import { getLoopSurface, getPlanContextSurface } from "../src/admin/runtime-surface.ts";
import type { RunExecutionPlan } from "../src/domain/types.ts";

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
