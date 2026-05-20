import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installDevgodIntoProject } from "../src/install/cli.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function createInstalledWorkflowFixture(taskId: string, prefix: string): Promise<string> {
  const targetRoot = await mkdtemp(join(tmpdir(), prefix));

  await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
  await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

  await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "checkpoints"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "coverage"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "proofs"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
  await mkdir(join(targetRoot, ".devgod", "work", "reviews"), { recursive: true });

  await writeFile(
    join(targetRoot, ".devgod", "work", "briefs", `brief-${taskId}.md`),
    `## Task ID\n\n\`${taskId}\`\n`,
    "utf8"
  );
  await writeFile(
    join(targetRoot, ".devgod", "ACTIVE"),
    `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
    "utf8"
  );

  return targetRoot;
}

async function attachWorkflowProofStub(
  targetRoot: string,
  options: {
    exitCode?: number;
    stderr?: string;
  } = {}
): Promise<string> {
  const stubRoot = await mkdtemp(join(tmpdir(), "devgod-workflow-proof-stub-"));
  await mkdir(join(stubRoot, "src", "admin"), { recursive: true });
  await writeFile(
    join(stubRoot, "package.json"),
    JSON.stringify({ name: "devgod", private: true, type: "module" }, null, 2) + "\n",
    "utf8"
  );
  await writeFile(
    join(stubRoot, "src", "admin", "devgod.ts"),
    [
      'import { writeFileSync } from "node:fs";',
      'const args = process.argv.slice(2);',
      'const logPath = process.env.DEVGOD_WORKFLOW_PROOF_ARGS_LOG;',
      'if (logPath) {',
      '  writeFileSync(logPath, args.join(" "), "utf8");',
      '}',
      'if (args[0] !== "workflow-proof") {',
      '  throw new Error(`unexpected command: ${args[0] ?? ""}`);',
      '}',
      `if (${JSON.stringify(options.exitCode ?? 0)} !== 0) {`,
      `  process.stderr.write(${JSON.stringify(options.stderr ?? "runtime workflow proof failed")});`,
      `  process.exit(${JSON.stringify(options.exitCode ?? 0)});`,
      '}',
      'process.stdout.write(JSON.stringify({ authorityLabel: "runtime_authoritative", taskStatus: "approved" }) + "\\n");'
    ].join("\n"),
    "utf8"
  );

  const packageJsonPath = join(targetRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  packageJson.devDependencies = {
    ...(packageJson.devDependencies ?? {}),
    devgod: `file:${stubRoot}`
  };
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");

  return stubRoot;
}

async function writeLiveTaskPacket(
  targetRoot: string,
  taskId: string,
  options?: {
    completionStandard?: "artifact_complete" | "specialist_verified";
    qualityGates?: string[];
    verificationCommand?: string;
    omitSections?: string[];
    reasoningMode?: "dual" | "strict";
    inputs?: string[];
    dependencies?: string[];
    workflowArtifactRefs?: Partial<
      Record<"brief" | "plan" | "task" | "reviewer" | "qa_engineer" | "security_reviewer", string>
    >;
    reviewExports?: "required" | "runtime_optional";
  }
): Promise<void> {
  const completionStandard = options?.completionStandard ?? "artifact_complete";
  const qualityGates = options?.qualityGates ?? ["product_acceptance"];
  const verificationCommand = options?.verificationCommand ?? "bash scripts/check-devgod-workflow-live.sh";
  const omitSections = new Set(options?.omitSections ?? []);
  const reasoningMode = options?.reasoningMode;
  const inputs = options?.inputs ?? ["- active workflow artifact set"];
  const dependencies = options?.dependencies ?? ["- brief artifact"];
  const workflowArtifactRefs = options?.workflowArtifactRefs;
  const reviewExports = options?.reviewExports ?? "required";
  const workflowArtifactRefLines = [
    ...(workflowArtifactRefs?.brief ? [`brief=${workflowArtifactRefs.brief}`] : []),
    ...(workflowArtifactRefs?.plan ? [`plan=${workflowArtifactRefs.plan}`] : []),
    ...(workflowArtifactRefs?.task ? [`task=${workflowArtifactRefs.task}`] : []),
    ...(workflowArtifactRefs?.reviewer ? [`reviewer=${workflowArtifactRefs.reviewer}`] : []),
    ...(workflowArtifactRefs?.qa_engineer ? [`qa_engineer=${workflowArtifactRefs.qa_engineer}`] : []),
    ...(workflowArtifactRefs?.security_reviewer
      ? [`security_reviewer=${workflowArtifactRefs.security_reviewer}`]
      : []),
    `review_exports=${reviewExports}`
  ];

  const sections: Array<[string, string[]]> = [
    ["## Task ID", [`\`${taskId}\``]],
    ["## Owner role", ["`qa_engineer`"]],
    ["## Completion standard", [`\`${completionStandard}\``]],
    ["## Required specialist roles", ["- `qa_engineer`", "- `reviewer`", "- `security_reviewer`"]],
    ["## Quality gates", qualityGates.map((gate) => `- \`${gate}\``)],
    ["## Goal", ["- prove live workflow policy enforcement"]],
    ["## Inputs", inputs],
    ["## Dependencies", dependencies],
    ["## Outputs", ["- validated live task packet"]],
    ["## Coverage impact", ["- touched analysis coverage must be tracked explicitly"]],
    ["## Touched ledger items", ["- `service:workflow-checker`"]],
    ["## Required runtime traces", ["- `trace://workflow-proof/live-check`"]],
    ["## Progress proof", ["- `.devgod/work/proofs/progress-task.json` records measurable deltas"]],
    ["## Interrupt checkpoint policy", ["- checkpoint before yielding when state changes"]],
    ["## Workflow artifact refs", workflowArtifactRefLines],
    ["## Allowed write scope", ["- `scripts/`", "- `tests/`"]],
    ["## Out of scope", ["- historical artifact cleanup"]],
    ["## Assumptions", []],
    ["### Approved assumptions", ["- live checks should be stricter than artifact checks"]],
    ["### Blocked assumptions", ["- none"]],
    ["## Reasoning quality", []],
    ["### Claim", ["- the live workflow proof should reflect real task authority"]],
    ["### Facts", ["- workflow checker and live proof wrapper are available"]],
    ["### Assumptions", ["- the authoritative runtime proof is present"]],
    ["### Hypotheses and alternatives", ["- missing proof should fail closed", "- summary-only reviews must stay insufficient"]],
    ["### Evidence refs", ["- `scripts/check-devgod-workflow.sh`", "- `scripts/check-devgod-workflow-live.sh`"]],
    ["### Counter-evidence", ["- none"]],
    ["### Confidence", ["- `medium`"]],
    ["### Open questions", ["- none"]],
    ["### Verification plan", [`- ${verificationCommand}`]],
    ["### Research and debug budgets", ["- researchSteps=1 debugSteps=1 reviewPasses=1 toolRetries=1"]],
    ...(reasoningMode
      ? ([
          ["## Reasoning policy", []],
          ["### Mode", [`\`${reasoningMode}\``]],
          ["### Requirements", ["- strict reasoning metadata is present"]],
          ["### Max attempts", ["- 3"]],
          ["## Reasoning attempts", []],
          ["### Attempt records", ["- attempt-1 trace ref and evidence present"]],
          ["### Verification records", ["- verification-1 critic review passed"]],
          ["### Verdict", ["- supported verdict recorded"]]
        ] as Array<[string, string[]]>)
      : []),
    ["## Acceptance criteria", ["- live workflow validation passes only with strong proof"]],
    ["## Verification steps", [`- ${verificationCommand}`]],
    ["## Required reviews", ["- reviewer", "- qa_engineer", "- security_reviewer"]],
    ["## Security checks", ["- require explicit live-proof references"]],
    ["## Retrieval guidance", ["- use direct workflow artifacts only"]],
    ["## Anti-patterns to avoid", ["- summary-only live approvals"]],
    ["## Rollback notes", ["- delete the fixture"]],
    ["## Handoff format", ["- concise summary plus cited verification evidence"]]
  ];

  const content = sections
    .filter(([heading]) => !omitSections.has(heading))
    .flatMap(([heading, lines]) => [heading, "", ...lines, ""])
    .join("\n");

  await writeFile(join(targetRoot, ".devgod", "work", "tasks", `task-${taskId}.md`), `${content}\n`, "utf8");
  await writeFile(
    join(targetRoot, ".devgod", "work", "coverage", `coverage-${taskId}.json`),
    JSON.stringify(
      {
        run_id: taskId,
        profile: "standard_delivery",
        required_categories: ["services", "tests"],
        thresholds: {
          critical_item_coverage: 0.8,
          critical_item_validation: 0.6,
          callsite_coverage: 0.85,
          runtime_trace_coverage: 0.75
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await writeFile(
    join(targetRoot, ".devgod", "work", "proofs", `progress-${taskId}.json`),
    JSON.stringify(
      {
        cycle: 1,
        proof_id: `proof-${taskId}`,
        phase_before: "inventory",
        phase_after: "dependency_mapping",
        evidence_refs: ["scripts/check-devgod-workflow.sh"],
        coverage_delta: { fully_analyzed: 1 },
        blocking_gap_delta: { closed: 1, opened: 0 },
        next_target: "service:workflow-checker",
        why_next: "exercise quality-gate proof enforcement"
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await writeFile(
    join(targetRoot, ".devgod", "work", "checkpoints", `checkpoint-${taskId}.md`),
    [
      "# Checkpoint Summary",
      "",
      "## Run ID",
      "",
      `\`${taskId}\``,
      "",
      "## Checkpoint ID",
      "",
      `\`cp-${taskId}\``,
      "",
      "## Phase",
      "",
      "`dependency_mapping`",
      "",
      "## Active targets",
      "",
      "- `service:workflow-checker`",
      "",
      "## Recent evidence refs",
      "",
      "- `scripts/check-devgod-workflow.sh`",
      "",
      "## Open gaps",
      "",
      "- `gap:workflow-checker:none`",
      "",
      "## Next actions",
      "",
      "- verify workflow-proof gating",
      "",
      "## Compressed context ref",
      "",
      `memory://checkpoint/${taskId}`
    ].join("\n") + "\n",
    "utf8"
  );
}

async function writeWorkflowReview(
  targetRoot: string,
  taskId: string,
  reviewerRole: "reviewer" | "qa_engineer" | "security_reviewer",
  options?: {
    provenanceStatus?: "summary_only" | "runtime_verified" | "legacy_backfill";
    reviewState?: "passed" | "waived";
    decision?: "approved" | "waived";
    waiverAuthority?: "none" | "manager" | "security_exception";
    waiverReason?: string;
  }
): Promise<void> {
  const provenanceStatus = options?.provenanceStatus ?? "runtime_verified";
  const reviewState = options?.reviewState ?? "passed";
  const decision = options?.decision ?? "approved";
  const waiverAuthority = options?.waiverAuthority ?? "none";
  const waiverReason = options?.waiverReason ?? "None.";
  const runtimeProofLines =
    provenanceStatus === "runtime_verified"
      ? [
          "- Runtime proof: review service recordReview review_id=rev-123 principal=github:alice",
          "- bash scripts/check-devgod-workflow-live.sh"
        ]
      : ["- bash scripts/check-devgod-workflow-live.sh"];
  const sourceHandoff =
    provenanceStatus === "runtime_verified"
      ? [
          "Runtime proof: review service recordReview review_id=rev-123 principal=github:alice",
          "",
          "Manager summary of reviewer output."
        ]
      : ["Manager summary of reviewer output."];

  await writeFile(
    join(targetRoot, ".devgod", "work", "reviews", `review-${taskId}-${reviewerRole}.md`),
    [
      "# Review Gate",
      "",
      "## Task ID",
      "",
      `\`${taskId}\``,
      "",
      "## Reviewer role",
      "",
      `\`${reviewerRole}\``,
      "",
      "## Actor",
      "",
      "`synthetic-actor`",
      "",
      "## Actor role",
      "",
      `\`${reviewerRole}\``,
      "",
      "## Provenance status",
      "",
      `\`${provenanceStatus}\``,
      "",
      "## Review state",
      "",
      `\`${reviewState}\``,
      "",
      "## Severity",
      "",
      "`low`",
      "",
      "## Specialist execution evidence",
      "",
      "- specialist handoff references reviewed files",
      "",
      "## Quality gate evidence",
      "",
      "- quality gates were checked explicitly",
      "",
      "## Reasoning quality findings",
      "",
      "No reasoning-quality findings.",
      "",
      "## Findings",
      "",
      "No findings.",
      "",
      "## Residual risk",
      "",
      "Residual risk depends on the cited live review proof.",
      "",
      "## Verification evidence",
      "",
      ...runtimeProofLines,
      "",
      "## Waiver authority",
      "",
      `\`${waiverAuthority}\``,
      "",
      "## Waiver reason",
      "",
      waiverReason,
      "",
      "## Decision",
      "",
      `\`${decision}\``,
      "",
      "## Source handoff",
      "",
      ...sourceHandoff
    ].join("\n"),
    "utf8"
  );
}

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

test("check-devgod-workflow accepts a complete ACTIVE export when an explicit task id is provided", async () => {
  const taskId = "DG-COMPLETE-EXPORT";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-complete-export-");

  try {
    await writeLiveTaskPacket(targetRoot, taskId);
    await writeWorkflowReview(targetRoot, taskId, "reviewer");
    await writeWorkflowReview(targetRoot, taskId, "qa_engineer");
    await writeWorkflowReview(targetRoot, taskId, "security_reviewer");
    await writeFile(join(targetRoot, ".devgod", "ACTIVE"), "workflow=devgod\nstate=complete\n", "utf8");

    await execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
      cwd: repoRoot
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow validates queue metadata when a task queue export is present", async () => {
  const taskId = "DG-QUEUE-METADATA";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-queue-metadata-");

  try {
    await writeLiveTaskPacket(targetRoot, taskId);
    await writeWorkflowReview(targetRoot, taskId, "reviewer");
    await writeWorkflowReview(targetRoot, taskId, "qa_engineer");
    await writeWorkflowReview(targetRoot, taskId, "security_reviewer");
    await writeFile(
      join(targetRoot, ".devgod", "work", "task-queue.json"),
      JSON.stringify(
        {
          project_status: "active",
          current_task_id: taskId,
          tasks: [
            {
              id: taskId,
              title: "queue validation fixture",
              status: "in_progress",
              class: "release_candidate",
              depends_on: [],
              acceptance_criteria: ["workflow check validates queued metadata"],
              verification: ["bash scripts/check-devgod-workflow.sh --task-id DG-QUEUE-METADATA"],
              evidence: [".devgod/work/tasks/task-DG-QUEUE-METADATA.md"],
              blocker: null
            }
          ]
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
      cwd: repoRoot
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live accepts CRLF active files", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-crlf-workflow-"));
  const taskId = "DG-CRLF";
  let stubRoot: string | undefined;

  try {
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });
    stubRoot = await attachWorkflowProofStub(targetRoot);

    await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "checkpoints"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "coverage"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "proofs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "reviews"), { recursive: true });

    await writeFile(join(targetRoot, ".devgod", "work", "briefs", `brief-${taskId}.md`), `## Task ID\n\n\`${taskId}\`\n`, "utf8");
    await writeLiveTaskPacket(targetRoot, taskId);
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\r\nworkflow=devgod\r\nstate=active\r\n`,
      "utf8"
    );

    await execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
      cwd: targetRoot
    });
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects requested task ids that do not match the active task", async () => {
  const targetRoot = await createInstalledWorkflowFixture("DG-LIVE-MATCH", "devgod-live-task-mismatch-");
  const taskId = "DG-LIVE-MATCH";
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      verificationCommand: "bash scripts/check-devgod-workflow-live.sh --task-id DG-LIVE-MATCH"
    });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync(
        "bash",
        ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot, "--task-id", "DG-LIVE-OTHER"],
        { cwd: repoRoot }
      ),
      /requested task id DG-LIVE-OTHER does not match active task DG-LIVE-MATCH/
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects tasks without authoritative runtime proof even if local reviews look approved", async () => {
  const taskId = "DG-LIVE-RUNTIME-BLOCK";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-runtime-block-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot, {
      exitCode: 1,
      stderr: "task is not approved in runtime"
    });
    await writeLiveTaskPacket(targetRoot, taskId);
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role, { provenanceStatus: "summary_only" });
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /Command failed: bash scripts\/check-devgod-workflow-live\.sh/
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects task packets missing required live sections", async () => {
  const taskId = "DG-LIVE-MISSING-SECTIONS";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-missing-sections-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, { omitSections: ["## Goal"] });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /missing heading ## Goal/
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects missing coverage or proof artifacts when autonomous gates are enabled", async () => {
  const taskId = "DG-LIVE-MISSING-AUTONOMOUS-ARTIFACTS";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-missing-autonomous-artifacts-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      qualityGates: [
        "product_acceptance",
        "coverage_ledger_required",
        "progress_proof_required",
        "checkpoint_resume_required",
        "memory_compaction_required"
      ]
    });
    await rm(join(targetRoot, ".devgod", "work", "coverage", `coverage-${taskId}.json`), {
      force: true
    });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /missing file: \.devgod\/work\/coverage\/coverage-DG-LIVE-MISSING-AUTONOMOUS-ARTIFACTS\.json/
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects invalid coverage manifest content when autonomous gates are enabled", async () => {
  const taskId = "DG-LIVE-BAD-COVERAGE-MANIFEST";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-bad-coverage-manifest-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      qualityGates: ["product_acceptance", "coverage_ledger_required"]
    });
    await writeFile(
      join(targetRoot, ".devgod", "work", "coverage", `coverage-${taskId}.json`),
      JSON.stringify(
        {
          run_id: taskId,
          profile: "legacy_rewrite",
          required_categories: [],
          thresholds: {
            critical_item_coverage: 0.8
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /invalid coverage manifest artifact/i
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects narrative-only progress proofs when autonomous gates are enabled", async () => {
  const taskId = "DG-LIVE-BAD-PROGRESS-PROOF";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-bad-progress-proof-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      qualityGates: ["product_acceptance", "progress_proof_required"]
    });
    await writeFile(
      join(targetRoot, ".devgod", "work", "proofs", `progress-${taskId}.json`),
      JSON.stringify(
        {
          cycle: 1,
          proof_id: `proof-${taskId}`,
          phase_before: "validation",
          phase_after: "validation",
          evidence_refs: ["src/core/service.ts:1"],
          coverage_delta: {
            validated: 0
          },
          blocking_gap_delta: {
            closed: 0,
            opened: 0
          },
          next_target: "task:rewrite",
          why_next: "narrative only"
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /invalid progress proof artifact/i
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects unsupported quality gates", async () => {
  const taskId = "DG-LIVE-BAD-GATE";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-bad-gate-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      qualityGates: ["workflow_happy_path_required"]
    });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /unsupported quality gate in .*task-DG-LIVE-BAD-GATE\.md: workflow_happy_path_required/
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live rejects strict reasoning tasks without attempt records", async () => {
  const taskId = "DG-LIVE-STRICT-MISSING";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-strict-missing-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      qualityGates: ["product_acceptance", "reasoning_strict_required"],
      reasoningMode: "strict",
      omitSections: ["### Attempt records"]
    });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await assert.rejects(
      execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
        cwd: targetRoot
      }),
      /missing heading ### Attempt records/
    );
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live accepts strict reasoning tasks with attempt records and verdict", async () => {
  const taskId = "DG-LIVE-STRICT-PASS";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-live-strict-pass-");
  let stubRoot: string | undefined;

  try {
    stubRoot = await attachWorkflowProofStub(targetRoot);
    await writeLiveTaskPacket(targetRoot, taskId, {
      qualityGates: ["product_acceptance", "reasoning_strict_required"],
      reasoningMode: "strict"
    });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
    }

    await execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot], {
      cwd: targetRoot
    });
  } finally {
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow-live accepts inherited briefs with runtime-optional review exports", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-inherited-brief-live-"));
  const taskId = "DG-INHERITED-BRIEF";
  const parentTaskId = "DG-PARENT-PLAN";
  let stubRoot: string | undefined;

  try {
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });
    stubRoot = await attachWorkflowProofStub(targetRoot);

    await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "checkpoints"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "coverage"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "proofs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });

    await writeFile(
      join(targetRoot, ".devgod", "work", "briefs", `brief-${parentTaskId}.md`),
      `## Task ID\n\n\`${parentTaskId}\`\n`,
      "utf8"
    );
    await writeLiveTaskPacket(targetRoot, taskId, {
      inputs: ["- active workflow artifact set", `- .devgod/work/briefs/brief-${parentTaskId}.md`],
      dependencies: [`- .devgod/work/briefs/brief-${parentTaskId}.md`],
      workflowArtifactRefs: {
        brief: `.devgod/work/briefs/brief-${parentTaskId}.md`
      },
      reviewExports: "runtime_optional"
    });
    await writeFile(
      join(targetRoot, ".devgod", "ACTIVE"),
      `task_id=${taskId}\nworkflow=devgod\nstate=active\n`,
      "utf8"
    );

    await execFileAsync("bash", ["scripts/check-devgod-workflow-live.sh", "--repo-root", targetRoot, "--task-id", taskId], {
      cwd: repoRoot
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    if (stubRoot) {
      await rm(stubRoot, { recursive: true, force: true });
    }
  }
});

test("check-devgod-workflow rejects inherited brief refs that are not declared as inputs or dependencies", async () => {
  const targetRoot = await mkdtemp(join(tmpdir(), "devgod-inherited-brief-undocumented-"));
  const taskId = "DG-INHERITED-BRIEF-UNDECLARED";
  const parentTaskId = "DG-PARENT-UNDECLARED";

  try {
    await writeFile(join(targetRoot, "package.json"), '{ "name": "fixture", "private": true }\n');
    await installDevgodIntoProject({ sourceRoot: repoRoot, targetRoot });

    await mkdir(join(targetRoot, ".devgod", "work", "briefs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "checkpoints"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "coverage"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "proofs"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "tasks"), { recursive: true });
    await mkdir(join(targetRoot, ".devgod", "work", "reviews"), { recursive: true });

    await writeFile(
      join(targetRoot, ".devgod", "work", "briefs", `brief-${parentTaskId}.md`),
      `## Task ID\n\n\`${parentTaskId}\`\n`,
      "utf8"
    );
    await writeLiveTaskPacket(targetRoot, taskId, {
      workflowArtifactRefs: {
        brief: `.devgod/work/briefs/brief-${parentTaskId}.md`
      }
    });
    for (const role of ["reviewer", "qa_engineer", "security_reviewer"] as const) {
      await writeWorkflowReview(targetRoot, taskId, role);
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
      /workflow brief ref must also be listed in ## Inputs or ## Dependencies/
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("check-devgod-workflow accepts runtime-optional review exports without markdown review files", async () => {
  const taskId = "DG-RUNTIME-OPTIONAL-ARTIFACT";
  const targetRoot = await createInstalledWorkflowFixture(taskId, "devgod-runtime-optional-artifact-");

  try {
    await writeLiveTaskPacket(targetRoot, taskId, {
      reviewExports: "runtime_optional"
    });

    await execFileAsync("bash", ["scripts/check-devgod-workflow.sh", "--repo-root", targetRoot, "--task-id", taskId], {
      cwd: repoRoot
    });
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
