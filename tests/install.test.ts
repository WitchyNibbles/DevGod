import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "@iarna/toml";
import {
  gitNexusCodexConfigFragment,
  mergeAgentsMd,
  mergeCodexConfig,
  mergeGitignore,
  mergePackageJson
} from "../src/install/merge.ts";
import {
  installDevgodIntoProject,
  parseCliArgs,
  upgradeReasoningWorkflowArtifacts,
  upgradeDevgodInProject,
  verifyDevgodInstall
} from "../src/install/cli.ts";
import {
  listCatalogAgentArtifactPaths,
  verifyAgentCatalogArtifacts
} from "../src/devgod/agent-artifact-verifier.ts";

const execFileAsync = promisify(execFile);

async function runNpmPackJsonDryRun(sourceRoot: string): Promise<string> {
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-npm-pack-cache-"));
  const outputPath = path.join(npmCacheDir, "npm-pack-output.json");

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
      { cwd: sourceRoot }
    );

    return await readFile(outputPath, "utf8");
  } finally {
    await rm(npmCacheDir, { recursive: true, force: true });
  }
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  await chmod(filePath, 0o755);
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

test("mergeAgentsMd appends and is idempotent", () => {
  const first = mergeAgentsMd("# Existing Rules\n");
  const second = mergeAgentsMd(first);
  const managedBlock = first.match(/<!-- BEGIN DEVGOD MANAGED -->([\s\S]*?)<!-- END DEVGOD MANAGED -->/)?.[1] ?? "";
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
  assert.match(first, /workflow-proof --run-id latest --task-id/);
  assert.match(first, /## Autonomy Loop/);
  assert.match(first, /update runtime product state/i);
  assert.match(first, /update runtime task queue/i);
  assert.match(first, /a completed phase is not a completed product/i);
  assert.match(first, /clarify ambiguous intent before planning/i);
  assert.match(first, /do not wait for the user to say continue/i);
  assert.match(first, /runtime-backed devgod commands/i);
  assert.doesNotMatch(first, /scrum_master/);
  assert.doesNotMatch(first, /test_director/);
  assert.doesNotMatch(first, /devgod:codex/);
  assert.match(first, /implicitly invoked on every prompt/i);
  assert.match(first, /default workflow controller even when other tools are available/i);
  assert.ok(managedWordCount < 450, `expected slimmer managed AGENTS block, got ${managedWordCount} words`);
  assert.equal(first, second);
});

test("mergeCodexConfig preserves existing values and adds missing devgod defaults", () => {
  const merged = mergeCodexConfig(
    `model = "custom-model"\n\n[features]\npersonality = false\n`,
    `model = "gpt-5.4"\nmodel_verbosity = "low"\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\nproject_doc_fallback_filenames = [".agents.md", "AGENTS.md"]\nproject_doc_max_bytes = 16384\n\n[features]\nmulti_agent = true\nenable_request_compression = true\nplugin_hooks = true\n\n[agents]\nmax_threads = 8\n`
  );
  const parsed = parseToml(merged) as {
    model?: string;
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
  assert.equal(parsed.model_verbosity, "low");
  assert.equal(parsed.approval_policy, "never");
  assert.equal(parsed.sandbox_mode, "danger-full-access");
  assert.deepEqual(parsed.project_doc_fallback_filenames, [".agents.md", "AGENTS.md"]);
  assert.equal(parsed.project_doc_max_bytes, 16384);
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

test("mergeCodexConfig adds GitNexus MCP settings without overwriting existing project config", () => {
  const merged = mergeCodexConfig(
    'model = "gpt-5.4"\n\n[mcp_servers.playwright]\ncommand = "npx"\nargs = ["playwright-mcp"]\n',
    gitNexusCodexConfigFragment()
  );

  assert.match(merged, /\[mcp_servers\.gitnexus\]/);
  assert.match(merged, /command = "npx"/);
  assert.match(merged, /"--no-install"/);
  assert.match(merged, /"gitnexus"/);
  assert.match(merged, /"mcp"/);
  assert.match(merged, /\[mcp_servers\.playwright\]/);
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

  assert.equal(merged.scripts.test, "vitest");
  assert.equal(
    merged.scripts.devgod,
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts"
  );
  assert.match(merged.scripts["devgod:migrate"], /node_modules\/devgod\/src\/admin\/devgod\.ts migrate/);
  assert.match(merged.scripts["devgod:doctor"], /node_modules\/devgod\/src\/admin\/devgod\.ts doctor/);
  assert.match(merged.scripts["devgod:heal"], /node_modules\/devgod\/src\/admin\/devgod\.ts doctor --repair/);
  assert.match(merged.scripts["devgod:status"], /node_modules\/devgod\/src\/admin\/devgod\.ts status/);
  assert.equal(
    merged.scripts["devgod:coverage"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts coverage --format text"
  );
  assert.equal(
    merged.scripts["devgod:gaps"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts gaps --format text"
  );
  assert.equal(
    merged.scripts["devgod:checkpoint"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts checkpoint --format text"
  );
  assert.equal(
    merged.scripts["devgod:resume"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts resume --format text"
  );
  assert.equal(
    merged.scripts["devgod:seed-workflow-proof"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts seed-workflow-proof"
  );
  assert.equal(
    merged.scripts["devgod:seed-modernization-proof"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts seed-modernization-proof"
  );
  assert.equal(
    merged.scripts["devgod:advance-active-task"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts advance-active-task --format text"
  );
  assert.equal(
    merged.scripts["devgod:reconcile"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts reconcile-runtime-state --apply --format text"
  );
  assert.equal(
    merged.scripts["devgod:sync-runtime-exports"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts sync-runtime-exports --format text"
  );
  assert.equal(
    merged.scripts["devgod:daemon"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts daemon --format text"
  );
  assert.equal(
    merged.scripts["devgod:supervisor"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts supervisor --format text"
  );
  assert.equal(
    merged.scripts["devgod:supervisor-history"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts supervisor-history --format text"
  );
  assert.equal(
    merged.scripts["devgod:loop"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts loop --format text"
  );
  assert.equal(merged.scripts["devgod:check-workflow"], "bash scripts/check-devgod-workflow.sh");
  assert.equal(
    merged.scripts["devgod:report"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts report --format markdown"
  );
  assert.equal(
    merged.scripts["devgod:refresh-retrieval"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts refresh-retrieval"
  );
  assert.equal(
    merged.scripts["devgod:autopilot-status"],
    "node --experimental-strip-types ./node_modules/devgod/src/devgod/autopilot-status.ts"
  );
  assert.equal(
    merged.scripts["devgod:github-dispatch"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts github-dispatch --target ."
  );
  assert.equal(
    merged.scripts["devgod:mcp"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts mcp"
  );
  assert.equal(
    merged.scripts["devgod:ui"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts serve-ui"
  );
  assert.match(
    merged.scripts["devgod:verify:migrations:live"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts verify-live-migrations/
  );
  assert.equal(
    merged.scripts["devgod:scaffold-workflow"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts scaffold-workflow --target ."
  );
  assert.equal(
    merged.scripts["devgod:upgrade-reasoning-workflow"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts upgrade-reasoning-workflow --target ."
  );
  assert.equal(
    merged.scripts["devgod:seed-happy-path-fixture"],
    "node --experimental-strip-types ./node_modules/devgod/src/admin/devgod.ts seed-happy-path-fixture --target ."
  );
  assert.equal(merged.scripts["devgod:check:happy-path"], "bash scripts/check-devgod-happy-path.sh");
  assert.match(
    merged.scripts["devgod:verify:review-identity"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts verify-review-identity/
  );
  assert.equal(
    merged.scripts["devgod:verify:git-guard"],
    "node --experimental-strip-types ./node_modules/devgod/src/install/verify-git-guard.ts"
  );
  assert.match(
    merged.scripts["devgod:record-review"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts record-review --input \.devgod\/review-action\.json/
  );
  assert.equal(
    merged.scripts["devgod:setup:git-guard"],
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-git-guard.ts"
  );
  assert.match(
    merged.scripts["devgod:setup:local"],
    /node_modules\/devgod\/src\/install\/setup-local\.ts/
  );
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
  assert.equal(result.ok, false);
});

test("mergePackageJson adds pinned GitNexus helpers only when requested", () => {
  const merged = JSON.parse(
    mergePackageJson(
      JSON.stringify({
        name: "target-project",
        private: true
      }),
      "../devgod",
      {
        withGitNexus: true,
        gitNexusPackageVersion: "1.6.3"
      }
    )
  ) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(merged.devDependencies.gitnexus, "1.6.3");
  assert.equal(merged.scripts["devgod:gitnexus:analyze"], "gitnexus analyze --skip-agents-md");
  assert.equal(merged.scripts["devgod:gitnexus:status"], "gitnexus status");
});

test("mergeGitignore adds devgod env ignores once", () => {
  const first = mergeGitignore("node_modules/\n");
  const second = mergeGitignore(first);

  assert.match(first, /\.env\.devgod/);
  assert.equal(first, second);
});

test("mergeGitignore adds GitNexus storage ignore only when requested", () => {
  const first = mergeGitignore("node_modules/\n", { withGitNexus: true });
  const second = mergeGitignore(first, { withGitNexus: true });

  assert.match(first, /\.gitnexus\//);
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
  assert.match(ciWorkflow, /qdrant\/qdrant:v1\.13\.4/);
  assert.match(ciWorkflow, /DEVGOD_QDRANT_URL: http:\/\/127\.0\.0\.1:6333/);
  assert.doesNotMatch(ciWorkflow, /contents: write/);
  assert.doesNotMatch(ciWorkflow, /id-token: write/);
});

test("ci workflow routes the release posture through the release overlay gate", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ciWorkflow = await readFile(path.join(sourceRoot, ".github/workflows/ci.yml"), "utf8");

  assert.match(ciWorkflow, /jobs:\n  release-overlay:/);
  assert.match(ciWorkflow, /npm run verify:release-overlay/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  live-migrations:/);
  assert.match(ciWorkflow, /jobs:[\s\S]*\n  required-checks:/);
  assert.doesNotMatch(
    ciWorkflow,
    /jobs:[\s\S]*\n  windows-setup-smoke:[\s\S]*persist-credentials: false/
  );
  assert.doesNotMatch(ciWorkflow, /- run: npm test/);
  assert.doesNotMatch(ciWorkflow, /- run: npm run check:quality/);
  assert.doesNotMatch(ciWorkflow, /- run: npm run check:coverage/);
});

test("README frames devgod as an opt-in overlay with production-oriented package checks", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const readme = await readFile(path.join(sourceRoot, "README.md"), "utf8");

  assert.match(readme, /opt-in overlay/i);
  assert.match(readme, /production-oriented package checks/i);
  assert.doesNotMatch(readme, /production ready/i);
});

test("package.json keeps shipped skills and agent configs explicit", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8")) as {
    description?: string;
    license?: string;
    files: string[];
    private?: boolean;
    scripts: Record<string, string>;
  };

  const expectedSkillFiles = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-autopilot/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-gitnexus/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-repair-loop/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md"
  ];

  const expectedAgentFiles = listCatalogAgentArtifactPaths();

  const shippedSkillFiles = pkg.files.filter((file) => file.startsWith(".agents/skills/")).sort();
  const shippedAgentFiles = pkg.files.filter((file) => file.startsWith(".codex/agents/")).sort();
  const overlayPortableAssets = [
    ".githooks/",
    ".env.example",
    "README.md",
    "docker-compose.yml",
    "docs/global-setup.md",
    "scripts/check-devgod-commit-msg.sh",
    "scripts/check-devgod-git-guard.sh",
    "scripts/check-quality.sh",
    "scripts/check-devgod-happy-path.sh",
    "scripts/check-devgod-workflow-live.sh",
    "scripts/check-devgod-workflow.sh",
    "scripts/install-devgod.ps1",
    "scripts/install-devgod.sh",
    "scripts/setup-devgod.ps1",
    "scripts/setup-devgod.sh",
    "scripts/verify-devgod-workflow-check.sh",
    "scripts/verify-release-overlay.sh",
    "src/admin.ts",
    "src/admin/",
    "src/core/",
    "src/devgod/",
    "src/domain/",
    "src/evals/orchestration-baseline.ts",
    "src/evals/retrieval-memory-baseline.ts",
    "src/index.ts",
    "src/install/cli.ts",
    "src/install/git-guard.ts",
    "src/install/merge.ts",
    "src/install/setup-git-guard.ts",
    "src/install/setup-local.ts",
    "src/install/types.ts",
    "src/install/verify-git-guard.ts",
    "src/mcp/",
    "src/runtime/",
    "src/sql/migrations/",
    "src/store/",
    "src/ui/"
  ];
  const excludedOverlayFiles = [
    ".devgod/install-backups/",
    ".devgod/work/2026-05-04-project-state-review/BRIEF.md",
    "scripts/",
    "scripts/check-coverage.ts",
    "src/"
  ];

  assert.deepEqual(shippedSkillFiles, expectedSkillFiles);
  assert.deepEqual(shippedAgentFiles, expectedAgentFiles);
  assert.ok(pkg.files.includes("docs/devgod-agent-team.md"));

  const catalogVerification = await verifyAgentCatalogArtifacts({ repoRoot: sourceRoot });
  assert.equal(catalogVerification.ok, true);
  assert.deepEqual(catalogVerification.missingArtifacts, []);
  assert.deepEqual(catalogVerification.unexpectedArtifacts, []);
  assert.deepEqual(catalogVerification.metadataMismatches, []);
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "MIT");
  assert.match(pkg.description ?? "", /opt-in overlay/i);
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
  assert.equal(pkg.scripts["verify:release-overlay"], "bash scripts/verify-release-overlay.sh");
  for (const relativePath of overlayPortableAssets) {
    assert.ok(pkg.files.includes(relativePath), `${relativePath} should be shipped for the opt-in overlay`);
  }
  for (const relativePath of excludedOverlayFiles) {
    assert.ok(!pkg.files.includes(relativePath), `${relativePath} should stay out of the overlay package manifest`);
  }
  assert.ok(pkg.files.every((file) => !file.includes("*")));
});

test("package dry run includes the orchestration eval entrypoint exported by src/index.ts", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packResult = JSON.parse(await runNpmPackJsonDryRun(sourceRoot)) as Array<{
    files: Array<{
      path: string;
    }>;
  }>;

  const packedFiles = new Set(packResult[0]?.files.map((entry) => entry.path) ?? []);
  assert.ok(packedFiles.has("src/evals/orchestration-baseline.ts"));
  assert.ok(packedFiles.has("src/index.ts"));
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
    assert.match(summary.nextSteps.join("\n"), /devgod:setup:git-guard/);
    assert.match(summary.nextSteps.join("\n"), /devgod:verify:git-guard/);
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

test("installDevgodIntoProject opt-in GitNexus setup adds local package, MCP config, and safe next steps", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-gitnexus-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    const summary = await installDevgodIntoProject({
      sourceRoot,
      targetRoot,
      withGitNexus: true
    });

    const packageJson = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const codexConfig = await readFile(path.join(targetRoot, ".codex/config.toml"), "utf8");
    const gitignore = await readFile(path.join(targetRoot, ".gitignore"), "utf8");

    assert.equal(packageJson.devDependencies.gitnexus, "1.6.3");
    assert.equal(packageJson.scripts["devgod:gitnexus:analyze"], "gitnexus analyze --skip-agents-md");
    assert.equal(packageJson.scripts["devgod:gitnexus:status"], "gitnexus status");
    assert.match(codexConfig, /approval_policy = "never"/);
    assert.match(codexConfig, /sandbox_mode = "danger-full-access"/);
    assert.match(codexConfig, /\[mcp_servers\.gitnexus\]/);
    assert.match(codexConfig, /"--no-install"/);
    assert.match(gitignore, /\.gitnexus\//);
    assert.match(summary.nextSteps.join("\n"), /devgod:gitnexus:analyze/);
    assert.match(summary.nextSteps.join("\n"), /devgod:setup:git-guard/);
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

test("verifyDevgodInstall auto-detects the GitNexus install option", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-verify-gitnexus-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot, withGitNexus: true });

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("upgradeDevgodInProject preserves the GitNexus install option without repeating the flag", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-upgrade-gitnexus-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot, withGitNexus: true });

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
    await rm(path.join(targetRoot, driftFixtureTarget));

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.missing.includes(driftFixtureTarget));
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
    await writeFile(path.join(targetRoot, driftFixtureTarget), "#!/usr/bin/env bash\necho drifted-managed-file\n", "utf8");

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.modified.includes(driftFixtureTarget));
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

    await execFileAsync(
      "node",
      ["--experimental-strip-types", "src/install/cli.ts", "verify", "--target", targetRoot],
      { cwd: sourceRoot }
    );
    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });
    assert.equal(summary.ok, true);
    assert.deepEqual(summary.missing, []);
    assert.deepEqual(summary.modified, []);
    assert.deepEqual(summary.orphans, []);
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
      qdrantCollection: string;
    };
    assert.equal(registration.repoPath, targetRoot);
    assert.equal(registration.runtimeProfile, "local-docker");
    assert.equal(registration.qdrantCollection, "devgod-memory");

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
        "DEVGOD_QDRANT_URL=http://127.0.0.1:7444",
        "DEVGOD_QDRANT_COLLECTION=custom-memory",
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
      qdrantUrl: string;
      qdrantCollection: string;
    };

    assert.equal(registration.dataRoot, path.join(targetRoot, "runtime-state"));
    assert.equal(registration.qdrantUrl, "http://127.0.0.1:7444/");
    assert.equal(registration.qdrantCollection, "custom-memory");
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
    await writeFile(outsideFile, "#!/usr/bin/env bash\necho outside\n", "utf8");
    await rm(path.join(targetRoot, driftFixtureTarget));
    await symlink(outsideFile, path.join(targetRoot, driftFixtureTarget));

    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });

    assert.equal(summary.ok, false);
    assert.ok(summary.modified.includes(driftFixtureTarget));
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

test("installDevgodIntoProject seeds scaffolding but not live work or reviewed memory", async () => {
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
  assert.match(agentsMd, /`reviewer`, `qa_engineer`, and `security_reviewer` gates/);
  assert.match(agentsMd, /workflow-proof --run-id latest --task-id/);
  assert.match(agentsMd, /explicit workflow artifact refs/);
  assert.match(agentsMd, /review_exports=runtime_optional/);

  const memoryReadme = await readFile(path.join(targetRoot, ".devgod/memory/README.md"), "utf8");
  assert.match(memoryReadme, /devgod memory/i);

  const installedSkills = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-autopilot/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-gitnexus/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-repair-loop/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md"
  ];

  for (const relativePath of installedSkills) {
    const content = await readFile(path.join(targetRoot, relativePath), "utf8");
    assert.match(content, /^---/m, `${relativePath} should install a skill file`);
  }

  const productStateTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "product-state.md"),
    "utf8"
  );
  assert.match(productStateTemplate, /# Product State/);

  const taskQueueTemplate = await readFile(
    path.join(targetRoot, ".devgod", "templates", "task-queue.json"),
    "utf8"
  );
  assert.match(taskQueueTemplate, /"project_status": "not_started"/);

  const installedWorkflowChecker = await readFile(
    path.join(targetRoot, "scripts/check-devgod-workflow.sh"),
    "utf8"
  );
  assert.match(installedWorkflowChecker, /devgod workflow artifact check passed/);

  const installedLiveWorkflowChecker = await readFile(
    path.join(targetRoot, "scripts/check-devgod-workflow-live.sh"),
    "utf8"
  );
  assert.match(installedLiveWorkflowChecker, /scripts\/check-devgod-workflow\.sh/);

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

  const retrievalPolicy = await readFile(
    path.join(targetRoot, ".devgod/rules/role-retrieval-policy.md"),
    "utf8"
  );
  assert.match(retrievalPolicy, /Derived retrieval is a hint layer/i);

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

  const targetPackageJson = JSON.parse(
    await readFile(path.join(targetRoot, "package.json"), "utf8")
  ) as { scripts: Record<string, string> };
  assert.match(
    targetPackageJson.scripts["devgod:upgrade-reasoning-workflow"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts upgrade-reasoning-workflow --target \./
  );
  assert.match(
    targetPackageJson.scripts["devgod:seed-happy-path-fixture"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts seed-happy-path-fixture --target \./
  );
  assert.match(
    targetPackageJson.scripts["devgod:seed-workflow-proof"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts seed-workflow-proof/
  );
  assert.match(
    targetPackageJson.scripts["devgod:seed-modernization-proof"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts seed-modernization-proof/
  );
  assert.match(targetPackageJson.scripts.devgod, /node_modules\/devgod\/src\/admin\/devgod\.ts/);
  assert.match(
    targetPackageJson.scripts["devgod:status"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts status/
  );
  assert.match(
    targetPackageJson.scripts["devgod:coverage"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts coverage --format text/
  );
  assert.match(
    targetPackageJson.scripts["devgod:gaps"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts gaps --format text/
  );
  assert.match(
    targetPackageJson.scripts["devgod:checkpoint"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts checkpoint --format text/
  );
  assert.match(
    targetPackageJson.scripts["devgod:resume"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts resume --format text/
  );
  assert.match(
    targetPackageJson.scripts["devgod:supervisor-history"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts supervisor-history --format text/
  );
  assert.match(
    targetPackageJson.scripts["devgod:heal"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts doctor --repair/
  );
  assert.match(
    targetPackageJson.scripts["devgod:reconcile"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts reconcile-runtime-state --apply --format text/
  );
  assert.match(
    targetPackageJson.scripts["devgod:verify:review-identity"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts verify-review-identity/
  );
  assert.match(
    targetPackageJson.scripts["devgod:autopilot-status"],
    /node_modules\/devgod\/src\/devgod\/autopilot-status\.ts/
  );
  assert.equal(
    targetPackageJson.scripts["devgod:verify:git-guard"],
    "node --experimental-strip-types ./node_modules/devgod/src/install/verify-git-guard.ts"
  );
  assert.match(
    targetPackageJson.scripts["devgod:record-review"],
    /node_modules\/devgod\/src\/admin\/devgod\.ts record-review --input \.devgod\/review-action\.json/
  );
  assert.equal(
    targetPackageJson.scripts["devgod:setup:git-guard"],
    "node --experimental-strip-types ./node_modules/devgod/src/install/setup-git-guard.ts"
  );

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
  const qdrantUrl = "http://127.0.0.1:6333";

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    await installDevgodIntoProject({ sourceRoot, targetRoot });
    await writeHealthcheckNodeStub(binDir);

    const setupScriptPath = path.join(targetRoot, "scripts", "devgod-setup.sh");
    const setupScript = await readFile(setupScriptPath, "utf8");
    const setupPowerShell = await readFile(path.join(targetRoot, "scripts", "devgod-setup.ps1"), "utf8");

    assert.doesNotMatch(setupScript, /\bsource\s+\.\/\.env\.devgod\b/);
    assert.doesNotMatch(setupPowerShell, /Get-Content "\.env\.devgod"/);
    assert.match(setupPowerShell, /Test-DevgodSafeEnvKey/);
    assert.match(setupPowerShell, /Strip-DevgodUnquotedComment/);
    assert.match(setupPowerShell, /Unescape-DevgodDoubleQuotedValue/);
    assert.match(setupPowerShell, /\^DEVGOD_\[A-Z0-9_\]\+\$/);
    assert.match(setupPowerShell, /ToLowerInvariant\(\)/);

    await writeFile(
      path.join(targetRoot, ".env"),
      [
        "DEVGOD_WORKSPACE_SLUG=team # trailing comment",
        'DEVGOD_PROJECT_NAME="Alpha Team" # trailing comment',
        'DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE="./devgod/review-identity-adapter.ts" # module comment',
        'DEVGOD_POSTGRES_USER=\'quoted user\'',
        'DEVGOD_POSTGRES_PASSWORD="pa\\\"ss # literal"',
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
        'EOF',
        "exit 0"
      ].join("\n") + "\n",
      "utf8"
    );
    await chmod(path.join(binDir, "npm"), 0o755);

    await execFileAsync("bash", [setupScriptPath], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_QDRANT_URL: qdrantUrl,
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
  const qdrantUrl = "http://127.0.0.1:7444";

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    const installedExampleEnv = (await readFile(path.join(sourceRoot, ".env.example"), "utf8")).replace(
      "DEVGOD_QDRANT_URL=http://127.0.0.1:6333",
      `DEVGOD_QDRANT_URL=${qdrantUrl}`
    );
    await writeFile(
      path.join(targetRoot, ".env.example"),
      installedExampleEnv,
      "utf8"
    );

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
        "DEVGOD_QDRANT_URL=${DEVGOD_QDRANT_URL:-}",
        "EOF",
        "fi",
        "case \"${1:-}\" in",
        "  install)",
        "    exit 0",
        "    ;;",
        "  run)",
        "    case \"${2:-}\" in",
        "      devgod:migrate|devgod:bootstrap|devgod:verify:setup|devgod:refresh-retrieval)",
        "        exit 0",
        "        ;;",
        "    esac",
        "    ;;",
        "esac",
        'printf "unexpected npm call: %s\\n" "$*" >&2',
        "exit 1"
      ].join("\n")
    );

    await execFileAsync("bash", [path.join(targetRoot, "scripts", "devgod-setup.sh")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_QDRANT_URL: qdrantUrl,
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
      "run devgod:refresh-retrieval",
      "run devgod:verify:setup"
    ]);

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(dockerCalls, [
      "version",
      "version",
      "compose up -d devgod-postgres devgod-qdrant",
      "inspect -f {{.State.Health.Status}} devgod-postgres",
      "inspect -f {{.State.Health.Status}} devgod-qdrant"
    ]);

    const npmEnv = await readFile(npmEnvCapture, "utf8");
    assert.match(npmEnv, /DEVGOD_WORKSPACE_SLUG=default/);
    assert.match(npmEnv, /DEVGOD_PROJECT_SLUG=devgod/);
    assert.match(npmEnv, /DEVGOD_PROJECT_NAME=devgod/);
    assert.match(npmEnv, new RegExp(`DEVGOD_PROJECT_REPO_PATH=${targetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(npmEnv, /DEVGOD_DOCKER_CONTAINER_NAME=devgod-postgres/);
    assert.match(npmEnv, new RegExp(`DEVGOD_QDRANT_URL=${qdrantUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const copiedEnv = await readFile(path.join(targetRoot, ".env"), "utf8");
    assert.match(copiedEnv, /DEVGOD_PROJECT_REPO_PATH=\/absolute\/path\/to\/repo/);
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
  const qdrantUrl = "http://127.0.0.1:7555";

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
      path.join(binDir, "qdrant"),
      "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n"
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
        "      devgod:migrate|devgod:bootstrap|devgod:verify:setup|devgod:refresh-retrieval)",
        "        exit 0",
        "        ;;",
        "    esac",
        "    ;;",
        "esac",
        'printf "unexpected npm call: %s\\n" "$*" >&2',
        "exit 1"
      ].join("\n")
    );

    await execFileAsync("bash", [path.join(targetRoot, "scripts", "devgod-setup.sh")], {
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
        DEVGOD_NATIVE_SYSTEMD_UNIT_DIR: unitDir,
        DEVGOD_QDRANT_URL: qdrantUrl
      }
    });

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(dockerCalls, ["version"]);

    const systemctlCalls = (await readFile(systemctlLog, "utf8")).trim().split(/\n+/);
    assert.match(systemctlCalls.join("\n"), /is-system-running/);
    assert.match(systemctlCalls.join("\n"), /enable --now postgresql/);
    assert.match(systemctlCalls.join("\n"), /daemon-reload/);
    assert.match(systemctlCalls.join("\n"), /enable --now devgod-qdrant-devgod/);

    const sudoCalls = await readFile(sudoLog, "utf8");
    assert.match(sudoCalls, /-u postgres psql/);

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "install",
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-retrieval",
      "run devgod:verify:setup"
    ]);

    const unitFiles = await readdir(unitDir);
    const qdrantUnitFile = unitFiles.find((entry) => entry.startsWith("devgod-qdrant-") && entry.endsWith(".service"));
    assert.ok(qdrantUnitFile, "expected a qdrant systemd unit file");
    const qdrantUnit = await readFile(path.join(unitDir, qdrantUnitFile), "utf8");
    assert.match(qdrantUnit, /ExecStart=.*qdrant/);
    const runtimeProjects = await readdir(path.join(targetRoot, ".local", "share", "devgod"));
    assert.ok(runtimeProjects.length > 0, "expected a native runtime data root");
    const qdrantConfig = await readFile(
      path.join(targetRoot, ".local", "share", "devgod", runtimeProjects[0]!, "qdrant", "config.yaml"),
      "utf8"
    );
    assert.match(qdrantConfig, /http_port: \d+/);
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
  const qdrantUrl = "http://127.0.0.1:7666";

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    const installedExampleEnv = (await readFile(path.join(sourceRoot, ".env.example"), "utf8")).replace(
      "DEVGOD_QDRANT_URL=http://127.0.0.1:6333",
      `DEVGOD_QDRANT_URL=${qdrantUrl}`
    );
    await writeFile(path.join(targetRoot, ".env.example"), installedExampleEnv, "utf8");
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
        "      devgod:migrate|devgod:bootstrap|devgod:verify:setup|devgod:refresh-retrieval)",
        "        exit 0",
        "        ;;",
        "    esac",
        "    ;;",
        "esac",
        'printf "unexpected npm call: %s\\n" "$*" >&2',
        "exit 1"
      ].join("\n")
    );

    await execFileAsync("bash", [path.join(targetRoot, "scripts", "devgod-setup.sh")], {
      cwd: targetRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        DEVGOD_RUNTIME_MODE: "managed",
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_SYSTEMCTL_LOG_FILE: systemctlLog,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_QDRANT_URL: qdrantUrl
      }
    });

    await assert.rejects(readFile(dockerLog, "utf8"));
    await assert.rejects(readFile(systemctlLog, "utf8"));
    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "install",
      "run devgod:migrate",
      "run devgod:bootstrap",
      "run devgod:refresh-retrieval",
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
    await mkdir(path.join(stubRoot, "src", "admin"), { recursive: true });
    await writeFile(
      path.join(stubRoot, "package.json"),
      JSON.stringify({ name: "devgod", private: true, type: "module" }, null, 2) + "\n",
      "utf8"
    );
    await writeFile(
      path.join(stubRoot, "src", "admin", "devgod.ts"),
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

test("PowerShell setup script keeps the same env-import safety contract textually", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const setupPowerShell = await readFile(path.join(sourceRoot, "scripts/setup-devgod.ps1"), "utf8");

  assert.match(setupPowerShell, /Test-DevgodSafeEnvKey/);
  assert.match(setupPowerShell, /Strip-DevgodUnquotedComment/);
  assert.match(setupPowerShell, /Unescape-DevgodDoubleQuotedValue/);
  assert.match(setupPowerShell, /\^DEVGOD_\[A-Z0-9_\]\+\$/);
  assert.match(setupPowerShell, /devgod:setup:git-guard/);
  assert.doesNotMatch(setupPowerShell, /Set-Item -Path "Env:PATH"/);
  assert.doesNotMatch(setupPowerShell, /Get-Content -LiteralPath "\.env"/);
});

test("npm pack dry run includes the new agent, skill, and retrieval policy surface", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = JSON.parse(await runNpmPackJsonDryRun(sourceRoot)) as Array<{
    files: Array<{ path: string }>;
  }>;
  const packedFiles = new Set(output.flatMap((entry) => entry.files.map((file) => file.path)));

  const expectedSkillFiles = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-autopilot/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-gitnexus/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-repair-loop/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md"
  ];

  const expectedAgentFiles = listCatalogAgentArtifactPaths();

  const packedSkillFiles = [...packedFiles].filter((file) => file.startsWith(".agents/skills/")).sort();
  const packedAgentFiles = [...packedFiles].filter((file) => file.startsWith(".codex/agents/")).sort();

  assert.deepEqual(packedSkillFiles, expectedSkillFiles);
  assert.deepEqual(packedAgentFiles, expectedAgentFiles);
  assert.ok(packedFiles.has("docs/devgod-agent-team.md"));

  for (const expectedPath of [
    ".githooks/commit-msg",
    ".githooks/pre-commit",
    ".codex/hooks.json",
    ".devgod/rules/role-retrieval-policy.md",
    ".devgod/templates/product-state.md",
    ".devgod/templates/task-queue.json",
    ".devgod/templates/review-identity-bindings.json",
    ".devgod/templates/review-identity-adapter.fixture.json",
    "scripts/check-devgod-commit-msg.sh",
    "scripts/check-devgod-git-guard.sh",
    "scripts/check-devgod-workflow.sh",
    "scripts/check-devgod-workflow-live.sh",
    "scripts/check-quality.sh",
    "scripts/devgod-session-start.sh",
    "scripts/verify-devgod-workflow-check.sh",
    "scripts/verify-release-overlay.sh",
    "plugins/devgod/.codex-plugin/plugin.json",
    "plugins/devgod/hooks/hooks.json",
    "plugins/devgod/scripts/hook-utils.mjs",
    "plugins/devgod/scripts/hook-policy.mjs",
    "plugins/devgod/scripts/pre-tool-use.mjs",
    "plugins/devgod/scripts/permission-request.mjs",
    "plugins/devgod/scripts/post-tool-use.mjs",
    "plugins/devgod/scripts/session-start.mjs",
    "plugins/devgod/scripts/stop.mjs",
    "plugins/devgod/scripts/user-prompt-submit.mjs",
    "src/admin.ts",
    "src/devgod/autopilot-status.ts",
    "src/devgod/task-queue.ts",
    "src/index.ts",
    "src/install/cli.ts",
    "src/install/git-guard.ts",
    "src/install/setup-git-guard.ts",
    "src/install/setup-local.ts",
    "src/install/verify-git-guard.ts",
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
