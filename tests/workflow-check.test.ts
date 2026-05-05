import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("verify-devgod-workflow-check validates positive and negative fixtures", async () => {
  const { stdout } = await execFileAsync("bash", ["scripts/verify-devgod-workflow-check.sh"], {
    cwd: repoRoot
  });

  assert.match(stdout, /artifact-contract fixture verification passed for task-DG-001-fixture/);
});

test("check-devgod-workflow rejects task ids with path separators or spaces", async () => {
  await assert.rejects(
    async () =>
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--task-id", "bad/id"], {
        cwd: repoRoot
      }),
    /task_id must match/
  );

  await assert.rejects(
    async () =>
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--task-id", "bad id"], {
        cwd: repoRoot
      }),
    /task_id must match/
  );
});

test("check-devgod-workflow-live accepts CRLF active files", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-crlf-workflow-"));
  const taskId = "DG-CRLF";

  try {
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

    const briefPath = join(targetRoot, ".devgod", "work", "briefs", `brief-${taskId}.md`);
    const taskPath = join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`);
    const reviewDir = join(targetRoot, ".devgod", "work", "reviews");

    await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(reviewDir, { recursive: true });

    await writeFile(briefPath, `## Task ID\n\n\`${taskId}\`\n`, "utf8");
    await writeFile(
      taskPath,
      [
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Owner role",
        "",
        "`qa_engineer`",
        "",
        "## Completion standard",
        "",
        "`artifact_complete`",
        "",
        "## Acceptance criteria",
        "",
        "- smoke path passes",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow-live.sh",
        "",
        "## Required reviews",
        "",
        "- reviewer",
        "- qa_engineer",
        "- security_reviewer",
        "",
        "## Rollback notes",
        "",
        "- delete the smoke fixture"
      ].join("\n"),
      "utf8"
    );

    for (const [role, actorRole] of [
      ["reviewer", "reviewer"],
      ["qa_engineer", "qa_engineer"],
      ["security_reviewer", "security_reviewer"]
    ] as const) {
      await writeFile(
        join(reviewDir, `review-${taskId}-${role}.md`),
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
          `\`${actorRole}\``,
          "",
          "## Provenance status",
          "",
          "`summary_only`",
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
          "CRLF active files still need fixture coverage because the workflow checker reads task ids from .devgod/ACTIVE.",
          "",
          "## Verification evidence",
          "",
          "- bash scripts/check-devgod-workflow-live.sh",
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
          "Manager summary of CRLF fixture."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\r\nworkflow=devgod\r\nstate=active\r\n`,
      "utf8"
    );

    await execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
      cwd: repoRoot
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects requested task ids that do not match the active task", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-live-task-mismatch-"));
  const taskId = "DG-LIVE-MATCH";

  try {
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
        "`qa_engineer`",
        "",
        "## Completion standard",
        "",
        "`artifact_complete`",
        "",
        "## Acceptance criteria",
        "",
        "- task-id alignment is enforced",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow-live.sh --task-id DG-LIVE-MATCH",
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

    for (const [role, actorRole] of [
      ["reviewer", "reviewer"],
      ["qa_engineer", "qa_engineer"],
      ["security_reviewer", "security_reviewer"]
    ] as const) {
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
          `\`${actorRole}\``,
          "",
          "## Provenance status",
          "",
          "`summary_only`",
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
          "No material residual risk.",
          "",
          "## Verification evidence",
          "",
          "- synthetic proof",
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
          "Manager summary of the fixture."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await assert.rejects(
      execFileAsync(
        "bash",
        ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot, "--task-id", "DG-LIVE-OTHER"],
        { cwd: repoRoot }
      ),
      /requested task id DG-LIVE-OTHER does not match active task DG-LIVE-MATCH/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow rejects passed security reviews with high severity", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-security-high-"));
  const taskId = "DG-SEC-HIGH";

  try {
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
        "`qa_engineer`",
        "",
        "## Completion standard",
        "",
        "`artifact_complete`",
        "",
        "## Acceptance criteria",
        "",
        "- security severity rule is enforced",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow.sh --task-id DG-SEC-HIGH",
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

    for (const [role, actorRole] of [
      ["reviewer", "reviewer"],
      ["qa_engineer", "qa_engineer"]
    ] as const) {
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
          `\`${actorRole}\``,
          "",
          "## Provenance status",
          "",
          "`summary_only`",
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
          "No material residual risk.",
          "",
          "## Verification evidence",
          "",
          "- synthetic proof",
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
          "Manager summary of the fixture."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-security_reviewer.md`),
      [
        "# Review Gate",
        "",
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Reviewer role",
        "",
        "`security_reviewer`",
        "",
        "## Actor",
        "",
        "`security-actor`",
        "",
        "## Actor role",
        "",
        "`security_reviewer`",
        "",
        "## Provenance status",
        "",
        "`summary_only`",
        "",
        "## Review state",
        "",
        "`passed`",
        "",
        "## Severity",
        "",
        "`high`",
        "",
        "## Findings",
        "",
        "No findings.",
        "",
        "## Residual risk",
        "",
        "High severity must be rejected.",
        "",
        "## Verification evidence",
        "",
        "- synthetic proof",
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
        "Manager summary of the fixture."
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
        cwd: repoRoot
      }),
      /passed security review summaries must use low or medium severity, not high/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow rejects passed security reviews with critical severity", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-security-critical-"));
  const taskId = "DG-SEC-CRITICAL";

  try {
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
        "`qa_engineer`",
        "",
        "## Completion standard",
        "",
        "`artifact_complete`",
        "",
        "## Acceptance criteria",
        "",
        "- security severity rule is enforced",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow.sh --task-id DG-SEC-CRITICAL",
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

    for (const [role, actorRole] of [
      ["reviewer", "reviewer"],
      ["qa_engineer", "qa_engineer"]
    ] as const) {
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
          `\`${actorRole}\``,
          "",
          "## Provenance status",
          "",
          "`summary_only`",
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
          "No material residual risk.",
          "",
          "## Verification evidence",
          "",
          "- synthetic proof",
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
          "Manager summary of the fixture."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-security_reviewer.md`),
      [
        "# Review Gate",
        "",
        "## Task ID",
        "",
        `\`${taskId}\``,
        "",
        "## Reviewer role",
        "",
        "`security_reviewer`",
        "",
        "## Actor",
        "",
        "`security-actor`",
        "",
        "## Actor role",
        "",
        "`security_reviewer`",
        "",
        "## Provenance status",
        "",
        "`summary_only`",
        "",
        "## Review state",
        "",
        "`passed`",
        "",
        "## Severity",
        "",
        "`critical`",
        "",
        "## Findings",
        "",
        "No findings.",
        "",
        "## Residual risk",
        "",
        "Critical severity must be rejected.",
        "",
        "## Verification evidence",
        "",
        "- synthetic proof",
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
        "Manager summary of the fixture."
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
        cwd: repoRoot
      }),
      /passed security review summaries must use low or medium severity, not critical/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow rejects specialist_verified tasks without runtime-verified evidence", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-specialist-proof-"));
  const taskId = "DG-SPECIALIST-PROOF";

  try {
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
        "- `product_acceptance`",
        "- `tdd_required`",
        "",
        "## Acceptance criteria",
        "",
        "- specialist proof is present",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow.sh --task-id DG-SPECIALIST-PROOF",
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
          "`summary_only`",
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
          "Runtime proof is missing in this negative fixture.",
          "",
          "## Verification evidence",
          "",
          "- bash scripts/check-devgod-workflow.sh --task-id DG-SPECIALIST-PROOF",
          "",
          "## Specialist execution evidence",
          "",
          "- manager summary only",
          "",
          "## Quality gate evidence",
          "",
          "- acceptance claimed without runtime proof",
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
          "Manager summary without authenticated runtime proof."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
        cwd: repoRoot
      }),
      /requires runtime_verified review provenance/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow rejects specialist_verified tasks with legacy-backfill review provenance", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-legacy-review-proof-"));
  const taskId = "DG-LEGACY-REVIEW-PROOF";

  try {
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
        "- `product_acceptance`",
        "- `tdd_required`",
        "",
        "## Acceptance criteria",
        "",
        "- legacy review proof is rejected",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow.sh --task-id DG-LEGACY-REVIEW-PROOF",
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
          "`legacy_backfill`",
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
          "Backfilled review provenance must not satisfy runtime trust requirements.",
          "",
          "## Verification evidence",
          "",
          "- bash scripts/check-devgod-workflow.sh --task-id DG-LEGACY-REVIEW-PROOF",
          "",
          "## Specialist execution evidence",
          "",
          "- manager summary references historical review state",
          "",
          "## Quality gate evidence",
          "",
          "- acceptance claimed without authenticated runtime proof",
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
          "Manager summary with legacy backfill provenance."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
        cwd: repoRoot
      }),
      /requires runtime_verified review provenance/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow rejects runtime_verified specialist summaries without runtime proof citations", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-runtime-proof-missing-"));
  const taskId = "DG-RUNTIME-PROOF-MISSING";

  try {
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
        "- `product_acceptance`",
        "- `tdd_required`",
        "",
        "## Acceptance criteria",
        "",
        "- runtime proof citation is required",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow.sh --task-id DG-RUNTIME-PROOF-MISSING",
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
          "Markdown cites runtime_verified but not the underlying authenticated runtime artifact.",
          "",
          "## Verification evidence",
          "",
          "- bash scripts/check-devgod-workflow.sh --task-id DG-RUNTIME-PROOF-MISSING",
          "",
          "## Specialist execution evidence",
          "",
          "- specialist handoff references reviewed files",
          "",
          "## Quality gate evidence",
          "",
          "- quality gates claimed in summary",
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
          "Manager summary says runtime was checked, but does not cite the authenticated runtime proof."
        ].join("\n"),
        "utf8"
      );
    }

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
        cwd: repoRoot
      }),
      /must cite Runtime proof/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow accepts runtime_verified specialist summaries with runtime proof citations", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-runtime-proof-present-"));
  const taskId = "DG-RUNTIME-PROOF-PRESENT";

  try {
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
        "- `product_acceptance`",
        "- `tdd_required`",
        "",
        "## Acceptance criteria",
        "",
        "- runtime proof citation is present",
        "",
        "## Verification steps",
        "",
        "- bash scripts/check-devgod-workflow.sh --task-id DG-RUNTIME-PROOF-PRESENT",
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
          "- bash scripts/check-devgod-workflow.sh --task-id DG-RUNTIME-PROOF-PRESENT",
          "",
          "## Specialist execution evidence",
          "",
          "- specialist handoff references reviewed files",
          "",
          "## Quality gate evidence",
          "",
          "- quality gates claimed in summary",
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

    const { stdout } = await execFileAsync(
      "bash",
      ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId],
      { cwd: repoRoot }
    );

    assert.match(stdout, /devgod workflow artifact check passed/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
