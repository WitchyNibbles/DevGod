import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createGrafanaClient } from "../src/grafana/client.ts";
import { createGrafanaMcpToolDefinitions } from "../src/grafana/tools.ts";

type GrafanaStubHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>
) => void | Promise<void>;

async function withGrafanaStub(
  handler: GrafanaStubHandler,
  run: (url: string) => Promise<void>
): Promise<void> {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("Grafana client queries Loki logs through the datasource proxy", async () => {
  const seenRequests: Array<{ url: string; auth?: string; tenant?: string }> = [];

  await withGrafanaStub(async (req, res) => {
    const requestRecord: { url: string; auth?: string; tenant?: string } = {
      url: req.url ?? "",
      ...(typeof req.headers.authorization === "string" ? { auth: req.headers.authorization } : {}),
      ...(typeof req.headers["x-scope-orgid"] === "string" ? { tenant: req.headers["x-scope-orgid"] } : {})
    };
    seenRequests.push(requestRecord);

    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ commit: "abc123", database: "ok", version: "11.5.0" }));
      return;
    }

    if (req.url === "/api/datasources") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ uid: "loki-main", name: "Loki Main", type: "loki", isDefault: true }]));
      return;
    }

    if (req.url === "/api/datasources/uid/loki-main") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ uid: "loki-main", name: "Loki Main", type: "loki" }));
      return;
    }

    if (req.url?.startsWith("/api/datasources/proxy/uid/loki-main/loki/api/v1/query_range?")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "success",
          data: {
            result: [
              {
                stream: { app: "api", env: "prod" },
                values: [
                  ["1716911000000000000", "first line"],
                  ["1716912000000000000", "second line"]
                ]
              }
            ],
            stats: { summary: { bytesProcessedPerSecond: 42 } }
          }
        })
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  }, async (baseUrl) => {
    const client = createGrafanaClient({
      DEVGOD_GRAFANA_URL: baseUrl,
      DEVGOD_GRAFANA_TOKEN: "secret-token",
      DEVGOD_GRAFANA_LOGS_DATASOURCE_UID: "loki-main",
      DEVGOD_GRAFANA_LOKI_TENANT_ID: "tenant-a"
    });

    const health = await client.testConnection();
    assert.equal(health.version, "11.5.0");

    const datasources = await client.listDatasources();
    assert.equal(datasources.length, 1);
    assert.equal(datasources[0]?.uid, "loki-main");

    const logs = await client.queryLogs({
      query: '{app="api"} |= "error"',
      limit: 2
    });

    assert.equal(logs.datasource.uid, "loki-main");
    assert.equal(logs.lineCount, 2);
    assert.deepEqual(logs.lines[0], {
      timestamp: "1716911000000000000",
      line: "first line",
      labels: { app: "api", env: "prod" }
    });
    assert.ok(
      seenRequests.some((request) => request.auth === "Bearer secret-token" && request.url === "/api/health")
    );
    assert.ok(
      seenRequests.some(
        (request) =>
          request.tenant === "tenant-a" &&
          request.url.includes("/api/datasources/proxy/uid/loki-main/loki/api/v1/query_range")
      )
    );
  });
});

test("Grafana client rejects non-Loki datasource types for log queries", async () => {
  await withGrafanaStub(async (req, res) => {
    if (req.url === "/api/datasources/uid/not-loki") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ uid: "not-loki", name: "Tempo", type: "tempo" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  }, async (baseUrl) => {
    const client = createGrafanaClient({
      DEVGOD_GRAFANA_URL: baseUrl,
      DEVGOD_GRAFANA_TOKEN: "secret-token"
    });

    await assert.rejects(
      client.queryLogs({
        datasourceUid: "not-loki",
        query: '{app="api"}'
      }),
      /Loki datasources only/
    );
  });
});

test("Grafana MCP tools expose test, list, and query surfaces", async () => {
  const calls: Array<{ tool: string; input?: Record<string, unknown> }> = [];
  const tools = createGrafanaMcpToolDefinitions({
    async testConnection() {
      calls.push({ tool: "test" });
      return { commit: "abc123", database: "ok", version: "11.5.0" };
    },
    async listDatasources() {
      calls.push({ tool: "list" });
      return [{ uid: "loki-main", name: "Loki Main", type: "loki", isDefault: true }];
    },
    async queryLogs(input) {
      calls.push({ tool: "query", input: input as unknown as Record<string, unknown> });
      return {
        datasource: { uid: "loki-main", name: "Loki Main", type: "loki" },
        query: input.query,
        direction: input.direction ?? "backward",
        lineCount: 1,
        lines: [{ timestamp: "1", line: "hello", labels: { app: "api" } }]
      };
    }
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "devgod_grafana_test_connection",
      "devgod_grafana_list_datasources",
      "devgod_grafana_query_logs"
    ]
  );

  const health = await tools[0]!.invoke({});
  const datasources = await tools[1]!.invoke({});
  const logs = await tools[2]!.invoke({ query: '{app="api"}', limit: 50, direction: "forward" });

  assert.match(health.content[0]?.text ?? "", /Grafana reachable/);
  assert.equal((datasources.structuredContent.datasources as Array<{ uid: string }>)[0]?.uid, "loki-main");
  assert.equal(logs.structuredContent.lineCount, 1);
  assert.deepEqual(calls, [
    { tool: "test" },
    { tool: "list" },
    {
      tool: "query",
      input: {
        query: '{app="api"}',
        datasourceUid: undefined,
        start: undefined,
        end: undefined,
        since: undefined,
        limit: 50,
        direction: "forward"
      }
    }
  ]);
});
