import test from "node:test";
import assert from "node:assert/strict";
import { DevgodCoreService } from "../src/core/service.ts";
import { MemoryStore } from "../src/store/memory-store.ts";
import { executePlanContextCommandFromArgs } from "../src/admin.ts";
import { formatPlanningContextReportMarkdown } from "../src/admin/planning-context.ts";

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
  assert.match(result.report.items[0]?.citation ?? "", /^memory:\/\//);

  const markdown = formatPlanningContextReportMarkdown(result.report);
  assert.match(markdown, /# devgod planning context/);
  assert.match(markdown, /Project incident playbook/);
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
