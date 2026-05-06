import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectGitNexusStatus } from "../src/admin/gitnexus.ts";

async function createRepoRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(root, ".git", "refs", "heads"), { recursive: true });
  await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
  await writeFile(
    path.join(root, ".git", "refs", "heads", "main"),
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
    "utf8"
  );
  return root;
}

async function writeProjectGitNexusConfig(repoRoot: string) {
  await mkdir(path.join(repoRoot, ".codex"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".codex", "config.toml"),
    "[mcp_servers.gitnexus]\ncommand = \"npx\"\nargs = [\"-y\", \"gitnexus@latest\", \"mcp\"]\n",
    "utf8"
  );
}

async function writeGitNexusMeta(repoRoot: string, contents: Record<string, unknown>) {
  await mkdir(path.join(repoRoot, ".gitnexus"), { recursive: true });
  await writeFile(path.join(repoRoot, ".gitnexus", "meta.json"), JSON.stringify(contents, null, 2), "utf8");
}

test("inspectGitNexusStatus reports unconfigured repos without indexes", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-unconfigured-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "unconfigured");
    assert.equal(result.configured, false);
    assert.equal(result.repoIndexed, false);
    assert.match(result.notes.join(" "), /config was not detected/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus reports missing indexes when GitNexus MCP is configured", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-missing-index-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeProjectGitNexusConfig(repoRoot);

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "missing_index");
    assert.equal(result.configured, true);
    assert.deepEqual(result.configuredScopes, ["project"]);
    assert.match(result.notes.join(" "), /has not been indexed yet/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus reports stale indexes when meta commit lags HEAD", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-stale-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeProjectGitNexusConfig(repoRoot);
    await writeGitNexusMeta(repoRoot, {
      indexedAt: "2026-05-06T00:00:00.000Z",
      lastCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "stale");
    assert.equal(result.repoIndexed, true);
    assert.equal(result.indexedCommit, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(result.headCommit, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.match(result.notes.join(" "), /behind the current git HEAD/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus reports ready indexes when meta matches HEAD", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-ready-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeProjectGitNexusConfig(repoRoot);
    await writeGitNexusMeta(repoRoot, {
      indexedAt: "2026-05-06T00:00:00.000Z",
      lastCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.repoIndexed, true);
    assert.match(result.notes.join(" "), /advisory context is ready/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus reports invalid metadata when required fields are missing", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-invalid-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeProjectGitNexusConfig(repoRoot);
    await writeGitNexusMeta(repoRoot, {
      indexedAt: "2026-05-06T00:00:00.000Z"
    });

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "invalid_metadata");
    assert.equal(result.repoIndexed, true);
    assert.match(result.notes.join(" "), /meta is invalid/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus reports config parse warnings without failing the advisory flow", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-bad-config-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await mkdir(path.join(repoRoot, ".codex"), { recursive: true });
    await writeFile(path.join(repoRoot, ".codex", "config.toml"), "[mcp_servers.gitnexus\n", "utf8");

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "unconfigured");
    assert.match(result.notes.join(" "), /project Codex config could not be parsed/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus resolves gitdir files and packed refs", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-packed-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeProjectGitNexusConfig(repoRoot);
    await mkdir(path.join(repoRoot, ".git-data"), { recursive: true });
    await writeFile(path.join(repoRoot, ".git"), "gitdir: .git-data\n", "utf8");
    await writeFile(path.join(repoRoot, ".git-data", "HEAD"), "ref: refs/heads/main\n", "utf8");
    await writeFile(
      path.join(repoRoot, ".git-data", "packed-refs"),
      "# pack-refs with: peeled fully-peeled sorted\ncccccccccccccccccccccccccccccccccccccccc refs/heads/main\n",
      "utf8"
    );
    await writeGitNexusMeta(repoRoot, {
      indexedAt: "2026-05-06T00:00:00.000Z",
      lastCommit: "cccccccccccccccccccccccccccccccccccccccc"
    });

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.headCommit, "cccccccccccccccccccccccccccccccccccccccc");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus keeps indexed repos advisory when MCP config is absent", async () => {
  const repoRoot = await createRepoRoot("devgod-gitnexus-indexed-no-config-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeGitNexusMeta(repoRoot, {
      indexedAt: "2026-05-06T00:00:00.000Z",
      lastCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.configured, false);
    assert.match(result.notes.join(" "), /index is current, but no GitNexus MCP config was detected/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGitNexusStatus reports head_unavailable when index exists but git metadata is missing", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-head-unavailable-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-gitnexus-home-"));

  try {
    await writeProjectGitNexusConfig(repoRoot);
    await writeGitNexusMeta(repoRoot, {
      indexedAt: "2026-05-06T00:00:00.000Z",
      lastCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    const result = await inspectGitNexusStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "head_unavailable");
    assert.match(result.notes.join(" "), /HEAD could not be resolved/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});
