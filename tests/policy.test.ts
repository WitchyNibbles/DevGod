import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArtifactSearchResult,
  buildMemorySearchResult,
  canRoleAccessRetrievalMetadata,
  canRoleAccessSearchResult,
  compareMemorySearchResults,
  evaluateReviewDecision,
  findBlockingReasonsForTask,
  hasOverlappingWriteScope,
  scoreMemoryResult
} from "../src/core/policy.ts";
import type { LockRecord, ReviewRecord, SearchMemoryResult, TaskRecord } from "../src/domain/types.ts";

function createTask(): TaskRecord {
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
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z"
  };
}

function createReview(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "review-1",
    runId: "run-1",
    taskId: "task-1",
    reviewerRole: "reviewer",
    actor: "reviewer-1",
    actorRole: "reviewer",
    identityAssurance: "authenticated",
    state: "passed",
    severity: "low",
    findings: [],
    waiverAuthority: "none",
    createdAt: "2026-05-05T00:00:00.000Z",
    ...overrides
  };
}

function createSearchResult(overrides: Partial<SearchMemoryResult> = {}): SearchMemoryResult {
  return {
    id: "result-1",
    title: "Incident playbook",
    content: "rollback checklist",
    scope: "project",
    projectSlug: "devgod",
    score: 10,
    authority: {
      source: "shared_backend_memory",
      precedence: "retrieval_hint",
      scope: "project",
      reviewedBy: "memory_curator",
      authorityLevel: "reviewed_memory",
      allowedRoles: ["planner"]
    },
    freshness: {
      status: "fresh",
      createdAt: "2026-05-05T00:00:00.000Z",
      ageDays: 1,
      staleAfterDays: 30
    },
    citation: {
      kind: "memory_entry",
      memoryId: "result-1",
      label: "Incident playbook",
      canonicalRef: "memory://entry/result-1"
    },
    provenance: {
      entryType: "decision",
      actor: "memory_curator",
      reviewer: "memory_curator",
      runId: "run-1",
      taskId: "task-1",
      createdAt: "2026-05-05T00:00:00.000Z"
    },
    metadata: {
      allowedRoles: ["planner"],
      tags: ["runbook"],
      staleAfterDays: 30,
      supersededBy: [],
      contradicts: []
    },
    conflict: {
      detected: false,
      relatedIds: []
    },
    ...overrides
  };
}

test("policy helpers detect overlapping scopes and dependency blockers", () => {
  const task = createTask();
  const dependency = {
    ...createTask(),
    id: "dep-record",
    packet: {
      ...createTask().packet,
      taskId: "dep-1",
      allowedWriteScope: ["src/dependency"]
    },
    status: "review_blocked" as const
  };
  const lock: LockRecord = {
    id: "lock-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    runId: "run-1",
    taskId: "other-task",
    scopePaths: ["src/core/service.ts"],
    status: "active",
    createdAt: "2026-05-05T00:00:00.000Z"
  };

  assert.equal(hasOverlappingWriteScope(["src/core"], ["src/core/service.ts"]), true);
  assert.equal(hasOverlappingWriteScope(["src/core"], ["src/ui"]), false);
  assert.deepEqual(findBlockingReasonsForTask(task, [task, dependency], [lock]), [
    "dependency dep-1 is review_blocked",
    "write scope locked by other-task"
  ]);
});

test("evaluateReviewDecision reports the remaining review gate failure modes", () => {
  const task = createTask();

  assert.deepEqual(evaluateReviewDecision(task, []).blockers, [
    "missing required review: reviewer",
    "missing required review: security_reviewer",
    "missing required review: qa_engineer"
  ]);

  assert.deepEqual(
    evaluateReviewDecision(task, [
      createReview({
        reviewerRole: "reviewer",
        identityAssurance: "legacy_backfill"
      }),
      createReview({
        id: "review-2",
        reviewerRole: "security_reviewer",
        state: "waived",
        waiverAuthority: "none",
        waiverReason: undefined,
        actor: "security-1",
        actorRole: "security_reviewer"
      }),
      createReview({
        id: "review-3",
        reviewerRole: "qa_engineer",
        state: "blocked",
        actor: "qa-1",
        actorRole: "qa_engineer"
      })
    ]).blockers,
    [
      "required review provenance unauthenticated: reviewer",
      "waived review missing reason: security_reviewer",
      "required review not passed: qa_engineer is blocked"
    ]
  );

  assert.deepEqual(
    evaluateReviewDecision(task, [
      createReview(),
      createReview({
        id: "review-4",
        reviewerRole: "security_reviewer",
        state: "waived",
        waiverAuthority: "manager",
        waiverReason: "not allowed",
        actor: "planner-1",
        actorRole: "planner"
      }),
      createReview({
        id: "review-5",
        reviewerRole: "qa_engineer",
        actor: "qa-1",
        actorRole: "qa_engineer"
      })
    ]).blockers,
    ["required review waiver unauthorized: security_reviewer"]
  );
});

test("memory and artifact search builders preserve precedence and access policy", () => {
  const memoryResult = buildMemorySearchResult(
    {
      id: "memory-1",
      title: "Incident playbook",
      content: "rollback checklist",
      scope: "project",
      entryType: "decision",
      actor: "memory_curator",
      reviewer: "memory_curator",
      runId: "run-1",
      taskId: "task-1",
      sourcePath: ".devgod/memory/decision-log.md",
      sourceAnchor: "incident-playbook",
      metadata: {
        retrievalRoles: ["planner"],
        tags: ["runbook"]
      },
      createdAt: "not-a-date"
    },
    "incident playbook",
    true,
    "devgod",
    "2026-05-05T00:00:00.000Z"
  );

  const artifactResult = buildArtifactSearchResult(
    {
      id: "artifact-1",
      title: "Runbook",
      content: "rollback checklist",
      sourcePath: "",
      sourceAnchor: undefined,
      createdAt: "3026-05-05T00:00:00.000Z",
      kind: "markdown_chunk",
      metadata: {
        retrievalRoles: ["reviewer"]
      },
      runId: "run-1"
    },
    "runbook",
    "devgod",
    "2026-05-05T00:00:00.000Z"
  );

  assert.equal(memoryResult.freshness.status, "invalid_timestamp");
  assert.equal(memoryResult.authority.allowedRoles.includes("planner"), true);
  assert.equal(artifactResult.freshness.status, "future_timestamp");
  assert.equal(artifactResult.citation.canonicalRef, "artifact://entry/artifact-1");
  assert.equal(canRoleAccessRetrievalMetadata(undefined, "planner"), true);
  assert.equal(canRoleAccessSearchResult(memoryResult, "planner"), true);
  assert.equal(canRoleAccessSearchResult(artifactResult, "planner"), false);
});

test("compareMemorySearchResults and scoreMemoryResult honor tie-break and empty-term cases", () => {
  const freshProject = createSearchResult();
  const staleGlobal = createSearchResult({
    id: "result-2",
    projectSlug: undefined,
    score: 20,
    authority: {
      source: "repo_artifact",
      precedence: "repo_context",
      scope: "project",
      authorityLevel: "repo_context",
      allowedRoles: ["planner"]
    },
    freshness: {
      status: "stale",
      createdAt: "2026-01-01T00:00:00.000Z",
      ageDays: 120,
      staleAfterDays: 30
    }
  });
  const tied = createSearchResult({
    id: "z-id",
    title: "Same title",
    score: 10
  });
  const tied2 = createSearchResult({
    id: "a-id",
    title: "Same title",
    score: 10
  });

  assert.ok(compareMemorySearchResults(freshProject, staleGlobal) < 0);
  assert.ok(compareMemorySearchResults(tied, tied2) > 0);
  assert.equal(
    scoreMemoryResult(
      {
        title: "Anything",
        content: "content",
        scope: "project"
      },
      "   ",
      true
    ) >= 4,
    true
  );
});
