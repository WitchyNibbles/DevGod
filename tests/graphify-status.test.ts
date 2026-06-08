import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { inspectGraphifyStatus } from "../src/admin/graphify.ts";

const execFileAsync = promisify(execFile);

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

async function writeProjectGraphifyConfig(repoRoot: string) {
  await mkdir(path.join(repoRoot, ".codex"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".codex", "config.toml"),
    '[mcp_servers.graphify]\ncommand = "python3"\nargs = ["-m", "graphify.serve", "graphify-out/graph.json"]\n',
    "utf8"
  );
}

async function writeGraphifyGraph(repoRoot: string, contents: Record<string, unknown>) {
  await mkdir(path.join(repoRoot, "graphify-out"), { recursive: true });
  await writeFile(path.join(repoRoot, "graphify-out", "graph.json"), JSON.stringify(contents, null, 2), "utf8");
}

test("inspectGraphifyStatus reports unconfigured repos without graphs", async () => {
  const repoRoot = await createRepoRoot("devgod-graphify-unconfigured-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "unconfigured");
    assert.equal(result.configured, false);
    assert.equal(result.graphBuilt, false);
    assert.match(result.notes.join(" "), /config was not detected/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus reports missing graphs when Graphify MCP is configured", async () => {
  const repoRoot = await createRepoRoot("devgod-graphify-missing-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await writeProjectGraphifyConfig(repoRoot);

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "missing_graph");
    assert.equal(result.configured, true);
    assert.deepEqual(result.configuredScopes, ["project"]);
    assert.match(result.notes.join(" "), /has not been built yet/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus reports stale graphs when repo files are newer than the graph", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-graphify-stale-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "devgod@example.com"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Devgod"], { cwd: repoRoot });
    await mkdir(path.join(repoRoot, "src"), { recursive: true });
    await writeFile(path.join(repoRoot, "src", "index.ts"), "export const version = 1;\n", "utf8");
    await execFileAsync("git", ["add", "src/index.ts"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoRoot });
    await writeProjectGraphifyConfig(repoRoot);
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });
    const graphPath = path.join(repoRoot, "graphify-out", "graph.json");
    const oldDate = new Date("2024-01-01T00:00:00.000Z");
    await utimes(graphPath, oldDate, oldDate);
    await writeFile(path.join(repoRoot, "src", "index.ts"), "export const version = 2;\n", "utf8");

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "stale");
    assert.equal(result.graphBuilt, true);
    assert.match(result.notes.join(" "), /behind the current repo snapshot/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus ignores dirty files outside the indexed src scope", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-graphify-out-of-scope-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "devgod@example.com"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Devgod"], { cwd: repoRoot });
    await mkdir(path.join(repoRoot, "src"), { recursive: true });
    await writeFile(path.join(repoRoot, "src", "index.ts"), "export const version = 1;\n", "utf8");
    await execFileAsync("git", ["add", "src/index.ts"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoRoot });
    await writeProjectGraphifyConfig(repoRoot);
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });
    await writeFile(path.join(repoRoot, "README.md"), "not indexed by graphify extract src\n", "utf8");

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.graphBuilt, true);
    assert.match(result.notes.join(" "), /repo context is ready/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus reports ready graphs when graph is current", async () => {
  const repoRoot = await createRepoRoot("devgod-graphify-ready-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await writeProjectGraphifyConfig(repoRoot);
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.graphBuilt, true);
    assert.match(result.notes.join(" "), /repo context is ready/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus ignores graphify-generated dirty paths when evaluating freshness", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-graphify-self-generated-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "devgod@example.com"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Devgod"], { cwd: repoRoot });
    await writeFile(path.join(repoRoot, "README.md"), "initial\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoRoot });
    await writeProjectGraphifyConfig(repoRoot);
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });
    await writeFile(path.join(repoRoot, "graphify-out", "index.md"), "generated wiki\n", "utf8");
    await writeFile(path.join(repoRoot, "graphify-out", ".graphify_analysis.json"), "{}\n", "utf8");

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.graphBuilt, true);
    assert.match(result.notes.join(" "), /repo context is ready/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus treats deleted indexed files as current after a post-delete graph rebuild", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-graphify-deleted-source-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "devgod@example.com"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Devgod"], { cwd: repoRoot });
    await mkdir(path.join(repoRoot, "src"), { recursive: true });
    await writeFile(path.join(repoRoot, "src", "index.ts"), "export const version = 1;\n", "utf8");
    await writeFile(path.join(repoRoot, "src", "old.ts"), "export const removed = true;\n", "utf8");
    await execFileAsync("git", ["add", "src/index.ts", "src/old.ts"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoRoot });
    await writeProjectGraphifyConfig(repoRoot);
    await rm(path.join(repoRoot, "src", "old.ts"));
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.graphBuilt, true);
    assert.match(result.notes.join(" "), /repo context is ready/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus reports invalid graphs when graph.json is malformed", async () => {
  const repoRoot = await createRepoRoot("devgod-graphify-invalid-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await writeProjectGraphifyConfig(repoRoot);
    await mkdir(path.join(repoRoot, "graphify-out"), { recursive: true });
    await writeFile(path.join(repoRoot, "graphify-out", "graph.json"), "{broken", "utf8");

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "invalid_graph");
    assert.equal(result.graphBuilt, true);
    assert.match(result.notes.join(" "), /graph is invalid/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus reports config parse warnings without failing the advisory flow", async () => {
  const repoRoot = await createRepoRoot("devgod-graphify-bad-config-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await mkdir(path.join(repoRoot, ".codex"), { recursive: true });
    await writeFile(path.join(repoRoot, ".codex", "config.toml"), "[mcp_servers.graphify\n", "utf8");

    const result = await inspectGraphifyStatus({
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

test("inspectGraphifyStatus resolves gitdir files and packed refs", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-graphify-packed-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await writeProjectGraphifyConfig(repoRoot);
    await mkdir(path.join(repoRoot, ".git-data"), { recursive: true });
    await writeFile(path.join(repoRoot, ".git"), "gitdir: .git-data\n", "utf8");
    await writeFile(path.join(repoRoot, ".git-data", "HEAD"), "ref: refs/heads/main\n", "utf8");
    await writeFile(
      path.join(repoRoot, ".git-data", "packed-refs"),
      "# pack-refs with: peeled fully-peeled sorted\ncccccccccccccccccccccccccccccccccccccccc refs/heads/main\n",
      "utf8"
    );
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });

    const result = await inspectGraphifyStatus({
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

test("inspectGraphifyStatus keeps built graphs advisory when MCP config is absent", async () => {
  const repoRoot = await createRepoRoot("devgod-graphify-built-no-config-");
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });

    const result = await inspectGraphifyStatus({
      cwd: repoRoot,
      homeDirectory
    });

    assert.equal(result.state, "ready");
    assert.equal(result.configured, false);
    assert.match(result.notes.join(" "), /graph is current, but no Graphify MCP config was detected/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("inspectGraphifyStatus reports head_unavailable when graph exists but git metadata is missing", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-graphify-head-unavailable-"));
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-graphify-home-"));

  try {
    await writeProjectGraphifyConfig(repoRoot);
    await writeGraphifyGraph(repoRoot, { nodes: [], edges: [] });

    const result = await inspectGraphifyStatus({
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
