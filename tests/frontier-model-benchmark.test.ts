import test from "node:test";
import assert from "node:assert/strict";
import {
  detectConfiguredDefaultModel,
  renderFrontierModelBenchmarkMarkdown,
  runFrontierModelBenchmark
} from "../src/evals/frontier-model-benchmark.ts";

test("detectConfiguredDefaultModel reads the configured model from codex config source", async () => {
  const model = await detectConfiguredDefaultModel({
    configSource: 'model = "gpt-5.4"\nmodel_reasoning_effort = "medium"\n'
  });

  assert.equal(model, "gpt-5.4");
});

test("runFrontierModelBenchmark anchors on SWE-Bench Pro public and marks the configured default model", async () => {
  const report = await runFrontierModelBenchmark({
    configSource: 'model = "gpt-5.4"\n'
  });

  assert.equal(report.benchmark.id, "swe_bench_pro_public");
  assert.equal(report.defaultModel.id, "gpt-5.4");
  assert.equal(report.defaultModel.score?.benchmarkScore, 57.7);
  assert.equal(report.ranking[0]?.id, "claude-opus-4.7");
  assert.equal(report.ranking.find((entry) => entry.id === "gpt-5.4")?.isConfiguredDefault, true);
  assert.match(report.benchmark.contaminationNote, /memorization|contamination/i);
});

test("renderFrontierModelBenchmarkMarkdown produces a publishable report with source links and benchmark caveats", async () => {
  const markdown = renderFrontierModelBenchmarkMarkdown(
    await runFrontierModelBenchmark({
      configSource: 'model = "gpt-5.4"\n'
    })
  );

  assert.match(markdown, /# Frontier Model Benchmark/);
  assert.match(markdown, /SWE-Bench Pro \(Public\)/);
  assert.match(markdown, /Configured default model: `gpt-5\.4`/);
  assert.match(markdown, /\| Rank \| Model \| Score \| Delta vs default \| Source \|/);
  assert.match(markdown, /https:\/\/openai\.com\/index\/introducing-gpt-5-5\//);
});
