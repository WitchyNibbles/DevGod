import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  executeRefreshRetrievalCommand,
  inspectRetrievalFreshness
} from "../src/admin.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

test("executeRefreshRetrievalCommand records retrieval manifest metadata after indexing and embedding", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-refresh-retrieval-"));
  const store = new MemoryStore();

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await store.saveProjectRuntimeRegistration({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      repoPath: directory,
      runtimeProfile: "local-docker",
      dataRoot: path.join(directory, "runtime-root"),
      qdrantUrl: "http://127.0.0.1:6333/",
      qdrantCollection: "devgod-memory",
      installManifestPath: ".devgod/install-manifest.json",
      manifest: {},
      provenance: { authority: "runtime_authoritative" },
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    });

    const result = await executeRefreshRetrievalCommand({
      cwd: directory,
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_WORKSPACE_NAME: "Team Workspace",
        DEVGOD_PROJECT_SLUG: "devgod",
        DEVGOD_PROJECT_NAME: "Devgod",
        DEVGOD_EMBEDDING_MODEL: "devgod-local-hash-1536"
      },
      async withClient(callback) {
        return callback({ kind: "client" } as never);
      },
      createStore() {
        return store as never;
      },
      async captureSnapshot() {
        return {
          repoRoot: directory,
          include: ["README.md", "docs"],
          fileCount: 2,
          fingerprint: "repo-fingerprint"
        };
      },
      async indexRepoMarkdown() {
        return {
          runId: "run-markdown",
          filesIndexed: 2,
          chunksStored: 4,
          jobsQueued: 4
        };
      },
      async runEmbeddingJobs() {
        return {
          leased: 4,
          completed: 4,
          failed: 0
        };
      },
      now() {
        return new Date("2026-05-15T12:00:00.000Z");
      }
    });

    assert.equal(result.filesIndexed, 2);
    assert.equal(result.embeddingJobs?.completed, 4);

    const registration = await store.getProjectRuntimeRegistration(context.project.id);
    const retrievalIndex = registration?.manifest.retrievalIndex as Record<string, unknown> | undefined;
    assert.equal(retrievalIndex?.status, "ready");
    assert.equal(retrievalIndex?.fingerprint, "repo-fingerprint");
    assert.equal(retrievalIndex?.embeddingModel, "devgod-local-hash-1536");
    assert.equal(retrievalIndex?.jobsQueued, 4);
    assert.equal(retrievalIndex?.embeddingCompleted, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeRefreshRetrievalCommand accepts flags before the positional repo root", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-refresh-retrieval-flags-"));
  const repoRoot = path.join(directory, "docs");
  const store = new MemoryStore();

  try {
    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: repoRoot
    });
    await store.saveProjectRuntimeRegistration({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      repoPath: repoRoot,
      runtimeProfile: "local-docker",
      dataRoot: path.join(directory, "runtime-root"),
      qdrantUrl: "http://127.0.0.1:6333/",
      qdrantCollection: "devgod-memory",
      installManifestPath: ".devgod/install-manifest.json",
      manifest: {},
      provenance: { authority: "runtime_authoritative" },
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    });

    const result = await executeRefreshRetrievalCommand({
      argv: [
        "node",
        "src/admin.ts",
        "refresh-retrieval",
        "--workspace-slug",
        "team",
        "--workspace-name",
        "Team Workspace",
        "--project-slug",
        "devgod",
        "--project-name",
        "Devgod",
        "--embedding-model",
        "devgod-local-hash-1536",
        "docs"
      ],
      cwd: directory,
      env: {},
      async withClient(callback) {
        return callback({ kind: "client" } as never);
      },
      createStore() {
        return store as never;
      },
      async captureSnapshot(input) {
        assert.equal(input.repoRoot, repoRoot);
        return {
          repoRoot,
          include: ["README.md", "docs"],
          fileCount: 2,
          fingerprint: "repo-fingerprint"
        };
      },
      async indexRepoMarkdown(input) {
        assert.equal(input.repoRoot, repoRoot);
        assert.equal(input.workspaceSlug, "team");
        assert.equal(input.workspaceName, "Team Workspace");
        assert.equal(input.projectSlug, "devgod");
        assert.equal(input.projectName, "Devgod");
        assert.equal(input.embeddingModel, "devgod-local-hash-1536");
        return {
          runId: "run-markdown",
          filesIndexed: 2,
          chunksStored: 4,
          jobsQueued: 4
        };
      },
      async runEmbeddingJobs() {
        return {
          leased: 4,
          completed: 4,
          failed: 0
        };
      },
      now() {
        return new Date("2026-05-15T12:00:00.000Z");
      }
    });

    assert.equal(result.repoRoot, repoRoot);
    assert.equal(result.workspaceSlug, "team");
    assert.equal(result.projectSlug, "devgod");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("inspectRetrievalFreshness reports stale when the repo fingerprint diverges from runtime metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devgod-retrieval-freshness-"));
  const store = new MemoryStore();

  try {
    await mkdir(path.join(directory, "docs"), { recursive: true });
    await writeFile(path.join(directory, "README.md"), "# Devgod\n", "utf8");
    await writeFile(path.join(directory, "docs", "runbook.md"), "# Runbook\n\nCurrent content.\n", "utf8");

    const context = await store.ensureProjectContext({
      workspaceSlug: "team",
      projectSlug: "devgod",
      repoPath: directory
    });
    await store.saveProjectRuntimeRegistration({
      projectId: context.project.id,
      workspaceId: context.workspace.id,
      repoPath: directory,
      runtimeProfile: "local-docker",
      dataRoot: path.join(directory, "runtime-root"),
      qdrantUrl: "http://127.0.0.1:6333/",
      qdrantCollection: "devgod-memory",
      installManifestPath: ".devgod/install-manifest.json",
      manifest: {
        retrievalIndex: {
          status: "ready",
          include: ["README.md", "docs"],
          fileCount: 2,
          fingerprint: "old-fingerprint",
          embeddingModel: "devgod-local-hash-1536",
          indexedAt: "2026-05-15T11:00:00.000Z"
        }
      },
      provenance: { authority: "runtime_authoritative" },
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    });

    const freshness = await inspectRetrievalFreshness({
      cwd: directory,
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod",
        DEVGOD_EMBEDDING_MODEL: "devgod-local-hash-1536"
      },
      store
    });

    assert.equal(freshness.state, "stale");
    assert.match(freshness.summary, /does not match/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
