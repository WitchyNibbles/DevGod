import assert from "node:assert/strict";
import { execFile, type ExecFileException } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  installDevgodIntoProject,
  parseCliArgs,
  scaffoldWorkflowArtifacts
} from "../src/install/cli.ts";
import { writePublishedPackageEntrypoints } from "../src/install/merge.ts";
import {
  buildWorkflowArtifactRefExampleLines,
  buildWorkflowReviewArtifactRelativePath,
  buildWorkflowReviewArtifactRelativePaths,
  buildWorkflowSchemaArtifact,
  renderIntakeBriefTemplate,
  renderReviewGatePolicyDocument,
  renderReviewGateTemplate,
  renderTaskPacketTemplate,
  renderWorkflowSchemaArtifactJson
} from "../src/devgod/workflow-schema.ts";
import {
  syncVendoredSkills,
  vendoredSkillEntries
} from "../src/devgod/vendored-skills.ts";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const installCliScript = path.join(repoRoot, "src", "install", "cli.ts");
const verifyAgentCavemanScript = path.join(
  repoRoot,
  "src",
  "devgod",
  "verify-agent-caveman-contract.ts"
);
const verifyVendoredSkillsScript = path.join(
  repoRoot,
  "src",
  "devgod",
  "verify-vendored-skills.ts"
);
const workflowSchemaCliScript = path.join(repoRoot, "src", "devgod", "workflow-schema-cli.ts");

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

function fixturePackageJson(name: string): string {
  return JSON.stringify({ name, private: true }, null, 2) + "\n";
}

async function createTargetRoot(prefix: string): Promise<string> {
  const targetRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await writeFile(path.join(targetRoot, "package.json"), fixturePackageJson(prefix), "utf8");
  return targetRoot;
}

async function createInstalledTarget(prefix: string): Promise<string> {
  const targetRoot = await createTargetRoot(prefix);
  await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });
  return targetRoot;
}

async function runTypeScriptCli(
  scriptPath: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("node", ["--experimental-strip-types", scriptPath, ...args], {
    cwd: options.cwd,
    env: childProcessEnv(options.env)
  });
}

async function captureCliFailure(
  scriptPath: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): Promise<ExecFileException & { stdout: string; stderr: string }> {
  try {
    await runTypeScriptCli(scriptPath, args, options);
    assert.fail(`Expected ${path.basename(scriptPath)} to fail`);
  } catch (error) {
    return error as ExecFileException & { stdout: string; stderr: string };
  }
}

async function createVendoredSkillSourceRoot(): Promise<string> {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "devgod-vendored-source-"));

  for (const entry of vendoredSkillEntries) {
    const targetPath = path.join(sourceRoot, entry.upstreamSkillId, "SKILL.md");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      targetPath,
      [
        "---",
        `name: ${entry.upstreamSkillId}`,
        `description: ${JSON.stringify(`${entry.upstreamSkillId} fixture`)}`,
        "---",
        "",
        `# ${entry.upstreamSkillId}`,
        "",
        "Fixture body"
      ].join("\n"),
      "utf8"
    );
  }

  return sourceRoot;
}

test("workflow schema renderers expose the runtime review contract end to end", () => {
  const taskId = "task-coverage";
  const intake = renderIntakeBriefTemplate();
  const policy = renderReviewGatePolicyDocument();
  const reviewGate = renderReviewGateTemplate();
  const taskPacket = renderTaskPacketTemplate();
  const artifact = buildWorkflowSchemaArtifact();
  const exampleLines = buildWorkflowArtifactRefExampleLines(taskId);
  const reviewPaths = buildWorkflowReviewArtifactRelativePaths(taskId);
  const renderedArtifactJson = renderWorkflowSchemaArtifactJson();
  const parsedArtifact = JSON.parse(renderedArtifactJson) as {
    workflowArtifactRefExampleLines: string[];
    workflowReviewExportPolicies: string[];
    liveTaskRequiredHeadings: string[];
  };

  assert.match(intake, /## Council need/);
  assert.match(intake, /## Stop Go/);
  assert.match(policy, /runtime task, review, approval, and council records are canonical truth/);
  assert.match(policy, /required task gates are `reviewer`, `security_reviewer`, and `qa_engineer`/);
  assert.match(reviewGate, /## Provenance status/);
  assert.match(reviewGate, /## Waiver authority/);
  assert.match(taskPacket, /## Workflow artifact refs/);
  assert.match(taskPacket, /review_exports=runtime_optional/);
  assert.match(taskPacket, /## Completion audit/);
  assert.match(taskPacket, /## Reasoning policy/);
  assert.match(taskPacket, /## Residual risk disposition/);

  assert.equal(
    buildWorkflowReviewArtifactRelativePath(taskId, "qa_engineer"),
    reviewPaths.qa_engineer
  );
  assert.deepEqual(exampleLines, [
    `brief=.devgod/work/briefs/brief-${taskId}.md`,
    `plan=.devgod/work/plans/plan-${taskId}.md`,
    `task=.devgod/work/tasks/task-${taskId}.md`,
    `reviewer=${reviewPaths.reviewer}`,
    `qa_engineer=${reviewPaths.qa_engineer}`,
    `security_reviewer=${reviewPaths.security_reviewer}`,
    "review_exports=required | runtime_optional"
  ]);
  assert.deepEqual(parsedArtifact.workflowArtifactRefExampleLines, artifact.workflowArtifactRefExampleLines);
  assert.deepEqual(parsedArtifact.workflowReviewExportPolicies, [...artifact.workflowReviewExportPolicies]);
  assert.deepEqual(parsedArtifact.liveTaskRequiredHeadings, [...artifact.liveTaskRequiredHeadings]);
  assert.equal(renderedArtifactJson.endsWith("\n"), true);
});

test("workflow-schema-cli lists every shipped enum surface", async () => {
  const listKeys = [
    "live-task-required-headings",
    "live-task-required-reasoning-headings",
    "live-task-reasoning-policy-headings",
    "live-task-required-nonempty-headings",
    "live-task-required-nonempty-reasoning-headings",
    "quality-gates",
    "stronger-artifact-quality-gates",
    "ui-surfaces",
    "workflow-template-review-roles",
    "workflow-review-filename-aliases",
    "workflow-review-actor-roles",
    "workflow-review-provenance-statuses",
    "workflow-review-export-policies",
    "workflow-artifact-ref-keys",
    "playwright-requirement-states",
    "reasoning-workflow-modes",
    "stop-go-states"
  ] as const;

  for (const key of listKeys) {
    const { stdout } = await runTypeScriptCli(workflowSchemaCliScript, ["list", key], { cwd: repoRoot });
    assert.ok(stdout.trim().length > 0, `expected ${key} to render at least one value`);
  }
});

test("writePublishedPackageEntrypoints emits runnable dist wrappers from a minimal package", async () => {
  const packageRoot = await mkdtemp(path.join(tmpdir(), "devgod-published-entrypoints-"));

  try {
    await mkdir(path.join(packageRoot, "src"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "src", "value.ts"),
      [
        'export const coverageValue = "from-public-ts";',
        "export type CoverageType = { value: string };"
      ].join("\n") + "\n",
      "utf8"
    );
    await writeFile(
      path.join(packageRoot, "src", "public.ts"),
      [
        'export { coverageValue } from "./value.ts";',
        'export type { CoverageType } from "./value.ts";'
      ].join("\n") + "\n",
      "utf8"
    );

    await writePublishedPackageEntrypoints(packageRoot);

    const registerHooksPath = path.join(packageRoot, "dist", "register-typescript-hooks.js");
    const indexPath = path.join(packageRoot, "dist", "index.js");
    const binPath = path.join(packageRoot, "dist", "bin", "devgod.js");
    const registerHooksSource = await readFile(registerHooksPath, "utf8");
    const binSource = await readFile(binPath, "utf8");
    const binStats = await stat(binPath);
    const wrapperModule = (await import(pathToFileURL(indexPath).href)) as { coverageValue: string };

    assert.match(registerHooksSource, /registerHooks/);
    assert.match(registerHooksSource, /stripTypeScriptTypes/);
    assert.match(binSource, /Unknown devgod command/);
    assert.equal(wrapperModule.coverageValue, "from-public-ts");
    assert.ok((binStats.mode & 0o111) !== 0, "expected generated bin wrapper to be executable");
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("verify-agent-caveman-contract CLI reports both drift and success paths", async () => {
  const brokenRepoRoot = await mkdtemp(path.join(tmpdir(), "devgod-agent-cli-broken-"));

  try {
    await mkdir(path.join(brokenRepoRoot, ".codex", "agents"), { recursive: true });
    await writeFile(
      path.join(brokenRepoRoot, "AGENTS.md"),
      "Only the root thread that talks directly to the user may answer outside caveman.\n",
      "utf8"
    );
    await writeFile(
      path.join(brokenRepoRoot, ".codex", "agents", "backend-engineer.toml"),
      [
        'name = "wrong_backend_role"',
        'description = "Broken metadata fixture"',
        'developer_instructions = "talk normally without caveman markers"'
      ].join("\n") + "\n",
      "utf8"
    );

    const failure = await captureCliFailure(verifyAgentCavemanScript, [], { cwd: brokenRepoRoot });
    assert.match(failure.stderr, /missing agent artifact:/);
    assert.match(failure.stderr, /agent metadata drift:/);
    assert.match(failure.stderr, /agent caveman drift:/);
    assert.match(failure.stderr, /policy caveman drift:/);

    const success = await runTypeScriptCli(verifyAgentCavemanScript, [], { cwd: repoRoot });
    assert.match(success.stdout, /agent caveman contract verified in/);
  } finally {
    await rm(brokenRepoRoot, { recursive: true, force: true });
  }
});

test("verify-vendored-skills CLI reports both verified and drifted mirrors", async () => {
  const localRepoRoot = await mkdtemp(path.join(tmpdir(), "devgod-vendored-cli-repo-"));
  const sourceRoot = await createVendoredSkillSourceRoot();

  try {
    await syncVendoredSkills({
      repoRoot: localRepoRoot,
      sourceRoots: [sourceRoot],
      now: "2026-06-13T00:00:00.000Z"
    });

    const env = {
      DEVGOD_VENDORED_SKILL_SOURCE_ROOTS: sourceRoot
    };

    const success = await runTypeScriptCli(verifyVendoredSkillsScript, [], {
      cwd: localRepoRoot,
      env
    });
    assert.match(success.stdout, /vendored skills verified in/);

    await unlink(path.join(localRepoRoot, ".agents", "skills", "devgod-api-design", "SKILL.md"));
    const failure = await captureCliFailure(verifyVendoredSkillsScript, [], {
      cwd: localRepoRoot,
      env
    });
    assert.match(failure.stderr, /devgod-api-design: missing local file/);
  } finally {
    await rm(localRepoRoot, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  }
});

test("install CLI entrypoints print summaries for dry runs, drifted verify, fixture seeding, and reasoning upgrades", async () => {
  const dryRunTargetRoot = await createTargetRoot("devgod-cli-dry-run-");
  const installedTargetRoot = await createInstalledTarget("devgod-cli-installed-");
  const reasoningTaskId = "task-cli-reasoning";
  const fixtureTaskId = "fixture-cli-happy";

  try {
    const dryRun = await runTypeScriptCli(
      installCliScript,
      ["init", "--dry-run", "--target", dryRunTargetRoot],
      { cwd: repoRoot }
    );
    assert.match(dryRun.stdout, new RegExp(`devgod dry run for ${dryRunTargetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(dryRun.stdout, /mode: dry-run/);
    assert.match(dryRun.stdout, /Next steps:/);

    const installedPackageJsonPath = path.join(installedTargetRoot, "package.json");
    const installedPackageJson = JSON.parse(await readFile(installedPackageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    delete installedPackageJson.scripts?.["devgod:verify:setup"];
    await writeFile(installedPackageJsonPath, `${JSON.stringify(installedPackageJson, null, 2)}\n`, "utf8");

    const verifyFailure = await captureCliFailure(
      installCliScript,
      ["verify", "--target", installedTargetRoot],
      { cwd: repoRoot }
    );
    assert.match(verifyFailure.stdout, new RegExp(`devgod verify for ${installedTargetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(verifyFailure.stdout, /status: drifted/);
    assert.match(verifyFailure.stdout, /Modified:/);
    assert.match(verifyFailure.stdout, /package\.json/);
    assert.match(verifyFailure.stdout, /Optional module drift:/);

    const happyPathSeed = await runTypeScriptCli(
      installCliScript,
      ["seed-happy-path-fixture", "--target", installedTargetRoot, "--task-id", fixtureTaskId],
      { cwd: repoRoot }
    );
    assert.match(happyPathSeed.stdout, /devgod seed-happy-path-fixture for/);
    assert.match(happyPathSeed.stdout, new RegExp(`task_id: ${fixtureTaskId}`));
    await access(
      path.join(installedTargetRoot, ".devgod", "work", "tasks", `task-${fixtureTaskId}.md`),
      fsConstants.F_OK
    );

    await scaffoldWorkflowArtifacts({
      sourceRoot: repoRoot,
      targetRoot: installedTargetRoot,
      taskId: reasoningTaskId,
      force: false,
      forceActive: false
    });

    const reasoningUpgrade = await runTypeScriptCli(
      installCliScript,
      [
        "upgrade-reasoning-workflow",
        "--target",
        installedTargetRoot,
        "--task-id",
        reasoningTaskId,
        "--mode",
        "dual"
      ],
      { cwd: repoRoot }
    );
    assert.match(reasoningUpgrade.stdout, /devgod upgrade-reasoning-workflow for/);
    assert.match(reasoningUpgrade.stdout, new RegExp(`task_id: ${reasoningTaskId}`));
    assert.match(reasoningUpgrade.stdout, /Next steps:/);
  } finally {
    await rm(dryRunTargetRoot, { recursive: true, force: true });
    await rm(installedTargetRoot, { recursive: true, force: true });
  }
});

test("install CLI parser rejects unsupported legacy apply mode and malformed mutation targets", () => {
  assert.throws(
    () => parseCliArgs(["--apply", "/tmp/project"]),
    /--apply is only supported with the init or upgrade commands/
  );
  assert.throws(
    () => parseCliArgs(["--dry-run", "--with-grafana"]),
    /Usage: node --experimental-strip-types src\/install\/cli\.ts/
  );
  assert.throws(
    () => parseCliArgs(["scaffold-workflow", "--task-id", "task-cli-usage", "--unknown-flag"]),
    /Usage: node --experimental-strip-types src\/install\/cli\.ts/
  );
  assert.throws(
    () =>
      parseCliArgs([
        "upgrade-reasoning-workflow",
        "--task-id",
        "task-cli-usage",
        "--mode",
        "dual",
        "--unknown-flag"
      ]),
    /Usage: node --experimental-strip-types src\/install\/cli\.ts/
  );
});

test("install CLI upgrade summary reports conflicts, orphans, and failing exit status", async () => {
  const targetRoot = await createInstalledTarget("devgod-cli-upgrade-conflict-");

  try {
    const conflictedRelativePath = ".devgod/templates/task-packet.md";
    const conflictedPath = path.join(targetRoot, ".devgod", "templates", "task-packet.md");
    await writeFile(conflictedPath, "# divergent managed template\n", "utf8");

    const orphanPath = path.join(targetRoot, "legacy-orphan.txt");
    await writeFile(orphanPath, "legacy managed orphan\n", "utf8");

    const manifestPath = path.join(targetRoot, ".devgod", "install-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      version: number;
      files: Array<{ target: string; strategy: "merge" | "replace"; contentHash: string }>;
    };
    const conflictedRecord = manifest.files.find((entry) => entry.target === conflictedRelativePath);
    assert.ok(conflictedRecord, "expected install manifest to track the conflicted template");
    conflictedRecord.contentHash = "stale-manifest-baseline";
    manifest.files.push({
      target: "legacy-orphan.txt",
      strategy: "replace",
      contentHash: "orphan-fixture"
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const failure = await captureCliFailure(
      installCliScript,
      ["upgrade", "--dry-run", "--target", targetRoot],
      { cwd: repoRoot }
    );

    assert.equal(failure.code, 1);
    assert.match(failure.stdout, /devgod upgrade plan for/);
    assert.match(failure.stdout, /Conflicts:/);
    assert.match(failure.stdout, /- \.devgod\/templates\/task-packet\.md/);
    assert.match(failure.stdout, /Orphans:/);
    assert.match(failure.stdout, /- legacy-orphan\.txt/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow mutation CLIs print updated summaries when forced over existing artifacts", async () => {
  const targetRoot = await createInstalledTarget("devgod-cli-workflow-updates-");
  const scaffoldTaskId = "task-cli-summary";
  const fixtureTaskId = "fixture-cli-summary";
  const reasoningTaskId = "task-cli-reasoning-update";

  try {
    await runTypeScriptCli(
      installCliScript,
      ["scaffold-workflow", "--target", targetRoot, "--task-id", scaffoldTaskId],
      { cwd: repoRoot }
    );

    const scaffoldRerun = await runTypeScriptCli(
      installCliScript,
      [
        "scaffold-workflow",
        "--target",
        targetRoot,
        "--task-id",
        scaffoldTaskId,
        "--force",
        "--force-active"
      ],
      { cwd: repoRoot }
    );
    assert.match(scaffoldRerun.stdout, /devgod scaffold-workflow for/);
    assert.match(scaffoldRerun.stdout, /Updated:/);

    await runTypeScriptCli(
      installCliScript,
      ["seed-happy-path-fixture", "--target", targetRoot, "--task-id", fixtureTaskId],
      { cwd: repoRoot }
    );

    const fixtureRerun = await runTypeScriptCli(
      installCliScript,
      ["seed-happy-path-fixture", "--target", targetRoot, "--task-id", fixtureTaskId, "--force"],
      { cwd: repoRoot }
    );
    assert.match(fixtureRerun.stdout, /devgod seed-happy-path-fixture for/);
    assert.match(fixtureRerun.stdout, /Updated:/);

    await mkdir(path.join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".devgod", "work", "tasks", `task-${reasoningTaskId}.md`),
      [
        "## Task ID",
        "",
        `\`${reasoningTaskId}\``,
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

    const reasoningUpdate = await runTypeScriptCli(
      installCliScript,
      [
        "upgrade-reasoning-workflow",
        "--target",
        targetRoot,
        "--task-id",
        reasoningTaskId,
        "--mode",
        "dual"
      ],
      { cwd: repoRoot }
    );
    assert.match(reasoningUpdate.stdout, /devgod upgrade-reasoning-workflow for/);
    assert.match(reasoningUpdate.stdout, /Updated:/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow mutation CLIs reject invalid fixture ids and missing reasoning task artifacts", async () => {
  const targetRoot = await createInstalledTarget("devgod-cli-workflow-errors-");

  try {
    const fixtureFailure = await captureCliFailure(
      installCliScript,
      ["seed-happy-path-fixture", "--target", targetRoot, "--task-id", "task-not-a-fixture"],
      { cwd: repoRoot }
    );
    assert.match(fixtureFailure.stderr, /requires a task id starting with fixture-/);

    const reasoningFailure = await captureCliFailure(
      installCliScript,
      ["upgrade-reasoning-workflow", "--target", targetRoot, "--task-id", "task-missing-cli"],
      { cwd: repoRoot }
    );
    assert.match(
      reasoningFailure.stderr,
      /missing task artifact: \.devgod\/work\/tasks\/task-task-missing-cli\.md/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
