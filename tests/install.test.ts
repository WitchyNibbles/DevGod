import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { mergeAgentsMd, mergeCodexConfig, mergeGitignore, mergePackageJson } from "../src/install/merge.ts";
import { installDevgodIntoProject } from "../src/install/cli.ts";

test("mergeAgentsMd appends and is idempotent", () => {
  const first = mergeAgentsMd("# Existing Rules\n");
  const second = mergeAgentsMd(first);

  assert.match(first, /BEGIN DEVGOD MANAGED/);
  assert.match(first, /## Department Workflow/);
  assert.match(first, /`solution_architect`/);
  assert.match(first, /`planner`/);
  assert.doesNotMatch(first, /scrum_master/);
  assert.doesNotMatch(first, /test_director/);
  assert.doesNotMatch(first, /devgod:codex/);
  assert.equal(first, second);
});

test("mergeCodexConfig preserves existing values and adds missing devgod defaults", () => {
  const merged = mergeCodexConfig(
    `model = "custom-model"\n\n[features]\npersonality = false\n`,
    `model = "gpt-5.4"\nproject_doc_fallback_filenames = [".agents.md"]\n\n[features]\nmulti_agent = true\nenable_request_compression = true\n\n[agents]\nmax_threads = 8\n`
  );

  assert.match(merged, /model = "custom-model"/);
  assert.match(merged, /project_doc_fallback_filenames = \[\s*"\.agents\.md"\s*\]/);
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

  const memoryReadme = await readFile(path.join(targetRoot, ".devgod/memory/README.md"), "utf8");
  assert.match(memoryReadme, /devgod memory/i);

  await assert.rejects(
    readFile(path.join(targetRoot, ".devgod/memory/project-profile.md"), "utf8")
  );
  await assert.rejects(
    readFile(path.join(targetRoot, ".devgod/work/briefs/brief-2026-04-25-bitbat-rebuild.md"), "utf8")
  );
});
