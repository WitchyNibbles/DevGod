import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installDevgodIntoProject, seedHappyPathFixtureArtifacts } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function childProcessEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_V8_COVERAGE: ""
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
      continue;
    }
    env[key] = value;
  }
  env.NODE_V8_COVERAGE = "";
  return env;
}

async function execFileWithoutCoverage(
  file: string,
  args: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {}
) {
  return execFileAsync(file, [...args], {
    ...options,
    env: childProcessEnv(options.env)
  });
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  await chmod(filePath, 0o755);
}

async function createPlaywrightNpxStub(): Promise<{ stubPath: string; stubRoot: string }> {
  const stubRoot = await mkdtemp(join(tmpdir(), "devgod-playwright-npx-"));
  const stubPath = join(stubRoot, "npx");

  await writeExecutable(
    stubPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "exit 0"
    ].join("\n")
  );

  return { stubPath, stubRoot };
}

async function createHappyPathFixture(taskId: string): Promise<string> {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-happy-path-"));

  await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
  await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

  await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "reviews"), { recursive: true });

  await writeFile(
    join(targetRoot, ".devgod", "work", "briefs", `brief-${taskId}.md`),
    `## Task ID\n\n\`${taskId}\`\n\n## Fixture posture\n\nSynthetic install-proof only. Do not reuse these artifacts as live workflow evidence.\n`,
    "utf8"
  );

  await writeFile(
    join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
    [
      "## Task ID",
      "",
      `\`${taskId}\``,
      "",
      "## Owner role",
      "",
      "`backend_engineer`",
      "",
      "## Completion standard",
      "",
      "`specialist_verified`",
      "",
      "## Required specialist roles",
      "",
      "- `backend_engineer`",
      "- `reviewer`",
      "- `qa_engineer`",
      "- `security_reviewer`",
      "",
      "## Quality gates",
      "",
      "- `workflow_happy_path_required`",
      "- `artifact_contract_required`",
      "- `advisory_retrieval_required`",
      "",
      "## Acceptance criteria",
      "",
      "- composed happy-path command passes",
      "- fixture remains synthetic and non-authoritative",
      "",
      "## Verification steps",
      "",
      "- bash scripts/check-devgod-happy-path.sh",
      "",
      "## Required reviews",
      "",
      "- reviewer",
      "- qa_engineer",
      "- security_reviewer",
      "",
      "## Rollback notes",
      "",
      "- delete the synthetic fixture artifacts"
    ].join("\n"),
    "utf8"
  );

  for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
    await writeFile(
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-${role}.md`),
      [
        "# Review Gate",
        "",
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Reviewer role",
        "",
        `\`${role}\``,
        "",
        "## Actor",
        "",
        "`synthetic-install-fixture`",
        "",
        "## Actor role",
        "",
        `\`${role}\``,
        "",
        "## Provenance status",
        "",
        "`summary_only`",
        "",
        "## Review state",
        "",
        "`blocked`",
        "",
        "## Severity",
        "",
        "`low`",
        "",
        "## Findings",
        "",
        "- Synthetic install fixture only; replace with authenticated runtime review evidence before live work.",
        "",
        "## Residual risk",
        "",
        "Residual risk remains fully open because this fixture is not authenticated reviewer evidence.",
        "",
        "## Verification evidence",
        "",
        `- bash scripts/check-devgod-happy-path.sh --task-id ${taskId}`,
        "- fixture review is intentionally non-authoritative",
        "",
        "## Specialist execution evidence",
        "",
        "- specialist handoff references reviewed files",
        "",
        "## Quality gate evidence",
        "",
        "- happy-path composition references synthetic fixture checks and retrieval smoke",
        "",
        "## Waiver authority",
        "",
        "`none`",
        "",
        "## Waiver reason",
        "",
        "None.",
        "",
        "## Decision",
        "",
        "`blocked`",
        "",
        "## Source handoff",
        "",
        "Synthetic fixture summary. No authenticated reviewer source exists for this install proof."
      ].join("\n"),
      "utf8"
    );
  }

  return targetRoot;
}

test("check-devgod-happy-path passes a synthetic fixture and reports advisory retrieval status", async () => {
  const taskId = "fixture-happy-path-pass";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    const { stdout } = await execFileWithoutCoverage(
      "bash",
      ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
      { cwd: repoRoot }
    );

    assert.match(stdout, /synthetic fixture check/);
    assert.match(stdout, /retrieval advisory smoke \(derived, non-authoritative\)/);
    assert.match(stdout, /derived retrieval baseline skipped: eval surface unavailable/);
    assert.match(stdout, /devgod happy-path checks passed/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installed consumer fixture can seed and pass the happy-path flow without manual edits", async () => {
  const taskId = "fixture-happy-path-consumer";
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-consumer-happy-path-"));

  try {
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

    const summary = await seedHappyPathFixtureArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId,
      force: false,
      forceActive: false
    });

    assert.equal(summary.taskId, taskId);
    assert.ok(summary.created.length > 0);
    assert.equal(summary.updated.length, 0);

    const { stdout } = await execFileWithoutCoverage(
      "bash",
      ["scripts/check-devgod-happy-path.sh", "--task-id", taskId],
      { cwd: targetRoot }
    );

    assert.match(stdout, /synthetic fixture check/);
    assert.match(stdout, /retrieval advisory smoke \(derived, non-authoritative\)/);
    assert.match(stdout, /derived retrieval baseline skipped: eval surface unavailable/);
    assert.match(stdout, /devgod happy-path checks passed/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("verify-installed-repo-harness can include the Grafana opt-in wiring", async () => {
  const { stubPath, stubRoot } = await createPlaywrightNpxStub();

  try {
    const { stdout } = await execFileWithoutCoverage(
      "bash",
      ["scripts/verify-installed-repo-harness.sh", "--with-grafana"],
      {
        cwd: repoRoot,
        env: { DEVGOD_PLAYWRIGHT_NPX_BIN: stubPath }
      }
    );

    assert.match(stdout, /installed repo harness passed/);
    assert.match(stdout, /grafana-opt-in: enabled/);
  } finally {
    await rm(stubRoot, { recursive: true, force: true });
  }
});

test("seed-happy-path-fixture rejects non-fixture task ids", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-consumer-happy-path-reject-"));

  try {
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

    await assert.rejects(
      seedHappyPathFixtureArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId: "not-a-fixture",
        force: false,
        forceActive: false
      }),
      /task id starting with fixture-/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-happy-path fails when a required review gate is missing", async () => {
  const taskId = "fixture-happy-path-missing-review";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    await rm(
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-qa_engineer.md`),
      { force: true }
    );

    await assert.rejects(
      execFileWithoutCoverage(
        "bash",
        ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
        {
          cwd: repoRoot
        }
      ),
      /missing required fixture file: \.devgod\/work\/reviews\/review-.*-qa_engineer\.md/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});


test("check-devgod-happy-path fails clearly when the review identity adapter scaffold is missing", async () => {
  const taskId = "fixture-happy-path-missing-adapter";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    await rm(join(targetRoot, "devgod", "review-identity-adapter.ts"), { force: true });

    await assert.rejects(
      execFileWithoutCoverage(
        "bash",
        ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
        { cwd: repoRoot }
      ),
      /missing review identity adapter scaffold: devgod\/review-identity-adapter\.ts/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-happy-path fails clearly on malformed review identity bindings exports", async () => {
  const taskId = "fixture-happy-path-bad-bindings";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    await writeFile(join(targetRoot, ".devgod", "review-identity-bindings.json"), '{"bindings":[]}' + "\n", "utf8");

    await assert.rejects(
      execFileWithoutCoverage(
        "bash",
        ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
        { cwd: repoRoot }
      ),
      /fixture check failed: expected replace-with-authenticated-user-id in \.devgod\/review-identity-bindings\.json/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-happy-path fails clearly when a managed workflow export is stale or missing", async () => {
  const taskId = "fixture-happy-path-stale-export";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    await rm(join(targetRoot, "scripts", "check-devgod-workflow.sh"), { force: true });

    await assert.rejects(
      execFileWithoutCoverage(
        "bash",
        ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
        { cwd: repoRoot }
      ),
      /stale install export missing: scripts\/check-devgod-workflow\.sh/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-happy-path fails clearly when installed setup wiring is incomplete", async () => {
  const taskId = "fixture-happy-path-incomplete-setup";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    const packageJsonPath = join(targetRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      name: string;
      private: boolean;
      scripts?: Record<string, string>;
    };
    delete packageJson.scripts?.["devgod:verify:setup"];
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

    await assert.rejects(
      execFileWithoutCoverage(
        "bash",
        ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
        { cwd: repoRoot }
      ),
      /incomplete devgod setup: package\.json lacks devgod:verify:setup/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});


test("verify-installed-repo-harness isolates fresh target repo context and reaches authoritative workflow proof", async () => {
  const { stubPath, stubRoot } = await createPlaywrightNpxStub();

  try {
    const { stdout } = await execFileWithoutCoverage("bash", ["scripts/verify-installed-repo-harness.sh"], {
      cwd: repoRoot,
      env: {
        DEVGOD_WORKSPACE_SLUG: "wrong-workspace",
        DEVGOD_PROJECT_SLUG: "wrong-project",
        DEVGOD_PLAYWRIGHT_NPX_BIN: stubPath
      }
    });

    assert.match(stdout, /installed repo harness passed/);
    assert.match(stdout, /workspace: default/);
    assert.match(stdout, /project: devgod-installed-harness-/);
    assert.match(stdout, /task: harness-proof/);
    assert.match(stdout, /profile: modernization_program/);
    assert.match(stdout, /rewrite_readiness: ready/);
  } finally {
    await rm(stubRoot, { recursive: true, force: true });
  }
});
