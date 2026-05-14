import test from "node:test";
import assert from "node:assert/strict";
import { createHostedUiRequestHandler } from "../src/ui/server.ts";

test("hosted UI serves HTML and JSON API surfaces", async () => {
  const handler = createHostedUiRequestHandler({
    async status(args) {
      return { surface: "status", args };
    },
    async ops(args) {
      return { surface: "ops", args };
    },
    async report(args) {
      return { surface: "report", args };
    }
  });

  async function invoke(url: string): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body = "";
    await handler(
      { url } as Parameters<typeof handler>[0],
      {
        writeHead(code: number, outgoingHeaders: Record<string, string>) {
          statusCode = code;
          Object.assign(headers, outgoingHeaders);
          return this;
        },
        end(chunk?: string) {
          body = chunk ?? "";
          return this;
        }
      } as Parameters<typeof handler>[1]
    );
    return { statusCode, headers, body };
  }

  const htmlResponse = await invoke("/");
  assert.equal(htmlResponse.statusCode, 200);
  assert.match(htmlResponse.body, /devgod operator deck/);
  assert.match(htmlResponse.body, /Hosted Operator Surface/);

  const statusResponse = await invoke("/api/status?runId=latest&workspaceSlug=team&projectSlug=devgod");
  const status = JSON.parse(statusResponse.body) as { surface: string; args: string[] };
  assert.equal(status.surface, "status");
  assert.deepEqual(status.args, ["--run-id", "latest", "--workspace-slug", "team", "--project-slug", "devgod"]);

  const reportResponse = await invoke("/api/report?runId=run-22&staleAfterHours=12");
  const report = JSON.parse(reportResponse.body) as { surface: string; args: string[] };
  assert.equal(report.surface, "report");
  assert.deepEqual(report.args, ["--run-id", "run-22", "--format", "json", "--stale-after-hours", "12"]);
});
