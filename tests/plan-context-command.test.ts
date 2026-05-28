import test from "node:test";
import assert from "node:assert/strict";
import { DevgodCoreService } from "../src/core/service.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { buildPlanContextRefreshArgs, executePlanContextCommandFromArgs } from "../src/admin.ts";
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
      async getRetrievalFreshness() {
        return {
          authorityLabel: "derived_only",
          state: "fresh",
          summary: "repo retrieval index matches the current repo snapshot"
        };
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
  assert.equal(result.report.retrieval?.state, "fresh");
  assert.ok((result.report.items[0]?.reasoningWarnings.length ?? 0) > 0);
  assert.match(result.report.items[0]?.citation ?? "", /^memory:\/\//);

  const markdown = formatPlanningContextReportMarkdown(result.report);
  assert.match(markdown, /# devgod planning context/);
  assert.match(markdown, /retrieval: fresh/);
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
    retrieval: {
      authorityLabel: "derived_only",
      state: "stale",
      summary: "repo retrieval index does not match the current repo snapshot"
    },
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
  assert.equal(report.retrieval?.state, "stale");
  assert.match(formatPlanningContextReportMarkdown(report), /retrieval: stale/);
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

test("executePlanContextCommandFromArgs auto-refreshes stale retrieval before searching when explicitly enabled", async () => {
  const callOrder: string[] = [];
  let freshnessChecks = 0;
  let refreshCalls = 0;

  const result = await executePlanContextCommandFromArgs(["--query", "retrieval freshness", "--auto-refresh-retrieval"], {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    async getRetrievalFreshness() {
      callOrder.push(`freshness:${freshnessChecks}`);
      freshnessChecks += 1;
      return freshnessChecks === 1
        ? {
            authorityLabel: "derived_only",
            state: "stale",
            summary: "repo retrieval index does not match the current repo snapshot"
          }
        : {
            authorityLabel: "derived_only",
            state: "fresh",
            summary: "repo retrieval index matches the current repo snapshot"
          };
    },
    async refreshRetrieval() {
      callOrder.push("refresh");
      refreshCalls += 1;
      return {
        authorityLabel: "runtime_authoritative",
        workspaceSlug: "team",
        projectSlug: "devgod",
        repoRoot: "/repo",
        filesIndexed: 2,
        chunksStored: 4,
        jobsQueued: 4,
        embeddingJobs: {
          leased: 4,
          completed: 4,
          failed: 0
        }
      };
    },
    async searchMemory() {
      callOrder.push("search");
      return [];
    }
  });

  assert.equal(refreshCalls, 1);
  assert.deepEqual(callOrder, ["freshness:0", "refresh", "freshness:1", "search"]);
  assert.equal(result.report.retrieval?.state, "fresh");
});

test("executePlanContextCommandFromArgs leaves stale retrieval in place by default", async () => {
  let refreshCalls = 0;

  const result = await executePlanContextCommandFromArgs(
    ["--query", "retrieval freshness"],
    {
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      async getRetrievalFreshness() {
        return {
          authorityLabel: "derived_only",
          state: "stale",
          summary: "repo retrieval index does not match the current repo snapshot"
        };
      },
      async refreshRetrieval() {
        refreshCalls += 1;
        return {
          authorityLabel: "runtime_authoritative",
          workspaceSlug: "team",
          projectSlug: "devgod",
          repoRoot: "/repo",
          filesIndexed: 2,
          chunksStored: 4,
          jobsQueued: 4
        };
      },
      async searchMemory() {
        return [];
      }
    }
  );

  assert.equal(refreshCalls, 0);
  assert.equal(result.report.retrieval?.state, "stale");
  assert.match(result.report.retrieval?.summary ?? "", /automatic .* refresh deferred/i);
});

test("executePlanContextCommandFromArgs includes repo context and auto-refreshes it when explicitly enabled", async () => {
  const callOrder: string[] = [];
  let freshnessChecks = 0;

  const result = await executePlanContextCommandFromArgs(
    ["--query", "django database env", "--auto-refresh-repo-context"],
    {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    async getRepoContext() {
      callOrder.push(`repo:${freshnessChecks}`);
      freshnessChecks += 1;
      return freshnessChecks === 1
        ? {
            authorityLabel: "derived_only",
            state: "stale",
            summary: "repo context profile no longer matches the current repo snapshot",
            items: []
          }
        : {
            authorityLabel: "derived_only",
            state: "fresh",
            summary: "repo context profile matches the current repo snapshot",
            items: [
              {
                slotKey: "django.dbEnvSelectorVariable",
                title: "Django DB selector",
                value: "DJANGO_DB_ENV",
                sourceKind: "derived_file",
                freshness: "fresh"
              }
            ]
          };
    },
    async refreshRepoContext() {
      callOrder.push("repo-refresh");
      return {
        authorityLabel: "runtime_authoritative",
        workspaceSlug: "team",
        projectSlug: "devgod",
        repoRoot: "/repo",
        slotCount: 1
      };
    },
    async searchMemory() {
      callOrder.push("search");
      return [];
    }
    }
  );

  assert.deepEqual(callOrder, ["repo:0", "repo-refresh", "repo:1", "search"]);
  assert.equal(result.report.repoContext?.state, "fresh");
  assert.equal(result.report.repoContext?.items[0]?.slotKey, "django.dbEnvSelectorVariable");
  assert.match(formatPlanningContextReportMarkdown(result.report), /Repo Context/);
  assert.match(formatPlanningContextReportMarkdown(result.report), /DJANGO_DB_ENV/);
});

test("executePlanContextCommandFromArgs leaves stale repo context in place by default", async () => {
  let refreshCalls = 0;

  const result = await executePlanContextCommandFromArgs(["--query", "django database env"], {
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    async getRepoContext() {
      return {
        authorityLabel: "derived_only",
        state: "stale",
        summary: "repo context profile no longer matches the current repo snapshot",
        items: []
      };
    },
    async refreshRepoContext() {
      refreshCalls += 1;
      return {
        authorityLabel: "runtime_authoritative",
        workspaceSlug: "team",
        projectSlug: "devgod",
        repoRoot: "/repo",
        slotCount: 1
      };
    },
    async searchMemory() {
      return [];
    }
  });

  assert.equal(refreshCalls, 0);
  assert.equal(result.report.repoContext?.state, "stale");
  assert.match(result.report.repoContext?.summary ?? "", /automatic .* refresh deferred/i);
});

test("buildPlanContextRefreshArgs strips plan-context-only flags and query text", () => {
  assert.deepEqual(
    buildPlanContextRefreshArgs([
      "--query",
      "what still matters here?",
      "--role",
      "planner",
      "--workspace-slug",
      "team",
      "--project-slug",
      "devgod",
      "--auto-refresh-repo-context"
    ]),
    ["--workspace-slug", "team", "--project-slug", "devgod"]
  );
});
