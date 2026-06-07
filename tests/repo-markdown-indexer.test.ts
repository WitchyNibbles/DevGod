import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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

test("indexRepoMarkdown default includes capture skill markdown for retrieval", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-skills-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    await mkdir(path.join(repoRoot, ".agents", "skills", "devgod-test"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".agents", "skills", "devgod-test", "SKILL.md"),
      [
        "# Devgod Test Skill",
        "",
        "Use lexical-first retrieval with semantic fallback to keep planning context out of repo prompts."
      ].join("\n"),
      "utf8"
    );

    const indexResult = await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod"
    });

    assert.equal(indexResult.filesIndexed, 1);

    const results = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "lexical-first retrieval"
    });

    assert.equal(results[0]?.citation.sourcePath, ".agents/skills/devgod-test/SKILL.md");
    assert.equal(results[0]?.authority.source, "repo_artifact");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("indexRepoMarkdown preserves distinct chunks when heading slugs repeat within one file", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-duplicate-headings-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    await writeFile(
      path.join(repoRoot, "README.md"),
      [
        "# Runbook",
        "",
        "Primary rollback checklist.",
        "",
        "## Output Contract",
        "",
        "First repeated section keeps the initial guidance.",
        "",
        "## Output Contract",
        "",
        "Second repeated section must still be retrievable without ID collisions."
      ].join("\n"),
      "utf8"
    );

    const indexResult = await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod",
      include: ["README.md"]
    });

    assert.equal(indexResult.filesIndexed, 1);
    assert.ok(indexResult.chunksStored >= 3);

    const results = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "ID collisions"
    });

    assert.equal(results[0]?.citation.sourcePath, "README.md");
    assert.equal(results[0]?.citation.sourceAnchor, "output-contract");
    assert.match(results[0]?.content ?? "", /Second repeated section/);
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

test("indexRepoMarkdown skips runtime-managed workflow markdown even when .devgod is explicitly included", async () => {
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
    assert.equal(reviewerResults.length, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("indexRepoMarkdown rejects include paths outside the repository root", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-traversal-"));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-outside-"));
  const store = new MemoryStore();

  try {
    await writeFile(path.join(outsideRoot, "escape.md"), "# Escape\n\nTraversal should not be reachable.\n", "utf8");

    await assert.rejects(
      indexRepoMarkdown({
        store,
        repoRoot,
        workspaceSlug: "team",
        projectSlug: "devgod",
        include: ["../" + path.basename(outsideRoot)]
      }),
      /outside the repository root|within the repository root/
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("indexRepoMarkdown allows a legitimate in-repo ..name path", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-dotdot-"));
  const store = new MemoryStore();
  const service = new DevgodCoreService(store);

  try {
    await mkdir(path.join(repoRoot, "..name"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "..name", "guide.md"),
      "# Dot Dot Name\n\nThis path stays inside the repository.\n",
      "utf8"
    );

    const indexResult = await indexRepoMarkdown({
      store,
      repoRoot,
      workspaceSlug: "team",
      projectSlug: "devgod",
      include: ["..name"]
    });

    assert.equal(indexResult.filesIndexed, 1);

    const results = await service.searchMemory({
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "stays inside the repository"
    });

    assert.equal(results[0]?.citation.sourcePath, "..name/guide.md");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("indexRepoMarkdown rejects symlinked markdown files that escape the repository root", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-symlink-"));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-markdown-symlink-outside-"));
  const store = new MemoryStore();

  try {
    await mkdir(path.join(repoRoot, "docs"), { recursive: true });
    await writeFile(
      path.join(outsideRoot, "escape.md"),
      "# Escape\n\nTraversal should not be reachable.\n",
      "utf8"
    );
    await symlink(path.join(outsideRoot, "escape.md"), path.join(repoRoot, "docs", "escape.md"));

    await assert.rejects(
      indexRepoMarkdown({
        store,
        repoRoot,
        workspaceSlug: "team",
        projectSlug: "devgod",
        include: ["docs"]
      }),
      /outside the repository root|refusing to read markdown outside the repository root/
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});
