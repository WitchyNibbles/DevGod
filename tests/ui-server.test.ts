import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHostedUiRequestHandler } from "../src/ui/server.ts";

test("hosted UI serves HTML and JSON API surfaces", async () => {
  const server = createServer((request, response) => {
    void createHostedUiRequestHandler({
      async status(args) {
        return { surface: "status", args };
      },
      async ops(args) {
        return { surface: "ops", args };
      },
      async report(args) {
        return { surface: "report", args };
      }
    })(request, response);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const htmlResponse = await fetch(baseUrl);
    const html = await htmlResponse.text();
    assert.match(html, /devgod operator deck/);
    assert.match(html, /Hosted Operator Surface/);

    const statusResponse = await fetch(`${baseUrl}/api/status?runId=latest&workspaceSlug=team&projectSlug=devgod`);
    const status = (await statusResponse.json()) as { surface: string; args: string[] };
    assert.equal(status.surface, "status");
    assert.deepEqual(status.args, ["--run-id", "latest", "--workspace-slug", "team", "--project-slug", "devgod"]);

    const reportResponse = await fetch(`${baseUrl}/api/report?runId=run-22&staleAfterHours=12`);
    const report = (await reportResponse.json()) as { surface: string; args: string[] };
    assert.equal(report.surface, "report");
    assert.deepEqual(report.args, ["--run-id", "run-22", "--format", "json", "--stale-after-hours", "12"]);
  } finally {
    server.close();
    await once(server, "close");
  }
});
