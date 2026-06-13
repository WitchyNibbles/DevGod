import test from "node:test";
import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "@iarna/toml";
import { auditMaintainerOnlyPublishedPaths } from "../src/install/maintainer-boundary.ts";
import {
  agentsManagedBlock,
  grafanaCodexConfigFragment,
  graphifyCodexConfigFragment,
  mergeAgentsMd,
  mergeDotAgentsMd,
  mergeCodexConfig,
  mergeGitignore,
  mergePackageJson,
  playwrightCodexConfigFragment
} from "../src/install/merge.ts";
import {
  renderManagedAgentsBlock,
  renderManagedDotAgentsBlock
} from "../src/devgod/managed-policy-renderer.ts";
import {
  installDevgodIntoProject,
  parseCliArgs,
  upgradeReasoningWorkflowArtifacts,
  upgradeDevgodInProject,
  verifyDevgodInstall
} from "../src/install/cli.ts";
import {
  listCatalogAgentArtifactPaths,
  verifyCatalogRepoLocalSkills,
  verifyAgentCatalogArtifacts
} from "../src/devgod/agent-artifact-verifier.ts";
import {
  listCanonicalPackageOwnershipGroups,
  listCanonicalPackageFileEntries,
  verifyPackageFileEntries
} from "../src/devgod/package-surface.ts";
import { listCatalogRepoLocalSkillPaths } from "../src/devgod/repo-local-skill-surface.ts";
import {
  listPublishedPackFixturePaths,
  readPublishedPackageJson,
  readPublishedTypesEntrypoint,
  readPublishedTypesRelativePath
} from "./published-package-test-helpers.ts";

const execFileRawAsync = promisify(execFile);

function childProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_V8_COVERAGE: ""
  };
  return {
    ...env,
    ...overrides,
    NODE_V8_COVERAGE: ""
  };
}

function packFixtureEnv(sourceRoot: string): NodeJS.ProcessEnv {
  return childProcessEnv({
    NODE_PATH: [path.join(sourceRoot, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
  });
}

function execFileAsync(
  file: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> {
  return (async () => {
    const captureRoot = await mkdtemp(path.join(tmpdir(), "devgod-exec-capture-"));
    const stdoutPath = path.join(captureRoot, "stdout.txt");
    const stderrPath = path.join(captureRoot, "stderr.txt");
    const statusPath = path.join(captureRoot, "status.txt");

    try {
      await execFileRawAsync(
        "bash",
        [
          "-c",
          [
            "set +e",
            "stdout_file=$1",
            "stderr_file=$2",
            "status_file=$3",
            "shift 3",
            '"$@" >"$stdout_file" 2>"$stderr_file"',
            "status=$?",
            'printf "%s" "$status" >"$status_file"',
            "exit 0"
          ].join("\n"),
          "bash",
          stdoutPath,
          stderrPath,
          statusPath,
          file,
          ...args
        ],
        {
          ...options,
          encoding: "utf8",
          env: childProcessEnv(options.env ?? {})
        }
      );

      const [stdout, stderr, statusText] = await Promise.all([
        readFile(stdoutPath, "utf8"),
        readFile(stderrPath, "utf8"),
        readFile(statusPath, "utf8")
      ]);
      const exitCode = Number.parseInt(statusText, 10);

      if (exitCode === 0) {
        return { stdout, stderr };
      }

      const error = new Error(`Command failed: ${file} ${args.join(" ")}`) as Error & {
        code: number;
        signal: null;
        stderr: string;
        stdout: string;
      };
      error.code = exitCode;
      error.signal = null;
      error.stdout = stdout;
      error.stderr = stderr;
      throw error;
    } finally {
      await rm(captureRoot, { recursive: true, force: true });
    }
  })();
}

interface PackFixtureStageOptions {
  intendedTrackedRelativePaths?: string[];
}

function normalizeFixtureRelativePath(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join(path.posix.sep);
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Pack fixture paths must stay repo-relative; received "${relativePath}"`);
  }
  return normalized;
}

async function listTrackedFixturePaths(sourceRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: sourceRoot });
  return stdout
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => normalizeFixtureRelativePath(entry))
    .sort();
}

async function listUntrackedFixturePaths(sourceRoot: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: sourceRoot
  });
  return new Set(
    stdout
      .split("\0")
      .filter((entry) => entry.length > 0)
      .map((entry) => normalizeFixtureRelativePath(entry))
  );
}

async function copyFixturePath(sourceRoot: string, stagedRoot: string, relativePath: string): Promise<void> {
  const sourcePath = path.join(sourceRoot, relativePath);
  const stagedPath = path.join(stagedRoot, relativePath);
  await mkdir(path.dirname(stagedPath), { recursive: true });
  await cp(sourcePath, stagedPath, {
    force: true,
    recursive: false
  });
}

async function stagePackSourceRoot(
  sourceRoot: string,
  options: PackFixtureStageOptions = {}
): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const stagedRoot = await mkdtemp(path.join(tmpdir(), "devgod-pack-source-"));
  const trackedPaths = await listTrackedFixturePaths(sourceRoot);
  const trackedPathSet = new Set(trackedPaths);
  const untrackedPaths = await listUntrackedFixturePaths(sourceRoot);
  const intendedTrackedPaths = (options.intendedTrackedRelativePaths ?? []).map((entry) =>
    normalizeFixtureRelativePath(entry)
  );

  for (const relativePath of intendedTrackedPaths) {
    if (!trackedPathSet.has(relativePath) && !untrackedPaths.has(relativePath)) {
      throw new Error(
        `Intended tracked pack fixture path must exist in the workspace before staging: ${relativePath}`
      );
    }
  }

  const fixturePaths = [...new Set([...trackedPaths, ...intendedTrackedPaths])];

  try {
    for (const relativePath of fixturePaths) {
      await copyFixturePath(sourceRoot, stagedRoot, relativePath);
    }

    return {
      root: stagedRoot,
      cleanup: async () => rm(stagedRoot, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(stagedRoot, { recursive: true, force: true });
    throw error;
  }
}

async function runNpmPackJsonDryRun(sourceRoot: string, options: PackFixtureStageOptions = {}): Promise<string> {
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-npm-pack-cache-"));
  const outputPath = path.join(npmCacheDir, "npm-pack-output.json");
  const staged = await stagePackSourceRoot(sourceRoot, options);

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "set -euo pipefail",
          `npm pack --json --dry-run --cache ${JSON.stringify(npmCacheDir)} > ${JSON.stringify(outputPath)}`
        ].join("\n")
      ],
      {
        cwd: staged.root,
        env: packFixtureEnv(sourceRoot)
      }
    );

    return await readFile(outputPath, "utf8");
  } finally {
    await staged.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
  }
}

async function createPackedTarball(
  sourceRoot: string,
  options: PackFixtureStageOptions = {}
): Promise<{ tarballPath: string; cleanup: () => Promise<void> }> {
  const packDir = await mkdtemp(path.join(tmpdir(), "devgod-npm-pack-"));
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-npm-pack-cache-"));
  const staged = await stagePackSourceRoot(sourceRoot, options);

  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--json", "--pack-destination", packDir],
      {
        cwd: staged.root,
        env: {
          ...packFixtureEnv(sourceRoot),
          npm_config_cache: npmCacheDir
        }
      }
    );
    const packResult = JSON.parse(stdout) as Array<{ filename: string }>;
    const filename = packResult[0]?.filename;
    if (!filename) {
      throw new Error("npm pack did not report a tarball filename");
    }

    return {
      tarballPath: path.join(packDir, filename),
      cleanup: async () => {
        await staged.cleanup();
        await rm(packDir, { recursive: true, force: true });
        await rm(npmCacheDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await staged.cleanup();
    await rm(packDir, { recursive: true, force: true });
    await rm(npmCacheDir, { recursive: true, force: true });
    throw error;
  }
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  await chmod(filePath, 0o755);
}

async function writeGraphifyGraph(targetRoot: string): Promise<void> {
  await mkdir(path.join(targetRoot, "graphify-out"), { recursive: true });
  await writeFile(
    path.join(targetRoot, "graphify-out", "graph.json"),
    JSON.stringify({ nodes: [], edges: [] }, null, 2),
    "utf8"
  );
}

async function writeHealthcheckNodeStub(binDir: string): Promise<void> {
  await writeExecutable(
    path.join(binDir, "node"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [[ "${1:-}" == "-e" ]]; then',
      "  exit 0",
      "fi",
      `exec ${JSON.stringify(process.execPath)} "$@"`
    ].join("\n")
  );
}

const driftFixtureTarget = "scripts/check-devgod-workflow.sh";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readInstalledManifest(targetRoot: string): Promise<{
  version: number;
  files: Array<{ contentHash: string; strategy: "merge" | "replace"; target: string }>;
}> {
  return JSON.parse(
    await readFile(path.join(targetRoot, ".devgod", "install-manifest.json"), "utf8")
  ) as {
    version: number;
    files: Array<{ contentHash: string; strategy: "merge" | "replace"; target: string }>;
  };
}

test("mergeAgentsMd appends and is idempotent", () => {
  const first = mergeAgentsMd("# Existing Rules\n");
  const second = mergeAgentsMd(first);
  const managedBlockMatch = first.match(
    /<!-- BEGIN DEVGOD MANAGED -->[\s\S]*?<!-- END DEVGOD MANAGED -->/
  );
  const managedBlock = managedBlockMatch?.[0] ?? "";
  const managedWordCount = managedBlock.split(/\s+/).filter(Boolean).length;

  assert.match(first, /BEGIN DEVGOD MANAGED/);
  assert.match(first, /## Department Workflow/);
  assert.match(first, /<!-- devgod-workflow-contract:start -->/);
  assert.match(first, /<!-- devgod-workflow-contract:end -->/);
  assert.match(first, /workflow=devgod/);
  assert.match(first, /workflow_runtime=postgres/);
  assert.match(first, /active_task_pointer=project_runtime_state\.active_task_id/);
  assert.match(first, /local_live_check=bash scripts\/check-devgod-workflow-live\.sh \[--task-id <task-id>\]/);
  assert.doesNotMatch(first, /\.devgod\/ACTIVE/);
  assert.match(first, /devgod-intake/);
  assert.match(first, /`solution_architect`/);
  assert.match(first, /`planner`/);
  assert.match(first, /`git_operator`/);
  assert.match(first, /workflow_check=npm run devgod -- workflow-proof --run-id latest --task-id <task-id>/);
  assert.match(first, /workflow-proof --run-id latest --task-id/);
  assert.doesNotMatch(first, /workflow_check=devgod workflow-proof --run-id latest --task-id <task-id>/);
  assert.doesNotMatch(first, /node_modules\/devgod\/src\/admin\/devgod\.ts/);
  assert.match(first, /## Autonomy Loop/);
  assert.match(first, /update runtime product state/i);
  assert.match(first, /update runtime task queue/i);
  assert.match(first, /a completed phase is not a completed product/i);
  assert.match(first, /clarify ambiguous intent before planning/i);
  assert.match(first, /do not wait for the user to say continue/i);
  assert.match(first, /runtime-backed devgod commands/i);
  assert.match(first, /repo-local Grafana configuration/i);
  assert.match(first, /avoid strong negative claims/i);
  assert.match(first, /broader evidence/i);
  assert.match(first, /branch from updated `origin\/main`/i);
  assert.match(first, /default branch prefixes are `feature\/`, `bugfix\/`, `hotfix\/`, `release\/`, `chore\/`, `refactor\/`, `docs\/`, `test\/`, `ci\/`, and `perf\/`/i);
  assert.match(first, /do not use `codex` in branch names, commit subjects, PR titles, or PR bodies/i);
  assert.match(first, /caveman.*ultra/i);
  assert.match(first, /\/caveman ultra/i);
  assert.match(first, /root thread that talks directly to the user/i);
  assert.doesNotMatch(first, /scrum_master/);
  assert.doesNotMatch(first, /test_director/);
  assert.doesNotMatch(first, /devgod:codex/);
  assert.match(first, /implicitly invoked on every prompt/i);
  assert.match(first, /default workflow controller even when other tools are available/i);
  assert.ok(managedWordCount < 620, `expected slimmer managed AGENTS block, got ${managedWordCount} words`);
  assert.equal(managedBlock, renderManagedAgentsBlock());
  assert.equal(first, second);
});

test("mergeDotAgentsMd appends and is idempotent", () => {
  const first = mergeDotAgentsMd("# local notes\n");
  const second = mergeDotAgentsMd(first);
  const managedBlock = first.match(/<!-- BEGIN DEVGOD KERNEL -->[\s\S]*?<!-- END DEVGOD KERNEL -->/)?.[0] ?? "";

  assert.match(first, /BEGIN DEVGOD KERNEL/);
  assert.match(first, /Devgod Kernel/);
  assert.match(first, /devgod-intake/);
  assert.match(first, /specialist_verified/);
  assert.match(first, /repo-local Grafana configuration/i);
  assert.match(first, /avoid strong negative claims/i);
  assert.match(first, /branch from updated `origin\/main`/i);
  assert.match(first, /keep `codex` out of branch names, commit subjects, PR titles, and PR bodies/i);
  assert.match(first, /caveman.*ultra/i);
  assert.match(first, /\/caveman ultra/i);
  assert.match(first, /root thread that talks directly to the user/i);
  assert.equal(managedBlock, renderManagedDotAgentsBlock());
  assert.equal(first, second);
});

test("mergeCodexConfig preserves existing values and adds missing devgod defaults", () => {
  const merged = mergeCodexConfig(
    `model = "custom-model"\n\n[features]\npersonality = false\n`,
    `model = "gpt-5.4"\nmodel_reasoning_effort = "medium"\nmodel_verbosity = "low"\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\nproject_doc_fallback_filenames = [".agents.md", "AGENTS.md"]\nproject_doc_max_bytes = 8192\n\n[features]\nmulti_agent = true\nenable_request_compression = true\nplugin_hooks = true\n\n[agents]\nmax_threads = 8\n`
  );
  const parsed = parseToml(merged) as {
    model?: string;
    model_reasoning_effort?: string;
    model_verbosity?: string;
    approval_policy?: string;
    sandbox_mode?: string;
    project_doc_fallback_filenames?: string[];
    project_doc_max_bytes?: number;
    suppress_unstable_features_warning?: boolean;
    features?: Record<string, unknown>;
    agents?: Record<string, unknown>;
  };

  assert.equal(parsed.model, "custom-model");
  assert.equal(parsed.model_reasoning_effort, "medium");
  assert.equal(parsed.model_verbosity, "low");
  assert.equal(parsed.approval_policy, "never");
  assert.equal(parsed.sandbox_mode, "danger-full-access");
  assert.deepEqual(parsed.project_doc_fallback_filenames, [".agents.md", "AGENTS.md"]);
  assert.equal(parsed.project_doc_max_bytes, 8192);
  assert.equal(parsed.suppress_unstable_features_warning, true);
  assert.equal(parsed.features?.multi_agent, true);
  assert.equal(parsed.features?.plugin_hooks, true);
  assert.equal(parsed.features?.enable_request_compression, true);
  assert.equal(parsed.features?.personality, false);
  assert.equal(parsed.agents?.max_threads, 8);
});

test("mergeCodexConfig preserves explicit unstable-warning preferences", () => {
  const merged = mergeCodexConfig(
    'model = "custom-model"\nsuppress_unstable_features_warning = false\n',
    `model = "gpt-5.4"\n\n[features]\nplugin_hooks = true\n`
  );
  const parsed = parseToml(merged) as {
    suppress_unstable_features_warning?: boolean;
    features?: Record<string, unknown>;
  };

  assert.equal(parsed.suppress_unstable_features_warning, false);
  assert.equal(parsed.features?.plugin_hooks, true);
});

test("mergeCodexConfig enforces devgod full-access defaults", () => {
  const merged = mergeCodexConfig(
    'approval_policy = "on-request"\nsandbox_mode = "workspace-write"\n',
    'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n'
  );
  const parsed = parseToml(merged) as {
    approval_policy?: string;
    sandbox_mode?: string;
  };

  assert.equal(parsed.approval_policy, "never");
  assert.equal(parsed.sandbox_mode, "danger-full-access");
});

test("mergeCodexConfig preserves existing comments when no semantic change is needed", () => {
  const existing = `# keep me\nmodel = "gpt-5.4"\n\n[features]\nmulti_agent = true\n`;

  const merged = mergeCodexConfig(
    existing,
    `model = "gpt-5.4"\n\n[features]\nmulti_agent = true\n`
  );

  assert.equal(merged, existing);
});

test("merge helpers initialize empty managed files and normalize absolute dependency paths", () => {
  const mergedAgents = mergeAgentsMd(undefined);
  const mergedDotAgents = mergeDotAgentsMd(undefined);
  const mergedCodexConfig = mergeCodexConfig(undefined, 'model = "gpt-5.4"\n');
  const mergedGitignore = mergeGitignore(undefined);
  const mergedPackageJson = JSON.parse(mergePackageJson(undefined, "/opt/devgod")) as {
    devDependencies: Record<string, string>;
    name: string;
    private: boolean;
    scripts: Record<string, string>;
  };

  assert.equal(mergedAgents, agentsManagedBlock());
  assert.equal(mergedAgents, renderManagedAgentsBlock());
  assert.equal(mergedDotAgents, `${renderManagedDotAgentsBlock()}\n`);
  assert.match(mergedDotAgents, /BEGIN DEVGOD KERNEL/);
  assert.match(mergedCodexConfig, /model = "gpt-5\.4"/);
  assert.equal(mergedGitignore, "\n# devgod\n.env.devgod\n.env.devgod.*\ngraphify-out/\n");
  assert.equal(mergedPackageJson.name, "project-with-devgod");
  assert.equal(mergedPackageJson.private, true);
  assert.equal(mergedPackageJson.devDependencies.devgod, "file:/opt/devgod");
  assert.equal(mergedPackageJson.scripts["devgod:setup:graphify"], undefined);
  assert.equal(mergedPackageJson.scripts["devgod:setup:playwright"], undefined);
});

test("mergeCodexConfig adds Graphify MCP settings without overwriting existing project config", () => {
  const merged = mergeCodexConfig(
    'model = "gpt-5.4"\n\n[mcp_servers.playwright]\ncommand = "npx"\nargs = ["playwright-mcp"]\n',
    graphifyCodexConfigFragment()
  );

  assert.match(merged, /\[mcp_servers\.graphify\]/);
  assert.match(merged, /command = "uv"/);
  assert.match(merged, /"graphify\.serve"/);
  assert.match(merged, /"graphify-out\/graph\.json"/);
  assert.match(merged, /\[mcp_servers\.playwright\]/);
});

test("mergeCodexConfig adds Playwright MCP settings with standard and vision profiles", () => {
  const merged = mergeCodexConfig(
    'model = "gpt-5.4"\n',
    playwrightCodexConfigFragment()
  );

  assert.match(merged, /\[mcp_servers\.playwright\]/);
  assert.match(merged, /@playwright\/mcp@latest/);
  assert.match(merged, /\.devgod\/playwright\/mcp\.json/);
  assert.match(merged, /\[mcp_servers\.playwright_vision\]/);
  assert.match(merged, /\.devgod\/playwright\/mcp\.vision\.json/);
});

test("mergeCodexConfig adds Grafana MCP settings without overwriting existing project config", () => {
  const merged = mergeCodexConfig(
    'model = "gpt-5.4"\n\n[mcp_servers.playwright]\ncommand = "npx"\nargs = ["playwright-mcp"]\n',
    grafanaCodexConfigFragment()
  );

  assert.match(merged, /\[mcp_servers\.grafana\]/);
  assert.match(merged, /command = "node"/);
  assert.match(merged, /node_modules\/devgod\/dist\/bin\/devgod\.js/);
  assert.match(merged, /grafana-mcp/);
  assert.doesNotMatch(merged, /node_modules\/devgod\/src\/grafana\/mcp-server\.ts/);
  assert.match(merged, /\[mcp_servers\.playwright\]/);
});

test("mergeCodexConfig updates devgod-managed MCP tables without overwriting unrelated user tables", () => {
  const merged = mergeCodexConfig(
    [
      'model = "custom-model"',
      "",
      "[user_owned]",
      'value = "keep-me"',
      "",
      "[mcp_servers.graphify]",
      'command = "python3"',
      'args = ["-m", "graphify.serve", "legacy-graph.json"]',
      "",
      "[mcp_servers.playwright]",
      'command = "node"',
      'args = ["legacy-playwright", ".devgod/playwright/old.json"]',
      "",
      "[mcp_servers.playwright_vision]",
      'command = "node"',
      'args = ["legacy-playwright", ".devgod/playwright/old-vision.json"]',
      "",
      "[mcp_servers.grafana]",
      'command = "tsx"',
      'args = ["src/grafana/mcp-server.ts"]'
    ].join("\n") + "\n",
    [graphifyCodexConfigFragment(), playwrightCodexConfigFragment(), grafanaCodexConfigFragment()].join("\n")
  );

  const parsed = parseToml(merged) as {
    model?: string;
    user_owned?: { value?: string };
    mcp_servers?: Record<string, { command?: string; args?: string[] }>;
  };

  assert.equal(parsed.model, "custom-model");
  assert.equal(parsed.user_owned?.value, "keep-me");
  assert.equal(parsed.mcp_servers?.graphify?.command, "uv");
  assert.deepEqual(parsed.mcp_servers?.graphify?.args, [
    "tool",
    "run",
    "--from",
    "graphifyy",
    "python",
    "-m",
    "graphify.serve",
    "graphify-out/graph.json"
  ]);
  assert.equal(parsed.mcp_servers?.playwright?.command, "npx");
  assert.deepEqual(parsed.mcp_servers?.playwright?.args, [
    "--yes",
    "@playwright/mcp@latest",
    "--config",
    ".devgod/playwright/mcp.json"
  ]);
  assert.equal(parsed.mcp_servers?.playwright_vision?.command, "npx");
  assert.deepEqual(parsed.mcp_servers?.playwright_vision?.args, [
    "--yes",
    "@playwright/mcp@latest",
    "--config",
    ".devgod/playwright/mcp.vision.json"
  ]);
  assert.equal(parsed.mcp_servers?.grafana?.command, "node");
  assert.deepEqual(parsed.mcp_servers?.grafana?.args, [
    "./node_modules/devgod/dist/bin/devgod.js",
    "grafana-mcp"
  ]);
});

test("mergePackageJson adds devgod dependency and scripts without removing existing scripts", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        scripts: {
          test: "vitest"
        }
      }),
      "../devgod"
    )
  ) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const devgodEntry = "devgod";

  assert.equal(merged.scripts.test, "vitest");
  assert.equal(merged.scripts.devgod, devgodEntry);
  assert.equal(merged.scripts["devgod:migrate"], `${devgodEntry} migrate`);
  assert.equal(merged.scripts["devgod:doctor"], `${devgodEntry} doctor`);
  assert.equal(merged.scripts["devgod:heal"], `${devgodEntry} doctor --repair`);
  assert.equal(merged.scripts["devgod:status"], `${devgodEntry} status`);
  assert.equal(merged.scripts["devgod:coverage"], `${devgodEntry} coverage --format text`);
  assert.equal(merged.scripts["devgod:gaps"], `${devgodEntry} gaps --format text`);
  assert.equal(merged.scripts["devgod:checkpoint"], `${devgodEntry} checkpoint --format text`);
  assert.equal(merged.scripts["devgod:resume"], `${devgodEntry} resume --format text`);
  assert.equal(merged.scripts["devgod:seed-workflow-proof"], `${devgodEntry} seed-workflow-proof`);
  assert.equal(merged.scripts["devgod:seed-modernization-proof"], `${devgodEntry} seed-modernization-proof`);
  assert.equal(merged.scripts["devgod:advance-active-task"], `${devgodEntry} advance-active-task --format text`);
  assert.equal(merged.scripts["devgod:reconcile"], `${devgodEntry} reconcile-runtime-state --apply --format text`);
  assert.equal(merged.scripts["devgod:sync-runtime-exports"], `${devgodEntry} sync-runtime-exports --format text`);
  assert.equal(merged.scripts["devgod:daemon"], `${devgodEntry} daemon --format text`);
  assert.equal(merged.scripts["devgod:supervisor"], `${devgodEntry} supervisor --format text`);
  assert.equal(merged.scripts["devgod:supervisor-history"], `${devgodEntry} supervisor-history --format text`);
  assert.equal(merged.scripts["devgod:loop"], `${devgodEntry} loop --format text`);
  assert.equal(merged.scripts["devgod:check-workflow"], "bash scripts/check-devgod-workflow.sh");
  assert.equal(merged.scripts["devgod:report"], `${devgodEntry} report --format markdown`);
  assert.equal(merged.scripts["devgod:focus"], `${devgodEntry} ops --format text`);
  assert.equal(merged.scripts["devgod:refresh-retrieval"], `${devgodEntry} refresh-retrieval`);
  assert.equal(merged.scripts["devgod:refresh-retrieval:fast"], `${devgodEntry} refresh-retrieval --artifacts-only`);
  assert.equal(merged.scripts["devgod:refresh-repo-context"], `${devgodEntry} refresh-repo-context`);
  assert.equal(merged.scripts["devgod:repair-task-queue"], `${devgodEntry} repair-task-queue`);
  assert.equal(merged.scripts["devgod:autopilot-status"], `${devgodEntry} autopilot-status`);
  assert.equal(merged.scripts["devgod:github-dispatch"], `${devgodEntry} github-dispatch --target .`);
  assert.equal(merged.scripts["devgod:mcp"], `${devgodEntry} mcp`);
  assert.equal(merged.scripts["devgod:ui"], `${devgodEntry} serve-ui`);
  assert.equal(merged.scripts["devgod:verify:migrations:live"], `${devgodEntry} verify-live-migrations`);
  assert.equal(merged.scripts["devgod:scaffold-workflow"], `${devgodEntry} scaffold-workflow --target .`);
  assert.equal(merged.scripts["devgod:upgrade-reasoning-workflow"], `${devgodEntry} upgrade-reasoning-workflow --target .`);
  assert.equal(merged.scripts["devgod:seed-happy-path-fixture"], `${devgodEntry} seed-happy-path-fixture --target .`);
  assert.equal(merged.scripts["devgod:check:happy-path"], "bash scripts/check-devgod-happy-path.sh");
  assert.equal(merged.scripts["devgod:verify:review-identity"], `${devgodEntry} verify-review-identity`);
  assert.equal(merged.scripts["devgod:verify:git-guard"], `${devgodEntry} verify-git-guard`);
  assert.equal(merged.scripts["devgod:record-review"], `${devgodEntry} record-review --input .devgod/review-action.json`);
  assert.equal(merged.scripts["devgod:setup:git-guard"], `${devgodEntry} setup-git-guard`);
  assert.equal(merged.scripts["devgod:setup:local"], `${devgodEntry} setup-local`);
  assert.equal(merged.scripts["devgod:setup:graphify"], undefined);
  assert.equal(merged.scripts["devgod:setup:playwright"], undefined);
  assert.equal(merged.scripts["devgod:verify:playwright"], undefined);
  assert.equal(merged.devDependencies.devgod, "file:../devgod");
});

test("verifyAgentCatalogArtifacts reports missing, unexpected, and metadata drift deterministically", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-agent-catalog-"));
  const agentsRoot = path.join(repoRoot, ".codex", "agents");
  await mkdir(agentsRoot, { recursive: true });

  await writeFile(
    path.join(agentsRoot, "backend-engineer.toml"),
    [
      'name = "wrong_backend_role"',
      'description = "Broken metadata fixture"',
      'model = "gpt-5.4"'
    ].join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    path.join(agentsRoot, "mystery-agent.toml"),
    [
      'name = "mystery_agent"',
      'description = "Unexpected artifact fixture"',
      'model = "gpt-5.4-mini"'
    ].join("\n") + "\n",
    "utf8"
  );

  const result = await verifyAgentCatalogArtifacts({
    repoRoot,
    roles: ["backend_engineer", "technical_writer"]
  });

  assert.deepEqual(result.missingArtifacts, [".codex/agents/technical-writer.toml"]);
  assert.deepEqual(result.unexpectedArtifacts, [".codex/agents/mystery-agent.toml"]);
  assert.deepEqual(result.metadataMismatches, [
    '.codex/agents/backend-engineer.toml: expected name "backend_engineer", got "wrong_backend_role"'
  ]);
  assert.deepEqual(result.cavemanContractMismatches, [
    '.codex/agents/backend-engineer.toml: missing caveman markers - caveman ultra mode for every response this role emits; - enable with `/caveman ultra` semantics for maximum compression; - no prose exception: this role does not talk directly to the user; - keep caveman ultra shape: 4-6 lines, 2-8 words per value, no status essays'
  ]);
  assert.equal(result.ok, false);
});

test("verifyCatalogRepoLocalSkills reports missing repo-local wrapper files deterministically", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "devgod-skill-catalog-"));

  try {
    for (const relativePath of listCatalogRepoLocalSkillPaths({ roles: ["planner", "reviewer"] })) {
      const targetPath = path.join(repoRoot, relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, "---\nname = \"placeholder\"\n---\n", "utf8");
    }

    await rm(path.join(repoRoot, ".agents/skills/superpowers-verification-before-completion"), {
      recursive: true,
      force: true
    });

    const result = await verifyCatalogRepoLocalSkills({
      repoRoot,
      roles: ["planner", "reviewer"]
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.missingSkillFiles, [
      ".agents/skills/superpowers-verification-before-completion/SKILL.md"
    ]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("mergePackageJson keeps Graphify and Playwright helpers out of the default install", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        private: true
      }),
      "../devgod"
    )
  ) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(merged.scripts["devgod:setup:graphify"], undefined);
  assert.equal(merged.scripts["devgod:graphify:build"], undefined);
  assert.equal(merged.scripts["devgod:graphify:codex-full"], undefined);
  assert.equal(merged.scripts["devgod:graphify:update"], undefined);
  assert.equal(merged.scripts["devgod:graphify:serve"], undefined);
  assert.equal(merged.scripts["devgod:setup:playwright"], undefined);
  assert.equal(merged.scripts["devgod:verify:playwright"], undefined);
});

test("mergePackageJson adds Graphify helpers only when requested", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        private: true
      }),
      "../devgod",
      {
        withGraphify: true
      }
    )
  ) as {
    scripts: Record<string, string>;
  };

  assert.equal(merged.scripts["devgod:setup:graphify"], "devgod setup-graphify");
  assert.equal(merged.scripts["devgod:graphify:build"], "graphify extract src --out .");
  assert.equal(
    merged.scripts["devgod:graphify:codex-full"],
    "devgod setup-graphify-codex"
  );
  assert.equal(merged.scripts["devgod:graphify:update"], "graphify extract src --out .");
  assert.equal(
    merged.scripts["devgod:graphify:serve"],
    "uv tool run --from graphifyy python -m graphify.serve graphify-out/graph.json"
  );
});

test("mergePackageJson adds Playwright helpers only when requested", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        private: true
      }),
      "../devgod",
      {
        withPlaywright: true
      }
    )
  ) as {
    scripts: Record<string, string>;
  };

  assert.equal(merged.scripts["devgod:setup:playwright"], "devgod setup-playwright");
  assert.equal(merged.scripts["devgod:verify:playwright"], "devgod setup-playwright --verify");
});

test("mergePackageJson adds a Grafana MCP helper only when requested", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        private: true
      }),
      "../devgod",
      {
        withGrafana: true
      }
    )
  ) as {
    scripts: Record<string, string>;
  };

  assert.equal(
    merged.scripts["devgod:grafana:mcp"],
    "devgod grafana-mcp"
  );
});

test("mergeGitignore adds devgod env ignores once", () => {
  const first = mergeGitignore("node_modules/\n");
  const second = mergeGitignore(first);

  assert.match(first, /\.env\.devgod/);
  assert.equal(first, second);
});

test("mergeGitignore adds Graphify output ignore once", () => {
  const first = mergeGitignore("node_modules/\n");
  const second = mergeGitignore(first);

  assert.match(first, /graphify-out\//);
  assert.equal(first, second);
});

test("ci workflow pins external actions and keeps read-only permissions", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ciWorkflow = await readFile(path.join(sourceRoot, ".github/workflows/ci.yml"), "utf8");

  assert.match(ciWorkflow, /uses: actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd/);
  assert.match(ciWorkflow, /uses: actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/);
  assert.match(ciWorkflow, /permissions:\n\s+contents: read/);
  assert.match(ciWorkflow, /merge_group:/);
  assert.match(ciWorkflow, /concurrency:\n\s+group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
  assert.match(
    ciWorkflow,
    /DEVGOD_REVIEW_IDENTITY_BINDINGS: \.devgod\/templates\/review-identity-bindings\.json/
  );
  assert.match(
    ciWorkflow,
    /DEVGOD_REVIEW_IDENTITY_FIXTURES: \.devgod\/templates\/review-identity-adapter\.fixture\.json/
  );
  assert.match(ciWorkflow, /image: pgvector\/pgvector:0\.8\.2-pg18/);
  assert.doesNotMatch(ciWorkflow, /contents: write/);
  assert.doesNotMatch(ciWorkflow, /id-token: write/);
});

test("ci workflow routes the release posture through the release overlay gate", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ciWorkflow = await readFile(path.join(sourceRoot, ".github/workflows/ci.yml"), "utf8");

  assert.match(ciWorkflow, /jobs:\n  release-overlay:/);
  assert.match(ciWorkflow, /npm run verify:release-overlay/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  live-migrations:/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  vendored-skills:/);
  assert.match(ciWorkflow, /npm run verify:vendored-skills/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  required-checks:/);
  assert.match(ciWorkflow, /needs:[\s\S]*- vendored-skills/);
  const windowsJobBlock = ciWorkflow.match(
    /\n  windows-setup-smoke:[\s\S]*?(?=\n  [a-z0-9-]+:|\n$)/
  )?.[0] ?? "";
  assert.doesNotMatch(windowsJobBlock, /persist-credentials: false/);
  assert.doesNotMatch(ciWorkflow, /- run: npm test/);
  assert.doesNotMatch(ciWorkflow, /- run: npm run check:quality/);
  assert.doesNotMatch(ciWorkflow, /- run: npm run check:coverage/);
});

test("README frames devgod as an opt-in overlay with production-oriented package checks", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const readme = await readFile(path.join(sourceRoot, "README.md"), "utf8");

  assert.match(readme, /opt-in overlay/i);
  assert.match(readme, /production-oriented package checks/i);
  assert.match(readme, /core maintainer commands/i);
  assert.match(readme, /core installed commands/i);
  assert.match(readme, /optional module commands/i);
  assert.match(readme, /legacy aliases and migration notes/i);
  assert.match(readme, /intentionally ships two naming layers/i);
  assert.match(readme, /npm run devgod -- workflow-proof --run-id latest --task-id <task-id>/);
  assert.match(readme, /devgod:check-workflow.*legacy compatibility alias/i);
  assert.doesNotMatch(readme, /production ready/i);
});

test("global setup docs keep optional modules out of core readiness", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const globalSetup = await readFile(path.join(sourceRoot, "docs/global-setup.md"), "utf8");
  const consumingCommands = globalSetup.match(/Typical consuming-repo commands there:\n\n```bash\n([\s\S]*?)```/)?.[1] ?? "";
  const graphifySection = globalSetup.match(/## 🕸️ Graphify Repo Graph\n\n([\s\S]*?)(?=\n## |\n$)/)?.[1] ?? "";

  assert.match(globalSetup, /--with-playwright/i);
  assert.match(globalSetup, /--with-graphify/i);
  assert.match(graphifySection, /optional advisory evidence/i);
  assert.match(graphifySection, /core readiness stays governed by runtime/i);
  assert.doesNotMatch(consumingCommands, /devgod:setup:playwright|devgod:verify:playwright/);
  assert.doesNotMatch(graphifySection, /mandatory for DevGod operation/i);
  assert.doesNotMatch(graphifySection, /verify\/setup should be treated as incomplete/i);
});

test("package.json keeps shipped skills and agent configs explicit", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8")) as {
    bin?: Record<string, string> | string;
    devgodCommandSurface?: {
      namingPolicy?: {
        sourceRepo?: string;
        installedRepo?: string;
        workflowProof?: string;
      };
      sourceRepo?: {
        coreMaintainer?: string[];
        optionalModules?: string[];
        legacyAliases?: Record<string, string>;
      };
      installedRepo?: {
        coreInstalled?: string[];
        workflowProof?: {
          canonicalCommand?: string;
          legacyAlias?: string;
          migrationNote?: string;
        };
        optionalModules?: string[];
        legacyAliases?: Record<string, string>;
      };
    };
    description?: string;
    exports?: { ".": { types?: string; default?: string }; "./package.json"?: string };
    license?: string;
    files: string[];
    private?: boolean;
    scripts: Record<string, string>;
  };

  const expectedEntries = listCanonicalPackageFileEntries();
  const ownershipGroups = listCanonicalPackageOwnershipGroups();
  const excludedOverlayFiles = [
    ".devgod/install-backups/",
    ".devgod/work/2026-05-04-project-state-review/BRIEF.md",
    "docs/maintainers/package-surface-ownership.md",
    "docs/maintainers/quality-tooling.md",
    "evals/promptfoo/maintainer-boundary.promptfooconfig.yaml",
    "scripts/",
    "scripts/check-coverage.ts",
    "src/",
    "stryker-maintainer-boundary.config.json"
  ];

  assert.deepEqual([...pkg.files].sort(), expectedEntries);
  assert.deepEqual(
    [...new Set(ownershipGroups.flatMap((group) => group.entries))].sort(),
    expectedEntries
  );
  assert.deepEqual(
    ownershipGroups.map((group) => group.id),
    [
      "bootstrap",
      "operator_docs",
      "plugin_runtime",
      "published_entrypoints",
      "operator_scripts",
      "runtime_sources",
      "repo_local_skills",
      "agent_artifacts"
    ]
  );
  assert.deepEqual(verifyPackageFileEntries(pkg.files), {
    ok: true,
    missingEntries: [],
    unexpectedEntries: [],
    duplicateEntries: []
  });

  const catalogVerification = await verifyAgentCatalogArtifacts({ repoRoot: sourceRoot });
  assert.equal(catalogVerification.ok, true);
  assert.deepEqual(catalogVerification.missingArtifacts, []);
  assert.deepEqual(catalogVerification.unexpectedArtifacts, []);
  assert.deepEqual(catalogVerification.metadataMismatches, []);
  assert.deepEqual(catalogVerification.cavemanContractMismatches, []);
  const catalogSkillVerification = await verifyCatalogRepoLocalSkills({ repoRoot: sourceRoot });
  assert.equal(catalogSkillVerification.ok, true);
  assert.deepEqual(catalogSkillVerification.missingSkillFiles, []);
  assert.equal(pkg.private, false);
  assert.equal(pkg.license, "MIT");
  assert.match(pkg.description ?? "", /opt-in overlay/i);
  assert.deepEqual(pkg.bin, {
    devgod: "./dist/bin/devgod.js"
  });
  assert.deepEqual(pkg.exports, {
    ".": {
      types: readPublishedTypesEntrypoint(pkg),
      default: "./dist/index.js"
    },
    "./package.json": "./package.json"
  });
  assert.equal(pkg.scripts.devgod, "node --experimental-strip-types src/admin/devgod.ts");
  assert.equal(pkg.scripts.test, "node --experimental-strip-types --test tests/*.test.ts");
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts["check:quality"], "bash scripts/check-quality.sh");
  assert.equal(pkg.scripts["install:project"], "node --experimental-strip-types src/install/cli.ts");
  assert.equal(pkg.scripts.migrate, "node --experimental-strip-types src/admin/devgod.ts migrate");
  assert.equal(pkg.scripts.status, "node --experimental-strip-types src/admin/devgod.ts status");
  assert.equal(pkg.scripts.ops, "node --experimental-strip-types src/admin/devgod.ts ops --format text");
  assert.equal(pkg.scripts["record:review"], "node --experimental-strip-types src/admin/devgod.ts record-review --input .devgod/review-action.json");
  assert.equal(pkg.scripts.mcp, "node --experimental-strip-types src/admin/devgod.ts mcp");
  assert.equal(pkg.scripts.ui, "node --experimental-strip-types src/admin/devgod.ts serve-ui");
  assert.equal(pkg.scripts["check:happy-path"], "bash scripts/check-devgod-happy-path.sh");
  assert.equal(
    pkg.scripts["scaffold:workflow"],
    "node --experimental-strip-types src/install/cli.ts scaffold-workflow --target ."
  );
  assert.equal(
    pkg.scripts["devgod:autopilot-status"],
    "node --experimental-strip-types src/devgod/autopilot-status.ts"
  );
  assert.equal(pkg.scripts["devgod:loop"], "node --experimental-strip-types src/admin/devgod.ts loop --format text");
  assert.equal(
    pkg.scripts["verify:agent-caveman"],
    "node --experimental-strip-types src/devgod/verify-agent-caveman-contract.ts"
  );
  assert.equal(
    pkg.scripts["verify:package-surface"],
    "node --experimental-strip-types src/devgod/verify-package-surface.ts"
  );
  assert.equal(pkg.scripts["verify:release-overlay"], "bash scripts/verify-release-overlay.sh");
  assert.equal(
    pkg.scripts["devgod:graphify:codex-full"],
    "node --experimental-strip-types src/install/setup-graphify-codex.ts"
  );
  assert.ok(!("devgod:setup:local" in pkg.scripts));
  assert.ok(!("devgod:doctor" in pkg.scripts));
  assert.ok(!("devgod:verify:setup" in pkg.scripts));
  assert.ok(!("devgod:status" in pkg.scripts));
  assert.ok(!("devgod:workflow-proof" in pkg.scripts));
  assert.deepEqual(pkg.devgodCommandSurface?.sourceRepo?.coreMaintainer, [
    "test",
    "typecheck",
    "check:quality",
    "install:project",
    "devgod"
  ]);
  assert.deepEqual(pkg.devgodCommandSurface?.installedRepo?.coreInstalled, [
    "devgod:setup:local",
    "devgod:doctor",
    "devgod:verify:setup",
    "devgod:status"
  ]);
  assert.deepEqual(pkg.devgodCommandSurface?.sourceRepo?.optionalModules, [
    "mcp",
    "ui",
    "setup:playwright",
    "verify:playwright",
    "setup:graphify",
    "devgod:graphify:build",
    "devgod:graphify:codex-full",
    "devgod:graphify:serve",
    "devgod:graphify:update",
    "devgod:graphify:watch"
  ]);
  assert.deepEqual(pkg.devgodCommandSurface?.installedRepo?.workflowProof, {
    canonicalCommand: "npm run devgod -- workflow-proof --run-id latest --task-id <task-id>",
    legacyAlias: "devgod:check-workflow",
    migrationNote: "Keep the shell wrapper until the installed script surface can rename it under test coverage."
  });
  assert.match(pkg.devgodCommandSurface?.namingPolicy?.sourceRepo ?? "", /short maintainer script names/i);
  assert.match(pkg.devgodCommandSurface?.namingPolicy?.installedRepo ?? "", /namespaced devgod:\* scripts/i);
  assert.match(
    pkg.devgodCommandSurface?.namingPolicy?.workflowProof ?? "",
    /canonical workflow proof command is `npm run devgod -- workflow-proof --run-id latest --task-id <task-id>`/i
  );
  assert.doesNotMatch(
    pkg.scripts["devgod:graphify:codex-full"],
    /node_modules\/devgod\/src\/install\/setup-graphify-codex\.ts/
  );
  for (const relativePath of excludedOverlayFiles) {
    assert.ok(!pkg.files.includes(relativePath), `${relativePath} should stay out of the overlay package manifest`);
  }
  assert.deepEqual(auditMaintainerOnlyPublishedPaths(pkg.files), []);
  assert.ok(pkg.files.every((file) => !file.includes("*")));
});

test("package dry run includes the JS public entrypoints and exported source modules", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const publishedTypesRelativePath = await readPublishedTypesRelativePath(sourceRoot);
  const packResult = JSON.parse(await runNpmPackJsonDryRun(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  })) as Array<{
    files: Array<{
      path: string;
    }>;
  }>;

  const packedFiles = new Set(packResult[0]?.files.map((entry) => entry.path) ?? []);
  assert.ok(packedFiles.has("dist/bin/devgod.js"));
  assert.ok(packedFiles.has(publishedTypesRelativePath));
  assert.ok(packedFiles.has("dist/index.js"));
  assert.ok(packedFiles.has("dist/register-typescript-hooks.js"));
  assert.ok(packedFiles.has("src/public.ts"));
  assert.ok(packedFiles.has("src/evals/orchestration-baseline.ts"));
  assert.ok(packedFiles.has("src/devgod/managed-policy-renderer.ts"));
  assert.ok(packedFiles.has("src/index.ts"));
});

test("verify-package-surface script reports success and drift with canonical package boundaries", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const verifierEntrypoint = path.join(sourceRoot, "src", "devgod", "verify-package-surface.ts");
  const driftRoot = await mkdtemp(path.join(tmpdir(), "devgod-package-surface-drift-"));

  try {
    const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", verifierEntrypoint], {
      cwd: sourceRoot
    });
    assert.match(stdout, /package surface verified/);

    await writeFile(
      path.join(driftRoot, "package.json"),
      JSON.stringify({ files: ["AGENTS.md", "README.md"] }, null, 2) + "\n",
      "utf8"
    );

    await assert.rejects(
      execFileAsync(process.execPath, ["--experimental-strip-types", verifierEntrypoint], {
        cwd: driftRoot
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stderr = "stderr" in error ? String(error.stderr) : "";
        assert.match(stderr, /package\.json files drifted from canonical package surface/);
        assert.match(stderr, /missing:/);
        return true;
      }
    );
  } finally {
    await rm(driftRoot, { recursive: true, force: true });
  }
});

test("packed install exposes the public import and executable surfaces", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const publishedTypesEntrypoint = readPublishedTypesEntrypoint(await readPublishedPackageJson(sourceRoot));
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-packed-install-"));
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-packed-install-cache-"));
  const packed = await createPackedTarball(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  });

  try {
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ name: "packed-install-fixture", private: true }, null, 2) + "\n",
      "utf8"
    );

    await execFileAsync(
      "npm",
      ["install", "--ignore-scripts", "--no-package-lock", packed.tarballPath],
      {
        cwd: targetRoot,
        env: {
          ...process.env,
          npm_config_cache: npmCacheDir
        }
      }
    );

    const installedPackageRoot = path.join(targetRoot, "node_modules", "devgod");
    const installedPackageJson = JSON.parse(
      await readFile(path.join(installedPackageRoot, "package.json"), "utf8")
    ) as {
      exports?: { ".": { types?: string; default?: string } };
      bin?: { devgod?: string };
    };

    assert.equal(installedPackageJson.exports?.["."].types, publishedTypesEntrypoint);
    assert.equal(installedPackageJson.exports?.["."].default, "./dist/index.js");
    assert.equal(installedPackageJson.bin?.devgod, "./dist/bin/devgod.js");
    await assert.doesNotReject(
      execFileAsync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "--eval",
          [
            'import assert from "node:assert/strict";',
            'import * as devgod from "devgod";',
            'assert.equal(typeof devgod.DevgodCoreService, "function");',
            'assert.equal(typeof devgod.MemoryStore, "function");',
            'assert.equal(typeof devgod.createReviewPrincipalAdapter, "function");',
            'await assert.rejects(',
            '  devgod.executeStatusCommandFromArgs([], { cwd: process.cwd(), env: {} }),',
            '  /status-like commands require --run-id <run-id> or --run-id latest with workspace\\/project/',
            ');',
            'await assert.rejects(',
            '  devgod.executeReportCommandFromArgs(["--run-id", "run-1", "--stale-after-hours", "bad"], { cwd: process.cwd(), env: {} }),',
            '  /Invalid --stale-after-hours value: bad/',
            ');',
            'await assert.rejects(',
            '  devgod.executeSeedModernizationProofCommandFromArgs([], { cwd: process.cwd(), env: {} }),',
            '  /seed-modernization-proof requires DEVGOD_WORKSPACE_SLUG and DEVGOD_PROJECT_SLUG or explicit flags/',
            ');'
          ].join("\n")
        ],
        { cwd: targetRoot }
      )
    );

    const devgodBin = path.join(
      targetRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "devgod.cmd" : "devgod"
    );
    const { stdout: binStdout } = await execFileAsync(devgodBin, ["help"], { cwd: targetRoot });
    assert.match(binStdout, /Usage:/);
  } finally {
    await packed.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("packed install blocks deep imports of private admin internals via package exports", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-packed-private-imports-"));
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-packed-private-imports-cache-"));
  const packed = await createPackedTarball(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  });

  try {
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ name: "packed-private-imports-fixture", private: true }, null, 2) + "\n",
      "utf8"
    );

    await execFileAsync(
      "npm",
      ["install", "--ignore-scripts", "--no-package-lock", packed.tarballPath],
      {
        cwd: targetRoot,
        env: {
          ...process.env,
          npm_config_cache: npmCacheDir
        }
      }
    );

    await assert.doesNotReject(
      execFileAsync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          [
            'import assert from "node:assert/strict";',
            'const privateSpecifiers = [',
            '  "devgod/dist/types/admin.js",',
            '  "devgod/src/admin.ts",',
            '  "devgod/dist/types/admin/db.js"',
            '];',
            "",
            "for (const specifier of privateSpecifiers) {",
            "  await assert.rejects(",
            "    import(specifier),",
            "    (error) => {",
            '      assert.equal(error?.code, "ERR_PACKAGE_PATH_NOT_EXPORTED", `${specifier} should be blocked by package exports`);',
            '      assert.match(String(error?.message ?? ""), /Package subpath/);',
            '      assert.match(String(error?.message ?? ""), /"exports"/);',
            "      return true;",
            "    }",
            "  );",
            "}"
          ].join("\n")
        ],
        { cwd: targetRoot }
      )
    );
  } finally {
    await packed.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("packed tarball compiles for a standard NodeNext TypeScript consumer", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-packed-types-consumer-"));
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-packed-types-consumer-cache-"));
  const packed = await createPackedTarball(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  });

  try {
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ name: "packed-types-consumer-fixture", private: true, type: "module" }, null, 2) + "\n",
      "utf8"
    );

    await execFileAsync("npm", ["install", "--ignore-scripts", "--no-package-lock", packed.tarballPath], {
      cwd: targetRoot,
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir
      }
    });
    await execFileAsync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-package-lock",
        "--save-dev",
        path.join(sourceRoot, "node_modules", "typescript"),
        path.join(sourceRoot, "node_modules", "@types", "node")
      ],
      {
        cwd: targetRoot,
        env: {
          ...process.env,
          npm_config_cache: npmCacheDir
        }
      }
    );

    const consumerTsconfigText = JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          types: ["node"],
          verbatimModuleSyntax: true,
          exactOptionalPropertyTypes: true
        },
        include: ["index.ts"]
      },
      null,
      2
    ) + "\n";

    assert.doesNotMatch(consumerTsconfigText, /"allowImportingTsExtensions"/);
    assert.doesNotMatch(consumerTsconfigText, /"skipLibCheck"/);

    await writeFile(path.join(targetRoot, "tsconfig.json"), consumerTsconfigText, "utf8");
    await writeFile(
      path.join(targetRoot, "index.ts"),
      [
        'import { MemoryStore, executeStatusCommandFromArgs } from "devgod";',
        "",
        "const store = new MemoryStore();",
        'const statusPromise = executeStatusCommandFromArgs(["--run-id", "latest"], {',
        "  cwd: process.cwd(),",
        "  env: process.env",
        "});",
        "",
        "void store;",
        "void statusPromise;"
      ].join("\n") + "\n",
      "utf8"
    );

    const tscEntrypoint = path.join(
      targetRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsc.cmd" : "tsc"
    );
    await assert.doesNotReject(execFileAsync(tscEntrypoint, ["--project", "tsconfig.json"], { cwd: targetRoot }));
  } finally {
    await packed.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("public devgod bin routes install and admin commands without private path knowledge", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-public-bin-"));
  const initTargetRoot = await mkdtemp(path.join(tmpdir(), "devgod-packed-init-apply-"));
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-public-bin-cache-"));
  const packed = await createPackedTarball(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  });

  try {
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ name: "public-bin-fixture", private: true }, null, 2) + "\n",
      "utf8"
    );
    await execFileAsync("npm", ["install", "--ignore-scripts", "--no-package-lock", packed.tarballPath], {
      cwd: targetRoot,
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir
      }
    });

    const cliEntrypoint = path.join(
      targetRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "devgod.cmd" : "devgod"
    );
    const { stdout: helpStdout } = await execFileAsync(cliEntrypoint, ["help"], { cwd: targetRoot });
    assert.match(helpStdout, /Stable public CLI entrypoint for the devgod package/);
    assert.match(helpStdout, /Install commands:/);
    assert.match(helpStdout, /Helper commands:/);

    await writeFile(
      path.join(initTargetRoot, "package.json"),
      JSON.stringify({ name: "packed-init-fixture", private: true }, null, 2) + "\n",
      "utf8"
    );
    const { stdout: initStdout } = await execFileAsync(
      cliEntrypoint,
      ["init", "--apply", "--target", initTargetRoot],
      { cwd: targetRoot }
    );
    const initPackageJson = JSON.parse(
      await readFile(path.join(initTargetRoot, "package.json"), "utf8")
    ) as {
      devDependencies?: Record<string, string>;
    };
    const installedAgentsMd = await readFile(path.join(initTargetRoot, "AGENTS.md"), "utf8");
    const installedDotAgentsMd = await readFile(path.join(initTargetRoot, ".agents.md"), "utf8");

    assert.match(initStdout, /devgod installed into /);
    assert.ok(initPackageJson.devDependencies?.devgod);
    assert.match(initPackageJson.devDependencies?.devgod ?? "", /node_modules\/devgod/);
    assert.match(installedAgentsMd, /<!-- BEGIN DEVGOD MANAGED -->/);
    assert.match(installedDotAgentsMd, /<!-- BEGIN DEVGOD KERNEL -->/);
    await assert.doesNotReject(readFile(path.join(initTargetRoot, ".devgod", "install-manifest.json"), "utf8"));

    await assert.rejects(
      execFileAsync(cliEntrypoint, ["init", "--target", targetRoot], { cwd: targetRoot }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stderr = "stderr" in error ? String(error.stderr) : "";
        assert.match(stderr, /init requires exactly one of --apply or --dry-run/);
        return true;
      }
    );

    await assert.rejects(
      execFileAsync(cliEntrypoint, ["seed-modernization-proof", "--workspace-slug", "team", "--project-slug", "devgod"], {
        cwd: targetRoot,
        env: {
          ...process.env
        }
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stderr = "stderr" in error ? String(error.stderr) : "";
        assert.match(
          stderr,
          /DEVGOD_CORE_DATABASE_URL is required|Project team\/devgod is not bootstrapped|seed-modernization-proof requires --task-id or an active runtime task/
        );
        return true;
      }
    );

    await assert.rejects(
      execFileAsync(cliEntrypoint, ["unknown-command"], { cwd: targetRoot }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stderr = "stderr" in error ? String(error.stderr) : "";
        assert.match(stderr, /Unknown devgod command: unknown-command/);
        return true;
      }
    );
  } finally {
    await packed.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
    await rm(initTargetRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("repo-local devgod scripts and helper entrypoints stay callable through package surfaces", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-local-"));
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-setup-local-cache-"));
  const packed = await createPackedTarball(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  });

  try {
    const { stdout: helpStdout } = await execFileAsync("npm", ["run", "devgod", "--", "help"], {
      cwd: sourceRoot
    });
    assert.match(helpStdout, /Implicit workflow controller by default/);
    assert.match(helpStdout, /mcp \| serve-ui/);

    await assert.rejects(
      execFileAsync("npm", ["run", "devgod", "--", "unknown-command"], {
        cwd: sourceRoot
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stderr = "stderr" in error ? String(error.stderr) : "";
        assert.match(stderr, /Unknown devgod command: unknown-command/);
        return true;
      }
    );

    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ name: "setup-local-fixture", private: true }, null, 2) + "\n",
      "utf8"
    );
    await execFileAsync("npm", ["install", "--ignore-scripts", "--no-package-lock", packed.tarballPath], {
      cwd: targetRoot,
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir
      }
    });
    const cliEntrypoint = path.join(
      targetRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "devgod.cmd" : "devgod"
    );
    await assert.rejects(
      execFileAsync(process.execPath, [cliEntrypoint, "setup-local"], {
        cwd: targetRoot
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stderr = "stderr" in error ? String(error.stderr) : "";
        assert.match(stderr, /DEVGOD_POSTGRES_PASSWORD must be set to a non-default local password/);
        return true;
      }
    );

    const packagedSetupScript = await readFile(
      path.join(targetRoot, "node_modules", "devgod", "scripts", "setup-devgod.sh"),
      "utf8"
    );
    const packagedSetupPowerShell = await readFile(
      path.join(targetRoot, "node_modules", "devgod", "scripts", "setup-devgod.ps1"),
      "utf8"
    );

    assert.match(packagedSetupScript, /npm run devgod -- setup-local/);
    assert.doesNotMatch(packagedSetupScript, /load_env_file|setup_docker_runtime|setup_native_runtime/);
    assert.match(packagedSetupPowerShell, /npm run devgod -- setup-local/);
    assert.doesNotMatch(
      packagedSetupPowerShell,
      /Import-DevgodEnvFile|Test-DevgodSafeEnvKey|Wait-DevgodContainerHealth/
    );

    let graphifyOutput = "";
    try {
      const result = await execFileAsync(process.execPath, [cliEntrypoint, "setup-graphify-codex"], {
        cwd: sourceRoot
      });
      graphifyOutput = `${result.stdout}${result.stderr}`;
    } catch (error) {
      assert.ok(error instanceof Error);
      const stdout = "stdout" in error ? String(error.stdout) : "";
      const stderr = "stderr" in error ? String(error.stderr) : "";
      graphifyOutput = `${stdout}${stderr}`;
    }
    assert.match(graphifyOutput, /Devgod Graphify Codex full-mode helper/);
  } finally {
    await packed.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("package verification scripts stay runnable from the published boundary set", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-autopilot-status-"));

  try {
    await mkdir(path.join(targetRoot, ".devgod", "work"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".devgod", "work", "task-queue.json"),
      JSON.stringify(
        {
          project_status: "in_progress",
          current_task_id: "task-001",
          tasks: [
            {
              id: "task-001",
              title: "Example task",
              status: "in_progress",
              class: "prototype_slice",
              depends_on: [],
              acceptance_criteria: ["Example task outcome is explicitly defined."],
              verification: ["bash scripts/check-devgod-workflow.sh --task-id task-001"],
              evidence: [
                "task packet: task-001",
                "verification: bash scripts/check-devgod-workflow.sh --task-id task-001"
              ],
              blocker: null
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const { stdout: autopilotStdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", path.join(sourceRoot, "src/devgod/autopilot-status.ts")],
      { cwd: targetRoot }
    );
    assert.match(autopilotStdout, /Project status: in_progress/);
    assert.match(autopilotStdout, /Current task: task-001 - Example task \[in_progress\]/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }

  const { stdout: cavemanStdout } = await execFileAsync("npm", ["run", "verify:agent-caveman"], {
    cwd: sourceRoot
  });
  assert.match(cavemanStdout, /agent caveman contract verified/);

  const { stdout: vendoredStdout } = await execFileAsync("npm", ["run", "verify:vendored-skills"], {
    cwd: sourceRoot
  });
  assert.match(vendoredStdout, /vendored skills verified/);

  const { stdout: workflowStdout } = await execFileAsync("npm", ["run", "verify:workflow-schema"], {
    cwd: sourceRoot
  });
  assert.match(workflowStdout, /workflow schema verified/);

  const { stdout: workflowCliStdout } = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", path.join(sourceRoot, "src/devgod/workflow-schema-cli.ts"), "list", "quality-gates"],
    { cwd: sourceRoot }
  );
  assert.match(workflowCliStdout, /product_acceptance/);
  assert.match(workflowCliStdout, /coverage_ledger_required/);
});

test("installDevgodIntoProject dry-run reports planned changes without writing", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-dry-run-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    const initialPackageJson = '{ "name": "fixture", "private": true }\n';
    await writeFile(path.join(targetRoot, "package.json"), initialPackageJson, "utf8");

    const summary = await installDevgodIntoProject({
      sourceRoot,
      targetRoot,
      dryRun: true
    });

    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.writesPerformed, false);
    assert.match(summary.nextSteps.join("\n"), /Rerun in apply mode to write changes/);
    assert.match(summary.nextSteps.join("\n"), /devgod:setup:local/);
    assert.match(summary.nextSteps.join("\n"), /optional module/i);
    assert.doesNotMatch(summary.nextSteps.join("\n"), /registers the Graphify MCP server/i);
    assert.ok(summary.created.includes("AGENTS.md"));
    assert.ok(summary.created.includes("scripts/devgod-setup.sh"));
    assert.ok(summary.updated.includes("package.json"));
    assert.equal(summary.backups.length, 0);
    assert.equal(summary.plannedBackups.length, 1);
    assert.match(summary.plannedBackups[0], /\.devgod\/install-backups\/.+\/package\.json/);

    assert.equal(await readFile(path.join(targetRoot, "package.json"), "utf8"), initialPackageJson);
    await assert.rejects(readFile(path.join(targetRoot, "AGENTS.md"), "utf8"));
    await assert.rejects(readFile(path.join(targetRoot, "scripts/devgod-setup.sh"), "utf8"));
    await assert.rejects(readFile(path.join(targetRoot, ".codex/config.toml"), "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject keeps Playwright MCP configs and setup wiring out of the default install", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-playwright-default-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");

    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");
    const installManifest = await readInstalledManifest(targetRoot);
    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    assert.doesNotMatch(codexConfig, /\[mcp_servers\.playwright\]/);
    assert.doesNotMatch(codexConfig, /\[mcp_servers\.playwright_vision\]/);
    assert.ok(!installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.json"));
    assert.ok(!installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.vision.json"));
    assert.equal(packageJson.scripts?.["devgod:setup:playwright"], undefined);
    assert.equal(packageJson.scripts?.["devgod:verify:playwright"], undefined);
    await assert.rejects(readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.json"), "utf8"));
    await assert.rejects(readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.vision.json"), "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject ships Playwright MCP configs and setup wiring when enabled", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-playwright-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");

    await installDevgodIntoProject({ sourceRoot, targetRoot, withPlaywright: true });

    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");
    const installManifest = await readInstalledManifest(targetRoot);
    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const kernelAgents = await readFile(path.join(targetRoot, ".agents.md"), "utf8");
    const playwrightConfig = await readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.json"), "utf8");
    const playwrightVisionConfig = await readFile(
      path.join(targetRoot, ".devgod", "playwright", "mcp.vision.json"),
      "utf8"
    );

    assert.match(codexConfig, /\[mcp_servers\.playwright\]/);
    assert.match(codexConfig, /\[mcp_servers\.playwright_vision\]/);
    assert.equal(
      packageJson.scripts?.["devgod:setup:playwright"],
      "devgod setup-playwright"
    );
    assert.equal(
      packageJson.scripts?.["devgod:verify:playwright"],
      "devgod setup-playwright --verify"
    );
    assert.ok(installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.json"));
    assert.ok(installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.vision.json"));
    assert.match(kernelAgents, /BEGIN DEVGOD KERNEL/);
    assert.match(kernelAgents, /devgod-intake/);
    assert.match(playwrightConfig, /"browserName": "chromium"/);
    assert.match(playwrightVisionConfig, /"vision"/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("install CLI rejects flag-like values passed after --target", async () => {
  assert.throws(
    () => parseCliArgs(["--target", "--dry-run"]),
    /Target path must follow --target and cannot start with '-'/
  );
});

test("legacy direct install CLI invocation cannot mutate", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-cli-legacy-"));

  try {
    const initialPackageJson = '{ "name": "fixture", "private": true }\n';
    await writeFile(path.join(targetRoot, "package.json"), initialPackageJson, "utf8");

    assert.throws(
      () => parseCliArgs(["--target", targetRoot]),
      /Mutating installs require 'init --apply'/
    );

    assert.equal(await readFile(path.join(targetRoot, "package.json"), "utf8"), initialPackageJson);
    await assert.rejects(readFile(path.join(targetRoot, "AGENTS.md"), "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("install CLI init requires an explicit mode before writing", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-cli-init-mode-"));

  try {
    const initialPackageJson = '{ "name": "fixture", "private": true }\n';
    await writeFile(path.join(targetRoot, "package.json"), initialPackageJson, "utf8");

    assert.throws(
      () => parseCliArgs(["init", "--target", targetRoot]),
      /init requires exactly one of --apply or --dry-run/
    );

    assert.equal(await readFile(path.join(targetRoot, "package.json"), "utf8"), initialPackageJson);
    await assert.rejects(readFile(path.join(targetRoot, "AGENTS.md"), "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("parseCliArgs accepts upgrade-reasoning-workflow with explicit mode", () => {
  const parsed = parseCliArgs([
    "upgrade-reasoning-workflow",
    "--target",
    "/tmp/project",
    "--task-id",
    "task-123",
    "--mode",
    "strict"
  ]);

  assert.deepEqual(parsed, {
    command: "upgrade-reasoning-workflow",
    targetArg: "/tmp/project",
    taskId: "task-123",
    mode: "strict",
    force: false
  });
});

test("parseCliArgs accepts positional targets for verify and workflow mutation commands", () => {
  assert.deepEqual(parseCliArgs(["verify", "/tmp/project"]), {
    command: "verify",
    targetArg: "/tmp/project"
  });

  assert.deepEqual(
    parseCliArgs([
      "scaffold-workflow",
      "--task-id",
      "task-123",
      "--force",
      "--force-active",
      "/tmp/project"
    ]),
    {
      command: "scaffold-workflow",
      targetArg: "/tmp/project",
      taskId: "task-123",
      force: true,
      forceActive: true
    }
  );

  assert.deepEqual(
    parseCliArgs([
      "seed-happy-path-fixture",
      "--task-id",
      "fixture-demo",
      "--force",
      "/tmp/project"
    ]),
    {
      command: "seed-happy-path-fixture",
      targetArg: "/tmp/project",
      taskId: "fixture-demo",
      force: true,
      forceActive: false
    }
  );
});

test("parseCliArgs defaults upgrade-reasoning-workflow mode to strict", () => {
  const parsed = parseCliArgs([
    "upgrade-reasoning-workflow",
    "--target",
    "/tmp/project",
    "--task-id",
    "task-123"
  ]);

  assert.deepEqual(parsed, {
    command: "upgrade-reasoning-workflow",
    targetArg: "/tmp/project",
    taskId: "task-123",
    mode: "strict",
    force: false
  });
});

test("parseCliArgs rejects unsupported upgrade-reasoning-workflow modes", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "upgrade-reasoning-workflow",
        "--target",
        "/tmp/project",
        "--task-id",
        "task-123",
        "--mode",
        "legacy"
      ]),
    /mode must be dual or strict/
  );
});

test("parseCliArgs requires a target for upgrade-reasoning-workflow", () => {
  assert.throws(
    () => parseCliArgs(["upgrade-reasoning-workflow", "--task-id", "task-123", "--mode", "dual"]),
    /Usage: node --experimental-strip-types src\/install\/cli\.ts/
  );
});

test("parseCliArgs validates install, verify, and workflow mutation modes", () => {
  assert.throws(
    () => parseCliArgs(["upgrade", "--apply", "--dry-run", "--target", "/tmp/project"]),
    /upgrade requires exactly one of --apply or --dry-run/
  );
  assert.throws(
    () => parseCliArgs(["verify", "--dry-run", "/tmp/project"]),
    /verify does not support --apply, --dry-run, --with-graphify, --with-playwright, or --with-grafana/
  );
  assert.throws(
    () => parseCliArgs(["scaffold-workflow", "--target", "/tmp/project"]),
    /scaffold-workflow requires --task-id <task-id>/
  );
  assert.throws(
    () => parseCliArgs(["scaffold-workflow", "--dry-run", "--target", "/tmp/project", "--task-id", "task-123"]),
    /scaffold-workflow does not support --apply or --dry-run/
  );
  assert.throws(
    () => parseCliArgs(["seed-happy-path-fixture", "--target", "/tmp/project", "--task-id", "fixture bad"]),
    /task_id must match/
  );
  assert.throws(
    () =>
      parseCliArgs(["seed-happy-path-fixture", "--apply", "--target", "/tmp/project", "--task-id", "fixture-demo"]),
    /seed-happy-path-fixture does not support --apply or --dry-run/
  );
  assert.throws(
    () => parseCliArgs(["upgrade-reasoning-workflow", "--target", "/tmp/project", "--task-id", "task-123", "--mode"]),
    /Mode must follow --mode and cannot start with '-'/
  );
  assert.throws(
    () =>
      parseCliArgs([
        "upgrade-reasoning-workflow",
        "--target",
        "/tmp/project",
        "--task-id",
        "task-123",
        "--force-active"
      ]),
    /does not support --apply, --dry-run, or --force-active/
  );
});

test("parseCliArgs accepts upgrade-reasoning-workflow with force and positional target", () => {
  const parsed = parseCliArgs([
    "upgrade-reasoning-workflow",
    "--task-id",
    "task-123",
    "--mode",
    "dual",
    "--force",
    "/tmp/project"
  ]);

  assert.deepEqual(parsed, {
    command: "upgrade-reasoning-workflow",
    targetArg: "/tmp/project",
    taskId: "task-123",
    mode: "dual",
    force: true
  });
});

test("parseCliArgs rejects malformed workflow mutation targets and task ids", () => {
  assert.throws(
    () => parseCliArgs(["scaffold-workflow", "--target", "--task-id", "task-123"]),
    /Target path must follow --target and cannot start with '-'/
  );
  assert.throws(
    () => parseCliArgs(["scaffold-workflow", "--target", "/tmp/project", "--task-id", "--force"]),
    /Task id must follow --task-id and cannot start with '-'/
  );
  assert.throws(
    () => parseCliArgs(["seed-happy-path-fixture", "--target", "/tmp/project", "--task-id", "--force"]),
    /Task id must follow --task-id and cannot start with '-'/
  );
  assert.throws(
    () =>
      parseCliArgs([
        "upgrade-reasoning-workflow",
        "--target",
        "--task-id",
        "task-123",
        "--mode",
        "dual"
      ]),
    /Target path must follow --target and cannot start with '-'/
  );
});

test("parseCliArgs accepts Grafana install opt-in", () => {
  const parsed = parseCliArgs(["init", "--apply", "--with-grafana", "--target", "/tmp/project"]);

  assert.deepEqual(parsed, {
    command: "init",
    dryRun: false,
    targetArg: "/tmp/project",
    withGrafana: true
  });
});

test("parseCliArgs accepts Graphify and Playwright install opt-ins", () => {
  const parsed = parseCliArgs([
    "init",
    "--apply",
    "--with-graphify",
    "--with-playwright",
    "--target",
    "/tmp/project"
  ]);

  assert.deepEqual(parsed, {
    command: "init",
    dryRun: false,
    targetArg: "/tmp/project",
    withGraphify: true,
    withPlaywright: true
  });
});

test("upgradeReasoningWorkflowArtifacts backfills policy, attempts, and verdict into a legacy task packet", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-reasoning-workflow-"));
  const taskId = "task-legacy-upgrade";

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await mkdir(path.join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });

    await writeFile(
      path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
      [
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Reasoning quality",
        "",
        "### Claim",
        "",
        "- legacy reasoning claim",
        "",
        "### Evidence refs",
        "",
        "- `src/core/service.ts`",
        "",
        "### Verification plan",
        "",
        "- `npm test`"
      ].join("\n"),
      "utf8"
    );

    const summary = await upgradeReasoningWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId,
      mode: "dual"
    });

    assert.deepEqual(summary.created, []);
    assert.deepEqual(summary.updated, [`.devgod/work/tasks/task-${taskId}.md`]);

    const taskContent = await readFile(
      path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
      "utf8"
    );
    assert.match(taskContent, /## Reasoning policy/);
    assert.match(taskContent, /`dual`/);
    assert.match(taskContent, /## Reasoning attempts/);
    assert.match(taskContent, /### Attempt records/);
    assert.match(taskContent, /### Verification records/);
    assert.match(taskContent, /### Verdict/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeReasoningWorkflowArtifacts reports a no-op when the requested hardening already exists", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-reasoning-noop-"));
  const taskId = "task-reasoning-noop";

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await mkdir(path.join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });

    await writeFile(
      path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
      [
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Reasoning quality",
        "",
        "### Claim",
        "",
        "- legacy reasoning claim",
        "",
        "### Evidence refs",
        "",
        "- `src/core/service.ts`",
        "",
        "### Verification plan",
        "",
        "- `npm test`"
      ].join("\n"),
      "utf8"
    );

    await upgradeReasoningWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId,
      mode: "strict"
    });

    const hardenedContent = await readFile(
      path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
      "utf8"
    );
    const summary = await upgradeReasoningWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId,
      mode: "strict"
    });

    assert.deepEqual(summary.created, []);
    assert.deepEqual(summary.updated, []);
    assert.match(summary.nextSteps[0] ?? "", /Task already contains reasoning hardening sections/);
    assert.equal(
      await readFile(path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`), "utf8"),
      hardenedContent
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeReasoningWorkflowArtifacts rewrites an already hardened task packet when forced", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-reasoning-force-"));
  const taskId = "task-reasoning-force";

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await mkdir(path.join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });

    await writeFile(
      path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
      [
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Reasoning quality",
        "",
        "### Claim",
        "",
        "- legacy reasoning claim",
        "",
        "### Evidence refs",
        "",
        "- `src/core/service.ts`",
        "",
        "### Verification plan",
        "",
        "- `npm test`"
      ].join("\n"),
      "utf8"
    );

    await upgradeReasoningWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId,
      mode: "strict"
    });

    const summary = await upgradeReasoningWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId,
      mode: "strict",
      force: true
    });

    assert.deepEqual(summary.created, []);
    assert.deepEqual(summary.updated, [`.devgod/work/tasks/task-${taskId}.md`]);
    assert.match(summary.nextSteps[1] ?? "", /keep mode `strict`/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeReasoningWorkflowArtifacts rejects symlinked task artifacts", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-reasoning-symlink-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-reasoning-symlink-outside-"));
  const taskId = "task-reasoning-symlink";
  const outsideTaskPath = path.join(outsideRoot, `task-${taskId}.md`);

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await mkdir(path.join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(outsideTaskPath, "outside\n", "utf8");
    await symlink(outsideTaskPath, path.join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`));

    await assert.rejects(
      upgradeReasoningWorkflowArtifacts({
        sourceRoot,
        targetRoot,
        taskId,
        mode: "strict"
      }),
      new RegExp(
        `refusing to upgrade \\.devgod/work/tasks/task-${taskId}\\.md: managed path is not an in-root regular file`
      )
    );
    assert.equal(await readFile(outsideTaskPath, "utf8"), "outside\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject first apply backs up divergent managed content", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-backup-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const originalPackageJson = JSON.stringify(
    {
      name: "fixture",
      private: true,
      scripts: {
        test: "vitest"
      }
    },
    null,
    2
  ) + "\n";

  try {
    await writeFile(path.join(targetRoot, "package.json"), originalPackageJson, "utf8");

    const summary = await installDevgodIntoProject({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.mode, "apply");
    assert.equal(summary.backups.length, 1);
    assert.match(summary.backups[0], /^\.devgod\/install-backups\/.+\/package\.json$/);

    const backupContent = await readFile(path.join(targetRoot, summary.backups[0]), "utf8");
    assert.equal(backupContent, originalPackageJson);

    const installedPackageJson = JSON.parse(
      await readFile(path.join(targetRoot, "package.json"), "utf8")
    ) as { devDependencies: Record<string, string>; scripts: Record<string, string> };
    assert.equal(installedPackageJson.scripts.test, "vitest");
    assert.ok(installedPackageJson.devDependencies.devgod);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject keeps Graphify scripts and MCP config out of the default install", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-default-graphify-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    const summary = await installDevgodIntoProject({ sourceRoot, targetRoot });
    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");
    const gitignore = await readFile(path.join(targetRoot, ".gitignore"), "utf8");

    assert.equal(packageJson.scripts?.["devgod:setup:graphify"], undefined);
    assert.equal(packageJson.scripts?.["devgod:graphify:build"], undefined);
    assert.equal(packageJson.scripts?.["devgod:graphify:codex-full"], undefined);
    assert.doesNotMatch(codexConfig, /\[mcp_servers\.graphify\]/);
    assert.match(gitignore, /graphify-out\//);
    assert.match(summary.nextSteps.join("\n"), /Optional module: rerun init with --with-graphify/i);
    assert.doesNotMatch(summary.nextSteps.join("\n"), /registers the Graphify MCP server/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject adds Graphify scripts, MCP config, and setup guidance when enabled", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-graphify-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    const summary = await installDevgodIntoProject({ sourceRoot, targetRoot, withGraphify: true });

    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const codexConfig = await readFile(path.join(targetRoot, ".codex/config.toml"), "utf8");
    const gitignore = await readFile(path.join(targetRoot, ".gitignore"), "utf8");

    assert.equal(packageJson.scripts["devgod:graphify:build"], "graphify extract src --out .");
    assert.equal(
      packageJson.scripts["devgod:graphify:codex-full"],
      "devgod setup-graphify-codex"
    );
    assert.equal(packageJson.scripts["devgod:graphify:update"], "graphify extract src --out .");
    assert.equal(
      packageJson.scripts["devgod:graphify:serve"],
      "uv tool run --from graphifyy python -m graphify.serve graphify-out/graph.json"
    );
    assert.match(codexConfig, /approval_policy = "never"/);
    assert.match(codexConfig, /sandbox_mode = "danger-full-access"/);
    assert.match(codexConfig, /\[mcp_servers\.graphify\]/);
    assert.match(codexConfig, /graphify\.serve/);
    assert.match(gitignore, /graphify-out\//);
    assert.match(summary.nextSteps.join("\n"), /devgod:setup:local/);
    assert.match(summary.nextSteps.join("\n"), /Optional module: run npm run devgod:setup:graphify/i);
    assert.doesNotMatch(summary.nextSteps.join("\n"), /registers the Graphify MCP server/i);
    assert.match(summary.nextSteps.join("\n"), /devgod:graphify:codex-full/);
    assert.match(summary.nextSteps.join("\n"), /devgod:setup:local/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("setup-graphify installs Graphify with uv, builds the graph, and normalizes wiki output", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-graphify-install-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const uvLog = path.join(targetRoot, "uv.log");
  const npmLog = path.join(targetRoot, "npm.log");
  const graphifyLog = path.join(targetRoot, "graphify.log");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          private: true,
          scripts: {
            "devgod:graphify:build": "graphify extract src --out .",
            "devgod:graphify:update": "graphify extract src --out ."
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await mkdir(path.join(targetRoot, ".codex"), { recursive: true });
    await writeFile(path.join(targetRoot, ".codex", "config.toml"), graphifyCodexConfigFragment(), "utf8");
    await mkdir(path.join(targetRoot, "src"), { recursive: true });
    await writeFile(path.join(targetRoot, "src", "index.ts"), "export const ready = true;\n", "utf8");

    await writeExecutable(
      path.join(binDir, "graphify"),
      "#!/bin/bash\nset -euo pipefail\nexit 1\n"
    );

    await writeExecutable(
      path.join(binDir, "uv"),
      [
        "#!/bin/bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_UV_LOG_FILE:?missing uv log}"',
        'if [[ "${1:-}" == "--version" ]]; then',
        '  printf "%s\\n" "uv 0.test"',
        "  exit 0",
        "fi",
        'if [[ "${1:-}" == "tool" && "${2:-}" == "install" && "${3:-}" == "graphifyy" ]]; then',
        "  cat > \"${DEVGOD_GRAPHIFY_BIN:?missing graphify bin}\" <<'EOF'",
        "#!/bin/bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_GRAPHIFY_LOG_FILE:?missing graphify log}"',
        'if [[ "${1:-}" == "--version" ]]; then',
        '  printf "%s\\n" "graphify 0.test"',
        "  exit 0",
        "fi",
        'mkdir -p graphify-out/wiki',
        'printf "%s\\n" "# Code Wiki" > graphify-out/wiki/index.md',
        "exit 0",
        "EOF",
        '  chmod +x "${DEVGOD_GRAPHIFY_BIN}"',
        "  exit 0",
        "fi",
        "exit 1"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "npm"),
      [
        "#!/bin/bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_NPM_LOG_FILE:?missing npm log}"',
        "exit 0"
      ].join("\n")
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-graphify.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:/bin:/usr/bin`,
        DEVGOD_UV_LOG_FILE: uvLog,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_GRAPHIFY_LOG_FILE: graphifyLog,
        DEVGOD_GRAPHIFY_BIN: path.join(binDir, "graphify")
      }
    });

    assert.match(await readFile(uvLog, "utf8"), /tool install graphifyy/);
    assert.deepEqual((await readFile(npmLog, "utf8")).trim().split(/\n+/), ["run devgod:graphify:build"]);
    assert.match(await readFile(graphifyLog, "utf8"), /\.\/src --wiki --no-viz/);
    assert.match(await readFile(path.join(targetRoot, "graphify-out", "index.md"), "utf8"), /Code Wiki/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("setup-graphify refreshes an existing graph with update and skips uv install when graphify is already present", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-graphify-update-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const npmLog = path.join(targetRoot, "npm.log");
  const graphifyLog = path.join(targetRoot, "graphify.log");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          private: true,
          scripts: {
            "devgod:graphify:build": "graphify extract src --out .",
            "devgod:graphify:update": "graphify extract src --out ."
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await mkdir(path.join(targetRoot, ".codex"), { recursive: true });
    await writeFile(path.join(targetRoot, ".codex", "config.toml"), graphifyCodexConfigFragment(), "utf8");
    await mkdir(path.join(targetRoot, "src"), { recursive: true });
    await writeFile(path.join(targetRoot, "src", "index.ts"), "export const ready = true;\n", "utf8");
    await writeGraphifyGraph(targetRoot);

    await writeExecutable(
      path.join(binDir, "graphify"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_GRAPHIFY_LOG_FILE:?missing graphify log}"',
        'if [[ "${1:-}" == "--version" ]]; then',
        '  printf "%s\\n" "graphify 0.test"',
        "  exit 0",
        "fi",
        'if [[ "${1:-}" == "./src" && "${2:-}" == "--wiki" && "${3:-}" == "--no-viz" ]]; then',
        '  mkdir -p graphify-out',
        '  printf "%s\\n" "# Existing Wiki" > graphify-out/index.md',
        "  exit 0",
        "fi",
        "exit 0"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "npm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_NPM_LOG_FILE:?missing npm log}"',
        "exit 0"
      ].join("\n")
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-graphify.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_GRAPHIFY_LOG_FILE: graphifyLog
      }
    });

    assert.deepEqual((await readFile(npmLog, "utf8")).trim().split(/\n+/), ["run devgod:graphify:update"]);
    assert.match(await readFile(graphifyLog, "utf8"), /--version/);
    assert.match(await readFile(graphifyLog, "utf8"), /\.\/src --wiki --no-viz/);
    assert.match(await readFile(path.join(targetRoot, "graphify-out", "index.md"), "utf8"), /Existing Wiki/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject opt-in Grafana setup adds MCP config, env guidance, and helper script", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-grafana-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    const summary = await installDevgodIntoProject({
      sourceRoot,
      targetRoot,
      withGrafana: true
    });

    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const codexConfig = await readFile(path.join(targetRoot, ".codex/config.toml"), "utf8");
    const envExample = await readFile(path.join(targetRoot, ".env.devgod.example"), "utf8");

    assert.equal(
      packageJson.scripts["devgod:grafana:mcp"],
      "devgod grafana-mcp"
    );
    assert.match(codexConfig, /\[mcp_servers\.grafana\]/);
    assert.match(codexConfig, /node_modules\/devgod\/dist\/bin\/devgod\.js/);
    assert.match(codexConfig, /grafana-mcp/);
    assert.doesNotMatch(codexConfig, /node_modules\/devgod\/src\/grafana\/mcp-server\.ts/);
    assert.match(envExample, /DEVGOD_GRAFANA_URL=/);
    assert.match(envExample, /DEVGOD_GRAFANA_LOGS_DATASOURCE_UID=/);
    assert.match(summary.nextSteps.join("\n"), /DEVGOD_GRAFANA_URL/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject auto-detects configured Grafana env and adds MCP wiring", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-grafana-detected-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await writeFile(
      path.join(targetRoot, ".env.devgod"),
      [
        "DEVGOD_GRAFANA_URL=https://grafana.example.com",
        "DEVGOD_GRAFANA_TOKEN=env-file-token",
        ""
      ].join("\n"),
      "utf8"
    );

    await installDevgodIntoProject({
      sourceRoot,
      targetRoot
    });

    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const codexConfig = await readFile(path.join(targetRoot, ".codex/config.toml"), "utf8");

    assert.equal(
      packageJson.scripts["devgod:grafana:mcp"],
      "devgod grafana-mcp"
    );
    assert.match(codexConfig, /\[mcp_servers\.grafana\]/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("install CLI init --apply is explicit, replay-safe, and does not run docker", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-cli-apply-"));
  const binDir = path.join(targetRoot, "bin");
  const dockerSentinel = path.join(targetRoot, "docker-called");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    await writeExecutable(
      path.join(binDir, "docker"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `: > "${dockerSentinel}"`,
        "exit 0"
      ].join("\n")
    );

    await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "init", "--apply", "--target", targetRoot],
      {
        cwd: sourceRoot,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      }
    );

    const installedPackageJson = JSON.parse(
      await readFile(path.join(targetRoot, "package.json"), "utf8")
    ) as { devDependencies: Record<string, string> };
    assert.ok(installedPackageJson.devDependencies.devgod);

    const reviewIdentityAdapter = await readFile(
      path.join(targetRoot, "devgod/review-identity-adapter.ts"),
      "utf8"
    );
    assert.match(reviewIdentityAdapter, /Implement devgod\/review-identity-adapter\.ts/);

    await assert.rejects(readFile(path.join(targetRoot, ".env"), "utf8"));
    await assert.rejects(readFile(dockerSentinel, "utf8"));

    await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "init", "--apply", "--target", targetRoot],
      {
        cwd: sourceRoot,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      }
    );

    const manifestContent = await readFile(
      path.join(targetRoot, ".devgod", "install-manifest.json"),
      "utf8"
    );
    assert.match(manifestContent, /"target": "AGENTS\.md"/);
    await assert.rejects(readFile(dockerSentinel, "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("install CLI init --apply forwards the Grafana opt-in", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-cli-grafana-"));

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");

    await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "init", "--apply", "--with-grafana", "--target", targetRoot],
      { cwd: sourceRoot }
    );

    const installedPackageJson = JSON.parse(
      await readFile(path.join(targetRoot, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");

    assert.equal(installedPackageJson.scripts?.["devgod:grafana:mcp"], "devgod grafana-mcp");
    assert.match(codexConfig, /\[mcp_servers\.grafana\]/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("install CLI init --apply forwards the Graphify and Playwright opt-ins", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-cli-graphify-playwright-"));

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");

    await execFileAsync(
      "node",
      [
        "--experimental-strip-types",
        "src/install/cli.ts",
        "init",
        "--apply",
        "--with-graphify",
        "--with-playwright",
        "--target",
        targetRoot
      ],
      { cwd: sourceRoot }
    );

    const installedPackageJson = JSON.parse(
      await readFile(path.join(targetRoot, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");

    assert.equal(installedPackageJson.scripts?.["devgod:setup:graphify"], "devgod setup-graphify");
    assert.equal(installedPackageJson.scripts?.["devgod:setup:playwright"], "devgod setup-playwright");
    assert.match(codexConfig, /\[mcp_servers\.graphify\]/);
    assert.match(codexConfig, /\[mcp_servers\.playwright\]/);
    assert.match(codexConfig, /\[mcp_servers\.playwright_vision\]/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("install CLI upgrade --apply forwards the Grafana opt-in", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-cli-grafana-"));

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "upgrade", "--apply", "--with-grafana", "--target", targetRoot],
      { cwd: sourceRoot }
    );

    const installedPackageJson = JSON.parse(
      await readFile(path.join(targetRoot, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");

    assert.equal(installedPackageJson.scripts?.["devgod:grafana:mcp"], "devgod grafana-mcp");
    assert.match(codexConfig, /\[mcp_servers\.grafana\]/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall reports Graphify as optional drift without failing core verification", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-graphify-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
    assert.deepEqual(summary.policyDrift, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
    const optionalModuleDrift = summary.optionalModuleDrift.join(" ");
    assert.match(optionalModuleDrift, /graphify/i);
    assert.match(optionalModuleDrift, /--with-graphify/i);
    assert.doesNotMatch(optionalModuleDrift, /npm run devgod:setup:graphify/i);
    assert.doesNotMatch(optionalModuleDrift, /npm run devgod:graphify:(build|codex-full|update)/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall does not suggest repo-local Graphify scripts for user-scope-only Graphify config", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-graphify-user-scope-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const originalHome = process.env.HOME;
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "devgod-verify-home-"));

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await mkdir(path.join(homeDirectory, ".codex"), { recursive: true });
    await writeFile(
      path.join(homeDirectory, ".codex", "config.toml"),
      graphifyCodexConfigFragment(),
      "utf8"
    );

    process.env.HOME = homeDirectory;

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    const optionalModuleDrift = summary.optionalModuleDrift.join(" ");
    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
    assert.deepEqual(summary.policyDrift, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
    assert.match(optionalModuleDrift, /graphify/i);
    assert.match(optionalModuleDrift, /--with-graphify/i);
    assert.match(optionalModuleDrift, /user-level/i);
    assert.doesNotMatch(optionalModuleDrift, /npm run devgod:setup:graphify/i);
    assert.doesNotMatch(optionalModuleDrift, /npm run devgod:graphify:(build|codex-full|update)/i);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await rm(homeDirectory, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall passes when no optional modules are configured", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-no-optionals-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
    assert.deepEqual(summary.policyDrift, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
    assert.match(summary.optionalModuleDrift.join(" "), /graphify optional module is not configured/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall auto-detects the Grafana install option", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-grafana-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot, withGrafana: true });
    await writeGraphifyGraph(targetRoot);

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject preserves the default Graphify-managed install", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-core-only-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const replay = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    assert.equal(replay.conflicts.length, 0);
    assert.deepEqual(replay.created.sort(), [
      ".devgod/runtime/backup-manifest.json",
      ".devgod/runtime/migration-report.json",
      ".devgod/runtime/registration-intent.json"
    ]);
    assert.equal(replay.updated.length, 0);
    assert.equal(replay.writesPerformed, true);

    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");
    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const installManifest = await readInstalledManifest(targetRoot);

    assert.doesNotMatch(codexConfig, /\[mcp_servers\.playwright\]/);
    assert.doesNotMatch(codexConfig, /\[mcp_servers\.playwright_vision\]/);
    assert.equal(packageJson.scripts?.["devgod:setup:playwright"], undefined);
    assert.equal(packageJson.scripts?.["devgod:verify:playwright"], undefined);
    assert.ok(!installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.json"));
    assert.ok(!installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.vision.json"));
    await assert.rejects(readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.json"), "utf8"));
    await assert.rejects(readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.vision.json"), "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject preserves detected Playwright surface on replay", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-playwright-replay-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot, withPlaywright: true });

    const replay = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    const codexConfig = await readFile(path.join(targetRoot, ".codex", "config.toml"), "utf8");
    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const installManifest = await readInstalledManifest(targetRoot);

    assert.equal(replay.conflicts.length, 0);
    assert.match(codexConfig, /\[mcp_servers\.playwright\]/);
    assert.match(codexConfig, /\[mcp_servers\.playwright_vision\]/);
    assert.equal(packageJson.scripts?.["devgod:setup:playwright"], "devgod setup-playwright");
    assert.equal(packageJson.scripts?.["devgod:verify:playwright"], "devgod setup-playwright --verify");
    assert.ok(installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.json"));
    assert.ok(installManifest.files.some((entry) => entry.target === ".devgod/playwright/mcp.vision.json"));
    assert.match(await readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.json"), "utf8"), /chromium/);
    assert.match(
      await readFile(path.join(targetRoot, ".devgod", "playwright", "mcp.vision.json"), "utf8"),
      /vision/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject dry-run reports managed drift without writing", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-dry-run-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const driftedContent = "#!/usr/bin/env bash\necho drifted-managed-file\n";
  const unmanagedFile = path.join(targetRoot, "notes.txt");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(path.join(targetRoot, driftFixtureTarget), driftedContent, "utf8");
    await writeFile(unmanagedFile, "leave me alone\n", "utf8");

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot,
      dryRun: true
    });

    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.writesPerformed, false);
    assert.ok(summary.updated.includes(driftFixtureTarget));
    assert.equal(summary.backups.length, 0);
    assert.equal(summary.plannedBackups.length, 1);
    assert.match(
      summary.plannedBackups[0],
      /^\.devgod\/install-backups\/.+\/scripts\/check-devgod-workflow\.sh$/
    );
    assert.equal(await readFile(path.join(targetRoot, driftFixtureTarget), "utf8"), driftedContent);
    assert.equal(await readFile(unmanagedFile, "utf8"), "leave me alone\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject apply restores managed drift and backs it up", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-apply-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const driftedContent = "#!/usr/bin/env bash\necho drifted-managed-file\n";
  const unmanagedFile = path.join(targetRoot, "notes.txt");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(path.join(targetRoot, driftFixtureTarget), driftedContent, "utf8");
    await writeFile(unmanagedFile, "leave me alone\n", "utf8");

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.mode, "apply");
    assert.ok(summary.updated.includes(driftFixtureTarget));
    assert.equal(summary.backups.length, 1);
    assert.match(summary.backups[0], /^\.devgod\/install-backups\/.+\/scripts\/check-devgod-workflow\.sh$/);

    const backupContent = await readFile(path.join(targetRoot, summary.backups[0]), "utf8");
    assert.equal(backupContent, driftedContent);
    assert.equal(
      await readFile(path.join(targetRoot, driftFixtureTarget), "utf8"),
      await readFile(path.join(sourceRoot, driftFixtureTarget), "utf8")
    );
    assert.equal(await readFile(unmanagedFile, "utf8"), "leave me alone\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject replay apply is a no-op after drift is reconciled", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-replay-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(path.join(targetRoot, driftFixtureTarget), "#!/usr/bin/env bash\necho drifted-managed-file\n", "utf8");

    await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    const replay = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    assert.equal(replay.mode, "apply");
    assert.equal(replay.created.length, 0);
    assert.equal(replay.updated.length, 0);
    assert.equal(replay.backups.length, 0);
    assert.equal(replay.plannedBackups.length, 0);
    assert.equal(replay.writesPerformed, false);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject apply preserves unrelated local config and surrounding manager text", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-preserve-local-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const packageJsonPath = path.join(targetRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    packageJson.scripts = {
      ...(packageJson.scripts ?? {}),
      "local:keep": "echo keep-me"
    };
    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      "left-pad": "1.3.0"
    };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

    const codexConfigPath = path.join(targetRoot, ".codex", "config.toml");
    const codexConfig = await readFile(codexConfigPath, "utf8");
    await writeFile(
      codexConfigPath,
      `${codexConfig.trimEnd()}\n\n# user-owned table comment\n[user_owned]\nkeep = "yes"\n`,
      "utf8"
    );

    const agentsPath = path.join(targetRoot, "AGENTS.md");
    const agentsMd = await readFile(agentsPath, "utf8");
    await writeFile(
      agentsPath,
      `# User-owned preface\n\n${agentsMd.trimEnd()}\n\n## User-owned suffix\nKeep this text.\n`,
      "utf8"
    );

    const dotAgentsPath = path.join(targetRoot, ".agents.md");
    const dotAgentsMd = await readFile(dotAgentsPath, "utf8");
    await writeFile(
      dotAgentsPath,
      `# User-owned kernel note\n\n${dotAgentsMd.trimEnd()}\n\n## User-owned kernel suffix\nKeep this too.\n`,
      "utf8"
    );

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    const upgradedPackageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const upgradedCodexConfig = await readFile(codexConfigPath, "utf8");
    const upgradedAgentsMd = await readFile(agentsPath, "utf8");
    const upgradedDotAgentsMd = await readFile(dotAgentsPath, "utf8");

    assert.equal(summary.conflicts.length, 0);
    assert.equal(upgradedPackageJson.scripts?.["local:keep"], "echo keep-me");
    assert.equal(upgradedPackageJson.dependencies?.["left-pad"], "1.3.0");
    assert.match(upgradedCodexConfig, /# user-owned table comment/);
    assert.match(upgradedCodexConfig, /\[user_owned\]/);
    assert.match(upgradedCodexConfig, /keep = "yes"/);
    assert.match(upgradedAgentsMd, /# User-owned preface/);
    assert.match(upgradedAgentsMd, /## User-owned suffix/);
    assert.match(upgradedDotAgentsMd, /# User-owned kernel note/);
    assert.match(upgradedDotAgentsMd, /## User-owned kernel suffix/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject Codex config updates preserve unrelated user-owned TOML semantically", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-codex-merge-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const codexConfigPath = path.join(targetRoot, ".codex", "config.toml");
    await writeFile(
      codexConfigPath,
      [
        "# user-owned heading comment",
        'approval_policy = "on-request"',
        'sandbox_mode = "workspace-write"',
        'project_doc_fallback_filenames = ["TEAM.md"]',
        "",
        "[features]",
        "multi_agent = true",
        "",
        "# keep this table semantically",
        "[mcp_servers.custom]",
        'command = "node"',
        'args = ["custom-server.js"]',
        "",
        "[user_owned]",
        'keep = "yes"',
        ""
      ].join("\n"),
      "utf8"
    );

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot,
      withGraphify: true
    });

    const upgradedCodexConfig = await readFile(codexConfigPath, "utf8");
    const parsed = parseToml(upgradedCodexConfig) as {
      approval_policy?: string;
      sandbox_mode?: string;
      project_doc_fallback_filenames?: string[];
      mcp_servers?: Record<string, { command?: string; args?: string[] }>;
      user_owned?: { keep?: string };
    };

    assert.equal(summary.conflicts.length, 0);
    assert.equal(parsed.approval_policy, "never");
    assert.equal(parsed.sandbox_mode, "danger-full-access");
    assert.deepEqual(parsed.project_doc_fallback_filenames, [".agents.md", "AGENTS.md", "TEAM.md"]);
    assert.equal(parsed.mcp_servers?.custom?.command, "node");
    assert.deepEqual(parsed.mcp_servers?.custom?.args, ["custom-server.js"]);
    assert.equal(parsed.user_owned?.keep, "yes");
    assert.ok("graphify" in (parsed.mcp_servers ?? {}));
    assert.doesNotMatch(upgradedCodexConfig, /# user-owned heading comment/);
    assert.doesNotMatch(upgradedCodexConfig, /# keep this table semantically/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall passes when managed files match the install manifest", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-pass-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall reports missing managed files", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-missing-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeGraphifyGraph(targetRoot);
    await rm(path.join(targetRoot, driftFixtureTarget));

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.missing.includes(driftFixtureTarget));
    assert.deepEqual(summary.policyDrift, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall reports modified managed files", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-modified-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeGraphifyGraph(targetRoot);
    await writeFile(path.join(targetRoot, driftFixtureTarget), "#!/usr/bin/env bash\necho drifted-managed-file\n", "utf8");

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.modified.includes(driftFixtureTarget));
    assert.deepEqual(summary.policyDrift, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall reports caveman policy drift for shipped agent artifacts", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-policy-drift-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeGraphifyGraph(targetRoot);
    const backendAgentPath = path.join(targetRoot, ".codex", "agents", "devgod-build-resolver.toml");
    const backendAgent = await readFile(backendAgentPath, "utf8");
    await writeFile(
      backendAgentPath,
      backendAgent.replace(
        "- no prose exception: this role does not talk directly to the user\n",
        ""
      ),
      "utf8"
    );

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.modified.includes(".codex/agents/devgod-build-resolver.toml"));
    assert.match(summary.policyDrift[0] ?? "", /devgod-build-resolver\.toml: missing caveman markers/);
    assert.deepEqual(summary.prerequisiteDrift, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verify CLI succeeds for legacy installs without an install manifest", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-cli-legacy-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"));

    const { stdout } = await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "verify", "--target", targetRoot],
      { cwd: sourceRoot }
    );
    assert.match(stdout, /compatibility plan: legacy install without \.devgod\/install-manifest\.json/);
    assert.match(stdout, /verify used a backfilled inventory from current repo state/);
    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });
    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
    assert.deepEqual(summary.policyDrift, []);
    assert.deepEqual(summary.prerequisiteDrift, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("legacy compatibility backfill reports legacy-only managed leftovers", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-legacy-leftover-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const legacyLeftoverTarget = "scripts/setup-devgod.sh";

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"));
    await mkdir(path.join(targetRoot, "scripts"), { recursive: true });
    await writeFile(
      path.join(targetRoot, legacyLeftoverTarget),
      "#!/usr/bin/env bash\necho legacy managed leftover\n",
      "utf8"
    );

    const verifySummary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });
    assert.equal(verifySummary.ok, false);
    assert.deepEqual(verifySummary.orphans, [legacyLeftoverTarget]);

    const upgradeSummary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot,
      dryRun: true
    });
    assert.deepEqual(upgradeSummary.orphans, [legacyLeftoverTarget]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgrade CLI surfaces the legacy install compatibility backfill plan", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-cli-legacy-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"));

    const { stdout } = await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "upgrade", "--apply", "--target", targetRoot],
      { cwd: sourceRoot }
    );

    assert.match(stdout, /compatibility plan: legacy install without \.devgod\/install-manifest\.json/);
    assert.match(stdout, /upgrade backfilled the manifest and runtime migration plan/);
    await assert.doesNotReject(readFile(path.join(targetRoot, ".devgod", "install-manifest.json"), "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall rejects malformed install manifest variants", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-bad-manifest-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = path.join(targetRoot, ".devgod", "install-manifest.json");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const scenarios = [
      {
        label: "invalid JSON",
        content: "{bad-json\n",
        error: /Install manifest at \.devgod\/install-manifest\.json is not valid JSON/
      },
      {
        label: "invalid shape",
        content: "null\n",
        error: /Install manifest at \.devgod\/install-manifest\.json has an invalid shape/
      },
      {
        label: "unsupported version",
        content: `${JSON.stringify({ version: 2, files: [] }, null, 2)}\n`,
        error: /Install manifest at \.devgod\/install-manifest\.json has unsupported version 2/
      },
      {
        label: "missing files list",
        content: `${JSON.stringify({ version: 1 }, null, 2)}\n`,
        error: /Install manifest at \.devgod\/install-manifest\.json is missing its files list/
      },
      {
        label: "invalid file record",
        content: `${JSON.stringify({ version: 1, files: [null] }, null, 2)}\n`,
        error: /Install manifest at \.devgod\/install-manifest\.json has an invalid file record/
      },
      {
        label: "invalid file record fields",
        content: `${JSON.stringify(
          {
            version: 1,
            files: [{ target: driftFixtureTarget, strategy: "replace", contentHash: 123 }]
          },
          null,
          2
        )}\n`,
        error: /Install manifest at \.devgod\/install-manifest\.json has an invalid file record/
      },
      {
        label: "unsupported strategy",
        content: `${JSON.stringify(
          {
            version: 1,
            files: [{ target: driftFixtureTarget, strategy: "seed", contentHash: hashContent("stale") }]
          },
          null,
          2
        )}\n`,
        error: /Install manifest at \.devgod\/install-manifest\.json has an unsupported strategy/
      }
    ] as const;

    for (const scenario of scenarios) {
      await writeFile(manifestPath, scenario.content, "utf8");
      await assert.rejects(
        verifyDevgodInstall({ sourceRoot, targetRoot }),
        scenario.error,
        scenario.label
      );
    }
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall rejects install manifest symlinks outside the target root", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-manifest-symlink-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-manifest-symlink-outside-"));
  const outsideManifestPath = path.join(outsideRoot, "install-manifest.json");
  const manifestPath = path.join(targetRoot, ".devgod", "install-manifest.json");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(outsideManifestPath, '{ "version": 1, "files": [] }\n', "utf8");
    await rm(manifestPath, { force: true });
    await symlink(outsideManifestPath, manifestPath);

    await assert.rejects(
      verifyDevgodInstall({ sourceRoot, targetRoot }),
      /Install manifest at \.devgod\/install-manifest\.json is not an in-root regular file/
    );
    assert.equal(await readFile(outsideManifestPath, "utf8"), '{ "version": 1, "files": [] }\n');
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("verify CLI reports missing, orphaned, policy, and optional module drift", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-cli-drift-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const orphanTarget = "scripts/legacy-managed.sh";

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot, withGraphify: true });
    await writeGraphifyGraph(targetRoot);
    await writeFile(path.join(targetRoot, "graphify-out", "graph.json"), "{not-json\n", "utf8");
    await rm(path.join(targetRoot, driftFixtureTarget));

    const backendAgentPath = path.join(targetRoot, ".codex", "agents", "devgod-build-resolver.toml");
    const backendAgent = await readFile(backendAgentPath, "utf8");
    await writeFile(
      backendAgentPath,
      backendAgent.replace(
        "- no prose exception: this role does not talk directly to the user\n",
        ""
      ),
      "utf8"
    );

    await writeFile(path.join(targetRoot, orphanTarget), "#!/usr/bin/env bash\necho orphan\n", "utf8");
    const manifestPath = path.join(targetRoot, ".devgod", "install-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      files: Array<{ contentHash: string; strategy: "merge" | "replace"; target: string }>;
      version: number;
    };
    manifest.files.push({
      target: orphanTarget,
      strategy: "replace",
      contentHash: hashContent("#!/usr/bin/env bash\necho orphan\n")
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await assert.rejects(
      execFileAsync(
        "node",
        ["--experimental-strip-types", "src/install/cli.ts", "verify", "--target", targetRoot],
        { cwd: sourceRoot }
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const stdout = "stdout" in error ? String(error.stdout) : "";
        assert.match(stdout, /status: drifted/);
        assert.match(stdout, /Missing:/);
        assert.match(stdout, /- scripts\/check-devgod-workflow\.sh/);
        assert.match(stdout, /Modified:/);
        assert.match(stdout, /- \.codex\/agents\/devgod-build-resolver\.toml/);
        assert.match(stdout, /Orphans:/);
        assert.match(stdout, /- scripts\/legacy-managed\.sh/);
        assert.match(stdout, /Policy drift:/);
        assert.match(stdout, /missing caveman markers/);
        assert.match(stdout, /optional module drift: 1/);
        assert.match(stdout, /Optional module drift:/);
        assert.match(stdout, /graphify.*invalid/i);
        return true;
      }
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject legacy installs backfill the manifest and count manifest-only writes", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-legacy-backfill-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"));

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.mode, "apply");
    assert.deepEqual(summary.created.sort(), [
      ".devgod/runtime/backup-manifest.json",
      ".devgod/runtime/migration-report.json",
      ".devgod/runtime/registration-intent.json"
    ]);
    assert.equal(summary.updated.length, 0);
    assert.equal(summary.backups.length, 0);
    assert.equal(summary.writesPerformed, true);

    const manifest = JSON.parse(
      await readFile(path.join(targetRoot, ".devgod", "install-manifest.json"), "utf8")
    ) as { files: Array<{ target: string }> };
    assert.ok(manifest.files.some((entry) => entry.target === driftFixtureTarget));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject writes runtime migration artifacts for legacy installs", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-runtime-artifacts-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"));

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.mode, "apply");
    assert.equal(summary.runtimeRegistration, ".devgod/runtime/registration-intent.json");
    assert.equal(summary.runtimeBackupManifest, ".devgod/runtime/backup-manifest.json");
    assert.equal(summary.runtimeMigrationReport, ".devgod/runtime/migration-report.json");

    const registration = JSON.parse(
      await readFile(path.join(targetRoot, summary.runtimeRegistration ?? ""), "utf8")
    ) as {
      repoPath: string;
      runtimeProfile: string;
    };
    assert.equal(registration.repoPath, targetRoot);
    assert.equal(registration.runtimeProfile, "local-docker");

    const backupManifest = JSON.parse(
      await readFile(path.join(targetRoot, summary.runtimeBackupManifest ?? ""), "utf8")
    ) as {
      files: Array<{ target: string }>;
    };
    assert.ok(backupManifest.files.some((entry) => entry.target === "AGENTS.md"));

    const migrationReport = JSON.parse(
      await readFile(path.join(targetRoot, summary.runtimeMigrationReport ?? ""), "utf8")
    ) as {
      status: string;
      verification: {
        commands: string[];
      };
    };
    assert.equal(migrationReport.status, "planned");
    assert.deepEqual(migrationReport.verification.commands, [
      "npm run devgod:doctor",
      "npm run devgod:verify:setup"
    ]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject derives runtime migration artifacts from target repo env", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-runtime-env-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(
      path.join(targetRoot, ".env.devgod"),
      [
        "DEVGOD_RUNTIME_DATA_ROOT=./runtime-state",
        ""
      ].join("\n"),
      "utf8"
    );
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"));

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });
    const registration = JSON.parse(
      await readFile(path.join(targetRoot, summary.runtimeRegistration ?? ""), "utf8")
    ) as {
      dataRoot: string;
    };

    assert.equal(registration.dataRoot, path.join(targetRoot, "runtime-state"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject refuses to follow runtime artifact symlinks outside the target root", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-runtime-symlink-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-runtime-symlink-outside-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await rm(path.join(targetRoot, ".devgod"), { recursive: true, force: true });
    await mkdir(path.join(targetRoot, ".devgod"), { recursive: true });
    await symlink(path.join(outsideRoot, "runtime"), path.join(targetRoot, ".devgod", "runtime"));
    await rm(path.join(targetRoot, ".devgod", "install-manifest.json"), { force: true });

    await assert.rejects(
      upgradeDevgodInProject({
        sourceRoot,
        targetRoot
      }),
      /Runtime artifact at \.devgod\/runtime\/registration-intent\.json is not an in-root regular file/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject reports orphaned manifest-managed files", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-orphans-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const orphanTarget = "scripts/legacy-managed.sh";

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(path.join(targetRoot, orphanTarget), "#!/usr/bin/env bash\necho orphan\n", "utf8");

    const manifestPath = path.join(targetRoot, ".devgod", "install-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      files: Array<{ contentHash: string; strategy: "merge" | "replace"; target: string }>;
      version: number;
    };
    manifest.files.push({
      target: orphanTarget,
      strategy: "replace",
      contentHash: hashContent("#!/usr/bin/env bash\necho orphan\n")
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot,
      dryRun: true
    });

    assert.deepEqual(summary.orphans, [orphanTarget]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject reports conflicts when the manifest baseline diverges from target and desired content", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-conflict-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(path.join(targetRoot, driftFixtureTarget), "#!/usr/bin/env bash\necho local-drift\n", "utf8");

    const manifestPath = path.join(targetRoot, ".devgod", "install-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      files: Array<{ contentHash: string; strategy: "merge" | "replace"; target: string }>;
      version: number;
    };
    const record = manifest.files.find((entry) => entry.target === driftFixtureTarget);
    assert.ok(record);
    record.contentHash = hashContent("#!/usr/bin/env bash\necho stale-baseline\n");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot,
      dryRun: true
    });

    assert.deepEqual(summary.conflicts, [driftFixtureTarget]);
    assert.equal(summary.updated.length, 0);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verifyDevgodInstall treats managed symlinks as drift and does not read through them", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-symlink-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "devgod-outside-"));
  const outsideFile = path.join(outsideRoot, "outside-check-devgod-workflow.sh");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeGraphifyGraph(targetRoot);
    await writeFile(outsideFile, "#!/usr/bin/env bash\necho outside\n", "utf8");
    await rm(path.join(targetRoot, driftFixtureTarget));
    await symlink(outsideFile, path.join(targetRoot, driftFixtureTarget));

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.modified.includes(driftFixtureTarget));
    assert.deepEqual(summary.prerequisiteDrift, []);
    assert.equal(await readFile(outsideFile, "utf8"), "#!/usr/bin/env bash\necho outside\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject refuses to follow managed symlinks outside the target root", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-symlink-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-symlink-outside-"));
  const outsideFile = path.join(outsideRoot, "outside-check-devgod-workflow.sh");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeFile(outsideFile, "#!/usr/bin/env bash\necho outside\n", "utf8");
    await rm(path.join(targetRoot, driftFixtureTarget));
    await symlink(outsideFile, path.join(targetRoot, driftFixtureTarget));

    const summary = await upgradeDevgodInProject({
      sourceRoot,
      targetRoot
    });

    assert.deepEqual(summary.conflicts, [driftFixtureTarget]);
    assert.equal(summary.updated.length, 0);
    assert.equal(summary.writesPerformed, false);
    assert.equal(await readFile(outsideFile, "utf8"), "#!/usr/bin/env bash\necho outside\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("installDevgodIntoProject seeds overlay scaffolding and install manifest but not live work or reviewed memory", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-test-"));
  await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await installDevgodIntoProject({ sourceRoot, targetRoot });

  const agentsMd = await readFile(path.join(targetRoot, "AGENTS.md"), "utf8");
  assert.match(agentsMd, /## Department Workflow/);
  assert.match(agentsMd, /<!-- devgod-workflow-contract:start -->/);
  assert.match(agentsMd, /<!-- devgod-workflow-contract:end -->/);
  assert.match(agentsMd, /workflow=devgod/);
  assert.match(agentsMd, /workflow_runtime=postgres/);
  assert.match(agentsMd, /local_live_check=bash scripts\/check-devgod-workflow-live\.sh \[--task-id <task-id>\]/);
  assert.doesNotMatch(agentsMd, /\.devgod\/ACTIVE/);
  assert.match(agentsMd, /`reviewer`, `security_reviewer`, and `qa_engineer` gates/);
  assert.match(agentsMd, /workflow_check=npm run devgod -- workflow-proof --run-id latest --task-id <task-id>/);
  assert.match(agentsMd, /workflow-proof --run-id latest --task-id/);
  assert.doesNotMatch(agentsMd, /workflow_check=devgod workflow-proof --run-id latest --task-id <task-id>/);
  assert.doesNotMatch(agentsMd, /node_modules\/devgod\/src\/admin\/devgod\.ts/);
  assert.match(agentsMd, /explicit workflow artifact refs/);
  assert.match(agentsMd, /review_exports=runtime_optional/);

  const memoryReadme = await readFile(path.join(targetRoot, ".devgod/memory/README.md"), "utf8");
  assert.match(memoryReadme, /devgod memory/i);

  const installManifest = await readInstalledManifest(targetRoot);
  const installManifestTargets = new Set(installManifest.files.map((entry) => entry.target));

  for (const expectedTarget of [
    "scripts/check-devgod-happy-path.sh",
    "scripts/check-devgod-workflow.sh",
    ".codex/hooks.json",
    ".githooks/commit-msg",
    ".githooks/pre-commit",
    ".devgod/rules/review-gate-policy.md",
    ".devgod/rules/review-identity-policy.md",
    ".devgod/templates/workflow-schema.json",
    ".devgod/templates/review-identity-bindings.json",
    ".devgod/templates/review-identity-adapter.fixture.json",
    ".agents/skills/devgod-tdd-workflow/SKILL.md",
    ".codex/agents/devgod-reviewer.toml",
    "plugins/caveman/skills/caveman/SKILL.md",
    "plugins/devgod/hooks/hooks.json",
    "devgod/review-identity-adapter.ts",
    ".devgod/review-identity-bindings.json",
    ".devgod/review-identity-adapter.fixture.json"
  ]) {
    assert.ok(installManifestTargets.has(expectedTarget), `${expectedTarget} should be tracked by the install manifest`);
  }
  assert.ok(!installManifestTargets.has(".devgod/playwright/mcp.json"));
  assert.ok(!installManifestTargets.has(".devgod/playwright/mcp.vision.json"));

  const installedSkills = [
    ".agents/skills/anthropic-mcp-builder/SKILL.md",
    ".agents/skills/anthropic-webapp-testing/SKILL.md",
    ".agents/skills/caveman/SKILL.md",
    ".agents/skills/devgod-accessibility-gate/SKILL.md",
    ".agents/skills/devgod-agent-runtime/SKILL.md",
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-autopilot/SKILL.md",
    ".agents/skills/devgod-compliance-review/SKILL.md",
    ".agents/skills/devgod-context-retrieval/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-design-system/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md",
    ".agents/skills/devgod-eval-engineering/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-frontend-taste/SKILL.md",
    ".agents/skills/devgod-git-operator/SKILL.md",
    ".agents/skills/devgod-graphify/SKILL.md",
    ".agents/skills/devgod-infra-ops/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-performance/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-product-analysis/SKILL.md",
    ".agents/skills/devgod-product-framing/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-repair-loop/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-skill-evals/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md",
    ".agents/skills/devgod-technical-writing/SKILL.md",
    ".agents/skills/devgod-ui-art-direction/SKILL.md",
    ".agents/skills/devgod-ux-research/SKILL.md",
    ".agents/skills/devgod-visual-standards/SKILL.md",
    ".agents/skills/superpowers-finishing-development-branch/SKILL.md",
    ".agents/skills/superpowers-systematic-debugging/SKILL.md",
    ".agents/skills/superpowers-test-driven-development/SKILL.md",
    ".agents/skills/superpowers-using-git-worktrees/SKILL.md",
    ".agents/skills/superpowers-verification-before-completion/SKILL.md",
    ".agents/skills/superpowers-writing-plans/SKILL.md"
  ];

  for (const relativePath of installedSkills) {
    const content = await readFile(path.join(targetRoot, relativePath), "utf8");
    assert.match(content, /^---/m, `${relativePath} should install a skill file`);
  }
  const installedCatalogSkillVerification = await verifyCatalogRepoLocalSkills({ repoRoot: targetRoot });
  assert.equal(installedCatalogSkillVerification.ok, true);
  assert.deepEqual(installedCatalogSkillVerification.missingSkillFiles, []);

  const productStateTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "product-state.md"),
    "utf8"
  );
  assert.match(productStateTemplate, /# Product State/);

  const workflowSchemaTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "workflow-schema.json"),
    "utf8"
  );
  assert.match(workflowSchemaTemplate, /"workflowTemplateReviewRoles"/);
  assert.match(workflowSchemaTemplate, /"playwrightRequirementStates"/);

  const reviewGateTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "review-gate.md"),
    "utf8"
  );
  assert.match(reviewGateTemplate, /Playwright evidence refs/i);
  assert.match(reviewGateTemplate, /desktop\/mobile coverage/i);

  const taskQueueTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "task-queue.json"),
    "utf8"
  );
  assert.match(taskQueueTemplate, /"project_status": "not_started"/);

  const reviewIdentityBindingsTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "review-identity-bindings.json"),
    "utf8"
  );
  assert.match(reviewIdentityBindingsTemplate, /replace-with-release-manager-id/);

  const reviewIdentityFixtureTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "review-identity-adapter.fixture.json"),
    "utf8"
  );
  assert.match(reviewIdentityFixtureTemplate, /deny unverified principal/);

  const installedWorkflowChecker = await readFile(
    path.join(targetRoot, "scripts/check-devgod-workflow.sh"),
    "utf8"
  );
  assert.match(installedWorkflowChecker, /devgod workflow artifact check passed/);

  const installedHappyPathChecker = await readFile(
    path.join(targetRoot, "scripts/check-devgod-happy-path.sh"),
    "utf8"
  );
  assert.match(installedHappyPathChecker, /synthetic fixture check/);
  assert.match(installedHappyPathChecker, /retrieval advisory smoke \(derived, non-authoritative\)/);

  const installedLiveWorkflowChecker = await readFile(
    path.join(targetRoot, "scripts/check-devgod-workflow-live.sh"),
    "utf8"
  );
  assert.match(installedLiveWorkflowChecker, /scripts\/check-devgod-workflow\.sh/);
  assert.doesNotMatch(installedLiveWorkflowChecker, /node_modules\/devgod\/src\/admin\/devgod\.ts/);

  const installedCodexHooks = await readFile(path.join(targetRoot, ".codex", "hooks.json"), "utf8");
  assert.match(installedCodexHooks, /"SessionStart"/);
  assert.match(installedCodexHooks, /"PostToolUse"/);

  const commitMsgHook = await readFile(path.join(targetRoot, ".githooks", "commit-msg"), "utf8");
  assert.match(commitMsgHook, /check-devgod-commit-msg\.sh/);

  const preCommitHook = await readFile(path.join(targetRoot, ".githooks", "pre-commit"), "utf8");
  assert.match(preCommitHook, /check-devgod-branch-name\.sh/);
  assert.match(preCommitHook, /check-devgod-git-guard\.sh/);

  const installedAgents = [
    ".codex/agents/devgod-build-resolver.toml",
    ".codex/agents/devgod-docs-researcher.toml",
    ".codex/agents/devgod-git-operator.toml",
    ".codex/agents/devgod-reviewer.toml",
    ".codex/agents/devgod-tdd-guide.toml",
    ".codex/agents/devgod-e2e-runner.toml",
    ".codex/agents/devgod-release-readiness.toml"
  ];

  for (const relativePath of installedAgents) {
    const content = await readFile(path.join(targetRoot, relativePath), "utf8");
    assert.match(content, /^name = /m, `${relativePath} should install an agent file`);
  }

  const installedCavemanPlugin = await readFile(
    path.join(targetRoot, "plugins/caveman/.codex-plugin/plugin.json"),
    "utf8"
  );
  assert.match(installedCavemanPlugin, /"name": "caveman"/);

  const installedCavemanPluginSkill = await readFile(
    path.join(targetRoot, "plugins/caveman/skills/caveman/SKILL.md"),
    "utf8"
  );
  assert.match(installedCavemanPluginSkill, /^---/m);

  const retrievalPolicy = await readFile(
    path.join(targetRoot, ".devgod/rules/role-retrieval-policy.md"),
    "utf8"
  );
  assert.match(retrievalPolicy, /Derived retrieval is a hint layer/i);

  const reviewGatePolicy = await readFile(
    path.join(targetRoot, ".devgod/rules/review-gate-policy.md"),
    "utf8"
  );
  assert.match(reviewGatePolicy, /runtime task, review, approval, and council records are canonical truth/i);

  const reviewIdentityPolicy = await readFile(
    path.join(targetRoot, ".devgod/rules/review-identity-policy.md"),
    "utf8"
  );
  assert.match(reviewIdentityPolicy, /authenticated principal binding/i);

  const reviewIdentityBindings = await readFile(
    path.join(targetRoot, ".devgod/review-identity-bindings.json"),
    "utf8"
  );
  assert.match(reviewIdentityBindings, /replace-with-authenticated-user-id/);

  const reviewIdentityFixtures = await readFile(
    path.join(targetRoot, ".devgod/review-identity-adapter.fixture.json"),
    "utf8"
  );
  assert.match(reviewIdentityFixtures, /deny unverified principal/);

  const reviewIdentityAdapter = await readFile(
    path.join(targetRoot, "devgod/review-identity-adapter.ts"),
    "utf8"
  );
  assert.match(reviewIdentityAdapter, /Implement devgod\/review-identity-adapter\.ts/);
  assert.match(reviewIdentityAdapter, /before trusting review actions/);
  assert.match(reviewIdentityAdapter, /from "devgod"/);
  assert.doesNotMatch(reviewIdentityAdapter, /from "devgod\/src\/index\.ts"/);

  const installedPluginHooks = await readFile(
    path.join(targetRoot, "plugins/devgod/hooks/hooks.json"),
    "utf8"
  );
  assert.match(installedPluginHooks, /"PermissionRequest"/);
  assert.match(installedPluginHooks, /\$PLUGIN_ROOT\/scripts\/post-tool-use\.mjs/);

  const targetPackageJson = JSON.parse(
    await readFile(path.join(targetRoot, "package.json"), "utf8")
  ) as { scripts: Record<string, string> };
  assert.equal(
    targetPackageJson.scripts["devgod:upgrade-reasoning-workflow"],
    "devgod upgrade-reasoning-workflow --target ."
  );
  assert.equal(
    targetPackageJson.scripts["devgod:seed-happy-path-fixture"],
    "devgod seed-happy-path-fixture --target ."
  );
  assert.equal(targetPackageJson.scripts["devgod:seed-workflow-proof"], "devgod seed-workflow-proof");
  assert.equal(targetPackageJson.scripts["devgod:seed-modernization-proof"], "devgod seed-modernization-proof");
  assert.equal(targetPackageJson.scripts.devgod, "devgod");
  assert.equal(targetPackageJson.scripts["devgod:status"], "devgod status");
  assert.equal(targetPackageJson.scripts["devgod:coverage"], "devgod coverage --format text");
  assert.equal(targetPackageJson.scripts["devgod:gaps"], "devgod gaps --format text");
  assert.equal(targetPackageJson.scripts["devgod:checkpoint"], "devgod checkpoint --format text");
  assert.equal(targetPackageJson.scripts["devgod:resume"], "devgod resume --format text");
  assert.equal(targetPackageJson.scripts["devgod:supervisor-history"], "devgod supervisor-history --format text");
  assert.equal(targetPackageJson.scripts["devgod:heal"], "devgod doctor --repair");
  assert.equal(targetPackageJson.scripts["devgod:reconcile"], "devgod reconcile-runtime-state --apply --format text");
  assert.equal(targetPackageJson.scripts["devgod:verify:review-identity"], "devgod verify-review-identity");
  assert.equal(targetPackageJson.scripts["devgod:refresh-repo-context"], "devgod refresh-repo-context");
  assert.equal(targetPackageJson.scripts["devgod:repair-task-queue"], "devgod repair-task-queue");
  assert.equal(targetPackageJson.scripts["devgod:autopilot-status"], "devgod autopilot-status");
  assert.equal(targetPackageJson.scripts["devgod:verify:git-guard"], "devgod verify-git-guard");
  assert.equal(targetPackageJson.scripts["devgod:record-review"], "devgod record-review --input .devgod/review-action.json");
  assert.equal(targetPackageJson.scripts["devgod:setup:git-guard"], "devgod setup-git-guard");

  await assert.rejects(
    readFile(path.join(targetRoot, ".devgod/memory/project-profile.md"), "utf8")
  );
  await assert.rejects(
    readFile(path.join(targetRoot, ".devgod/work/briefs/brief-2026-04-25-bitbat-rebuild.md"), "utf8")
  );
});

test("setup scripts treat env files as data and keep repo defaults aligned", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-guard-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const captureFile = path.join(targetRoot, "captured-env.txt");
  const sentinel = path.join(targetRoot, "env-executed");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeHealthcheckNodeStub(binDir);

    const setupScriptPath = path.join(targetRoot, "scripts", "devgod-setup.sh");
    const setupScript = await readFile(setupScriptPath, "utf8");
    const setupPowerShell = await readFile(path.join(targetRoot, "scripts", "devgod-setup.ps1"), "utf8");

    assert.match(setupScript, /npm run devgod -- setup-local/);
    assert.doesNotMatch(setupScript, /load_env_file|setup_docker_runtime|setup_native_runtime/);
    assert.match(setupPowerShell, /npm run devgod -- setup-local/);
    assert.doesNotMatch(
      setupPowerShell,
      /Import-DevgodEnvFile|Test-DevgodSafeEnvKey|Wait-DevgodContainerHealth/
    );

    await writeFile(
      path.join(targetRoot, ".env"),
      [
        "DEVGOD_WORKSPACE_SLUG=team # trailing comment",
        'DEVGOD_PROJECT_NAME="Alpha Team" # trailing comment',
        'DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE="./devgod/review-identity-adapter.ts" # module comment',
        'DEVGOD_POSTGRES_USER=\'quoted user\'',
        'DEVGOD_POSTGRES_PASSWORD="pa\\\"ss # literal"',
        'DEVGOD_POSTGRES_DB="db name/with?reserved#chars"',
        "PATH=/tmp/evil",
        `NODE_OPTIONS=--require ${sentinel}`,
        `BASH_ENV=${sentinel}`,
        `LD_PRELOAD=${sentinel}`,
        `npm_config_cache=${sentinel}`,
        ""
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      path.join(binDir, "docker"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'if [[ "${1:-}" == "version" ]]; then exit 0; fi',
        'if [[ "${1:-}" == "compose" ]]; then exit 0; fi',
        'if [[ "${1:-}" == "inspect" ]]; then printf "healthy"; exit 0; fi',
        'if [[ "${1:-}" == "logs" ]]; then exit 0; fi',
        'exit 0'
      ].join("\n") + "\n",
      "utf8"
    );
    await chmod(path.join(binDir, "docker"), 0o755);

    await writeFile(
      path.join(binDir, "npm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'capture="${DEVGOD_ENV_CAPTURE_FILE:?missing capture file}"',
        'cat > "$capture" <<EOF',
        "PATH=$PATH",
        "NODE_OPTIONS=${NODE_OPTIONS:-}",
        "BASH_ENV=${BASH_ENV:-}",
        "LD_PRELOAD=${LD_PRELOAD:-}",
        "npm_config_cache=${npm_config_cache:-}",
        "DEVGOD_WORKSPACE_SLUG=${DEVGOD_WORKSPACE_SLUG:-}",
        "DEVGOD_PROJECT_NAME=${DEVGOD_PROJECT_NAME:-}",
        "DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE=${DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE:-}",
        "DEVGOD_POSTGRES_USER=${DEVGOD_POSTGRES_USER:-}",
        "DEVGOD_POSTGRES_PASSWORD=${DEVGOD_POSTGRES_PASSWORD:-}",
        "DEVGOD_CORE_DATABASE_URL=${DEVGOD_CORE_DATABASE_URL:-}",
        'EOF',
        "exit 0"
      ].join("\n") + "\n",
      "utf8"
    );
    await chmod(path.join(binDir, "npm"), 0o755);

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-local.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        NODE_OPTIONS: "baseline-node-options",
        BASH_ENV: "baseline-bash-env",
        LD_PRELOAD: "baseline-ld-preload",
        npm_config_cache: "baseline-npm-cache",
        DEVGOD_ENV_CAPTURE_FILE: captureFile
      }
    });

    const captured = await readFile(captureFile, "utf8");
    assert.match(captured, /^PATH=.+/m);
    assert.match(captured, /NODE_OPTIONS=baseline-node-options/);
    assert.match(captured, /BASH_ENV=baseline-bash-env/);
    assert.match(captured, /LD_PRELOAD=baseline-ld-preload/);
    assert.match(captured, /npm_config_cache=baseline-npm-cache/);
    assert.match(captured, /DEVGOD_WORKSPACE_SLUG=team/);
    assert.match(captured, /DEVGOD_PROJECT_NAME=Alpha Team/);
    assert.match(captured, /DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE=\.\/devgod\/review-identity-adapter\.ts/);
    assert.match(captured, /DEVGOD_POSTGRES_USER=quoted user/);
    assert.match(captured, /DEVGOD_POSTGRES_PASSWORD=pa"ss # literal/);
    assert.match(
      captured,
      /DEVGOD_CORE_DATABASE_URL=postgres:\/\/quoted%20user:pa%22ss%20%23%20literal@127\.0\.0\.1:5432\/db%20name%2Fwith%3Freserved%23chars/
    );
    await assert.rejects(readFile(sentinel, "utf8"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installed setup script bootstraps a clean workspace with synthetic docker and npm", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-smoke-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const dockerLog = path.join(targetRoot, "docker-log.txt");
  const dockerComposeSentinel = path.join(targetRoot, "docker-compose-called");
  const npmLog = path.join(targetRoot, "npm-log.txt");
  const npmEnvCapture = path.join(targetRoot, "npm-env.txt");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeHealthcheckNodeStub(binDir);

    await writeExecutable(
      path.join(binDir, "docker"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'log_file="${DEVGOD_DOCKER_LOG_FILE:?missing docker log file}"',
        "case \"${1:-}\" in",
        "  version)",
        '    printf "%s\\n" "version" >> "$log_file"',
        "    exit 0",
        "    ;;",
        "  compose)",
        '    printf "%s\\n" "$*" >> "$log_file"',
        '    : > "${DEVGOD_DOCKER_COMPOSE_SENTINEL:?missing compose sentinel}"',
        "    exit 0",
        "    ;;",
        "  inspect)",
        '    printf "%s\\n" "$*" >> "$log_file"',
        '    [[ -f "${DEVGOD_DOCKER_COMPOSE_SENTINEL:?missing compose sentinel}" ]]',
        '    printf "%s" "healthy"',
        "    exit 0",
        "    ;;",
        "  logs)",
        '    printf "%s\\n" "$*" >> "$log_file"',
        "    exit 0",
        "    ;;",
        "  *)",
        '    printf "unexpected docker call: %s\\n" "$*" >&2',
        "    exit 1",
        "    ;;",
        "esac"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "npm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_NPM_LOG_FILE:?missing npm log file}"',
        'capture_file="${DEVGOD_NPM_ENV_CAPTURE_FILE:?missing npm env capture file}"',
        'if [[ ! -f "$capture_file" ]]; then',
        '  cat > "$capture_file" <<EOF',
        "DEVGOD_WORKSPACE_SLUG=${DEVGOD_WORKSPACE_SLUG:-}",
        "DEVGOD_PROJECT_SLUG=${DEVGOD_PROJECT_SLUG:-}",
        "DEVGOD_PROJECT_NAME=${DEVGOD_PROJECT_NAME:-}",
        "DEVGOD_PROJECT_REPO_PATH=${DEVGOD_PROJECT_REPO_PATH:-}",
        "DEVGOD_DOCKER_CONTAINER_NAME=${DEVGOD_DOCKER_CONTAINER_NAME:-}",
        "EOF",
        "fi",
        "case \"${1:-}\" in",
        "  install)",
        "    exit 0",
        "    ;;",
        "  run)",
        "    case \"${2:-}\" in",
        "      devgod:setup:graphify|devgod:setup:playwright|devgod:migrate|devgod:bootstrap|devgod:repair-task-queue|devgod:refresh-repo-context|devgod:verify:setup|devgod:verify:playwright|devgod:refresh-retrieval|devgod:refresh-retrieval:fast)",
        "        exit 0",
        "        ;;",
        "    esac",
        "    ;;",
        "esac",
        'printf "unexpected npm call: %s\\n" "$*" >&2',
        "exit 1"
      ].join("\n")
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-local.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_POSTGRES_PASSWORD: "fixture-local-password",
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_DOCKER_COMPOSE_SENTINEL: dockerComposeSentinel,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_NPM_ENV_CAPTURE_FILE: npmEnvCapture
      }
    });

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "install",
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-repo-context",
      "run devgod:refresh-retrieval:fast",
      "run devgod:verify:setup"
    ]);

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(dockerCalls.slice(0, 3), [
      "version",
      "version",
      "compose up -d devgod-postgres"
    ]);
    assert.match(dockerCalls[3] ?? "", /^inspect -f \{\{\.State\.Health\.Status\}\} devgod-postgres(?:-.+)?$/);

    const npmEnv = await readFile(npmEnvCapture, "utf8");
    assert.match(npmEnv, /DEVGOD_WORKSPACE_SLUG=default/);
    assert.match(npmEnv, /DEVGOD_PROJECT_SLUG=devgod/);
    assert.match(npmEnv, /DEVGOD_PROJECT_NAME=devgod/);
    assert.match(npmEnv, new RegExp(`DEVGOD_PROJECT_REPO_PATH=${targetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(npmEnv, /DEVGOD_DOCKER_CONTAINER_NAME=devgod-postgres(?:-[^\r\n]+)?/);

    const copiedEnvPath = path.join(targetRoot, ".env");
    const copiedEnv = await readFile(copiedEnvPath, "utf8").catch(() => undefined);
    if (copiedEnv) {
      assert.match(copiedEnv, /DEVGOD_PROJECT_REPO_PATH=\/absolute\/path\/to\/repo/);
    }
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installed setup script falls back to native Linux services when docker is unavailable", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-native-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const dockerLog = path.join(targetRoot, "docker-log.txt");
  const systemctlLog = path.join(targetRoot, "systemctl-log.txt");
  const sudoLog = path.join(targetRoot, "sudo-log.txt");
  const psqlLog = path.join(targetRoot, "psql-log.txt");
  const npmLog = path.join(targetRoot, "npm-log.txt");
  const unitDir = path.join(targetRoot, "systemd");

  try {
    await mkdir(binDir, { recursive: true });
    await mkdir(unitDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeHealthcheckNodeStub(binDir);

    await writeExecutable(
      path.join(binDir, "docker"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_DOCKER_LOG_FILE:?missing docker log}"',
        'if [[ "${1:-}" == "version" ]]; then',
        "  exit 1",
        "fi",
        "exit 1"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "systemctl"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_SYSTEMCTL_LOG_FILE:?missing systemctl log}"',
        'case "${1:-}" in',
        "  is-system-running)",
        '    printf "%s\\n" "running"',
        "    exit 0",
        "    ;;",
        "  daemon-reload|enable|start|enable\\ --now)",
        "    exit 0",
        "    ;;",
        "  is-active)",
        "    exit 0",
        "    ;;",
        "esac",
        "exit 0"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "sudo"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_SUDO_LOG_FILE:?missing sudo log}"',
        'if [[ "${1:-}" == "-u" ]]; then',
        "  shift 2",
        "fi",
        'if [[ "${1:-}" == "--non-interactive" ]]; then',
        "  shift",
        "fi",
        'exec "$@"'
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "pg_isready"),
      "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n"
    );

    await writeExecutable(
      path.join(binDir, "psql"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_PSQL_LOG_FILE:?missing psql log}"',
        'if printf "%s" "$*" | grep -Fq "pg_available_extensions"; then',
        '  printf "%s\\n" "1"',
        "fi",
        "exit 0"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "npm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_NPM_LOG_FILE:?missing npm log}"',
        'case "${1:-}" in',
        "  install)",
        "    exit 0",
        "    ;;",
        "  run)",
        '    case "${2:-}" in',
        "      devgod:setup:graphify|devgod:setup:playwright|devgod:migrate|devgod:bootstrap|devgod:repair-task-queue|devgod:refresh-repo-context|devgod:verify:setup|devgod:verify:playwright|devgod:refresh-retrieval|devgod:refresh-retrieval:fast)",
        "        exit 0",
        "        ;;",
        "    esac",
        "    ;;",
        "esac",
        'printf "unexpected npm call: %s\\n" "$*" >&2',
        "exit 1"
      ].join("\n")
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-local.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        HOME: targetRoot,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_POSTGRES_PASSWORD: "fixture-local-password",
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_SYSTEMCTL_LOG_FILE: systemctlLog,
        DEVGOD_SUDO_LOG_FILE: sudoLog,
        DEVGOD_PSQL_LOG_FILE: psqlLog,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_NATIVE_SYSTEMD_UNIT_DIR: unitDir
      }
    });

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(dockerCalls, ["version"]);

    const systemctlCalls = (await readFile(systemctlLog, "utf8")).trim().split(/\n+/);
    assert.match(systemctlCalls.join("\n"), /is-system-running/);
    assert.match(systemctlCalls.join("\n"), /enable --now postgresql/);

    const sudoCalls = await readFile(sudoLog, "utf8");
    assert.match(sudoCalls, /-u postgres psql/);

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "install",
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-repo-context",
      "run devgod:refresh-retrieval:fast",
      "run devgod:verify:setup"
    ]);

  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installed setup script honors managed runtime mode without taking service ownership", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-managed-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const dockerLog = path.join(targetRoot, "docker-log.txt");
  const systemctlLog = path.join(targetRoot, "systemctl-log.txt");
  const npmLog = path.join(targetRoot, "npm-log.txt");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeHealthcheckNodeStub(binDir);

    await writeExecutable(
      path.join(binDir, "docker"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_DOCKER_LOG_FILE:?missing docker log}"',
        "exit 99"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "systemctl"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_SYSTEMCTL_LOG_FILE:?missing systemctl log}"',
        "exit 99"
      ].join("\n")
    );

    await writeExecutable(
      path.join(binDir, "npm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_NPM_LOG_FILE:?missing npm log}"',
        'case "${1:-}" in',
        "  install)",
        "    exit 0",
        "    ;;",
        "  run)",
        '    case "${2:-}" in',
        "      devgod:setup:graphify|devgod:setup:playwright|devgod:migrate|devgod:bootstrap|devgod:repair-task-queue|devgod:refresh-repo-context|devgod:verify:setup|devgod:verify:playwright|devgod:refresh-retrieval|devgod:refresh-retrieval:fast)",
        "        exit 0",
        "        ;;",
        "    esac",
        "    ;;",
        "esac",
        'printf "unexpected npm call: %s\\n" "$*" >&2',
        "exit 1"
      ].join("\n")
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-local.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_RUNTIME_MODE: "managed",
        DEVGOD_POSTGRES_PASSWORD: "fixture-local-password",
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_SYSTEMCTL_LOG_FILE: systemctlLog,
        DEVGOD_NPM_LOG_FILE: npmLog
      }
    });

    await assert.rejects(readFile(dockerLog, "utf8"));
    await assert.rejects(readFile(systemctlLog, "utf8"));
    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "install",
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-repo-context",
      "run devgod:refresh-retrieval:fast",
      "run devgod:verify:setup"
    ]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("setup-local skips optional module scripts by default even when they are present", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-setup-optional-skip-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = path.join(targetRoot, "bin");
  const npmLog = path.join(targetRoot, "npm-log.txt");

  try {
    await mkdir(binDir, { recursive: true });
    await mkdir(path.join(targetRoot, "node_modules"), { recursive: true });
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          private: true,
          scripts: {
            "devgod:setup:graphify": "echo optional graphify",
            "devgod:setup:playwright": "echo optional playwright",
            "devgod:verify:playwright": "echo optional playwright verify",
            "devgod:migrate": "echo migrate",
            "devgod:bootstrap": "echo bootstrap",
            "devgod:refresh-repo-context": "echo refresh repo",
            "devgod:refresh-retrieval:fast": "echo refresh retrieval",
            "devgod:verify:setup": "echo verify setup"
          }
        },
        null,
        2
      ) + "\n"
    );

    await writeExecutable(
      path.join(binDir, "npm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" >> "${DEVGOD_NPM_LOG_FILE:?missing npm log}"',
        "exit 0"
      ].join("\n")
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-local.ts")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_RUNTIME_MODE: "managed",
        DEVGOD_POSTGRES_PASSWORD: "fixture-local-password",
        DEVGOD_NPM_LOG_FILE: npmLog
      }
    });

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-repo-context",
      "run devgod:refresh-retrieval:fast",
      "run devgod:verify:setup"
    ]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow live wrapper forwards the active task id to the workflow checker", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-workflow-live-smoke-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const checkArgsLog = path.join(targetRoot, "workflow-check-args.txt");
  const proofArgsLog = path.join(targetRoot, "workflow-proof-args.txt");
  const stubRoot = await mkdtemp(path.join(tmpdir(), "devgod-workflow-proof-install-stub-"));

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await mkdir(path.join(stubRoot, "dist", "bin"), { recursive: true });
    await writeFile(
      path.join(stubRoot, "package.json"),
      JSON.stringify({ name: "devgod", private: true, type: "module", bin: { devgod: "./dist/bin/devgod.js" } }, null, 2) + "\n",
      "utf8"
    );
    await writeFile(
      path.join(stubRoot, "dist", "bin", "devgod.js"),
      [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync(process.env.DEVGOD_WORKFLOW_PROOF_ARGS_LOG, process.argv.slice(2).join(" "), "utf8");',
        'process.stdout.write(JSON.stringify({ authorityLabel: "runtime_authoritative", taskStatus: "approved" }) + "\\n");'
      ].join("\n"),
      "utf8"
    );
    const packageJsonPath = path.join(targetRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    packageJson.devDependencies = {
      ...(packageJson.devDependencies ?? {}),
      devgod: `file:${stubRoot}`
    };
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");

    await writeExecutable(
      path.join(targetRoot, "scripts", "check-devgod-workflow.sh"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf "%s\\n" "$*" > "${DEVGOD_WORKFLOW_CHECK_ARGS_LOG:?missing workflow args log}"'
      ].join("\n")
    );

    await writeFile(
      path.join(targetRoot, ".devgod", "ACTIVE"),
      "task_id=DG-004-smoke\nworkflow=devgod\nstate=active\n",
      "utf8"
    );

    await execFileAsync("bash", [path.join(targetRoot, "scripts", "check-devgod-workflow-live.sh")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        DEVGOD_WORKFLOW_CHECK_ARGS_LOG: checkArgsLog,
        DEVGOD_WORKFLOW_PROOF_ARGS_LOG: proofArgsLog
      }
    });

    const proofArgs = await readFile(proofArgsLog, "utf8");
    assert.match(proofArgs, /workflow-proof/);
    assert.match(proofArgs, /--task-id DG-004-smoke/);
    assert.match(proofArgs, /--run-id latest/);

    const checkArgs = await readFile(checkArgsLog, "utf8");
    assert.match(checkArgs, /--repo-root \S+devgod-workflow-live-smoke-\S+/);
    assert.match(checkArgs, /--task-id DG-004-smoke/);
    assert.match(checkArgs, /--external-review-authority/);
  } finally {
    await rm(stubRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installed harness verifier imports public devgod APIs instead of private source paths", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const verifier = await readFile(
    path.join(sourceRoot, "scripts/verify-installed-repo-harness.sh"),
    "utf8"
  );

  assert.match(verifier, /from "devgod"/);
  assert.doesNotMatch(verifier, /node_modules\/devgod\/src\/admin\/devgod\.ts/);
  assert.doesNotMatch(verifier, /node_modules\/devgod\/src\/grafana\/mcp-server\.ts/);
  assert.doesNotMatch(verifier, /\.\/node_modules\/devgod\/src\/index\.ts/);
});

test("setup-git-guard configures hooks and blocks managed control-layer commits", async (t) => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-git-guard-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    try {
      await execFileAsync("git", ["--version"]);
    } catch {
      t.skip("git is not available in this environment");
      return;
    }

    await execFileAsync("git", ["init"], { cwd: targetRoot });
    await execFileAsync("git", ["switch", "-c", "feature/test-git-guard"], { cwd: targetRoot });
    await execFileAsync("git", ["config", "user.email", "devgod@example.com"], { cwd: targetRoot });
    await execFileAsync("git", ["config", "user.name", "Devgod Test"], { cwd: targetRoot });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    await installDevgodIntoProject({ sourceRoot, targetRoot });

    const setup = await execFileAsync(
      "node",
      ["--experimental-strip-types", path.join(sourceRoot, "src/install/setup-git-guard.ts")],
      { cwd: targetRoot }
    );
    assert.doesNotMatch(setup.stderr, /Error:/);

    const hooksPath = await execFileAsync("git", ["config", "--local", "--get", "core.hooksPath"], {
      cwd: targetRoot
    });
    assert.equal(hooksPath.stdout.trim(), ".githooks");

    const verify = await execFileAsync(
      "node",
      ["--experimental-strip-types", path.join(sourceRoot, "src/install/verify-git-guard.ts")],
      { cwd: targetRoot }
    );
    assert.doesNotMatch(verify.stderr, /Error:/);

    await execFileAsync("git", ["add", "."], { cwd: targetRoot });
    await execFileAsync("git", ["commit", "-m", "chore: install devgod overlay"], {
      cwd: targetRoot,
      env: {
        ...process.env,
        DEVGOD_ALLOW_MANAGED_COMMITS: "1"
      }
    });

    await mkdir(path.join(targetRoot, "src"), { recursive: true });
    await writeFile(path.join(targetRoot, "src", "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["add", "src/app.ts"], { cwd: targetRoot });
    await execFileAsync("git", ["commit", "-m", "feat: add app stub"], { cwd: targetRoot });

    const agentsMd = await readFile(path.join(targetRoot, "AGENTS.md"), "utf8");
    await writeFile(path.join(targetRoot, "AGENTS.md"), `${agentsMd}\n<!-- guard test -->\n`, "utf8");
    await execFileAsync("git", ["add", "AGENTS.md"], { cwd: targetRoot });
    await assert.rejects(
      execFileAsync("git", ["commit", "-m", "docs: update agents overlay"], { cwd: targetRoot }),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.ok(error !== null);
        assert.match(
          String((error as { stderr?: string }).stderr ?? ""),
          /devgod git guard blocked managed control-layer files/
        );
        return true;
      }
    );
    await execFileAsync("git", ["reset", "HEAD", "AGENTS.md"], { cwd: targetRoot });

    await writeFile(path.join(targetRoot, "notes.md"), "guard check\n", "utf8");
    await execFileAsync("git", ["add", "notes.md"], { cwd: targetRoot });
    await assert.rejects(
      execFileAsync("git", ["commit", "-m", "bad message"], { cwd: targetRoot }),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.ok(error !== null);
        assert.match(
          String((error as { stderr?: string }).stderr ?? ""),
          /devgod commit message guard/
        );
        return true;
      }
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verify-git-guard CLI reports missing hooks and manifest in an unconfigured repo", async (t) => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-git-guard-fail-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    try {
      await execFileAsync("git", ["--version"]);
    } catch {
      t.skip("git is not available in this environment");
      return;
    }

    await execFileAsync("git", ["init"], { cwd: targetRoot });

    await assert.rejects(
      execFileAsync(
        "node",
        ["--experimental-strip-types", path.join(sourceRoot, "src/install/verify-git-guard.ts")],
        { cwd: targetRoot }
      ),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.ok(error !== null);
        const stderr = String((error as { stderr?: string }).stderr ?? "");
        assert.match(stderr, /devgod git guard verification failed/);
        assert.match(stderr, /core\.hooksPath must be \.githooks, found unset/);
        assert.match(stderr, /missing hook file: \.githooks\/pre-commit/);
        assert.match(stderr, /missing guard script: scripts\/check-devgod-git-guard\.sh/);
        assert.match(stderr, /missing \.devgod\/install-manifest\.json/);
        return true;
      }
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verify-git-guard CLI reports git resolution errors outside a repo", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-git-guard-no-repo-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await assert.rejects(
      execFileAsync(
        "node",
        ["--experimental-strip-types", path.join(sourceRoot, "src/install/verify-git-guard.ts")],
        { cwd: targetRoot }
      ),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.ok(error !== null);
        const stderr = String((error as { stderr?: string }).stderr ?? "");
        assert.match(stderr, /git rev-parse|not a git repository/i);
        return true;
      }
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("PowerShell setup script keeps the same env-import safety contract textually", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const setupPowerShell = await readFile(path.join(sourceRoot, "scripts/setup-devgod.ps1"), "utf8");

  assert.match(setupPowerShell, /npm run devgod -- setup-local/);
  assert.doesNotMatch(setupPowerShell, /Import-DevgodEnvFile|Test-DevgodSafeEnvKey|Wait-DevgodContainerHealth/);
});

test("install wrapper uses explicit init --apply CLI invocation", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const installWrapper = await readFile(path.join(sourceRoot, "scripts/install-devgod.sh"), "utf8");
  const installPowerShellWrapper = await readFile(path.join(sourceRoot, "scripts/install-devgod.ps1"), "utf8");

  assert.match(installWrapper, /src\/install\/cli\.ts init --apply --target/);
  assert.doesNotMatch(installWrapper, /src\/install\/cli\.ts --target "\$1"/);
  assert.match(
    installPowerShellWrapper,
    /node --experimental-strip-types src\/install\/cli\.ts init --apply --target \$resolvedTarget/
  );
  assert.doesNotMatch(installPowerShellWrapper, /src\/install\/cli\.ts --target \$resolvedTarget/);
});

test("npm pack dry run includes the new agent, skill, and retrieval policy surface", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = JSON.parse(await runNpmPackJsonDryRun(sourceRoot, {
    intendedTrackedRelativePaths: await listPublishedPackFixturePaths(sourceRoot)
  })) as Array<{
    files: Array<{ path: string }>;
  }>;
  const packedFiles = new Set(output.flatMap((entry) => entry.files.map((file) => file.path)));

  for (const expectedPath of listCanonicalPackageFileEntries().filter((entry) => !entry.endsWith("/"))) {
    assert.ok(packedFiles.has(expectedPath), `${expectedPath} should be present in npm pack --dry-run output`);
  }

  for (const expectedPath of [
    ".githooks/commit-msg",
    ".githooks/pre-commit",
    ".devgod/rules/role-retrieval-policy.md",
    ".devgod/templates/product-state.md",
    ".devgod/templates/task-queue.json",
    ".devgod/templates/review-identity-bindings.json",
    ".devgod/templates/review-identity-adapter.fixture.json",
    "src/devgod/autopilot-status.ts",
    "src/devgod/task-queue.ts",
    "src/sql/migrations/001_initial_schema.sql"
  ]) {
    assert.ok(packedFiles.has(expectedPath), `${expectedPath} should be present in npm pack --dry-run output`);
  }

  for (const excludedPath of [
    ".devgod/work/2026-05-04-project-state-review/BRIEF.md",
    "scripts/check-coverage.ts",
    "tests/install.test.ts"
  ]) {
    assert.ok(!packedFiles.has(excludedPath), `${excludedPath} should not be present in npm pack --dry-run output`);
  }
});

test("pack staging excludes arbitrary untracked files and only includes intended tracked fixtures when named", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "devgod-pack-clean-checkout-"));

  try {
    await execFileAsync("git", ["init"], { cwd: sourceRoot });
    await mkdir(path.join(sourceRoot, "src"), { recursive: true });
    await writeFile(
      path.join(sourceRoot, "package.json"),
      JSON.stringify(
        {
          name: "pack-clean-checkout",
          version: "1.0.0",
          type: "module",
          files: ["index.js", "src/public.ts"]
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(path.join(sourceRoot, "index.js"), 'export const tracked = "tracked";\n', "utf8");
    await writeFile(path.join(sourceRoot, "leak.txt"), "should stay out of the staged pack fixture\n", "utf8");
    await writeFile(path.join(sourceRoot, "src", "public.ts"), 'export const planned = "planned";\n', "utf8");
    await execFileAsync("git", ["add", "package.json", "index.js"], { cwd: sourceRoot });

    const output = JSON.parse(await runNpmPackJsonDryRun(sourceRoot)) as Array<{
      files: Array<{ path: string }>;
    }>;
    const packedFiles = new Set(output.flatMap((entry) => entry.files.map((file) => file.path)));

    assert.ok(packedFiles.has("index.js"));
    assert.ok(!packedFiles.has("leak.txt"));
    assert.ok(!packedFiles.has("src/public.ts"));

    const intendedFixtureOutput = JSON.parse(
      await runNpmPackJsonDryRun(sourceRoot, {
        intendedTrackedRelativePaths: ["src/public.ts"]
      })
    ) as Array<{
      files: Array<{ path: string }>;
    }>;
    const intendedFixtureFiles = new Set(
      intendedFixtureOutput.flatMap((entry) => entry.files.map((file) => file.path))
    );

    assert.ok(intendedFixtureFiles.has("index.js"));
    assert.ok(!intendedFixtureFiles.has("leak.txt"));
    assert.ok(intendedFixtureFiles.has("src/public.ts"));
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
  }
});
