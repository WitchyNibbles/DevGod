import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { mergeAgentsMd, mergeCodexConfig, mergeGitignore, mergePackageJson } from "../src/install/merge.ts";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);

test("mergeAgentsMd appends and is idempotent", () => {
  const first = mergeAgentsMd("# Existing Rules\n");
  const second = mergeAgentsMd(first);

  assert.match(first, /BEGIN DEVGOD MANAGED/);
  assert.match(first, /## Department Workflow/);
  assert.match(first, /\.devgod\/ACTIVE/);
  assert.match(first, /devgod-intake/);
  assert.match(first, /`solution_architect`/);
  assert.match(first, /`planner`/);
  assert.match(first, /check-devgod-workflow\.sh --task-id/);
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

test("installDevgodIntoProject seeds scaffolding but not live work or reviewed memory", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "devgod-install-test-"));
  await writeFile(path.join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');

  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await installDevgodIntoProject({ sourceRoot, targetRoot });

  const agentsMd = await readFile(path.join(targetRoot, "AGENTS.md"), "utf8");
  assert.match(agentsMd, /## Department Workflow/);
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
    ".agents/skills/devgod-review/SKILL.md",
    ".agents/skills/devgod-setup/SKILL.md"
  ];

  for (const relativePath of installedSkills) {
    const content = await readFile(path.join(targetRoot, relativePath), "utf8");
    assert.match(content, /^---/m, `${relativePath} should install a skill file`);
  }

  const installedWorkflowChecker = await readFile(
    path.join(targetRoot, "scripts/check-devgod-workflow.sh"),
    "utf8"
  );
  assert.match(installedWorkflowChecker, /devgod workflow check passed/);

  const installedAgents = [
    ".codex/agents/devgod-build-resolver.toml",
    ".codex/agents/devgod-docs-researcher.toml",
    ".codex/agents/devgod-reviewer.toml"
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

  await assert.rejects(
    readFile(path.join(targetRoot, ".devgod/memory/project-profile.md"), "utf8")
  );
  await assert.rejects(
    readFile(path.join(targetRoot, ".devgod/work/briefs/brief-2026-04-25-bitbat-rebuild.md"), "utf8")
  );
});

test("npm pack dry run includes the new agent, skill, and retrieval policy surface", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: sourceRoot });
  const output = JSON.parse(stdout) as Array<{
    files: Array<{ path: string }>;
  }>;
  const packedFiles = new Set(output.flatMap((entry) => entry.files.map((file) => file.path)));

  const expectedPaths = [
    ".agents/skills/devgod-architecture/SKILL.md",
    ".agents/skills/devgod-debugging/SKILL.md",
    ".agents/skills/devgod-docs-research/SKILL.md",
    ".agents/skills/devgod-planning/SKILL.md",
    ".agents/skills/devgod-qa-verification/SKILL.md",
    ".agents/skills/devgod-review/SKILL.md",
    ".codex/agents/build-resolver.toml",
    ".codex/agents/docs-researcher.toml",
    ".codex/agents/reviewer.toml",
    ".devgod/rules/role-retrieval-policy.md",
    "scripts/check-devgod-workflow.sh",
    "scripts/verify-devgod-workflow-check.sh"
  ];

  for (const expectedPath of expectedPaths) {
    assert.ok(packedFiles.has(expectedPath), `${expectedPath} should be present in npm pack --dry-run output`);
  }
});
