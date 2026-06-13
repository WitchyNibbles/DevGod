import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpToolDefinitions } from "../src/mcp/tools.ts";

let executableImportSequence = 0;
const repoRootPath = fileURLToPath(new URL("../", import.meta.url));
const serverModuleUrl = new URL("../src/mcp/server.ts", import.meta.url);
const serverEntrypointPath = fileURLToPath(serverModuleUrl);
const inertEntrypointPath = fileURLToPath(new URL("../src/mcp/not-server.ts", import.meta.url));
const originalArgv1ForLibraryImport = process.argv[1];
process.argv[1] = inertEntrypointPath;
const serverLibraryModule = await import(serverModuleUrl.href);
process.argv[1] = originalArgv1ForLibraryImport;

async function importServerModule(mode: string): Promise<void> {
  executableImportSequence += 1;
  await import(`${serverModuleUrl.href}?${mode}=${executableImportSequence}`);
  await delay(0);
}

function buildCoverageNeutralChildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_V8_COVERAGE: ""
  };
}

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

test("createDevgodMcpServer registers every tool with MCP metadata", async () => {
  const { createDevgodMcpServer } = serverLibraryModule;
  const originalRegisterTool = McpServer.prototype.registerTool;
  const registrations: Array<{
    name: string;
    config: Record<string, unknown>;
    handler: ((input: Record<string, unknown>) => Promise<unknown>) | undefined;
  }> = [];

  McpServer.prototype.registerTool = ((name: string, config: Record<string, unknown>, handler?: (input: Record<string, unknown>) => Promise<unknown>) => {
    registrations.push({
      name,
      config,
      handler
    });
    return undefined as never;
  }) as unknown as typeof McpServer.prototype.registerTool;

  try {
    createDevgodMcpServer({
      async status() {
        return { ok: true };
      },
      async runtimeHealth() {
        return { ok: true };
      },
      async ops() {
        return { ok: true };
      },
      async loop() {
        return { ok: true };
      },
      async report() {
        return { ok: true };
      },
      async planContext() {
        return { ok: true };
      }
    });
  } finally {
    McpServer.prototype.registerTool = originalRegisterTool;
  }

  assert.deepEqual(
    registrations.map((registration) => registration.name),
    ["devgod_status", "devgod_runtime_health", "devgod_ops", "devgod_loop", "devgod_report", "devgod_plan_context"]
  );
  assert.ok(
    registrations.every(
      (registration) =>
        registration.config.title === registration.name &&
        typeof registration.config.description === "string" &&
        registration.config.description.length > 0 &&
        typeof registration.config.inputSchema === "object" &&
        registration.config.inputSchema !== null &&
        Object.keys(registration.config.inputSchema as Record<string, unknown>).length > 0 &&
        typeof registration.handler === "function"
    )
  );
});

test("createDevgodMcpServer registers the default runtime surfaces when runtime is omitted", async () => {
  const { createDevgodMcpServer } = serverLibraryModule;
  const originalRegisterTool = McpServer.prototype.registerTool;
  const registrations: string[] = [];

  McpServer.prototype.registerTool = ((name: string) => {
    registrations.push(name);
    return undefined as never;
  }) as unknown as typeof McpServer.prototype.registerTool;

  try {
    createDevgodMcpServer();
  } finally {
    McpServer.prototype.registerTool = originalRegisterTool;
  }

  assert.deepEqual(registrations, [
    "devgod_status",
    "devgod_runtime_health",
    "devgod_ops",
    "devgod_loop",
    "devgod_report",
    "devgod_plan_context"
  ]);
});

test("createDevgodMcpServer registration handlers invoke the underlying MCP tool behavior", async () => {
  const { createDevgodMcpServer } = serverLibraryModule;
  const originalRegisterTool = McpServer.prototype.registerTool;
  const handlers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();

  McpServer.prototype.registerTool = ((name: string, _config: Record<string, unknown>, handler?: (input: Record<string, unknown>) => Promise<unknown>) => {
    if (handler) {
      handlers.set(name, handler);
    }
    return undefined as never;
  }) as unknown as typeof McpServer.prototype.registerTool;

  try {
    createDevgodMcpServer({
      async status(args: readonly string[]) {
        assert.deepEqual(args, ["--run-id", "run-1"]);
        return {
          run: { id: "run-1", status: "in_progress", updatedAt: "2026-05-20T00:00:00.000Z", taskCounts: { ready: 1 } }
        };
      },
      async runtimeHealth() {
        return { ok: true };
      },
      async ops() {
        return { ok: true };
      },
      async loop() {
        return { ok: true };
      },
      async report() {
        return { ok: true };
      },
      async planContext() {
        return { ok: true };
      }
    });
  } finally {
    McpServer.prototype.registerTool = originalRegisterTool;
  }

  const statusHandler = handlers.get("devgod_status");
  assert.ok(statusHandler);
  const response = await statusHandler!({ runId: "run-1" }) as {
    content: Array<{ text: string }>;
    structuredContent: Record<string, unknown>;
  };

  assert.deepEqual(response.content, [{ type: "text", text: "Returned the devgod status report." }]);
  assert.deepEqual(response.structuredContent, {
    run: {
      id: "run-1",
      status: "in_progress",
      updatedAt: "2026-05-20T00:00:00.000Z",
      taskCounts: { ready: 1 }
    },
    orchestration: undefined,
    autonomous: undefined,
    compaction: undefined,
    reviewIdentity: undefined,
    daemon: undefined
  });
});

test("startDevgodMcpServer connects over stdio transport", async () => {
  const { startDevgodMcpServer } = serverLibraryModule;
  const originalConnect = McpServer.prototype.connect;
  const transports: unknown[] = [];

  McpServer.prototype.connect = (async (transport) => {
    transports.push(transport);
  }) as typeof McpServer.prototype.connect;

  try {
    await startDevgodMcpServer();
  } finally {
    McpServer.prototype.connect = originalConnect;
  }

  assert.equal(transports.length, 1);
  assert.ok(transports[0] instanceof StdioServerTransport);
});

test("startDevgodMcpServer surfaces transport connection failures", async () => {
  const { startDevgodMcpServer } = serverLibraryModule;
  const originalConnect = McpServer.prototype.connect;
  const expected = new Error("stdio connect failed");

  McpServer.prototype.connect = (async () => {
    throw expected;
  }) as typeof McpServer.prototype.connect;

  try {
    await assert.rejects(() => startDevgodMcpServer(), /stdio connect failed/);
  } finally {
    McpServer.prototype.connect = originalConnect;
  }
});

test("server executable guard starts the stdio server on the executable entrypoint path", async () => {
  const originalConnect = McpServer.prototype.connect;
  const originalArgv1 = process.argv[1];
  const originalExitCode = process.exitCode;
  const originalConsoleError = console.error;
  const transports: unknown[] = [];
  const messages: string[] = [];

  McpServer.prototype.connect = (async (transport) => {
    transports.push(transport);
  }) as typeof McpServer.prototype.connect;
  process.argv[1] = serverEntrypointPath;
  process.exitCode = 0;
  console.error = ((message?: unknown) => {
    messages.push(String(message));
  }) as typeof console.error;

  try {
    await importServerModule("exec-success");
    assert.equal(transports.length, 1);
    assert.ok(transports[0] instanceof StdioServerTransport);
    assert.deepEqual(messages, []);
    assert.equal(process.exitCode, 0);
  } finally {
    McpServer.prototype.connect = originalConnect;
    process.argv[1] = originalArgv1;
    process.exitCode = originalExitCode;
    console.error = originalConsoleError;
  }
});

test("server library and executable paths run correctly in child Node processes", () => {
  const libraryScript = [
    "import assert from 'node:assert/strict';",
    "import process from 'node:process';",
    "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
    "import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';",
    `const serverModuleSpecifier = ${JSON.stringify(serverModuleUrl.href)};`,
    `process.argv[1] = ${JSON.stringify(inertEntrypointPath)};`,
    "const { createDevgodMcpServer, startDevgodMcpServer } = await import(serverModuleSpecifier);",
    "const registrations = [];",
    "const originalRegisterTool = McpServer.prototype.registerTool;",
    "const originalConnect = McpServer.prototype.connect;",
    "let transport;",
    "McpServer.prototype.registerTool = ((name) => { registrations.push(name); return undefined; });",
    "McpServer.prototype.connect = (async (value) => { transport = value; });",
    "try {",
    "  createDevgodMcpServer({",
    "    async status() { return { ok: true }; },",
    "    async runtimeHealth() { return { ok: true }; },",
    "    async ops() { return { ok: true }; },",
    "    async loop() { return { ok: true }; },",
    "    async report() { return { ok: true }; },",
    "    async planContext() { return { ok: true }; }",
    "  });",
    "  await startDevgodMcpServer();",
    "  assert.equal(registrations.length, 12);",
    "  assert.ok(transport instanceof StdioServerTransport);",
    "} finally {",
    "  McpServer.prototype.registerTool = originalRegisterTool;",
    "  McpServer.prototype.connect = originalConnect;",
    "}"
  ].join("\n");
  const libraryRun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", libraryScript],
    {
      cwd: repoRootPath,
      encoding: "utf8",
      env: buildCoverageNeutralChildEnv()
    }
  );

  assert.equal(libraryRun.status, 0, libraryRun.stderr);

  const execScript = [
    "import assert from 'node:assert/strict';",
    "import process from 'node:process';",
    "import { setTimeout as delay } from 'node:timers/promises';",
    "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
    `const serverModuleSpecifier = ${JSON.stringify(`${serverModuleUrl.href}?child-exec`)};`,
    "const messages = [];",
    "const originalConnect = McpServer.prototype.connect;",
    "const originalConsoleError = console.error;",
    "McpServer.prototype.connect = (async () => { throw new Error('child stdio failure'); });",
    "console.error = ((message) => { messages.push(String(message)); });",
    `process.argv[1] = ${JSON.stringify(serverEntrypointPath)};`,
    "try {",
    "  await import(serverModuleSpecifier);",
    "  await delay(0);",
    "  assert.deepEqual(messages, ['child stdio failure']);",
    "  assert.equal(process.exitCode, 1);",
    "} finally {",
    "  McpServer.prototype.connect = originalConnect;",
    "  console.error = originalConsoleError;",
    "}"
  ].join("\n");
  const execRun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", execScript],
    {
      cwd: repoRootPath,
      encoding: "utf8",
      env: buildCoverageNeutralChildEnv()
    }
  );

  assert.equal(execRun.status, 1, execRun.stderr);
});

test("server executable guard logs Error rejections and sets exitCode", async () => {
  const originalConnect = McpServer.prototype.connect;
  const originalArgv1 = process.argv[1];
  const originalExitCode = process.exitCode;
  const originalConsoleError = console.error;
  const messages: string[] = [];

  McpServer.prototype.connect = (async () => {
    throw new Error("broken stdio");
  }) as typeof McpServer.prototype.connect;
  process.argv[1] = serverEntrypointPath;
  process.exitCode = 0;
  console.error = ((message?: unknown) => {
    messages.push(String(message));
  }) as typeof console.error;

  try {
    await importServerModule("exec");
    assert.deepEqual(messages, ["broken stdio"]);
    assert.equal(process.exitCode, 1);
  } finally {
    McpServer.prototype.connect = originalConnect;
    process.argv[1] = originalArgv1;
    process.exitCode = originalExitCode;
    console.error = originalConsoleError;
  }
});

test("server executable guard stringifies non-Error rejections", async () => {
  const originalConnect = McpServer.prototype.connect;
  const originalArgv1 = process.argv[1];
  const originalExitCode = process.exitCode;
  const originalConsoleError = console.error;
  const messages: string[] = [];

  McpServer.prototype.connect = (async () => {
    throw "plain failure";
  }) as typeof McpServer.prototype.connect;
  process.argv[1] = serverEntrypointPath;
  process.exitCode = 0;
  console.error = ((message?: unknown) => {
    messages.push(String(message));
  }) as typeof console.error;

  try {
    await importServerModule("exec");
    assert.deepEqual(messages, ["plain failure"]);
    assert.equal(process.exitCode, 1);
  } finally {
    McpServer.prototype.connect = originalConnect;
    process.argv[1] = originalArgv1;
    process.exitCode = originalExitCode;
    console.error = originalConsoleError;
  }
});

test("server module import stays inert when loaded outside the executable entrypoint path", async () => {
  const originalConnect = McpServer.prototype.connect;
  const originalArgv1 = process.argv[1];
  const originalExitCode = process.exitCode;
  const originalConsoleError = console.error;
  const transports: unknown[] = [];
  const messages: string[] = [];

  McpServer.prototype.connect = (async (transport) => {
    transports.push(transport);
  }) as typeof McpServer.prototype.connect;
  process.argv[1] = inertEntrypointPath;
  process.exitCode = 0;
  console.error = ((message?: unknown) => {
    messages.push(String(message));
  }) as typeof console.error;

  try {
    await importServerModule("library");
    assert.deepEqual(transports, []);
    assert.deepEqual(messages, []);
    assert.equal(process.exitCode, 0);
  } finally {
    McpServer.prototype.connect = originalConnect;
    process.argv[1] = originalArgv1;
    process.exitCode = originalExitCode;
    console.error = originalConsoleError;
  }
});
