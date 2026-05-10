import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getOpsSurface,
  getPlanContextSurface,
  getReportSurface,
  getRuntimeHealthSurface,
  getStatusSurface
} from "../admin/runtime-surface.ts";
import { createMcpToolDefinitions, type McpRuntimeSurface } from "./tools.ts";

export function createDevgodMcpServer(
  runtime: McpRuntimeSurface = {
    status: getStatusSurface,
    runtimeHealth: getRuntimeHealthSurface,
    ops: getOpsSurface,
    report: getReportSurface,
    planContext: getPlanContextSurface
  }
) {
  const server = new McpServer({
    name: "devgod",
    version: "0.1.0"
  });

  for (const tool of createMcpToolDefinitions(runtime)) {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async (input) => tool.invoke(input)
    );
  }

  return server;
}

export async function startDevgodMcpServer(): Promise<void> {
  const server = createDevgodMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && process.argv[1].endsWith("src/mcp/server.ts")) {
  startDevgodMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
