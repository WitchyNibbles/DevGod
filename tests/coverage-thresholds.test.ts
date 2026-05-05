import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCoverageReport,
  parseCoverageSummary,
  validateCoverageThresholds,
  validatePerFileCoverage
} from "../src/runtime/coverage-thresholds.ts";

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

test("parseCoverageReport extracts src file rows and ignores directory rows", () => {
  const report = parseCoverageReport(`
# start of coverage report
# -------------------------------------------------------------------
# file                             | line % | branch % | funcs % | uncovered lines
# -------------------------------------------------------------------
# src                              |        |          |         |
#  admin.ts                        | 100.00 |   100.00 |  100.00 |
#  install                         |        |          |         |
#   cli.ts                         |  98.50 |    97.00 |  100.00 | 12-14
# tests                            |        |          |         |
#  admin.test.ts                   | 100.00 |   100.00 |  100.00 |
# -------------------------------------------------------------------
# all files                        |  99.12 |    98.50 |  100.00 |
# -------------------------------------------------------------------
# end of coverage report
`);

  assert.deepEqual(report.aggregate, {
    line: 99.12,
    branch: 98.5,
    funcs: 100
  });
  assert.deepEqual(report.files, [
    {
      file: "src/admin.ts",
      line: 100,
      branch: 100,
      funcs: 100
    },
    {
      file: "src/install/cli.ts",
      line: 98.5,
      branch: 97,
      funcs: 100
    },
    {
      file: "tests/admin.test.ts",
      line: 100,
      branch: 100,
      funcs: 100
    }
  ]);
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

test("validatePerFileCoverage reports missing files and per-dimension failures", () => {
  const failures = validatePerFileCoverage({
    files: [
      {
        file: "src/admin.ts",
        line: 100,
        branch: 99.99,
        funcs: 100
      },
      {
        file: "src/install/cli.ts",
        line: 100,
        branch: 100,
        funcs: 100
      }
    ],
    expectedFiles: ["src/admin.ts", "src/core/service.ts"],
    requiredCoverage: {
      line: 100,
      branch: 100,
      funcs: 100
    }
  });

  assert.deepEqual(failures, [
    "src/admin.ts branch coverage 99.99% is below 100.00%",
    "missing coverage for src/core/service.ts"
  ]);
});

test("validatePerFileCoverage reports line and function failures independently", () => {
  const failures = validatePerFileCoverage({
    files: [
      {
        file: "src/admin.ts",
        line: 99.99,
        branch: 100,
        funcs: 99.5
      }
    ],
    expectedFiles: ["src/admin.ts"],
    requiredCoverage: {
      line: 100,
      branch: 100,
      funcs: 100
    }
  });

  assert.deepEqual(failures, [
    "src/admin.ts line coverage 99.99% is below 100.00%",
    "src/admin.ts function coverage 99.50% is below 100.00%"
  ]);
});
