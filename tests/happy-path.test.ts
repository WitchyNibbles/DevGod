import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function createHappyPathFixture(taskId: string): Promise<string> {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-happy-path-"));

  await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
  await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

  await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "reviews"), { recursive: true });

  await writeFile(
    join(targetRoot, ".devgod", "work", "briefs", `brief-${taskId}.md`),
    `## Task ID\n\n\`${taskId}\`\n`,
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
      "- delete the fixture"
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
        "`synthetic-actor`",
        "",
        "## Actor role",
        "",
        `\`${role}\``,
        "",
        "## Provenance status",
        "",
        "`runtime_verified`",
        "",
        "## Review state",
        "",
        "`passed`",
        "",
        "## Severity",
        "",
        "`low`",
        "",
        "## Findings",
        "",
        "No findings.",
        "",
        "## Residual risk",
        "",
        "Residual risk depends on the referenced authenticated runtime review artifact.",
        "",
        "## Verification evidence",
        "",
        "- Runtime proof: review service recordReview review_id=rev-123 principal=github:alice",
        `- bash scripts/check-devgod-happy-path.sh --task-id ${taskId}`,
        "",
        "## Specialist execution evidence",
        "",
        "- specialist handoff references reviewed files",
        "",
        "## Quality gate evidence",
        "",
        "- happy-path composition references workflow and retrieval smoke",
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
        "`approved`",
        "",
        "## Source handoff",
        "",
        "Runtime proof: review service recordReview review_id=rev-123 principal=github:alice",
        "",
        "Manager summary of reviewer output."
      ].join("\n"),
      "utf8"
    );
  }

  await writeFile(
    join(targetRoot, ".devgod", "ACTIVE"),
    `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
    "utf8"
  );

  return targetRoot;
}

test("check-devgod-happy-path passes a runtime-verified fixture and reports advisory retrieval status", async () => {
  const taskId = "DG-HAPPY-PATH-PASS";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    const { stdout } = await execFileAsync(
      "bash",
      ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot, "--task-id", taskId],
      { cwd: repoRoot }
    );

    assert.match(stdout, /workflow live check/);
    assert.match(stdout, /devgod workflow artifact check passed/);
    assert.match(stdout, /retrieval advisory smoke \(derived, non-authoritative\)/);
    assert.match(stdout, /derived retrieval baseline skipped: eval surface unavailable/);
    assert.match(stdout, /devgod happy-path checks passed/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-happy-path fails when a required review gate is missing", async () => {
  const taskId = "DG-HAPPY-PATH-MISSING-REVIEW";
  const targetRoot = await createHappyPathFixture(taskId);

  try {
    await rm(
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-qa_engineer.md`),
      { force: true }
    );

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-happy-path.sh", "--repo-root", targetRoot], {
        cwd: repoRoot
      }),
      /missing review file for qa_engineer/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
