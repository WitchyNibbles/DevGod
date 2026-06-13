import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  installDevgodIntoProject,
  scaffoldWorkflowArtifacts,
  seedHappyPathFixtureArtifacts
} from "../src/install/cli.ts";
import {
  buildWorkflowSchemaArtifact,
  buildWorkflowReviewArtifactRelativePaths,
  getWorkflowReviewFilenameAlias,
  renderWorkflowSchemaArtifactJson,
  workflowTemplateReviewRoles
} from "../src/devgod/workflow-schema.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function createTargetRoot(prefix: string): Promise<string> {
  const targetRoot = await mkdtemp(join(tmpdir(), prefix));
  await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
  await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });
  return targetRoot;
}

async function runScaffold(targetRoot: string, taskId: string, args: string[] = []) {
  return execFileAsync(
    "node",
    [
      "--experimental-strip-types",
      "src/install/cli.ts",
      "scaffold-workflow",
      "--target",
      targetRoot,
      "--task-id",
      taskId,
      ...args
    ],
    { cwd: repoRoot }
  );
}

async function runWorkflowSchemaCli(args: string[]) {
  return execFileAsync("node", ["--experimental-strip-types", "src/devgod/workflow-schema-cli.ts", ...args], {
    cwd: repoRoot
  });
}

test("workflow-schema-cli renders shipped workflow templates", async () => {
  const intake = await runWorkflowSchemaCli(["render-template", "intake-brief"]);
  const taskPacket = await runWorkflowSchemaCli(["render-template", "task-packet"]);
  const reviewGate = await runWorkflowSchemaCli(["render-template", "review-gate"]);

  assert.match(intake.stdout, /## Task ID/);
  assert.match(taskPacket.stdout, /## Workflow artifact refs/);
  assert.match(taskPacket.stdout, /## Export artifact policy/);
  assert.match(reviewGate.stdout, /## Provenance status/);
});

test("workflow-schema-cli lists workflow enum surfaces", async () => {
  const reviewPolicies = await runWorkflowSchemaCli(["list", "workflow-review-export-policies"]);
  const reasoningModes = await runWorkflowSchemaCli(["list", "reasoning-workflow-modes"]);

  assert.match(reviewPolicies.stdout, /required/);
  assert.match(reviewPolicies.stdout, /runtime_optional/);
  assert.match(reasoningModes.stdout, /strict/);
  assert.match(reasoningModes.stdout, /dual/);
});

test("workflow-schema-cli rejects missing args and unknown keys", async () => {
  await assert.rejects(runWorkflowSchemaCli([]), /usage: workflow-schema-cli\.ts <render-template\|list> <key>/);
  await assert.rejects(runWorkflowSchemaCli(["render-template", "unknown-template"]), /unknown template key/);
  await assert.rejects(runWorkflowSchemaCli(["list", "unknown-list"]), /unknown list key/);
  await assert.rejects(runWorkflowSchemaCli(["unknown-mode", "task-packet"]), /unknown mode/);
});

test("scaffold-workflow creates canonical starter artifacts", async () => {
  const taskId = "DG-SCAFFOLD-CREATE";
  const targetRoot = await createTargetRoot("devgod-scaffold-create-");

  try {
    const summary = await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId,
      force: false,
      forceActive: false
    });
    const packageJson = JSON.parse(await readFile(join(targetRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    assert.equal(summary.taskId, taskId);
    assert.ok(summary.created.length > 0);
    assert.match(summary.nextSteps.join("\n"), new RegExp(`npm run devgod:check:happy-path -- --task-id ${taskId}`));

    const active = await readFile(join(targetRoot, ".devgod", "ACTIVE"), "utf8");
    const brief = await readFile(
      join(targetRoot, ".devgod", "work", "briefs", `brief-${taskId}.md`),
      "utf8"
    );
    const installedHappyPathScript = await readFile(
      join(targetRoot, "scripts", "check-devgod-happy-path.sh"),
      "utf8"
    );
    const task = await readFile(
      join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`),
      "utf8"
    );
    const reviewerGate = await readFile(
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-reviewer.md`),
      "utf8"
    );
    const reviewRelativePaths = buildWorkflowReviewArtifactRelativePaths(taskId);

    assert.equal(active, `task_id=${taskId}\nworkflow=devgod\nstate=active\n`);
    assert.match(brief, new RegExp(`brief-${taskId}`));
    assert.match(brief, new RegExp(`\\\`${taskId}\\\``));
    assert.match(task, /## Owner role\n\n`planner`/);
    assert.match(task, /## Completion standard\n\n`artifact_complete`/);
    assert.match(task, /## Reasoning policy\n\n### Mode\n\n`strict`/);
    assert.match(task, /review_exports=runtime_optional/);
    assert.match(task, /Allowed values: `required \| runtime_optional`/);
    assert.match(reviewerGate, /## Review state\n\n`pending`/);
    assert.match(reviewerGate, /## Decision\n\n`blocked`/);
    assert.match(reviewerGate, /Pending reviewer handoff\./);
    assert.equal(packageJson.scripts?.["devgod:check:happy-path"], "bash scripts/check-devgod-happy-path.sh");
    assert.match(installedHappyPathScript, /retrieval advisory smoke/);
    assert.equal(getWorkflowReviewFilenameAlias("reviewer"), "reviewer");
    assert.equal(getWorkflowReviewFilenameAlias("qa_engineer"), "qa");
    assert.equal(getWorkflowReviewFilenameAlias("security_reviewer"), "security");

    for (const role of workflowTemplateReviewRoles) {
      const reviewPath = join(targetRoot, reviewRelativePaths[role]);
      const reviewContent = await readFile(reviewPath, "utf8");
      assert.match(reviewContent, new RegExp(`## Reviewer role\\n\\n\\\`${role}\\\``));
    }
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow schema artifact renderer exposes the centralized review contract", () => {
  const artifact = buildWorkflowSchemaArtifact();
  const rendered = renderWorkflowSchemaArtifactJson();
  const parsed = JSON.parse(rendered) as {
    workflowTemplateReviewRoles: string[];
    workflowReviewFilenameAliases: string[];
    workflowArtifactRefKeys: string[];
    workflowArtifactRefGuidanceLine: string;
    workflowArtifactRefExampleLines: string[];
    workflowReviewExportsRuntimeOptionalGuidanceLine: string;
  };

  assert.deepEqual(artifact.workflowTemplateReviewRoles, [...workflowTemplateReviewRoles]);
  assert.deepEqual(artifact.workflowReviewFilenameAliases, [
    "reviewer:reviewer",
    "qa_engineer:qa",
    "security_reviewer:security"
  ]);
  assert.deepEqual(artifact.workflowArtifactRefKeys, [
    "brief",
    "plan",
    "task",
    "reviewer",
    "qa_engineer",
    "security_reviewer",
    "review_exports"
  ]);
  assert.equal(rendered.endsWith("\n"), true);
  assert.deepEqual(parsed.workflowTemplateReviewRoles, [...workflowTemplateReviewRoles]);
  assert.deepEqual(parsed.workflowReviewFilenameAliases, [...artifact.workflowReviewFilenameAliases]);
  assert.deepEqual(parsed.workflowArtifactRefKeys, [...artifact.workflowArtifactRefKeys]);
  assert.equal(parsed.workflowArtifactRefGuidanceLine, artifact.workflowArtifactRefGuidanceLine);
  assert.deepEqual(parsed.workflowArtifactRefExampleLines, [...artifact.workflowArtifactRefExampleLines]);
  assert.equal(
    parsed.workflowReviewExportsRuntimeOptionalGuidanceLine,
    artifact.workflowReviewExportsRuntimeOptionalGuidanceLine
  );
});

test("workflow schema review alias lookup rejects unknown roles", () => {
  assert.throws(
    () =>
      getWorkflowReviewFilenameAlias(
        "unknown_role" as Parameters<typeof getWorkflowReviewFilenameAlias>[0]
      ),
    /missing review filename alias for role unknown_role/
  );
});

test("scaffold-workflow refuses to overwrite existing artifacts without --force", async () => {
  const taskId = "DG-SCAFFOLD-NO-OVERWRITE";
  const targetRoot = await createTargetRoot("devgod-scaffold-no-overwrite-");

  try {
    await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId,
      force: false,
      forceActive: false
    });

    await assert.rejects(
      scaffoldWorkflowArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId,
        force: false,
        forceActive: false
      }),
      /refusing to overwrite existing workflow artifacts without --force/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow refuses to replace a different active task without --force-active", async () => {
  const targetRoot = await createTargetRoot("devgod-scaffold-active-mismatch-");

  try {
    await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId: "DG-SCAFFOLD-OLD",
      force: false,
      forceActive: false
    });

    await assert.rejects(
      scaffoldWorkflowArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId: "DG-SCAFFOLD-NEW",
        force: false,
        forceActive: false
      }),
      /refusing to replace active task DG-SCAFFOLD-OLD without --force-active/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow overwrites an existing active task when force flags are set", async () => {
  const targetRoot = await createTargetRoot("devgod-scaffold-force-active-");
  const oldTaskId = "DG-SCAFFOLD-OLD";
  const newTaskId = "DG-SCAFFOLD-NEW";

  try {
    await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId: oldTaskId,
      force: false,
      forceActive: false
    });

    const summary = await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId: newTaskId,
      force: true,
      forceActive: true
    });

    const active = await readFile(join(targetRoot, ".devgod", "ACTIVE"), "utf8");
    const newTask = await readFile(join(targetRoot, ".devgod", "work", "tasks", `task-${newTaskId}.md`), "utf8");

    assert.equal(active, `task_id=${newTaskId}\nworkflow=devgod\nstate=active\n`);
    assert.match(newTask, new RegExp(`\\\`${newTaskId}\\\``));
    assert.ok(summary.updated.includes(".devgod/ACTIVE"));
    assert.ok(summary.created.includes(`.devgod/work/tasks/task-${newTaskId}.md`));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("seed-happy-path-fixture rejects --force-active because fixtures never become active", async () => {
  const targetRoot = await createTargetRoot("devgod-happy-path-force-active-");

  try {
    await assert.rejects(
      seedHappyPathFixtureArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId: "fixture-demo",
        force: false,
        forceActive: true
      }),
      /seed-happy-path-fixture does not support --force-active because fixtures never become active/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffolded workflow artifacts remain blocked until reviews are completed", async () => {
  const taskId = "DG-SCAFFOLD-PENDING";
  const targetRoot = await createTargetRoot("devgod-scaffold-pending-");

  try {
    await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot,
      taskId,
      force: false,
      forceActive: false
    });

    await assert.rejects(
      execFileAsync(
        "bash",
        ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId],
        { cwd: repoRoot }
      ),
      /unexpected value.*pending/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow rejects invalid managed parents before writing artifacts", async () => {
  const targetRoot = await createTargetRoot("devgod-scaffold-parent-file-");
  const taskId = "DG-SCAFFOLD-PARENT-FILE";

  try {
    await rm(join(targetRoot, ".devgod", "work"), { recursive: true, force: true });
    await writeFile(join(targetRoot, ".devgod", "work"), "not-a-directory\n", "utf8");

    await assert.rejects(
      scaffoldWorkflowArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId,
        force: false,
        forceActive: false
      }),
      new RegExp(
        `refusing to scaffold \\.devgod/work/briefs/brief-${taskId}\\.md: managed path parent is not an in-root directory`
      )
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow accepts positional targets even when the task id matches the path segment", async () => {
  const baseRoot = await mkdtemp(join(tmpdir(), "devgod-scaffold-positional-"));
  const targetRoot = join(baseRoot, "same");

  try {
    await mkdir(targetRoot, { recursive: true });
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n', "utf8");
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

    await execFileAsync(
      "node",
      [
        "--experimental-strip-types",
        "src/install/cli.ts",
        "scaffold-workflow",
        targetRoot,
        "--task-id",
        "same"
      ],
      { cwd: repoRoot }
    );

    const active = await readFile(join(targetRoot, ".devgod", "ACTIVE"), "utf8");
    assert.equal(active, "task_id=same\nworkflow=devgod\nstate=active\n");
  } finally {
    await rm(baseRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow rejects symlinked targets even with force flags", async () => {
  const taskId = "DG-SCAFFOLD-SYMLINK";
  const targetRoot = await createTargetRoot("devgod-scaffold-symlink-");
  const victimRoot = await mkdtemp(join(tmpdir(), "devgod-scaffold-victim-"));
  const activeVictimPath = join(victimRoot, "active-victim.txt");
  const reviewVictimPath = join(victimRoot, "review-victim.txt");

  try {
    await writeFile(activeVictimPath, "do-not-touch-active\n", "utf8");
    await writeFile(reviewVictimPath, "do-not-touch-review\n", "utf8");

    await mkdir(join(targetRoot, ".devgod"), { recursive: true });
    await symlink(activeVictimPath, join(targetRoot, ".devgod", "ACTIVE"));

    await assert.rejects(
      scaffoldWorkflowArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId,
        force: true,
        forceActive: true
      }),
      /refusing to scaffold \.devgod\/ACTIVE: managed path is not an in-root regular file/
    );
    assert.equal(await readFile(activeVictimPath, "utf8"), "do-not-touch-active\n");

    await rm(join(targetRoot, ".devgod", "ACTIVE"), { force: true });
    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );
    await mkdir(join(targetRoot, ".devgod", "work", "reviews"), { recursive: true });
    await symlink(
      reviewVictimPath,
      join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-reviewer.md`)
    );

    await assert.rejects(
      scaffoldWorkflowArtifacts({
        sourceRoot: repoRoot,
        targetRoot,
        taskId,
        force: true,
        forceActive: false
      }),
      new RegExp(
        `refusing to scaffold \\.devgod/work/reviews/review-${taskId}-reviewer\\.md: managed path is not an in-root regular file`
      )
    );
    assert.equal(await readFile(reviewVictimPath, "utf8"), "do-not-touch-review\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(victimRoot, { recursive: true, force: true });
  }
});
