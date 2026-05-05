import test from "node:test";
import assert from "node:assert/strict";
import { parseCoverageSummary, validateCoverageThresholds } from "../src/runtime/coverage-thresholds.ts";

test("parseCoverageSummary extracts the aggregate coverage row", () => {
  const summary = parseCoverageSummary(`
# end of prior output
# all files                        |  89.30 |    77.80 |   87.55 | 
# -----------------------------------------------------------------
`);

  assert.deepEqual(summary, {
    line: 89.3,
    branch: 77.8,
    funcs: 87.55
  });
});

test("parseCoverageSummary returns null when the aggregate row is missing", () => {
  const summary = parseCoverageSummary("# no aggregate coverage row present");

  assert.equal(summary, null);
});

test("validateCoverageThresholds reports only the failing dimensions", () => {
  const failures = validateCoverageThresholds(
    {
      line: 84.99,
      branch: 74.99,
      funcs: 85
    },
    {
      line: 85,
      branch: 75,
      funcs: 85
    }
  );

  assert.deepEqual(failures, [
    "line coverage 84.99% is below 85.00%",
    "branch coverage 74.99% is below 75.00%"
  ]);
});

test("validateCoverageThresholds reports function failures and accepts passing summaries", () => {
  const failing = validateCoverageThresholds(
    {
      line: 85,
      branch: 75,
      funcs: 84.99
    },
    {
      line: 85,
      branch: 75,
      funcs: 85
    }
  );

  assert.deepEqual(failing, ["function coverage 84.99% is below 85.00%"]);

  const passing = validateCoverageThresholds(
    {
      line: 85.5,
      branch: 80,
      funcs: 90
    },
    {
      line: 85,
      branch: 75,
      funcs: 85
    }
  );

  assert.deepEqual(passing, []);
});
