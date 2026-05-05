import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  parseCoverageReport,
  validatePerFileCoverage,
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

async function listSourceFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentRoot: string): Promise<void> {
    const entries = await readdir(currentRoot, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentRoot, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && absolutePath.endsWith(".ts")) {
        results.push(path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/"));
      }
    }
  }

  await walk(root);
  return results.sort();
}

const thresholds: CoverageThresholds = {
  line: readThreshold("DEVGOD_MIN_LINE_COVERAGE", 100),
  branch: readThreshold("DEVGOD_MIN_BRANCH_COVERAGE", 100),
  funcs: readThreshold("DEVGOD_MIN_FUNCTION_COVERAGE", 100)
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
const report = parseCoverageReport(output);
if (!report.aggregate) {
  throw new Error("Coverage summary not found in test output");
}
const expectedFiles = await listSourceFiles(path.join(repoRoot, "src"));
const failures = validatePerFileCoverage({
  files: report.files.filter((file) => file.file.startsWith("src/")),
  expectedFiles,
  requiredCoverage: thresholds
});
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(
  `src per-file coverage passed; aggregate all-files coverage is lines ${report.aggregate.line.toFixed(2)}%, branches ${report.aggregate.branch.toFixed(2)}%, functions ${report.aggregate.funcs.toFixed(2)}%`
);
