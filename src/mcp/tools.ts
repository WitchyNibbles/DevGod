import { z } from "zod";

export interface McpRuntimeSurface {
  status(args: readonly string[]): Promise<unknown>;
  runtimeHealth(args: readonly string[]): Promise<unknown>;
  ops(args: readonly string[]): Promise<unknown>;
  report(args: readonly string[]): Promise<unknown>;
  planContext(args: readonly string[]): Promise<unknown>;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
  invoke: (input: Record<string, unknown>) => Promise<{
    content: { type: "text"; text: string }[];
    structuredContent: Record<string, unknown>;
  }>;
}

function pushOptionalStringFlag(args: string[], flag: string, value: unknown): void {
  if (typeof value === "string" && value.trim().length > 0) {
    args.push(flag, value.trim());
  }
}

function pushOptionalNumberFlag(args: string[], flag: string, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    args.push(flag, String(value));
  }
}

function buildRunSelectorArgs(input: {
  runId?: unknown;
  workspaceSlug?: unknown;
  projectSlug?: unknown;
}): string[] {
  const args: string[] = [];
  if (typeof input.runId === "string" && input.runId.trim().length > 0) {
    args.push("--run-id", input.runId.trim());
  } else {
    args.push("--run-id", "latest");
    pushOptionalStringFlag(args, "--workspace-slug", input.workspaceSlug);
    pushOptionalStringFlag(args, "--project-slug", input.projectSlug);
  }
  return args;
}

function buildTextResult(summary: string, structuredContent: unknown) {
  const normalizedStructuredContent =
    structuredContent && typeof structuredContent === "object" && !Array.isArray(structuredContent)
      ? (structuredContent as Record<string, unknown>)
      : { value: structuredContent };

  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: normalizedStructuredContent
  };
}

export function createMcpToolDefinitions(runtime: McpRuntimeSurface): readonly McpToolDefinition[] {
  return [
    {
      name: "devgod_status",
      description:
        "Get the authoritative devgod run status report. Use runId or latest plus workspace/project.",
      inputSchema: {
        runId: z.string().trim().optional(),
        workspaceSlug: z.string().trim().optional(),
        projectSlug: z.string().trim().optional(),
        staleAfterDays: z.number().int().min(0).optional()
      },
      async invoke(input) {
        const args = buildRunSelectorArgs(input);
        pushOptionalNumberFlag(args, "--stale-after-days", input.staleAfterDays);
        const report = await runtime.status(args);
        return buildTextResult("Returned the devgod status report.", report);
      }
    },
    {
      name: "devgod_runtime_health",
      description:
        "Check runtime registration, data-root, qdrant, and review-identity health for a devgod run.",
      inputSchema: {
        runId: z.string().trim().optional(),
        workspaceSlug: z.string().trim().optional(),
        projectSlug: z.string().trim().optional()
      },
      async invoke(input) {
        const report = await runtime.runtimeHealth(buildRunSelectorArgs(input));
        return buildTextResult("Returned the devgod runtime health report.", report);
      }
    },
    {
      name: "devgod_ops",
      description:
        "Get the operator dashboard for a run, including routing and recovery guidance with authority labels.",
      inputSchema: {
        runId: z.string().trim().optional(),
        workspaceSlug: z.string().trim().optional(),
        projectSlug: z.string().trim().optional(),
        staleAfterHours: z.number().int().min(0).optional()
      },
      async invoke(input) {
        const args = buildRunSelectorArgs(input);
        pushOptionalNumberFlag(args, "--stale-after-hours", input.staleAfterHours);
        const report = await runtime.ops(args);
        return buildTextResult("Returned the devgod operator dashboard.", report);
      }
    },
    {
      name: "devgod_report",
      description:
        "Get the run evidence report, including timeline, reviews, approvals, and recovery observations.",
      inputSchema: {
        runId: z.string().trim().optional(),
        workspaceSlug: z.string().trim().optional(),
        projectSlug: z.string().trim().optional(),
        staleAfterHours: z.number().int().min(0).optional()
      },
      async invoke(input) {
        const args = [...buildRunSelectorArgs(input), "--format", "json"];
        pushOptionalNumberFlag(args, "--stale-after-hours", input.staleAfterHours);
        const report = await runtime.report(args);
        return buildTextResult("Returned the devgod run evidence report.", report);
      }
    },
    {
      name: "devgod_plan_context",
      description:
        "Search reviewed devgod planning context with authority, freshness, and citation metadata.",
      inputSchema: {
        query: z.string().trim().min(1),
        workspaceSlug: z.string().trim().optional(),
        projectSlug: z.string().trim().optional(),
        role: z.string().trim().optional(),
        limit: z.number().int().min(1).max(20).optional(),
        projectOnly: z.boolean().optional()
      },
      async invoke(input) {
        const args = ["--query", String(input.query), "--format", "json"];
        pushOptionalStringFlag(args, "--workspace-slug", input.workspaceSlug);
        pushOptionalStringFlag(args, "--project-slug", input.projectSlug);
        pushOptionalStringFlag(args, "--role", input.role);
        pushOptionalNumberFlag(args, "--limit", input.limit);
        if (input.projectOnly === true) {
          args.push("--project-only");
        }
        const report = await runtime.planContext(args);
        return buildTextResult("Returned devgod planning context results.", report);
      }
    }
  ];
}
