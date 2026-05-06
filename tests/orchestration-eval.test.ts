import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runOrchestrationBaseline } from "../src/evals/orchestration-baseline.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("orchestration baseline passes all seeded cases", async () => {
  const report = await runOrchestrationBaseline();

  assert.equal(report.summary.totalCases, 8);
  assert.equal(report.summary.failedCases, 0);
  assert.equal(report.summary.passedCases, 8);
  assert.equal(report.summary.passRate, 1);
  assert.equal(report.summary.requiredPassRate, 1);
  assert.equal(report.summary.meetsThreshold, true);
  assert.equal(report.summary.authorityLabel, "derived_only");
});

test("orchestration baseline returns deterministic case coverage", async () => {
  const report = await runOrchestrationBaseline();

  assert.deepEqual(
    report.cases.map((testCase) => testCase.id),
    [
      "task_packet_contract_rejected",
      "dependency_ready_set_progresses",
      "routing_advisory_owner_dispatch",
      "overlapping_write_scope_locked",
      "partial_reviews_keep_task_blocked",
      "stale_approved_dependency_reblocked",
      "caller_asserted_review_authority_rejected",
      "unbound_principal_rejected"
    ]
  );
  assert.ok(report.cases.every((testCase) => testCase.authorityLabel === "derived_only"));
  assert.ok(report.cases.every((testCase) => testCase.score >= testCase.threshold));
});

test("orchestration baseline CLI emits the full report", async () => {
  const { stdout } = await execFileAsync(
    "node",
    ["--experimental-strip-types", "src/evals/orchestration-baseline.ts"],
    { cwd: repoRoot }
  );

  const report = JSON.parse(stdout) as Awaited<ReturnType<typeof runOrchestrationBaseline>>;
  assert.equal(report.summary.totalCases, 8);
  assert.equal(report.summary.failedCases, 0);
  assert.equal(report.cases[2]?.id, "routing_advisory_owner_dispatch");
});
