import test from "node:test";
import assert from "node:assert/strict";
import {
  canActorWaiveReview,
  defaultRetrievalRoles,
  effectiveRequiredReviews,
  findSecretSignals,
  hasFutureTenseClaim,
  isCompletionStandard,
  isGateReviewRole,
  isIdentityAssurance,
  isQualityGate,
  isRetrievalRole,
  isReviewWaiverAuthority,
  isValidStopGoDecision,
  canReviewRecordSatisfyGate,
  normalizeRetrievalMetadata,
  normalizeIntakeRequest,
  normalizeSearchInput,
  validateMemoryPromotion,
  validateReviewAction,
  validateHandoff,
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

test("normalizeIntakeRequest derives goal and go stopGo from explicit safe inputs", () => {
  const summary = normalizeIntakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "   ",
    request: "   Capture the final docs wording.   ",
    goal: "  polish docs  ",
    risks: ["minor doc drift"],
    unknowns: []
  });

  assert.equal(summary.goal, "polish docs");
  assert.equal(summary.stopGo, "go");
});

test("validateTaskPacket rejects missing operational controls", () => {
  const errors = validateTaskPacket({
    taskId: "task-1",
    title: "Bad task",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    requiredSpecialistRoles: [],
    qualityGates: [],
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
  assert.ok(errors.includes("requiredSpecialistRoles is required"));
  assert.ok(errors.includes("qualityGates is required"));
});

test("validateTaskPacket rejects non-devgod roles and missing mandatory review trio", () => {
  const errors = validateTaskPacket({
    taskId: "task-1",
    title: "Bad task",
    ownerRole: "ceo",
    completionStandard: "specialist_verified",
    requiredSpecialistRoles: ["planner"],
    qualityGates: ["tdd_required"],
    goal: "ship something",
    inputs: ["brief"],
    outputs: ["handoff"],
    dependencies: [],
    allowedWriteScope: ["src/core"],
    outOfScope: ["deploy"],
    acceptanceCriteria: ["done"],
    verificationSteps: ["npm test"],
    requiredReviews: ["qa_engineer", "planner" as "reviewer"],
    securityChecks: ["no secrets"],
    antiPatterns: ["broad edits"],
    rollbackNotes: "revert patch",
    handoffFormat: "summary"
  });

  assert.ok(errors.some((error) => error.includes("ownerRole must be one of")));
  assert.ok(errors.includes("requiredReviews must be limited to: reviewer, security_reviewer, qa_engineer"));
  assert.ok(errors.includes("missing required review gate: reviewer"));
  assert.ok(errors.includes("missing required review gate: security_reviewer"));
  assert.ok(!errors.includes("requiredSpecialistRoles must include ownerRole"));
});

test("validateTaskPacket accepts newly shipped specialist roles", () => {
  const errors = validateTaskPacket({
    taskId: "task-1",
    title: "TDD task",
    ownerRole: "tdd-guide",
    completionStandard: "specialist_verified",
    requiredSpecialistRoles: ["tdd-guide"],
    qualityGates: ["tdd_required"],
    goal: "prove behavior first",
    inputs: ["brief"],
    outputs: ["tests"],
    dependencies: [],
    allowedWriteScope: ["tests"],
    outOfScope: ["deploy"],
    acceptanceCriteria: ["failing test exists"],
    verificationSteps: ["npm test"],
    requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
    securityChecks: ["no secrets"],
    antiPatterns: ["implementation first"],
    rollbackNotes: "revert patch",
    handoffFormat: "summary"
  });

  assert.ok(!errors.some((error) => error.includes("ownerRole must be one of")));
});

test("validateTaskPacket rejects duplicate gates, roles, and write scope", () => {
  const errors = validateTaskPacket({
    taskId: "task-1",
    title: "Bad task",
    ownerRole: "backend_engineer",
    completionStandard: "artifact_complete",
    requiredSpecialistRoles: ["backend_engineer", "backend_engineer"],
    qualityGates: ["tdd_required", "tdd_required"],
    goal: "ship something",
    inputs: ["brief"],
    outputs: ["handoff"],
    dependencies: [],
    allowedWriteScope: ["src/core", "src/core"],
    outOfScope: [],
    acceptanceCriteria: ["done"],
    verificationSteps: ["npm test"],
    requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
    securityChecks: ["no secrets"],
    antiPatterns: ["broad edits"],
    rollbackNotes: "revert patch",
    handoffFormat: "summary"
  });

  assert.ok(errors.includes("requiredSpecialistRoles must not contain empty or duplicate values"));
  assert.ok(errors.includes("qualityGates must not contain empty or duplicate values"));
  assert.ok(errors.includes("duplicate write scope: src/core"));
});

test("validateHandoff rejects empty evidence fields", () => {
  const errors = validateHandoff({
    actor: "planner",
    ownerRole: "planner",
    completionStandard: "specialist_verified",
    summary: "",
    changedFiles: [],
    blockers: [],
    verificationNotes: [""],
    executionEvidence: [],
    qualityGateEvidence: [],
    contextRefs: []
  });

  assert.ok(errors.includes("handoff summary is required"));
  assert.ok(errors.includes("handoff changedFiles must contain at least one non-empty path"));
  assert.ok(errors.includes("handoff verificationNotes must contain at least one non-empty item"));
  assert.ok(errors.includes("handoff executionEvidence must contain at least one non-empty item"));
  assert.ok(errors.includes("handoff qualityGateEvidence must contain at least one non-empty item"));
  assert.ok(errors.includes("handoff contextRefs must contain at least one non-empty item"));
});

test("validateReviewAction rejects spoofed gate claims and invalid waivers", () => {
  const passErrors = validateReviewAction(
    {
      actor: "planner-1",
      actorRole: "planner",
      waiverAuthority: "none"
    },
    {
      reviewerRole: "qa_engineer",
      state: "passed",
      severity: "low",
      findings: []
    }
  );
  assert.ok(
    passErrors.includes("actorRole planner cannot record qa_engineer review state passed")
  );

  const waiveErrors = validateReviewAction(
    {
      actor: "planner-1",
      actorRole: "planner",
      waiverAuthority: "manager"
    },
    {
      reviewerRole: "security_reviewer",
      state: "waived",
      severity: "low",
      findings: [],
      waiverReason: "skip security"
    }
  );
  assert.ok(
    waiveErrors.includes("actorRole planner is not allowed to waive security_reviewer")
  );
});

test("validateReviewAction accepts matching reviewer roles and valid security waivers", () => {
  const passErrors = validateReviewAction(
    {
      actor: "security-1",
      actorRole: "security_reviewer",
      waiverAuthority: "none"
    },
    {
      reviewerRole: "security_reviewer",
      state: "passed",
      severity: "low",
      findings: ["checked auth"]
    }
  );
  assert.deepEqual(passErrors, []);

  const waiveErrors = validateReviewAction(
    {
      actor: "security-1",
      actorRole: "security_reviewer",
      waiverAuthority: "security_exception"
    },
    {
      reviewerRole: "security_reviewer",
      state: "waived",
      severity: "low",
      findings: ["accepted"],
      waiverReason: "documented exception"
    }
  );
  assert.deepEqual(waiveErrors, []);
});

test("canReviewRecordSatisfyGate rejects legacy-backfilled review provenance", () => {
  assert.equal(
    canReviewRecordSatisfyGate({
      id: "review-1",
      runId: "run-1",
      taskId: "task-1",
      reviewerRole: "reviewer",
      actor: "reviewer-1",
      actorRole: "reviewer",
      identityAssurance: "legacy_backfill",
      state: "passed",
      severity: "low",
      findings: [],
      waiverAuthority: "none",
      createdAt: "2026-05-05T00:00:00.000Z"
    }),
    false
  );
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

test("normalizeRetrievalMetadata defaults roles and deduplicates metadata arrays", () => {
  const metadata = normalizeRetrievalMetadata({
    retrievalRoles: ["planner", "planner", "invalid" as "planner"],
    tags: ["ops", "ops", " docs "],
    supersededBy: ["a", "a", "b"],
    contradicts: ["x", "x", "y"]
  });

  assert.deepEqual(metadata.retrievalRoles, ["planner"]);
  assert.deepEqual(metadata.tags, ["ops", "docs"]);
  assert.deepEqual(metadata.supersededBy, ["a", "b"]);
  assert.deepEqual(metadata.contradicts, ["x", "y"]);
});

test("default helpers and type guards expose the shipped workflow vocabulary", () => {
  assert.ok(defaultRetrievalRoles().includes("planner"));
  assert.deepEqual(effectiveRequiredReviews(["reviewer"]), ["reviewer", "security_reviewer", "qa_engineer"]);
  assert.equal(isRetrievalRole("planner"), true);
  assert.equal(isRetrievalRole("ceo"), false);
  assert.equal(isGateReviewRole("reviewer"), true);
  assert.equal(isGateReviewRole("planner"), false);
  assert.equal(isReviewWaiverAuthority("manager"), true);
  assert.equal(isReviewWaiverAuthority("bad"), false);
  assert.equal(isIdentityAssurance("authenticated"), true);
  assert.equal(isIdentityAssurance("bad"), false);
  assert.equal(isCompletionStandard("specialist_verified"), true);
  assert.equal(isCompletionStandard("bad"), false);
  assert.equal(isQualityGate("tdd_required"), true);
  assert.equal(isQualityGate("bad"), false);
  assert.equal(isValidStopGoDecision("go"), true);
  assert.equal(isValidStopGoDecision("later"), false);
});

test("waiver and secret helpers classify supported policy cases", () => {
  assert.equal(
    canActorWaiveReview({
      actorRole: "planner",
      reviewerRole: "qa_engineer",
      waiverAuthority: "manager"
    }),
    true
  );
  assert.equal(
    canActorWaiveReview({
      actorRole: "planner",
      reviewerRole: "security_reviewer",
      waiverAuthority: "manager"
    }),
    false
  );
  assert.equal(
    canActorWaiveReview({
      actorRole: "security_reviewer",
      reviewerRole: "security_reviewer",
      waiverAuthority: "security_exception"
    }),
    true
  );
  assert.ok(findSecretSignals("-----BEGIN RSA PRIVATE KEY-----").length > 0);
  assert.equal(hasFutureTenseClaim("This system will always self-modify."), true);
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
