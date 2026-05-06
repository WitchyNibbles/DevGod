import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchGithubWorkItem } from "../src/admin/github-dispatch.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dispatchGithubWorkItem scaffolds canonical workflow artifacts from a GitHub issue payload", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const targetRoot = path.join(tempRoot, "target");
  const inputPath = path.join(tempRoot, "issue-event.json");

  try {
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
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
      sourceRoot: repoRoot,
      targetRoot,
      inputPath
    });

    assert.equal(result.mode, "applied");
    assert.equal(result.trigger, "issue");
    assert.equal(result.repository, "acme/devgod");
    assert.equal(result.actor, "reporter");
    assert.equal(result.taskId, "issue-42-ship-operator-report");
    assert.match(result.briefPath ?? "", /brief-issue-42-ship-operator-report\.md$/);

    const active = await readFile(path.join(targetRoot, ".devgod/ACTIVE"), "utf8");
    const brief = await readFile(
      path.join(targetRoot, ".devgod/work/briefs/brief-issue-42-ship-operator-report.md"),
      "utf8"
    );

    assert.equal(active, "task_id=issue-42-ship-operator-report\nworkflow=devgod\nstate=active\n");
    assert.match(brief, /GitHub issue from acme\/devgod/);
    assert.match(brief, /Source URL: https:\/\/github\.com\/acme\/devgod\/issues\/42/);
    assert.match(brief, /canonical workflow state must remain in \.devgod\/work/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
