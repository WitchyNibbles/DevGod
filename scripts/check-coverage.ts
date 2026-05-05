import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  parseCoverageSummary,
  validateCoverageThresholds,
  type CoverageThresholds
} from "../src/runtime/coverage-thresholds.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${name} must be a number between 0 and 100`);
  }

  return parsed;
}

const thresholds: CoverageThresholds = {
  line: readThreshold("DEVGOD_MIN_LINE_COVERAGE", 85),
  branch: readThreshold("DEVGOD_MIN_BRANCH_COVERAGE", 80),
  funcs: readThreshold("DEVGOD_MIN_FUNCTION_COVERAGE", 85)
};

const command =
  "node --experimental-strip-types --test --experimental-test-coverage tests/*.test.ts";
const result = spawnSync("bash", ["-lc", command], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const summary = parseCoverageSummary(output);
if (!summary) {
  throw new Error("Coverage summary not found in test output");
}

const failures = validateCoverageThresholds(summary, thresholds);
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(
  `coverage thresholds passed: lines ${summary.line.toFixed(2)}%, branches ${summary.branch.toFixed(2)}%, functions ${summary.funcs.toFixed(2)}%`
);
