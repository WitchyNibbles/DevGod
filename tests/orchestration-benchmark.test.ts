import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderOrchestrationBenchmarkMarkdown,
  runOrchestrationBenchmark
} from "../src/evals/orchestration-benchmark.ts";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("orchestration benchmark ranks devgod first with repo-verified runtime proof", async () => {
  const report = await runOrchestrationBenchmark();

  assert.equal(report.runtimeProof.totalCases, 8);
  assert.equal(report.runtimeProof.passedCases, 8);
  assert.equal(report.ranking[0]?.id, "devgod");
  assert.equal(report.ranking[0]?.evidenceModel, "repo_verified");
});

test("orchestration benchmark markdown renders a publishable comparison table", async () => {
  const report = await runOrchestrationBenchmark();
  const markdown = renderOrchestrationBenchmarkMarkdown(report);

  assert.match(markdown, /# Orchestration Benchmark/);
  assert.match(markdown, /\| Rank \| System \| Score \|/);
  assert.match(markdown, /\| 1 \| devgod \|/);
});

test("orchestration benchmark report remains json-serializable and markdown-renderable", async () => {
  const jsonReport = JSON.parse(
    JSON.stringify(await runOrchestrationBenchmark())
  ) as Awaited<ReturnType<typeof runOrchestrationBenchmark>>;
  assert.equal(jsonReport.ranking[0]?.id, "devgod");

  const markdownStdout = renderOrchestrationBenchmarkMarkdown(await runOrchestrationBenchmark());
  assert.match(markdownStdout, /# Orchestration Benchmark/);
});
