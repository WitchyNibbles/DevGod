import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const driftScript = path.join(repoRoot, "scripts", "check-docs-runtime-drift.sh");

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "devgod-doc-drift-"));
  await mkdir(path.join(root, "docs", "benchmarks"), { recursive: true });
  return root;
}

const benchmarkSource = `# Orchestration Benchmark

Generated: 2026-05-20T16:50:16.106Z

Local proof: 14/14 repo-local baseline cases passed (100%).
Replay-grade proof: 4/4 generated multi-step replay cases passed (100%).

This report mixes repo-verified \`devgod\` runtime proof with reviewed comparative capability fixtures for adjacent systems. Local proof and replay-grade proof are both repo-local evidence layers, not an external lab certification.
Replay boundary: Replay-grade cases exercise broader multi-step degradation scenarios and should be read as stronger repo-local evidence, not external certification.
`;

const frontierBenchmarkSource = `# Frontier Model Benchmark

Generated: 2026-05-31T12:00:00.000Z

Configured default model: \`gpt-5.4\`
Configured in: \`.codex/config.toml\`
Primary public benchmark: SWE-Bench Pro (Public) (57.7% for the configured default).

- This report is reviewed external evidence, not repo-local runtime proof.
- Scores are vendor-published public benchmark values and may not have been reproduced under a single neutral harness by this repo.
- The report intentionally stores only benchmark metadata and published scores, not benchmark tasks, gold patches, or answer-bearing artifacts.
`;

const goalGapHistorical = `# DevGod Goal Gap Audit

Generated: \`2026-05-20\`

This document is historical context from the pre-remediation package audit.
`;

const currentState = `runtime-proven
authoritative completion proof is run \`d141baef-0f7a-40df-9aec-ac60ad9235f7\`
`;
const redesignState = `package-level remediation described by this redesign is now shipped
`;
const readmeState = `# DevGod

As of \`2026-05-20\`, DevGod is runtime-proven at the package level.

Command families include \`coverage\`, \`gaps\`, and \`report\`.
`;

test("check-docs-runtime-drift passes when benchmark and historical docs are aligned", async () => {
  const fixtureRoot = await createFixture();
  const benchmarkSourcePath = path.join(fixtureRoot, "benchmark-source.md");
  const frontierBenchmarkSourcePath = path.join(fixtureRoot, "frontier-benchmark-source.md");

  try {
    await writeFile(benchmarkSourcePath, benchmarkSource, "utf8");
    await writeFile(frontierBenchmarkSourcePath, frontierBenchmarkSource, "utf8");
    await writeFile(
      path.join(fixtureRoot, "docs", "benchmarks", "orchestration-benchmark.md"),
      benchmarkSource.replace("2026-05-20T16:50:16.106Z", "2026-05-20T17:00:00.000Z"),
      "utf8"
    );
    await writeFile(
      path.join(fixtureRoot, "docs", "benchmarks", "frontier-model-benchmark.md"),
      frontierBenchmarkSource.replace("2026-05-31T12:00:00.000Z", "2026-05-31T12:15:00.000Z"),
      "utf8"
    );
    await writeFile(path.join(fixtureRoot, "docs", "devgod-goal-gap-audit.md"), goalGapHistorical, "utf8");
    await writeFile(path.join(fixtureRoot, "docs", "current-state.md"), currentState, "utf8");
    await writeFile(path.join(fixtureRoot, "docs", "autonomous-execution-redesign.md"), redesignState, "utf8");
    await writeFile(path.join(fixtureRoot, "README.md"), readmeState, "utf8");

    const { stdout } = await execFileAsync(
      "bash",
      [
        driftScript,
        "--repo-root",
        fixtureRoot,
        "--benchmark-source",
        benchmarkSourcePath,
        "--frontier-benchmark-source",
        frontierBenchmarkSourcePath
      ],
      { cwd: repoRoot }
    );

    assert.match(stdout, /docs\/runtime drift checks passed/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("check-docs-runtime-drift fails on stale benchmark or stale goal-gap claims", async () => {
  const fixtureRoot = await createFixture();
  const benchmarkSourcePath = path.join(fixtureRoot, "benchmark-source.md");
  const frontierBenchmarkSourcePath = path.join(fixtureRoot, "frontier-benchmark-source.md");

  try {
    await writeFile(benchmarkSourcePath, benchmarkSource, "utf8");
    await writeFile(frontierBenchmarkSourcePath, frontierBenchmarkSource, "utf8");
    await writeFile(
      path.join(fixtureRoot, "docs", "benchmarks", "orchestration-benchmark.md"),
      benchmarkSource.replace(
        "Local proof: 14/14 repo-local baseline cases passed (100%).",
        "Runtime proof: 14/14 baseline cases passed (100%)."
      ),
      "utf8"
    );
    await writeFile(
      path.join(fixtureRoot, "docs", "benchmarks", "frontier-model-benchmark.md"),
      frontierBenchmarkSource.replace(
        "Primary public benchmark: SWE-Bench Pro (Public) (57.7% for the configured default).",
        "Primary public benchmark: SWE-Bench Pro (Public) (57.6% for the configured default)."
      ),
      "utf8"
    );
    await writeFile(
      path.join(fixtureRoot, "docs", "devgod-goal-gap-audit.md"),
      `This document is historical context from the pre-remediation package audit.
autonomous.configured=false
`,
      "utf8"
    );
    await writeFile(path.join(fixtureRoot, "docs", "current-state.md"), currentState, "utf8");
    await writeFile(path.join(fixtureRoot, "docs", "autonomous-execution-redesign.md"), redesignState, "utf8");
    await writeFile(path.join(fixtureRoot, "README.md"), readmeState, "utf8");

    await assert.rejects(
      execFileAsync(
        "bash",
        [
          driftScript,
          "--repo-root",
          fixtureRoot,
          "--benchmark-source",
          benchmarkSourcePath,
          "--frontier-benchmark-source",
          frontierBenchmarkSourcePath
        ],
        { cwd: repoRoot }
      ),
      /docs\/runtime drift check failed: benchmark markdown is stale/
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
