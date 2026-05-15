import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchGithubWorkItem } from "../src/admin/github-dispatch.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

test("dispatchGithubWorkItem creates a runtime intake run and workflow document from a GitHub issue payload", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const inputPath = path.join(tempRoot, "issue-event.json");
  const store = new MemoryStore();

  try {
    await writeFile(
      inputPath,
      `${JSON.stringify(
        {
          repository: { full_name: "acme/devgod" },
          sender: { login: "maintainer" },
          issue: {
            number: 42,
            title: "Ship operator report",
            body: "We need a report view for runs.",
            html_url: "https://github.com/acme/devgod/issues/42",
            user: { login: "reporter" }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath
    });

    assert.equal(result.mode, "applied");
    assert.equal(result.trigger, "issue");
    assert.equal(result.repository, "acme/devgod");
    assert.equal(result.actor, "reporter");
    assert.equal(result.taskId, "issue-42-ship-operator-report");
    assert.ok(result.runId);
    assert.ok(result.workflowDocumentId);

    const run = await store.getRun(result.runId!);
    assert.ok(run);
    assert.equal(run.actor, "github:reporter");
    assert.equal(run.title, "Ship operator report");
    assert.match(run.request, /GitHub issue from acme\/devgod/);
    assert.match(run.request, /Source URL: https:\/\/github\.com\/acme\/devgod\/issues\/42/);

    const projectContext = await store.getProjectContext({ workspaceSlug: "team", projectSlug: "devgod" });
    assert.ok(projectContext);

    const workflowDocuments = await store.listWorkflowDocuments({
      projectId: projectContext.project.id,
      runId: result.runId
    });
    assert.equal(workflowDocuments.length, 1);
    assert.equal(workflowDocuments[0]?.kind, "brief");
    assert.match(workflowDocuments[0]?.body ?? "", /canonical workflow state must remain in runtime records/);
    assert.equal(workflowDocuments[0]?.metadata.source, "github_dispatch");

    const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
    assert.equal(runtimeState?.activeRunId, result.runId);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
