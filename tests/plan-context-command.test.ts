import test from "node:test";
import assert from "node:assert/strict";
import { DevgodCoreService } from "../src/core/service.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { executePlanContextCommandFromArgs } from "../src/admin.ts";
import { formatPlanningContextReportMarkdown } from "../src/admin/planning-context.ts";
import type { RetrievalRole } from "../src/domain/types.ts";
import { buildPlanningContextReport } from "../src/admin/planning-context.ts";

test("executePlanContextCommandFromArgs returns ranked planning context and markdown output", async () => {
  const service = new DevgodCoreService(new MemoryStore());
  const run = await service.intakeRequest({
    workspaceSlug: "team",
    projectSlug: "devgod",
    actor: "ceo",
    title: "Capture planning context",
    request: "Summarize the roadmap evidence."
  });

  await service.promoteMemory(run.id, {
    scope: "global",
    entryType: "pattern",
    title: "Global release note",
    content: "incident playbook and release workflow guidance",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });
  await service.promoteMemory(run.id, {
    scope: "project",
    entryType: "decision",
    title: "Project incident playbook",
    content: "incident playbook for devgod release workflow",
    sourceRunId: run.id,
    reviewer: "memory_curator",
    actor: "memory_curator"
  });

  const result = await executePlanContextCommandFromArgs(
    ["--query", "incident playbook", "--role", "planner", "--format", "markdown"],
    {
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      searchMemory(input) {
        return service.searchMemory(input);
      }
    }
  );

  assert.equal(result.format, "markdown");
  assert.equal(result.report.requesterRole, "planner");
  assert.equal(result.report.totalResults, 2);
  assert.equal(result.report.items[0]?.title, "Project incident playbook");
  assert.ok((result.report.items[0]?.reasoningWarnings.length ?? 0) > 0);
  assert.match(result.report.items[0]?.citation ?? "", /^memory:\/\//);

  const markdown = formatPlanningContextReportMarkdown(result.report);
  assert.match(markdown, /# devgod planning context/);
  assert.match(markdown, /Project incident playbook/);
  assert.match(markdown, /reasoning-warnings:/);
  assert.match(markdown, /memory:\/\//);
});

test("executePlanContextCommandFromArgs honors --project-only when querying memory", async () => {
  let includeGlobal = true;

  await executePlanContextCommandFromArgs(["--query", "scope", "--project-only"], {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    async searchMemory(input) {
      includeGlobal = input.includeGlobal;
      return [];
    }
  });

  assert.equal(includeGlobal, false);
});

test("buildPlanningContextReport flags stale and conflicting evidence for review", () => {
  const report = buildPlanningContextReport({
    query: "schema drift",
    requesterRole: "planner",
    results: [
      {
        id: "memory-1",
        title: "Schema drift note",
        content: "tool query failed and the remaining evidence is stale",
        scope: "project",
        projectSlug: "devgod",
        score: 9,
        authority: {
          source: "shared_backend_memory",
          precedence: "retrieval_hint",
          scope: "project",
          allowedRoles: ["planner"]
        },
        freshness: {
          status: "stale",
          createdAt: "2026-01-01T00:00:00.000Z",
          ageDays: 120,
          staleAfterDays: 30
        },
        citation: {
          kind: "memory_entry",
          memoryId: "memory-1",
          label: "Schema drift note",
          canonicalRef: "memory://memory-1"
        },
        provenance: {
          entryType: "decision",
          runId: "run-1",
          createdAt: "2026-01-01T00:00:00.000Z"
        },
        metadata: {
          allowedRoles: ["planner"],
          tags: ["schema"],
          staleAfterDays: 30,
          supersededBy: [],
          contradicts: []
        },
        conflict: {
          detected: true,
          relatedIds: ["memory-2"]
        }
      }
    ]
  });

  assert.deepEqual(report.items[0]?.reasoningWarnings, [
    "retrieval hint only; re-anchor in canonical files",
    "evidence freshness is stale",
    "related contradictory evidence detected"
  ]);
});

test("executePlanContextCommandFromArgs derives a query embedding when an embedding model is configured", async () => {
  let capturedInput:
    | {
        workspaceSlug: string;
        projectSlug: string;
        query: string;
        limit: number;
        includeGlobal: boolean;
        queryEmbedding?: readonly number[] | undefined;
        embeddingModel?: string | undefined;
        requesterRole: RetrievalRole;
      }
    | undefined;

  await executePlanContextCommandFromArgs(["--query", "qdrant retrieval"], {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod",
      DEVGOD_EMBEDDING_MODEL: "devgod-local-hash-1536"
    },
    async searchMemory(input: {
      workspaceSlug: string;
      projectSlug: string;
      query: string;
      limit: number;
      includeGlobal: boolean;
      queryEmbedding?: readonly number[] | undefined;
      embeddingModel?: string | undefined;
      requesterRole: RetrievalRole;
    }) {
      capturedInput = input;
      return [];
    },
    async embedQuery({ model, text }: { model: string; text: string }) {
      assert.equal(model, "devgod-local-hash-1536");
      assert.equal(text, "qdrant retrieval");
      return [0.25, 0.75];
    }
  } as never);

  assert.deepEqual(capturedInput?.queryEmbedding, [0.25, 0.75]);
  assert.equal(capturedInput?.embeddingModel, "devgod-local-hash-1536");
});
