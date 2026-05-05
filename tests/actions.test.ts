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
    summary: "ready for review",
    changedFiles: ["src/core/actions.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
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
    summary: "ready for review",
    changedFiles: ["src/core/actions.ts"],
    blockers: [],
    verificationNotes: ["npm test"],
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
