import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export interface BenchmarkSourceReference {
  label: string;
  url: string;
  publishedAt: string;
  note: string;
}

export interface FrontierBenchmarkScore {
  id: string;
  label: string;
  provider: "OpenAI" | "Anthropic" | "Google";
  benchmarkScore: number;
  source: BenchmarkSourceReference;
  scoreNote: string;
  isConfiguredDefault: boolean;
}

export interface FrontierModelBenchmarkReport {
  generatedAt: string;
  benchmark: {
    id: "swe_bench_pro_public";
    label: "SWE-Bench Pro (Public)";
    whyPrimary: string[];
    contaminationNote: string;
    benchmarkSources: BenchmarkSourceReference[];
  };
  defaultModel: {
    id: string;
    configuredIn: string;
    score: FrontierBenchmarkScore | null;
  };
  ranking: FrontierBenchmarkScore[];
  comparisonNotes: string[];
  trackedButUnscoredModels: Array<{
    id: string;
    label: string;
    note: string;
    source: BenchmarkSourceReference;
  }>;
}

interface RunFrontierModelBenchmarkInput {
  repoRoot?: string;
  configPath?: string;
  configSource?: string;
}

const benchmarkSources: BenchmarkSourceReference[] = [
  {
    label: "SWE-Bench datasets guide",
    url: "https://www.swebench.com/SWE-bench/guides/datasets/",
    publishedAt: "2026-05-31",
    note: "Documents the public SWE-bench dataset variants used for software engineering evaluation."
  },
  {
    label: "SWE-Bench Pro paper",
    url: "https://arxiv.org/abs/2509.16941",
    publishedAt: "2025-09-21",
    note: "Describes SWE-Bench Pro as a realistic, long-horizon, contamination-resistant software-engineering benchmark."
  },
  {
    label: "OpenAI on SWE-Bench Verified contamination",
    url: "https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/",
    publishedAt: "2026-02-18",
    note: "Explains why older public SWE-Bench Verified is no longer the right primary frontier comparison."
  },
  {
    label: "OpenAI GPT-5.5 release table",
    url: "https://openai.com/index/introducing-gpt-5-5/",
    publishedAt: "2026-04-23",
    note: "Provides a cross-vendor SWE-Bench Pro (Public) comparison table and notes evidence of memorization on the public split."
  }
];

const scoreFixtures: Array<Omit<FrontierBenchmarkScore, "isConfiguredDefault">> = [
  {
    id: "claude-opus-4.7",
    label: "Claude Opus 4.7",
    provider: "Anthropic",
    benchmarkScore: 64.3,
    source: {
      label: "OpenAI GPT-5.5 release comparison table",
      url: "https://openai.com/index/introducing-gpt-5-5/",
      publishedAt: "2026-04-23",
      note: "Numeric SWE-Bench Pro (Public) comparison row for Claude Opus 4.7 as reported in OpenAI's release table."
    },
    scoreNote:
      "Cross-vendor published comparison table. Anthropic's Opus 4.7 release confirms SWE-bench Pro evaluation and memorization screening, but the numeric public-table value here is sourced from OpenAI's published comparison."
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "OpenAI",
    benchmarkScore: 58.6,
    source: {
      label: "OpenAI GPT-5.5 release",
      url: "https://openai.com/index/introducing-gpt-5-5/",
      publishedAt: "2026-04-23",
      note: "OpenAI's published SWE-Bench Pro (Public) score for GPT-5.5."
    },
    scoreNote: "Vendor-published score on the public split."
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI",
    benchmarkScore: 57.7,
    source: {
      label: "OpenAI GPT-5.5 release comparison table",
      url: "https://openai.com/index/introducing-gpt-5-5/",
      publishedAt: "2026-04-23",
      note: "OpenAI's published comparison value for GPT-5.4."
    },
    scoreNote: "Vendor-published prior-default comparison score on the public split."
  },
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    provider: "Google",
    benchmarkScore: 54.2,
    source: {
      label: "Gemini 3.1 Pro model card",
      url: "https://deepmind.google/models/model-cards/gemini-3-1-pro",
      publishedAt: "2026-02-19",
      note: "Google model card reports Gemini 3.1 Pro on SWE-Bench Pro (Public)."
    },
    scoreNote: "Vendor-published score on the public split."
  }
];

const trackedButUnscoredModels = [
  {
    id: "claude-opus-4.8",
    label: "Claude Opus 4.8",
    note: "Anthropic's May 28, 2026 release highlights coding and agentic benchmark gains, but this repo has not pinned an official SWE-Bench Pro (Public) numeric score from that release.",
    source: {
      label: "Anthropic Opus 4.8 release",
      url: "https://www.anthropic.com/news/claude-opus-4-8",
      publishedAt: "2026-05-28",
      note: "Release page used to track newer frontier models that are relevant but not yet backed by a pinned score in this report."
    }
  }
] as const;

function resolveRepoRoot(repoRoot?: string): string {
  return repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export async function detectConfiguredDefaultModel(input: RunFrontierModelBenchmarkInput = {}): Promise<string> {
  const source =
    input.configSource ??
    (await readFile(
      input.configPath ?? path.join(resolveRepoRoot(input.repoRoot), ".codex", "config.toml"),
      "utf8"
    ));
  const match = source.match(/^\s*model\s*=\s*"([^"]+)"/m);
  if (!match?.[1]) {
    throw new Error("Could not detect configured default model from codex config");
  }
  return match[1];
}

function buildRanking(defaultModelId: string): FrontierBenchmarkScore[] {
  return scoreFixtures
    .map((entry) => ({
      ...entry,
      isConfiguredDefault: entry.id === defaultModelId
    }))
    .sort((left, right) => right.benchmarkScore - left.benchmarkScore || left.label.localeCompare(right.label));
}

function formatDelta(delta: number): string {
  if (delta === 0) {
    return "0.0 pts";
  }
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`;
}

export async function runFrontierModelBenchmark(
  input: RunFrontierModelBenchmarkInput = {}
): Promise<FrontierModelBenchmarkReport> {
  const defaultModelId = await detectConfiguredDefaultModel(input);
  const ranking = buildRanking(defaultModelId);
  const defaultScore = ranking.find((entry) => entry.id === defaultModelId) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    benchmark: {
      id: "swe_bench_pro_public",
      label: "SWE-Bench Pro (Public)",
      whyPrimary: [
        "It is the closest public benchmark fit for repo-based, long-horizon software engineering work.",
        "It is a stronger public choice than SWE-Bench Verified for frontier comparison because Verified now has explicit contamination concerns.",
        "It measures issue-resolution style work, which is closer to `devgod` than contest-style coding benchmarks."
      ],
      contaminationNote:
        "Use this as the best available public benchmark, not a clean-room ground truth. The SWE-Bench Pro paper positions the benchmark as contamination-resistant, but OpenAI's April 23, 2026 public comparison table also notes evidence of memorization on the public split.",
      benchmarkSources
    },
    defaultModel: {
      id: defaultModelId,
      configuredIn: input.configPath ?? ".codex/config.toml",
      score: defaultScore
    },
    ranking,
    comparisonNotes: [
      "This report is reviewed external evidence, not repo-local runtime proof.",
      "Scores are vendor-published public benchmark values and may not have been reproduced under a single neutral harness by this repo.",
      "The report intentionally stores only benchmark metadata and published scores, not benchmark tasks, gold patches, or answer-bearing artifacts."
    ],
    trackedButUnscoredModels: [...trackedButUnscoredModels]
  };
}

export function renderFrontierModelBenchmarkMarkdown(report: FrontierModelBenchmarkReport): string {
  const defaultScore = report.defaultModel.score;
  const lines: string[] = [];
  lines.push("# Frontier Model Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`Configured default model: \`${report.defaultModel.id}\``);
  lines.push(`Configured in: \`${report.defaultModel.configuredIn}\``);
  lines.push(
    `Primary public benchmark: ${report.benchmark.label}${defaultScore ? ` (${defaultScore.benchmarkScore.toFixed(1)}% for the configured default)` : ""}.`
  );
  lines.push("");
  report.comparisonNotes.forEach((note) => {
    lines.push(`- ${note}`);
  });
  lines.push("");
  lines.push("## Why This Benchmark");
  lines.push("");
  report.benchmark.whyPrimary.forEach((reason) => {
    lines.push(`- ${reason}`);
  });
  lines.push(`- ${report.benchmark.contaminationNote}`);
  lines.push("");
  lines.push("| Rank | Model | Score | Delta vs default | Source |");
  lines.push("| --- | --- | --- | --- | --- |");
  report.ranking.forEach((entry, index) => {
    const delta = defaultScore ? entry.benchmarkScore - defaultScore.benchmarkScore : 0;
    const label = entry.isConfiguredDefault ? `${entry.label} (configured default)` : entry.label;
    lines.push(
      `| ${index + 1} | ${label} | ${entry.benchmarkScore.toFixed(1)}% | ${formatDelta(delta)} | [${entry.source.label}](${entry.source.url}) |`
    );
  });
  lines.push("");
  lines.push("## Score Notes");
  lines.push("");
  report.ranking.forEach((entry) => {
    lines.push(`- ${entry.label}: ${entry.scoreNote}`);
  });
  if (report.trackedButUnscoredModels.length > 0) {
    lines.push("");
    lines.push("## Tracked But Unscored");
    lines.push("");
    report.trackedButUnscoredModels.forEach((entry) => {
      lines.push(`- ${entry.label}: ${entry.note} Source: [${entry.source.label}](${entry.source.url}) (${entry.source.publishedAt}).`);
    });
  }
  lines.push("");
  lines.push("## Benchmark Sources");
  lines.push("");
  report.benchmark.benchmarkSources.forEach((source) => {
    lines.push(`- [${source.label}](${source.url}) (${source.publishedAt}): ${source.note}`);
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runFrontierModelBenchmark()
    .then((report) => {
      if (process.argv.includes("--format") && process.argv[process.argv.indexOf("--format") + 1] === "markdown") {
        process.stdout.write(renderFrontierModelBenchmarkMarkdown(report));
        return;
      }

      console.log(JSON.stringify(report));
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}
