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
