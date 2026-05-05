import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { mergeAgentsMd, mergeCodexConfig, mergeGitignore, mergePackageJson } from "../src/install/merge.ts";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  await chmod(filePath, 0o755);
}

test("mergeAgentsMd appends and is idempotent", () => {
  const first = mergeAgentsMd("# Existing Rules\n");
  const second = mergeAgentsMd(first);

  assert.match(first, /BEGIN DEVGOD MANAGED/);
  assert.match(first, /## Department Workflow/);
  assert.match(first, /<!-- devgod-workflow-contract:start -->/);
  assert.match(first, /<!-- devgod-workflow-contract:end -->/);
  assert.match(first, /workflow=devgod/);
  assert.match(first, /review_aliases=reviewer:reviewer;qa_engineer:qa\|qa_engineer;security_reviewer:security\|security_reviewer/);
  assert.match(first, /local_live_check=bash scripts\/check-devgod-workflow-live\.sh \[--task-id <task-id>\]/);
  assert.match(first, /\.devgod\/ACTIVE/);
  assert.match(first, /devgod-intake/);
  assert.match(first, /`solution_architect`/);
  assert.match(first, /`planner`/);
  assert.match(first, /check-devgod-workflow\.sh --task-id/);
  assert.match(first, /`tdd-guide`/);
  assert.match(first, /`e2e-runner`/);
  assert.match(first, /`release-readiness`/);
  assert.doesNotMatch(first, /scrum_master/);
  assert.doesNotMatch(first, /test_director/);
  assert.doesNotMatch(first, /devgod:codex/);
  assert.equal(first, second);
});

test("mergeCodexConfig preserves existing values and adds missing devgod defaults", () => {
  const merged = mergeCodexConfig(
    `model = "custom-model"\n\n[features]\npersonality = false\n`,
    `model = "gpt-5.4"\nproject_doc_fallback_filenames = ["AGENTS.md", ".agents.md"]\n\n[features]\nmulti_agent = true\nenable_request_compression = true\n\n[agents]\nmax_threads = 8\n`
  );

  assert.match(merged, /model = "custom-model"/);
  assert.match(merged, /project_doc_fallback_filenames = \[[^\]]*"AGENTS\.md"/);
  assert.match(merged, /project_doc_fallback_filenames = \[[^\]]*"\.agents\.md"/);
  assert.match(merged, /multi_agent = true/);
  assert.match(merged, /enable_request_compression = true/);
  assert.match(merged, /max_threads = 8/);
});

test("mergeCodexConfig preserves existing comments when no semantic change is needed", () => {
  const existing = `# keep me\nmodel = "gpt-5.4"\n\n[features]\nmulti_agent = true\n`;

  const merged = mergeCodexConfig(
    existing,
    `model = "gpt-5.4"\n\n[features]\nmulti_agent = true\n`
  );

  assert.equal(merged, existing);
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
  assert.match(merged.scripts["devgod:migrate"], /node_modules\/devgod\/src\/admin\.ts migrate/);
  assert.equal(merged.scripts["devgod:check-workflow"], "bash scripts/check-devgod-workflow.sh");
  assert.match(
    merged.scripts["devgod:verify:migrations:live"],
    /node_modules\/devgod\/src\/admin\.ts verify-live-migrations/
  );
  assert.match(
    merged.scripts["devgod:verify:review-identity"],
    /node_modules\/devgod\/src\/admin\.ts verify-review-identity/
  );
  assert.match(
    merged.scripts["devgod:setup:local"],
    /node_modules\/devgod\/src\/install\/setup-local\.ts/
  );
  assert.equal(merged.devDependencies.devgod, "file:../devgod");
});

test("mergeGitignore adds devgod env ignores once", () => {
  const first = mergeGitignore("node_modules/\n");
  const second = mergeGitignore(first);

  assert.match(first, /\.env\.devgod/);
  assert.equal(first, second);
});

test("ci workflow pins external actions and keeps read-only permissions", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ciWorkflow = await readFile(path.join(sourceRoot, ".github/workflows/ci.yml"), "utf8");

  assert.match(ciWorkflow, /uses: actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd/);
  assert.match(ciWorkflow, /uses: actions\/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f/);
  assert.match(ciWorkflow, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(ciWorkflow, /contents: write/);
  assert.doesNotMatch(ciWorkflow, /id-token: write/);
});

test("package.json keeps shipped skills and agent configs explicit", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8")) as {
    files: string[];
  };

  const expectedSkillFiles = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md"
  ];

  const expectedAgentFiles = [
    ".codex/agents/backend-engineer.toml",
    ".codex/agents/build-resolver.toml",
    ".codex/agents/docs-researcher.toml",
    ".codex/agents/e2e-runner.toml",
    ".codex/agents/frontend-designer.toml",
    ".codex/agents/infra-engineer.toml",
    ".codex/agents/memory-curator.toml",
    ".codex/agents/planner.toml",
    ".codex/agents/product-strategist.toml",
    ".codex/agents/qa-engineer.toml",
    ".codex/agents/release-readiness.toml",
    ".codex/agents/reviewer.toml",
    ".codex/agents/security-reviewer.toml",
    ".codex/agents/solution-architect.toml",
    ".codex/agents/tdd-guide.toml"
  ];

  const shippedSkillFiles = pkg.files.filter((file) => file.startsWith(".agents/skills/")).sort();
  const shippedAgentFiles = pkg.files.filter((file) => file.startsWith(".codex/agents/")).sort();

  assert.deepEqual(shippedSkillFiles, expectedSkillFiles);
  assert.deepEqual(shippedAgentFiles, expectedAgentFiles);
  assert.ok(pkg.files.every((file) => !file.includes("*")));
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
  assert.match(agentsMd, /local_live_check=bash scripts\/check-devgod-workflow-live\.sh \[--task-id <task-id>\]/);
  assert.match(agentsMd, /\.devgod\/ACTIVE/);
  assert.match(agentsMd, /`reviewer`, `qa_engineer`, and `security_reviewer` gates/);
  assert.match(agentsMd, /check-devgod-workflow\.sh --task-id/);

  const memoryReadme = await readFile(path.join(targetRoot, ".devgod/memory/README.md"), "utf8");
  assert.match(memoryReadme, /devgod memory/i);

  const installedSkills = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md"
  ];

  for (const relativePath of installedSkills) {
    const content = await readFile(path.join(targetRoot, relativePath), "utf8");
    assert.match(content, /^---/m, `${relativePath} should install a skill file`);
  }

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
    targetPackageJson.scripts["devgod:verify:review-identity"],
    /node_modules\/devgod\/src\/admin\.ts verify-review-identity/
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

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

    await installDevgodIntoProject({ sourceRoot, targetRoot });

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

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await writeFile(
      path.join(targetRoot, ".env.example"),
      await readFile(path.join(sourceRoot, ".env.example"), "utf8"),
      "utf8"
    );

    await installDevgodIntoProject({ sourceRoot, targetRoot });

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
        "      migrate|bootstrap|verify:setup)",
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
        DEVGOD_DOCKER_LOG_FILE: dockerLog,
        DEVGOD_DOCKER_COMPOSE_SENTINEL: dockerComposeSentinel,
        DEVGOD_NPM_LOG_FILE: npmLog,
        DEVGOD_NPM_ENV_CAPTURE_FILE: npmEnvCapture
      }
    });

    const npmCalls = (await readFile(npmLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(npmCalls, [
      "install",
      "run migrate",
      "run bootstrap",
      "run verify:setup"
    ]);

    const dockerCalls = (await readFile(dockerLog, "utf8")).trim().split(/\n+/);
    assert.deepEqual(dockerCalls, [
      "version",
      "compose up -d devgod-postgres",
      "inspect -f {{.State.Health.Status}} devgod-postgres",
      "inspect -f {{.State.Health.Status}} devgod-postgres"
    ]);

    const npmEnv = await readFile(npmEnvCapture, "utf8");
    assert.match(npmEnv, /DEVGOD_WORKSPACE_SLUG=default/);
    assert.match(npmEnv, /DEVGOD_PROJECT_SLUG=devgod/);
    assert.match(npmEnv, /DEVGOD_PROJECT_NAME=devgod/);
    assert.match(npmEnv, new RegExp(`DEVGOD_PROJECT_REPO_PATH=${targetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(npmEnv, /DEVGOD_DOCKER_CONTAINER_NAME=devgod-postgres/);

    const copiedEnv = await readFile(path.join(targetRoot, ".env"), "utf8");
    assert.match(copiedEnv, /DEVGOD_PROJECT_REPO_PATH=\/absolute\/path\/to\/repo/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow live wrapper forwards the active task id to the workflow checker", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-workflow-live-smoke-"));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const checkArgsLog = path.join(targetRoot, "workflow-check-args.txt");

  try {
    await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot, targetRoot });

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
        DEVGOD_WORKFLOW_CHECK_ARGS_LOG: checkArgsLog
      }
    });

    const checkArgs = await readFile(checkArgsLog, "utf8");
    assert.match(checkArgs, /--repo-root \S+devgod-workflow-live-smoke-\S+/);
    assert.match(checkArgs, /--task-id DG-004-smoke/);
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
  assert.doesNotMatch(setupPowerShell, /Set-Item -Path "Env:PATH"/);
  assert.doesNotMatch(setupPowerShell, /Get-Content -LiteralPath "\.env"/);
});

test("npm pack dry run includes the new agent, skill, and retrieval policy surface", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: sourceRoot });
  const output = JSON.parse(stdout) as Array<{
    files: Array<{ path: string }>;
  }>;
  const packedFiles = new Set(output.flatMap((entry) => entry.files.map((file) => file.path)));

  const expectedSkillFiles = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-e2e/SKILL.md",
    ".agents/skills/devgod-execution/SKILL.md",
    ".agents/skills/devgod-intake/SKILL.md",
    ".agents/skills/devgod-memory/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-release-readiness/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md",
    ".agents/skills/devgod-tdd/SKILL.md"
  ];

  const expectedAgentFiles = [
    ".codex/agents/backend-engineer.toml",
    ".codex/agents/build-resolver.toml",
    ".codex/agents/docs-researcher.toml",
    ".codex/agents/e2e-runner.toml",
    ".codex/agents/frontend-designer.toml",
    ".codex/agents/infra-engineer.toml",
    ".codex/agents/memory-curator.toml",
    ".codex/agents/planner.toml",
    ".codex/agents/product-strategist.toml",
    ".codex/agents/qa-engineer.toml",
    ".codex/agents/release-readiness.toml",
    ".codex/agents/reviewer.toml",
    ".codex/agents/security-reviewer.toml",
    ".codex/agents/solution-architect.toml",
    ".codex/agents/tdd-guide.toml"
  ];

  const packedSkillFiles = [...packedFiles].filter((file) => file.startsWith(".agents/skills/")).sort();
  const packedAgentFiles = [...packedFiles].filter((file) => file.startsWith(".codex/agents/")).sort();

  assert.deepEqual(packedSkillFiles, expectedSkillFiles);
  assert.deepEqual(packedAgentFiles, expectedAgentFiles);

  for (const expectedPath of [
    ".devgod/rules/role-retrieval-policy.md",
    ".devgod/templates/review-identity-bindings.json",
    ".devgod/templates/review-identity-adapter.fixture.json",
    "scripts/check-devgod-workflow.sh",
    "scripts/check-devgod-workflow-live.sh",
    "scripts/verify-devgod-workflow-check.sh"
  ]) {
    assert.ok(packedFiles.has(expectedPath), `${expectedPath} should be present in npm pack --dry-run output`);
  }
});
