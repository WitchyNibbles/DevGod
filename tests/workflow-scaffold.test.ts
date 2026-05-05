import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installDevgodIntoProject } from "../src/install/cli.ts";

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

test("scaffold-workflow creates canonical starter artifacts", async () => {
  const taskId = "DG-SCAFFOLD-CREATE";
  const targetRoot = await createTargetRoot("devgod-scaffold-create-");

  try {
    const { stdout } = await runScaffold(targetRoot, taskId);
    const packageJson = JSON.parse(await readFile(join(targetRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    assert.match(stdout, /devgod scaffold-workflow/);
    assert.match(stdout, new RegExp(`task_id: ${taskId}`));
    assert.match(
      stdout,
      new RegExp(`npm run devgod:check:happy-path -- --task-id ${taskId}`)
    );

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

    assert.equal(active, `task_id=${taskId}\nworkflow=devgod\nstate=active\n`);
    assert.match(brief, new RegExp(`brief-${taskId}`));
    assert.match(brief, new RegExp(`\\\`${taskId}\\\``));
    assert.match(task, /## Owner role\n\n`planner`/);
    assert.match(task, /## Completion standard\n\n`artifact_complete`/);
    assert.match(reviewerGate, /## Review state\n\n`pending`/);
    assert.match(reviewerGate, /## Decision\n\n`blocked`/);
    assert.match(reviewerGate, /Pending reviewer handoff\./);
    assert.equal(packageJson.scripts?.["devgod:check:happy-path"], "bash scripts/check-devgod-happy-path.sh");
    assert.match(installedHappyPathScript, /retrieval advisory smoke/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow refuses to overwrite existing artifacts without --force", async () => {
  const taskId = "DG-SCAFFOLD-NO-OVERWRITE";
  const targetRoot = await createTargetRoot("devgod-scaffold-no-overwrite-");

  try {
    await runScaffold(targetRoot, taskId);

    await assert.rejects(
      runScaffold(targetRoot, taskId),
      /refusing to overwrite existing workflow artifacts without --force/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffold-workflow refuses to replace a different active task without --force-active", async () => {
  const targetRoot = await createTargetRoot("devgod-scaffold-active-mismatch-");

  try {
    await runScaffold(targetRoot, "DG-SCAFFOLD-OLD");

    await assert.rejects(
      runScaffold(targetRoot, "DG-SCAFFOLD-NEW"),
      /refusing to replace active task DG-SCAFFOLD-OLD without --force-active/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("scaffolded workflow artifacts remain blocked until reviews are completed", async () => {
  const taskId = "DG-SCAFFOLD-PENDING";
  const targetRoot = await createTargetRoot("devgod-scaffold-pending-");

  try {
    await runScaffold(targetRoot, taskId);

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
      runScaffold(targetRoot, taskId, ["--force", "--force-active"]),
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
      runScaffold(targetRoot, taskId, ["--force"]),
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
