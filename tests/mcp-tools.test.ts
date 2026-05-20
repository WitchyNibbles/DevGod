import test from "node:test";
import assert from "node:assert/strict";
import { createMcpToolDefinitions } from "../src/mcp/tools.ts";

test("createMcpToolDefinitions wires status, ops, loop, report, and plan-context tools", async () => {
  const calls: Array<{ tool: string; args: readonly string[] }> = [];
  const tools = createMcpToolDefinitions({
    async status(args) {
      calls.push({ tool: "status", args });
      return { kind: "status" };
    },
    async runtimeHealth(args) {
      calls.push({ tool: "runtimeHealth", args });
      return { kind: "runtimeHealth" };
    },
    async ops(args) {
      calls.push({ tool: "ops", args });
      return { kind: "ops" };
    },
    async loop(args) {
      calls.push({ tool: "loop", args });
      return { kind: "loop" };
    },
    async report(args) {
      calls.push({ tool: "report", args });
      return { kind: "report" };
    },
    async planContext(args) {
      calls.push({ tool: "plan-context", args });
      return { kind: "plan-context" };
    }
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["devgod_status", "devgod_runtime_health", "devgod_ops", "devgod_loop", "devgod_report", "devgod_plan_context"]
  );

  await tools[0]?.invoke({ runId: "run-1", staleAfterDays: 2 });
  await tools[1]?.invoke({ workspaceSlug: "team", projectSlug: "devgod" });
  await tools[2]?.invoke({ workspaceSlug: "team", projectSlug: "devgod", staleAfterHours: 24 });
  await tools[3]?.invoke({
    workspaceSlug: "team",
    projectSlug: "devgod",
    staleAfterHours: 12,
    applySafeRecovery: true,
    executeSupportedDirectives: true,
    ownerActor: "planner",
    reviewInputPaths: ["security.json", "qa.json"]
  });
  await tools[4]?.invoke({ runId: "latest" });
  await tools[5]?.invoke({
    query: "incident playbook",
    workspaceSlug: "team",
    projectSlug: "devgod",
    role: "planner",
    limit: 3,
    projectOnly: true
  });

  assert.deepEqual(calls, [
    {
      tool: "status",
      args: ["--run-id", "run-1", "--stale-after-days", "2"]
    },
    {
      tool: "runtimeHealth",
      args: ["--run-id", "latest", "--workspace-slug", "team", "--project-slug", "devgod"]
    },
    {
      tool: "ops",
      args: ["--run-id", "latest", "--workspace-slug", "team", "--project-slug", "devgod", "--stale-after-hours", "24"]
    },
    {
      tool: "loop",
      args: [
        "--run-id",
        "latest",
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--format",
        "json",
        "--stale-after-hours",
        "12",
        "--apply-safe-recovery",
        "--execute-supported-directives",
        "--owner-actor",
        "planner",
        "--review-input",
        "security.json",
        "--review-input",
        "qa.json"
      ]
    },
    {
      tool: "report",
      args: ["--run-id", "latest", "--format", "json"]
    },
    {
      tool: "plan-context",
      args: [
        "--query",
        "incident playbook",
        "--format",
        "json",
        "--workspace-slug",
        "team",
        "--project-slug",
        "devgod",
        "--role",
        "planner",
        "--limit",
        "3",
        "--project-only"
      ]
    }
  ]);
});

test("MCP tools default to summary detail and allow full detail opt-in", async () => {
  const tools = createMcpToolDefinitions({
    async status() {
      return {
        run: { id: "run-1", status: "in_progress", updatedAt: "2026-05-20T00:00:00.000Z", taskCounts: { ready: 1 } },
        orchestration: { blockers: ["blocked-1"], nextTaskIds: ["task-2"] },
        autonomous: {
          configured: true,
          phase: "implementation",
          resume: { status: "ready", source: "checkpoint", summary: "resume at task-2", executionMode: "runtime_executable" }
        },
        compaction: { status: "present", checkpointId: "cp-1", generatedAt: "2026-05-20T00:00:00.000Z" },
        reviewIdentity: { liveTrustReady: true },
        daemon: {
          continuation: { summary: "continuation summary", nextActions: ["a", "b", "c"] }
        },
        giantNested: { preserved: true }
      };
    },
    async runtimeHealth() {
      return { ok: true, giantNested: { preserved: true } };
    },
    async ops() {
      return {
        alerts: ["a1", "a2", "a3", "a4", "a5"],
        nextActions: ["n1", "n2", "n3"],
        giantNested: { preserved: true, values: Array.from({ length: 10 }, (_, i) => `value-${i}`) }
      };
    },
    async loop() {
      return {
        status: "blocked",
        cycles: Array.from({ length: 8 }, (_, i) => ({ cycle: i + 1, summary: `cycle-${i + 1}` })),
        giantNested: { preserved: true }
      };
    },
    async report() {
      return {
        runId: "run-1",
        summary: { totalTasks: 4, totalLoopExecutions: 7 },
        autonomous: { resume: { summary: "resume at task-2" } },
        tasks: Array.from({ length: 8 }, (_, i) => ({ taskId: `task-${i + 1}` })),
        giantNested: { preserved: true }
      };
    },
    async planContext() {
      return {
        query: "incident playbook",
        requesterRole: "planner",
        totalResults: 9,
        summary: ["item-1", "item-2", "item-3"],
        items: Array.from({ length: 6 }, (_, i) => ({
          title: `Title ${i + 1}`,
          preview: `Preview ${i + 1}`,
          tags: ["alpha", "beta", "gamma"]
        }))
      };
    }
  });

  const summaryStatus = await tools[0]!.invoke({ runId: "run-1" });
  const fullStatus = await tools[0]!.invoke({ runId: "run-1", detail: "full" });
  const summaryReport = await tools[4]!.invoke({ runId: "run-1" });
  const fullReport = await tools[4]!.invoke({ runId: "run-1", detail: "full" });
  const summaryPlanContext = await tools[5]!.invoke({ query: "incident playbook" });

  assert.deepEqual(summaryStatus.structuredContent.run, {
    id: "run-1",
    status: "in_progress",
    updatedAt: "2026-05-20T00:00:00.000Z",
    taskCounts: { ready: 1 }
  });
  assert.equal((summaryStatus.structuredContent as Record<string, unknown>).giantNested, undefined);
  assert.deepEqual((fullStatus.structuredContent as Record<string, unknown>).giantNested, { preserved: true });

  assert.deepEqual(summaryReport.structuredContent, {
    runId: "run-1",
    totals: { totalLoopExecutions: 7, totalTasks: 4 },
    resume: "resume at task-2"
  });
  assert.ok(Array.isArray((fullReport.structuredContent as Record<string, unknown>).tasks));

  assert.deepEqual(summaryPlanContext.structuredContent, {
    query: "incident playbook",
    requesterRole: "planner",
    totalResults: 9,
    summary: ["item-1", "item-2", "item-3"]
  });
});
