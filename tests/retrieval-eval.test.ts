import test from "node:test";
import assert from "node:assert/strict";
import { runRetrievalMemoryBaseline } from "../src/index.ts";

test("retrieval memory baseline passes all seeded cases", async () => {
  const report = await runRetrievalMemoryBaseline();

  assert.equal(report.summary.totalCases, 7);
  assert.equal(report.summary.failedCases, 0);
  assert.equal(report.summary.passedCases, 7);
  assert.equal(report.summary.passRate, 1);
});

test("retrieval memory baseline returns per-case results", async () => {
  const report = await runRetrievalMemoryBaseline();

  const caseIds = report.cases.map((testCase) => testCase.id);
  assert.deepEqual(caseIds, [
    "project_recall_precision",
    "project_provenance_present",
    "project_citation_present",
    "global_redaction",
    "freshness_fresh_status",
    "freshness_stale_status",
    "conflict_candidates_visible"
  ]);
});
