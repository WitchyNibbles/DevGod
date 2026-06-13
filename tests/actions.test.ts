import test from "node:test";
import assert from "node:assert/strict";
import { createActionHandlers } from "../src/core/actions.ts";
import {
  createReviewActionContextResolver,
  type AuthenticatedPrincipal,
  type ReviewIdentityBindings
} from "../src/core/review-context.ts";
import { DevgodCoreService } from "../src/core/service.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

test("createActionHandlers forwards every action to the matching service method", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = {
    intakeRequest(input: unknown) {
      calls.push({ method: "intakeRequest", args: [input] });
      return Promise.resolve("intake");
    },
    createPlan(input: unknown) {
      calls.push({ method: "createPlan", args: [input] });
      return Promise.resolve("plan");
    },
    createTaskGraph(runId: string, taskPackets: unknown[]) {
      calls.push({ method: "createTaskGraph", args: [runId, taskPackets] });
      return Promise.resolve("graph");
    },
    claimTask(runId: string, taskId: string, actor: string) {
      calls.push({ method: "claimTask", args: [runId, taskId, actor] });
      return Promise.resolve("claim");
    },
    submitHandoff(runId: string, taskId: string, handoff: unknown) {
      calls.push({ method: "submitHandoff", args: [runId, taskId, handoff] });
      return Promise.resolve("handoff");
    },
    recordReview(runId: string, taskId: string, actor: string, review: unknown) {
      calls.push({ method: "recordReview", args: [runId, taskId, actor, review] });
      return Promise.resolve("review");
    },
    promoteMemory(runId: string, memory: unknown) {
      calls.push({ method: "promoteMemory", args: [runId, memory] });
      return Promise.resolve("memory");
    },
    searchMemory(input: unknown) {
      calls.push({ method: "searchMemory", args: [input] });
      return Promise.resolve("search");
    },
    getStatus(runId: string) {
      calls.push({ method: "getStatus", args: [runId] });
      return Promise.resolve("status");
    },
    getExecutionPlan(runId: string) {
      calls.push({ method: "getExecutionPlan", args: [runId] });
      return Promise.resolve("execution");
    },
    resumeRun(runId: string) {
      calls.push({ method: "resumeRun", args: [runId] });
      return Promise.resolve("resume");
    },
    recommendRouting(runId: string) {
      calls.push({ method: "recommendRouting", args: [runId] });
      return Promise.resolve("routing");
    }
  } as unknown as DevgodCoreService;

  const handlers = createActionHandlers(service);

  assert.equal(await handlers.intake_request({ request: "x" } as never), "intake");
  assert.equal(await handlers.create_plan({ plan: "x" } as never), "plan");
  assert.equal(
    await handlers.create_task_graph({
      runId: "run-1",
      taskPackets: [{ taskId: "task-1" }] as never
    }),
    "graph"
  );
  assert.equal(await handlers.claim_task({ runId: "run-1", taskId: "task-1", actor: "worker" }), "claim");
  assert.equal(
    await handlers.submit_handoff({
      runId: "run-1",
      taskId: "task-1",
      handoff: { actor: "worker" } as never
    }),
    "handoff"
  );
  assert.equal(
    await handlers.record_review({
      runId: "run-1",
      taskId: "task-1",
      actor: "reviewer",
      review: { reviewerRole: "reviewer" } as never
    }),
    "review"
  );
  assert.equal(
    await handlers.promote_memory({
      runId: "run-1",
      memory: { title: "note" } as never
    }),
    "memory"
  );
  assert.equal(await handlers.search_memory({ query: "note" } as never), "search");
  assert.equal(await handlers.get_status({ runId: "run-1" }), "status");
  assert.equal(await handlers.get_execution_plan({ runId: "run-1" }), "execution");
  assert.equal(await handlers.resume_run({ runId: "run-1" }), "resume");
  assert.equal(await handlers.recommend_routing({ runId: "run-1" }), "routing");

  assert.deepEqual(calls, [
    { method: "intakeRequest", args: [{ request: "x" }] },
    { method: "createPlan", args: [{ plan: "x" }] },
    { method: "createTaskGraph", args: ["run-1", [{ taskId: "task-1" }]] },
    { method: "claimTask", args: ["run-1", "task-1", "worker"] },
    { method: "submitHandoff", args: ["run-1", "task-1", { actor: "worker" }] },
    { method: "recordReview", args: ["run-1", "task-1", "reviewer", { reviewerRole: "reviewer" }] },
    { method: "promoteMemory", args: ["run-1", { title: "note" }] },
    { method: "searchMemory", args: [{ query: "note" }] },
    { method: "getStatus", args: ["run-1"] },
    { method: "getExecutionPlan", args: ["run-1"] },
    { method: "resumeRun", args: ["run-1"] },
    { method: "recommendRouting", args: ["run-1"] }
  ]);
});

function createServiceAndRun(
  overrides: {
    bindings?: ReviewIdentityBindings | undefined;
    principals?: Record<string, AuthenticatedPrincipal> | undefined;
    withResolver?: boolean | undefined;
  } = {}
) {
  const service = new DevgodCoreService(
    new MemoryStore(),
    overrides.withResolver === false
      ? {}
      : {
          resolveReviewActionContext: createReviewActionContextResolver({
            bindings: overrides.bindings ?? { bindings: [] },
            resolveAuthenticatedPrincipal(input) {
              return overrides.principals?.[input.actor] ?? {
                provider: "test",
                subject: input.actor,
                verified: true
              };
            }
          })
        }
  );
  return { service };
}

test("record_review action rejects caller-asserted role use without trusted resolver", async () => {
  const { service } = createServiceAndRun({ withResolver: false });
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    {
      taskId: "task-1",
      title: "Create task graph",
      ownerRole: "planner",
      completionStandard: "specialist_verified",
      requiredSpecialistRoles: ["planner"],
      qualityGates: ["product_acceptance", "completion_audit_required"],
      goal: "Build task graph",
      inputs: ["intake brief"],
      outputs: ["task packets"],
      dependencies: [],
      allowedWriteScope: [".devgod/work/tasks"],
      outOfScope: ["production deploys"],
      acceptanceCriteria: ["task packet exists"],
      verificationSteps: ["review generated packet"],
      requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
      securityChecks: ["ensure write scope is narrow"],
      antiPatterns: ["broad repo edits"],
      rollbackNotes: "delete the generated task packet",
      handoffFormat: "summary + blockers + changed files"
    }
  ]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/actions.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner-owned task packet and handoff"],
    qualityGateEvidence: ["product acceptance reviewed in brief"],
    contextRefs: ["brief-1"]
  });
  const handlers = createActionHandlers(service);

  await assert.rejects(
    handlers.record_review({
      runId: run.id,
      taskId: "task-1",
      actor: "security-reviewer-1",
      review: {
        reviewerRole: "security_reviewer",
        state: "passed",
        severity: "low",
        findings: []
      }
    }),
    /recordReview requires a trusted review action context resolver/
  );
});

test("record_review action uses trusted resolver output instead of caller-supplied role claims", async () => {
  const { service } = createServiceAndRun({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "test",
            subject: "security-reviewer-1"
          },
          actors: [
            {
              actor: "security-reviewer-1",
              roles: ["security_reviewer"]
            }
          ]
        }
      ]
    }
  });
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Build core",
    request: "Ship the shared orchestration backend."
  });

  await service.createTaskGraph(run.id, [
    {
      taskId: "task-1",
      title: "Create task graph",
      ownerRole: "planner",
      completionStandard: "specialist_verified",
      requiredSpecialistRoles: ["planner"],
      qualityGates: ["product_acceptance", "completion_audit_required"],
      goal: "Build task graph",
      inputs: ["intake brief"],
      outputs: ["task packets"],
      dependencies: [],
      allowedWriteScope: [".devgod/work/tasks"],
      outOfScope: ["production deploys"],
      acceptanceCriteria: ["task packet exists"],
      verificationSteps: ["review generated packet"],
      requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
      securityChecks: ["ensure write scope is narrow"],
      antiPatterns: ["broad repo edits"],
      rollbackNotes: "delete the generated task packet",
      handoffFormat: "summary + blockers + changed files"
    }
  ]);
  await service.claimTask(run.id, "task-1", "planner");
  await service.submitHandoff(run.id, "task-1", {
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "ready for review",
    changedFiles: ["src/core/actions.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
    executionEvidence: ["planner-owned task packet and handoff"],
    qualityGateEvidence: ["product acceptance reviewed in brief"],
    contextRefs: ["brief-1"]
  });

  const handlers = createActionHandlers(service);

  const result = await handlers.record_review({
    runId: run.id,
    taskId: "task-1",
    actor: "security-reviewer-1",
    review: {
      reviewerRole: "security_reviewer",
      state: "passed",
      severity: "low",
      findings: []
    }
  });

  assert.equal(result.review.actor, "security-reviewer-1");
  assert.equal(result.review.actorRole, "security_reviewer");
  assert.equal(result.task.status, "review_blocked");
  assert.ok(result.blockers.includes("missing required review: reviewer"));
});
