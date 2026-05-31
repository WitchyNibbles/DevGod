
> devgod@0.1.0 benchmark:frontier-models
> node --experimental-strip-types src/evals/frontier-model-benchmark.ts --format markdown

# Frontier Model Benchmark

Generated: 2026-05-31T17:38:28.864Z

Configured default model: `gpt-5.4`
Configured in: `.codex/config.toml`
Primary public benchmark: SWE-Bench Pro (Public) (57.7% for the configured default).

- This report is reviewed external evidence, not repo-local runtime proof.
- Scores are vendor-published public benchmark values and may not have been reproduced under a single neutral harness by this repo.
- The report intentionally stores only benchmark metadata and published scores, not benchmark tasks, gold patches, or answer-bearing artifacts.

## Why This Benchmark

- It is the closest public benchmark fit for repo-based, long-horizon software engineering work.
- It is a stronger public choice than SWE-Bench Verified for frontier comparison because Verified now has explicit contamination concerns.
- It measures issue-resolution style work, which is closer to `devgod` than contest-style coding benchmarks.
- Use this as the best available public benchmark, not a clean-room ground truth. The SWE-Bench Pro paper positions the benchmark as contamination-resistant, but OpenAI's April 23, 2026 public comparison table also notes evidence of memorization on the public split.

| Rank | Model | Score | Delta vs default | Source |
| --- | --- | --- | --- | --- |
| 1 | Claude Opus 4.7 | 64.3% | +6.6 pts | [OpenAI GPT-5.5 release comparison table](https://openai.com/index/introducing-gpt-5-5/) |
| 2 | GPT-5.5 | 58.6% | +0.9 pts | [OpenAI GPT-5.5 release](https://openai.com/index/introducing-gpt-5-5/) |
| 3 | GPT-5.4 (configured default) | 57.7% | 0.0 pts | [OpenAI GPT-5.5 release comparison table](https://openai.com/index/introducing-gpt-5-5/) |
| 4 | Gemini 3.1 Pro | 54.2% | -3.5 pts | [Gemini 3.1 Pro model card](https://deepmind.google/models/model-cards/gemini-3-1-pro) |

## Score Notes

- Claude Opus 4.7: Cross-vendor published comparison table. Anthropic's Opus 4.7 release confirms SWE-bench Pro evaluation and memorization screening, but the numeric public-table value here is sourced from OpenAI's published comparison.
- GPT-5.5: Vendor-published score on the public split.
- GPT-5.4: Vendor-published prior-default comparison score on the public split.
- Gemini 3.1 Pro: Vendor-published score on the public split.

## Tracked But Unscored

- Claude Opus 4.8: Anthropic's May 28, 2026 release highlights coding and agentic benchmark gains, but this repo has not pinned an official SWE-Bench Pro (Public) numeric score from that release. Source: [Anthropic Opus 4.8 release](https://www.anthropic.com/news/claude-opus-4-8) (2026-05-28).

## Benchmark Sources

- [SWE-Bench datasets guide](https://www.swebench.com/SWE-bench/guides/datasets/) (2026-05-31): Documents the public SWE-bench dataset variants used for software engineering evaluation.
- [SWE-Bench Pro paper](https://arxiv.org/abs/2509.16941) (2025-09-21): Describes SWE-Bench Pro as a realistic, long-horizon, contamination-resistant software-engineering benchmark.
- [OpenAI on SWE-Bench Verified contamination](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/) (2026-02-18): Explains why older public SWE-Bench Verified is no longer the right primary frontier comparison.
- [OpenAI GPT-5.5 release table](https://openai.com/index/introducing-gpt-5-5/) (2026-04-23): Provides a cross-vendor SWE-Bench Pro (Public) comparison table and notes evidence of memorization on the public split.

