import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchGithubWorkItem } from "../src/admin/github-dispatch.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

async function writeJsonFixture(
  root: string,
  filename: string,
  payload: Record<string, unknown>
): Promise<string> {
  const inputPath = path.join(root, filename);
  await writeFile(inputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return inputPath;
}

function must<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}

test("dispatchGithubWorkItem creates a runtime intake run and workflow document from a GitHub issue payload", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "issue-event.json", {
      repository: { full_name: "acme/devgod" },
      sender: { login: "maintainer" },
      issue: {
        number: 42,
        title: "Ship operator report",
        body: "We need a report view for runs.",
        html_url: "https://github.com/acme/devgod/issues/42",
        user: { login: "reporter" }
      }
    });

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
    const workflowDocument = workflowDocuments[0];
    assert.ok(workflowDocument);
    assert.equal(workflowDocument.kind, "brief");
    assert.match(workflowDocument.body, /canonical workflow state must remain in runtime records/);
    assert.equal(workflowDocument.metadata.source, "github_dispatch");

    const runtimeState = await store.getProjectRuntimeState(projectContext.project.id);
    assert.ok(runtimeState);
    assert.equal(runtimeState.activeRunId, result.runId);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem returns a dry-run plan for GitHub issue comments", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "issue-comment-event.json", {
      repository: { full_name: "acme/devgod" },
      sender: { login: "maintainer" },
      issue: {
        number: 77,
        title: "Tighten release gate",
        body: "Coverage should block release.",
        html_url: "https://github.com/acme/devgod/issues/77"
      },
      comment: {
        body: "Please prioritize this before the next tag.",
        html_url: "https://github.com/acme/devgod/issues/77#issuecomment-1",
        user: { login: "commenter" }
      }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath,
      dryRun: true
    });

    assert.equal(result.mode, "dry_run");
    assert.equal(result.trigger, "issue_comment");
    assert.equal(result.actor, "commenter");
    assert.equal(result.repository, "acme/devgod");
    assert.equal(result.taskId, "issue_comment-77-tighten-release-gate");
    assert.match(must(result.url), /issuecomment-1$/);
    assert.equal(result.nextSteps.length, 3);
    assert.match(must(result.nextSteps[0]), /github-dispatch --input/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem handles plain pull requests and trims advisory fields", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "pull-request-event.json", {
      pull_request: {
        title: "  Harden runtime status  ",
        body: "  Ensure the runtime report is trustworthy.  ",
        html_url: "https://github.com/acme/devgod/pull/14",
        user: { login: "  pr-author  " }
      },
      sender: { login: "maintainer" }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath
    });

    assert.equal(result.mode, "applied");
    assert.equal(result.trigger, "pull_request");
    assert.equal(result.repository, "unknown/unknown");
    assert.equal(result.actor, "pr-author");
    assert.equal(result.taskId, "pull_request-harden-runtime-status");
    assert.match(must(result.url), /\/pull\/14$/);

    const run = await store.getRun(result.runId!);
    assert.ok(run);
    assert.equal(run.actor, "github:pr-author");
    assert.equal(run.title, "Harden runtime status");
    assert.match(run.request, /GitHub pull_request from unknown\/unknown/);
    assert.match(run.request, /Ensure the runtime report is trustworthy\./);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem handles pull request comments and preserves comment context", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "pull-request-comment-event.json", {
      repository: { full_name: "acme/devgod" },
      sender: { login: "maintainer" },
      pull_request: {
        number: 9,
        title: "Refine runtime report",
        body: "Adds the first report view.",
        html_url: "https://github.com/acme/devgod/pull/9",
        user: { login: "pr-author" }
      },
      comment: {
        body: "Please split the storage changes into a follow-up.",
        html_url: "https://github.com/acme/devgod/pull/9#discussion_r1",
        user: { login: "reviewer" }
      }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath
    });

    assert.equal(result.mode, "applied");
    assert.equal(result.trigger, "pull_request_comment");
    assert.equal(result.actor, "reviewer");
    assert.equal(result.taskId, "pull_request_comment-9-refine-runtime-report");
    assert.match(must(result.url), /discussion_r1$/);

    const run = await store.getRun(result.runId!);
    assert.ok(run);
    assert.equal(run.actor, "github:reviewer");
    assert.match(run.request, /GitHub pull_request_comment from acme\/devgod/);
    assert.match(run.request, /Comment context:/);
    assert.match(run.request, /split the storage changes into a follow-up/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem falls back to sender identity and honors an explicit task id override", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "issue-fallback-event.json", {
      repository: { full_name: "acme/devgod" },
      sender: { login: "maintainer" },
      issue: {
        title: "Release gate drift",
        body: ""
      }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath,
      taskId: "manual-task-id"
    });

    assert.equal(result.mode, "applied");
    assert.equal(result.actor, "maintainer");
    assert.equal(result.taskId, "manual-task-id");

    const run = await store.getRun(result.runId!);
    assert.ok(run);
    assert.match(run.request, /No body supplied in the GitHub payload\./);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem preserves existing runtime queue state when creating a new intake run", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const { workspace, project } = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod"
    });
    await store.saveProjectRuntimeState({
      projectId: project.id,
      workspaceId: workspace.id,
      activeRunId: "run-previous",
      activeTaskId: "task-existing",
      taskQueue: {
        project_status: "active",
        current_task_id: "task-existing",
        tasks: []
      },
      productState: {
        status: "active",
        items: ["coverage gap"]
      },
      lastVerifiedRunId: "run-verified",
      metadata: { source: "seeded" },
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z"
    });

    const inputPath = await writeJsonFixture(tempRoot, "issue-existing-state.json", {
      repository: { full_name: "acme/devgod" },
      issue: {
        number: 88,
        title: "Keep queue state",
        body: "Preserve runtime metadata.",
        user: { login: "reporter" }
      }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath
    });

    const runtimeState = await store.getProjectRuntimeState(project.id);
    assert.ok(runtimeState);
    assert.equal(runtimeState.activeRunId, result.runId);
    assert.equal(runtimeState.activeTaskId, "task-existing");
    assert.equal(runtimeState.taskQueue.current_task_id, "task-existing");
    assert.equal(runtimeState.productState.status, "active");
    assert.equal(runtimeState.lastVerifiedRunId, "run-verified");
    assert.deepEqual(runtimeState.metadata, { source: "seeded" });
    assert.equal(runtimeState.createdAt, "2026-05-20T00:00:00.000Z");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem falls back to issue metadata for sparse issue-comment payloads", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "issue-comment-fallback-event.json", {
      issue: {
        number: 12,
        title: "!!!",
        body: "",
        html_url: "https://github.com/acme/devgod/issues/12",
        user: { login: "issue-author" }
      },
      comment: {
        body: "Needs decomposition before implementation."
      }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath,
      dryRun: true
    });

    assert.equal(result.mode, "dry_run");
    assert.equal(result.trigger, "issue_comment");
    assert.equal(result.actor, "issue-author");
    assert.equal(result.repository, "unknown/unknown");
    assert.equal(result.taskId, "issue_comment-12-github-work-item");
    assert.equal(result.url, "https://github.com/acme/devgod/issues/12");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem tolerates sparse pull-request comment metadata and invalid numeric fields", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "pull-request-comment-sparse.json", {
      sender: { login: "maintainer" },
      pull_request: {
        number: "9",
        title: "Refine daemon output",
        body: "Keep the advisory surface terse.",
        html_url: "https://github.com/acme/devgod/pull/9",
        user: { login: "pr-author" }
      },
      comment: {
        body: "Need a narrower follow-up.",
        user: []
      }
    });

    const result = await dispatchGithubWorkItem({
      store,
      workspaceSlug: "team",
      projectSlug: "devgod",
      inputPath,
      dryRun: true
    });

    assert.equal(result.mode, "dry_run");
    assert.equal(result.trigger, "pull_request_comment");
    assert.equal(result.actor, "pr-author");
    assert.equal(result.taskId, "pull_request_comment-refine-daemon-output");
    assert.equal(result.url, "https://github.com/acme/devgod/pull/9");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dispatchGithubWorkItem rejects unsupported GitHub payloads", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "devgod-github-dispatch-"));
  const store = new MemoryStore();

  try {
    const inputPath = await writeJsonFixture(tempRoot, "unsupported-event.json", {
      repository: { full_name: "acme/devgod" },
      sender: { login: "maintainer" },
      discussion: {
        title: "Unrelated event type"
      }
    });

    await assert.rejects(
      dispatchGithubWorkItem({
        store,
        workspaceSlug: "team",
        projectSlug: "devgod",
        inputPath
      }),
      /could not extract a supported GitHub issue, pull request, or comment payload/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
