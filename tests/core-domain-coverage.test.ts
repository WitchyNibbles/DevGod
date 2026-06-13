import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArtifactSearchResult,
  buildMemorySearchResult,
  buildWorkflowDocumentSearchResult,
  canRoleAccessRetrievalMetadata,
  canRoleAccessSearchResult,
  compareMemorySearchResults
} from "../src/core/policy.ts";
import {
  createReviewActionContextResolver,
  createReviewPrincipalAdapter,
  toReviewActionContextSnapshot,
  validateReviewIdentityBindings,
  validateReviewIdentityFixtures,
  verifyReviewIdentityAdapter,
  type ReviewIdentityFixtureDocument
} from "../src/core/review-context.ts";
import { deriveWaiverContext } from "../src/core/review-context-waiver.ts";
import {
  canActorWaiveReview,
  defaultRetrievalRoles,
  findSecretSignals,
  findVisualArtifactSignals,
  hasFutureTenseClaim,
  normalizeRetrievalMetadata,
  normalizeSearchInput,
  validateMemoryPromotion
} from "../src/domain/contracts.ts";
import type { SearchMemoryResult } from "../src/domain/types.ts";

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

test("policy builders cover redacted provenance, workflow documents, and search ranking tie-breaks", () => {
  const redactedMemory = buildMemorySearchResult(
    {
      id: "memory-redacted",
      title: "Shared retrieval note",
      content: "Use repo rules before ad hoc prompts",
      scope: "project",
      entryType: "decision",
      actor: "memory_curator",
      reviewer: "memory_curator",
      runId: "run-1",
      taskId: "task-1",
      sourcePath: ".devgod/memory/retrieval.md",
      sourceAnchor: "shared-note",
      metadata: {
        retrievalRoles: ["reviewer", "reviewer", "unknown" as "reviewer"],
        staleAfterDays: 7,
        tags: [" retrieval ", "retrieval"],
        supersededBy: ["old", "old"],
        contradicts: ["draft", "draft"]
      },
      createdAt: "2026-06-20T00:00:00.000Z"
    },
    "repo rules prompts",
    false,
    undefined,
    "2026-06-13T00:00:00.000Z"
  );

  const anchoredMemory = buildMemorySearchResult(
    {
      id: "memory-anchored",
      title: "Incident anchor",
      content: "Rollback before retry",
      scope: "project",
      entryType: "decision",
      actor: "memory_curator",
      reviewer: "memory_curator",
      runId: "run-2",
      taskId: "task-2",
      sourcePath: undefined,
      sourceAnchor: "rollback",
      metadata: {},
      createdAt: "2026-06-01T00:00:00.000Z"
    },
    "rollback",
    true,
    "devgod",
    "2026-06-13T00:00:00.000Z"
  );

  const artifact = buildArtifactSearchResult(
    {
      id: "artifact-1",
      title: "Ops runbook",
      content: "Rollback checklist and escalation notes",
      sourcePath: "docs/runbook.md",
      sourceAnchor: "rollback",
      createdAt: "2026-01-01T00:00:00.000Z",
      kind: "markdown_chunk",
      metadata: {
        retrievalRoles: ["qa_engineer"]
      },
      runId: "run-3"
    },
    "rollback checklist",
    "devgod",
    "2026-06-13T00:00:00.000Z"
  );

  const workflowDocument = buildWorkflowDocumentSearchResult(
    {
      id: "doc-1",
      title: "Planner handoff",
      body: "Approved write scope and verification plan",
      kind: "plan",
      metadata: {
        retrievalRoles: ["qa_engineer"],
        staleAfterDays: 14
      },
      createdAt: "2026-06-10T00:00:00.000Z",
      runId: "run-4",
      taskId: "task-4"
    },
    "verification plan",
    "devgod",
    "2026-06-13T00:00:00.000Z"
  );

  const sourcePreferred = createSearchResult({
    id: "runtime-doc",
    title: "Alpha",
    score: 10,
    authority: {
      source: "runtime_document",
      precedence: "runtime_context",
      scope: "project",
      authorityLevel: "operational_context",
      allowedRoles: ["planner"]
    }
  });
  const repoArtifact = createSearchResult({
    id: "repo-artifact",
    title: "Alpha",
    score: 10,
    authority: {
      source: "repo_artifact",
      precedence: "repo_context",
      scope: "project",
      authorityLevel: "repo_context",
      allowedRoles: ["planner"]
    }
  });
  const alpha = createSearchResult({ id: "alpha", title: "Alpha", score: 10 });
  const beta = createSearchResult({ id: "beta", title: "Beta", score: 10 });

  assert.equal(redactedMemory.authority.reviewedBy, undefined);
  assert.equal(redactedMemory.citation.sourcePath, undefined);
  assert.equal(redactedMemory.provenance.actor, undefined);
  assert.equal(redactedMemory.citation.canonicalRef, "memory://entry/memory-redacted");
  assert.equal(redactedMemory.freshness.status, "future_timestamp");
  assert.deepEqual(redactedMemory.metadata.allowedRoles, ["reviewer"]);
  assert.deepEqual(redactedMemory.metadata.tags, ["retrieval"]);
  assert.deepEqual(redactedMemory.metadata.supersededBy, ["old"]);
  assert.deepEqual(redactedMemory.metadata.contradicts, ["draft"]);

  assert.equal(anchoredMemory.citation.canonicalRef, "memory://entry/memory-anchored#rollback");
  assert.equal(anchoredMemory.citation.runId, "run-2");

  assert.equal(artifact.citation.canonicalRef, "docs/runbook.md#rollback");
  assert.equal(artifact.freshness.status, "stale");
  assert.equal(canRoleAccessSearchResult(artifact, "qa_engineer"), true);
  assert.equal(canRoleAccessSearchResult(artifact, "planner"), false);

  assert.equal(workflowDocument.authority.source, "runtime_document");
  assert.equal(workflowDocument.authority.authorityLevel, "operational_context");
  assert.equal(workflowDocument.citation.canonicalRef, "workflow://document/plan/doc-1");
  assert.equal(workflowDocument.freshness.status, "fresh");
  assert.equal(canRoleAccessSearchResult(workflowDocument, "qa_engineer"), true);
  assert.equal(
    canRoleAccessRetrievalMetadata({ retrievalRoles: ["reviewer"] }, "planner"),
    false
  );

  assert.ok(compareMemorySearchResults(sourcePreferred, repoArtifact) < 0);
  assert.ok(compareMemorySearchResults(alpha, beta) < 0);
});

test("review identity helpers reject malformed bindings and support security exception waivers", async () => {
  const bindingErrors = validateReviewIdentityBindings({
    bindings: [
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "alice-reviewer",
            roles: ["reviewer", "ceo" as "reviewer"]
          }
        ]
      },
      {
        principal: {
          provider: "github",
          subject: "alice"
        },
        actors: [
          {
            actor: "security-waiver",
            roles: ["security_reviewer"],
            waiverAuthorities: ["security_exception", "security_exception"]
          }
        ]
      }
    ]
  });

  const fixtureErrors = validateReviewIdentityFixtures({
    fixtures: [
      {
        name: "duplicate",
        authContext: {},
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "invalid" as never
        },
        expect: {
          outcome: "deny",
          errorIncludes: ["not verified", "not verified"]
        }
      },
      {
        name: "duplicate",
        authContext: {},
        review: {
          actor: "alice-reviewer",
          reviewerRole: "reviewer",
          reviewState: "passed"
        },
        expect: {
          outcome: "deny",
          errorIncludes: [""]
        }
      }
    ]
  });

  const resolver = createReviewActionContextResolver({
    bindings: {
      bindings: [
        {
          principal: {
            provider: "github",
            subject: "security-reviewer-1"
          },
          actors: [
            {
              actor: "security-reviewer-1",
              roles: ["security_reviewer"],
              waiverAuthorities: ["security_exception"]
            }
          ]
        }
      ]
    },
    resolveAuthenticatedPrincipal() {
      return {
        provider: "github",
        subject: "security-reviewer-1",
        verified: true
      };
    }
  });

  const waivedContext = await resolver({
    runId: "run-1",
    taskId: "task-1",
    actor: "security-reviewer-1",
    reviewerRole: "security_reviewer",
    reviewState: "waived"
  });

  const directWaiver = deriveWaiverContext(
    {
      actor: "security-reviewer-1",
      roles: ["security_reviewer"],
      waiverAuthorities: ["security_exception"]
    },
    "security_reviewer"
  );

  assert.match(bindingErrors.join(" | "), /duplicate principal github:alice/);
  assert.match(bindingErrors.join(" | "), /invalid role ceo/);
  assert.match(bindingErrors.join(" | "), /waiverAuthorities must not contain empty or duplicate values/);

  assert.match(fixtureErrors.join(" | "), /duplicate fixture name duplicate/);
  assert.match(fixtureErrors.join(" | "), /review\.reviewState must be one of/);
  assert.match(fixtureErrors.join(" | "), /expect\.errorIncludes must not contain empty or duplicate values/);
  assert.match(fixtureErrors.join(" | "), /expect\.errorIncludes requires at least one value/);

  assert.deepEqual(toReviewActionContextSnapshot(waivedContext), {
    actor: "security-reviewer-1",
    actorRole: "security_reviewer",
    waiverAuthority: "security_exception"
  });
  assert.deepEqual(directWaiver, {
    actor: "security-reviewer-1",
    actorRole: "security_reviewer",
    waiverAuthority: "security_exception"
  });
});

test("review principal adapter normalizes optional fields and rejects duplicate groups", async () => {
  const normalizedAdapter = createReviewPrincipalAdapter(async () => ({
    provider: " github ",
    subject: " alice ",
    verified: true,
    displayName: "   ",
    email: "   "
  }));

  const principal = await normalizedAdapter({
    runId: "run-1",
    taskId: "task-1",
    actor: "alice-reviewer",
    reviewerRole: "reviewer",
    reviewState: "passed",
    authContext: {}
  });

  const invalidGroupsAdapter = createReviewPrincipalAdapter(async () => ({
    provider: "github",
    subject: "alice",
    verified: true,
    groups: ["ops", " ops "]
  }));

  assert.deepEqual(principal, {
    provider: "github",
    subject: "alice",
    verified: true,
    displayName: undefined,
    email: undefined,
    groups: undefined
  });

  await assert.rejects(
    async () =>
      invalidGroupsAdapter({
        runId: "run-1",
        taskId: "task-1",
        actor: "alice-reviewer",
        reviewerRole: "reviewer",
        reviewState: "passed",
        authContext: {}
      }),
    /groups must not contain empty or duplicate values/
  );
});

test("verifyReviewIdentityAdapter rejects invalid fixture documents before execution", async () => {
  await assert.rejects(
    async () =>
      verifyReviewIdentityAdapter({
        bindings: {
          bindings: [
            {
              principal: {
                provider: "github",
                subject: "alice"
              },
              actors: [
                {
                  actor: "alice-reviewer",
                  roles: ["reviewer"]
                }
              ]
            }
          ]
        },
        adapter: async () => ({
          provider: "github",
          subject: "alice",
          verified: true
        }),
        fixtures: { fixtures: [] } satisfies ReviewIdentityFixtureDocument
      }),
    /Invalid review identity fixtures/
  );
});

test("contracts helpers cover retrieval defaults, search normalization, and durable memory guards", () => {
  const originalRoles = defaultRetrievalRoles();
  originalRoles.pop();
  const metadataDefaults = normalizeRetrievalMetadata();
  const normalizedSearch = normalizeSearchInput({
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "  incident playbook  ",
    limit: 2,
    includeGlobal: false,
    requesterRole: "qa_engineer",
    queryEmbedding: [0.5, 1.5]
  });
  const cleanMemoryErrors = validateMemoryPromotion({
    scope: "project",
    entryType: "lesson",
    title: "Approved note",
    content: "Reviewed rollback steps for the latest incident.",
    sourceRunId: "run-1",
    reviewer: "memory_curator",
    actor: "memory_curator",
    metadata: {
      retrievalRoles: ["planner", "qa_engineer"],
      staleAfterDays: 14,
      reviewedAt: "2026-06-10T00:00:00.000Z"
    }
  });

  assert.ok(defaultRetrievalRoles().includes("planner"));
  assert.ok(defaultRetrievalRoles().length >= metadataDefaults.retrievalRoles.length);
  assert.deepEqual(metadataDefaults.tags, []);
  assert.deepEqual(metadataDefaults.supersededBy, []);
  assert.deepEqual(metadataDefaults.contradicts, []);
  assert.equal(normalizedSearch.query, "incident playbook");
  assert.equal(normalizedSearch.limit, 2);
  assert.equal(normalizedSearch.includeGlobal, false);
  assert.equal(normalizedSearch.requesterRole, "qa_engineer");
  assert.deepEqual(cleanMemoryErrors, []);

  assert.deepEqual(
    findSecretSignals(
      "-----BEGIN RSA PRIVATE KEY----- ghp_abcdefghijklmnopqrstuvwxyz1234 sk-abcdefghijklmnop postgres://user:pass@example.com/db"
    ).length >= 4,
    true
  );
  assert.equal(hasFutureTenseClaim("This report summarizes what happened."), false);
  assert.equal(
    findVisualArtifactSignals(
      "data:image/png;base64,AAAA and .devgod/work/artifacts/playwright/home.png and playwright://trace/run-1"
    ).length >= 3,
    true
  );
  assert.equal(
    canActorWaiveReview({
      actorRole: "reviewer",
      reviewerRole: "reviewer",
      waiverAuthority: "none"
    }),
    false
  );

  assert.throws(
    () =>
      normalizeSearchInput({
        workspaceSlug: "team",
        projectSlug: "devgod",
        query: "   "
      }),
    /search query is required/
  );
  assert.throws(
    () =>
      normalizeSearchInput({
        workspaceSlug: "team",
        projectSlug: "devgod",
        query: "incident",
        queryEmbedding: [Number.NaN]
      }),
    /finite numbers/
  );
  assert.throws(
    () =>
      normalizeSearchInput({
        workspaceSlug: "team",
        projectSlug: "devgod",
        query: "incident",
        queryEmbedding: new Array(1537).fill(0)
      }),
    /must not exceed 1536 dimensions/
  );
});
