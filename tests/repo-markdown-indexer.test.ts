import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DevgodCoreService, MemoryStore, indexRepoMarkdown, runEmbeddingJobs } from "../src/index.ts";
import type { EmbeddingJobRecord } from "../src/store/types.ts";

function getEmbeddingJobs(store: MemoryStore): Map<string, EmbeddingJobRecord> {
  return (store as unknown as { embeddingJobs: Map<string, EmbeddingJobRecord> }).embeddingJobs;
}

test("indexRepoMarkdown stores markdown chunks, queues embeddings, and exposes them through searchMemory", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-index-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    await mkdir(path.join(repoRoot, "docs"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "README.md"),
      [
        "# Devgod",
        "",
        "Shared orchestration foundation.",
        "",
        "## Retrieval",
        "",
        "Use repo markdown indexing before external augmentation."
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(repoRoot, "docs", "runbook.md"),
      [
        "# Incident Playbook",
        "",
        "Rollback checklist for release recoveries.",
        "",
        "## Verification",
        "",
        "Verify retrieval citations reference the source markdown path."
      ].join("\n"),
      "utf8"
    );

    const indexResult = await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod",
      include: ["README.md", "docs"],
      embeddingModel: "text-embedding-3-small"
    });

    assert.equal(indexResult.filesIndexed, 2);
    assert.ok(indexResult.chunksStored >= 2);
    assert.equal(indexResult.jobsQueued, indexResult.chunksStored);
    assert.ok(getEmbeddingJobs(store).size >= 2);

    const embeddingResult = await runEmbeddingJobs({
      store,
      limit: 20,
      provider: {
        async embed() {
          return [0.1, 0.2, 0.3];
        }
      }
    });

    assert.equal(embeddingResult.failed, 0);
    assert.equal(embeddingResult.completed, indexResult.jobsQueued);

    const results = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "rollback checklist"
    });

    assert.equal(results[0]?.authority.source, "repo_artifact");
    assert.equal(results[0]?.authority.precedence, "repo_context");
    assert.equal(results[0]?.citation.kind, "artifact");
    assert.equal(results[0]?.citation.sourcePath, "docs/runbook.md");
    assert.equal(results[0]?.citation.sourceAnchor, "incident-playbook");
    assert.equal(results[0]?.citation.canonicalRef, "docs/runbook.md#incident-playbook");
    assert.equal(results[0]?.provenance.artifactKind, "markdown_chunk");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("indexRepoMarkdown replaces stale markdown chunks when files are removed", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-cleanup-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    await mkdir(path.join(repoRoot, "docs"), { recursive: true });
    const runbookPath = path.join(repoRoot, "docs", "runbook.md");

    await writeFile(runbookPath, "# Runbook\n\nRollback checklist for release recoveries.\n", "utf8");
    await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod",
      include: ["docs"]
    });

    let results = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "rollback checklist"
    });
    assert.equal(results[0]?.citation.sourcePath, "docs/runbook.md");

    await rm(runbookPath);
    await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod",
      include: ["docs"]
    });

    results = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "rollback checklist"
    });
    assert.equal(results.length, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("indexRepoMarkdown assigns role-scoped metadata to review artifacts", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-roles-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    await mkdir(path.join(repoRoot, ".devgod", "work", "reviews"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".devgod", "work", "reviews", "security.md"),
      ["# Security Review", "", "Escalate auth bypass findings through the review gate."].join("\n"),
      "utf8"
    );

    await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod",
      include: [".devgod"]
    });

    const backendResults = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "auth bypass findings",
      requesterRole: "backend_engineer"
    });
    assert.equal(backendResults.length, 0);

    const reviewerResults = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "auth bypass findings",
      requesterRole: "reviewer"
    });

    assert.equal(reviewerResults[0]?.citation.sourcePath, ".devgod/work/reviews/security.md");
    assert.ok(reviewerResults[0]?.metadata.allowedRoles.includes("reviewer"));
    assert.ok(reviewerResults[0]?.metadata.allowedRoles.includes("security_reviewer"));
    assert.equal(reviewerResults[0]?.authority.authorityLevel, "repo_context");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
