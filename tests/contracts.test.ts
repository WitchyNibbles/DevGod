import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIntakeRequest,
  normalizeSearchInput,
  validateMemoryPromotion,
  validateTaskPacket
} from "../src/domain/contracts.ts";

test("normalizeIntakeRequest returns required intake fields", () => {
  const summary = normalizeIntakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Shared orchestration",
    request: "Build a shared agent workflow core for multiple projects."
  });

  assert.equal(summary.goal, "Shared orchestration");
  assert.ok(summary.constraints.length > 0);
  assert.ok(summary.risks.length > 0);
  assert.ok(summary.unknowns.length > 0);
  assert.equal(summary.stopGo, "needs_review");
});

test("validateTaskPacket rejects missing operational controls", () => {
  const errors = validateTaskPacket({
    taskId: "task-1",
    title: "Bad task",
    ownerRole: "backend_engineer",
    goal: "ship something",
    inputs: [],
    outputs: [],
    dependencies: [],
    allowedWriteScope: [],
    outOfScope: [],
    acceptanceCriteria: [],
    verificationSteps: [],
    requiredReviews: [],
    securityChecks: [],
    antiPatterns: [],
    rollbackNotes: "",
    handoffFormat: ""
  });

  assert.ok(errors.includes("allowedWriteScope is required"));
  assert.ok(errors.includes("acceptanceCriteria is required"));
  assert.ok(errors.includes("requiredReviews is required"));
});

test("validateMemoryPromotion rejects secrets and speculative claims", () => {
  const errors = validateMemoryPromotion({
    scope: "project",
    entryType: "lesson",
    title: "Unsafe note",
    content: "postgres://user:secret@example.com/db will always self-modify",
    sourceRunId: "run-1",
    reviewer: "security_reviewer",
    actor: "memory_curator"
  });

  assert.ok(errors.some((error) => error.includes("secret")));
  assert.ok(errors.some((error) => error.includes("speculative")));
});

test("normalizeSearchInput defaults requesterRole and rejects invalid retrieval roles", async () => {
  const normalized = normalizeSearchInput({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident playbook"
  });

  assert.equal(normalized.requesterRole, "planner");

  await assert.rejects(
    async () =>
      normalizeSearchInput({
        workspaceSlug: "team",
        projectSlug: "devgod",
        query: "incident playbook",
        requesterRole: "ceo" as "planner"
      }),
    /requesterRole must be one of/
  );
});

test("validateMemoryPromotion rejects invalid retrieval metadata", () => {
  const errors = validateMemoryPromotion({
    scope: "project",
    entryType: "lesson",
    title: "Scoped note",
    content: "incident review notes",
    sourceRunId: "run-1",
    reviewer: "memory_curator",
    actor: "memory_curator",
    metadata: {
      retrievalRoles: ["security_reviewer", "ceo" as "planner"],
      staleAfterDays: 0,
      reviewedAt: "not-a-date"
    }
  });

  assert.ok(errors.some((error) => error.includes("invalid retrieval roles")));
  assert.ok(errors.some((error) => error.includes("staleAfterDays")));
  assert.ok(errors.some((error) => error.includes("reviewedAt")));
});
