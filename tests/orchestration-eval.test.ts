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

  assert.equal(report.summary.totalCases, 14);
  assert.equal(report.summary.failedCases, 0);
  assert.equal(report.summary.passedCases, 14);
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
      "unbound_principal_rejected",
      "contradiction_loop_forces_backward_transition",
      "stale_checkpoint_does_not_override_continuation",
      "fresh_checkpoint_preserves_interrupted_resume",
      "retry_budget_exhaustion_blocks_readiness",
      "backlog_not_exhausted_false_completion_rejected",
      "terminal_tasks_with_autonomous_target_continue_analysis"
    ]
  );
  assert.ok(report.cases.every((testCase) => testCase.authorityLabel === "derived_only"));
  assert.ok(report.cases.every((testCase) => testCase.score >= testCase.threshold));
});

test("orchestration baseline report remains json-serializable", async () => {
  const report = JSON.parse(
    JSON.stringify(await runOrchestrationBaseline())
  ) as Awaited<ReturnType<typeof runOrchestrationBaseline>>;
  assert.equal(report.summary.totalCases, 14);
  assert.equal(report.summary.failedCases, 0);
  assert.equal(report.cases[2]?.id, "routing_advisory_owner_dispatch");
});
