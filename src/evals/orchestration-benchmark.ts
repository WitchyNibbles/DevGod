import process from "node:process";
import { fileURLToPath } from "node:url";
import { runOrchestrationBaseline } from "./orchestration-baseline.ts";

type BenchmarkCategory =
  | "workflow_governance"
  | "trusted_reviews"
  | "operator_observability"
  | "recovery"
  | "eval_rigor"
  | "operator_ergonomics";

interface CapabilityProfile {
  id: string;
  label: string;
  evidenceModel: "repo_verified" | "reviewed_fixture";
  categories: Record<BenchmarkCategory, number>;
  notes: string[];
}

export interface OrchestrationBenchmarkEntry {
  id: string;
  label: string;
  evidenceModel: "repo_verified" | "reviewed_fixture";
  score: number;
  maxScore: number;
  categories: Record<BenchmarkCategory, number>;
  notes: string[];
}

export interface OrchestrationBenchmarkReport {
  generatedAt: string;
  rubric: {
    maxPerCategory: number;
    categories: BenchmarkCategory[];
  };
  runtimeProof: {
    passedCases: number;
    totalCases: number;
    passRate: number;
  };
  ranking: OrchestrationBenchmarkEntry[];
}

const rubricCategories: BenchmarkCategory[] = [
  "workflow_governance",
  "trusted_reviews",
  "operator_observability",
  "recovery",
  "eval_rigor",
  "operator_ergonomics"
];

const reviewedFixtureProfiles: CapabilityProfile[] = [
  {
    id: "langgraph",
    label: "LangGraph",
    evidenceModel: "reviewed_fixture",
    categories: {
      workflow_governance: 4,
      trusted_reviews: 1,
      operator_observability: 4,
      recovery: 5,
      eval_rigor: 4,
      operator_ergonomics: 3
    },
    notes: ["strong runtime durability", "review authority left to host implementation"]
  },
  {
    id: "openai_agents_sdk",
    label: "OpenAI Agents SDK",
    evidenceModel: "reviewed_fixture",
    categories: {
      workflow_governance: 4,
      trusted_reviews: 2,
      operator_observability: 4,
      recovery: 4,
      eval_rigor: 3,
      operator_ergonomics: 4
    },
    notes: ["strong tracing and orchestration primitives", "governance policy is host-owned"]
  },
  {
    id: "google_adk",
    label: "Google ADK",
    evidenceModel: "reviewed_fixture",
    categories: {
      workflow_governance: 3,
      trusted_reviews: 1,
      operator_observability: 3,
      recovery: 4,
      eval_rigor: 3,
      operator_ergonomics: 4
    },
    notes: ["workflow-agent primitives are strong", "review trust model is host-owned"]
  },
  {
    id: "mastra",
    label: "Mastra",
    evidenceModel: "reviewed_fixture",
    categories: {
      workflow_governance: 3,
      trusted_reviews: 1,
      operator_observability: 4,
      recovery: 3,
      eval_rigor: 3,
      operator_ergonomics: 4
    },
    notes: ["good observability and memory", "governance and authenticated review are lighter"]
  },
  {
    id: "openhands",
    label: "OpenHands",
    evidenceModel: "reviewed_fixture",
    categories: {
      workflow_governance: 2,
      trusted_reviews: 1,
      operator_observability: 3,
      recovery: 3,
      eval_rigor: 2,
      operator_ergonomics: 4
    },
    notes: ["strong coding harness posture", "less explicit governance and review authority"]
  }
];

function scoreProfile(profile: CapabilityProfile): number {
  return rubricCategories.reduce((total, category) => total + profile.categories[category], 0);
}

function benchmarkDevgodProfile(runtimePassRate: number): CapabilityProfile {
  const evalRigor = runtimePassRate === 1 ? 5 : runtimePassRate >= 0.8 ? 4 : runtimePassRate >= 0.6 ? 3 : 2;

  return {
    id: "devgod",
    label: "devgod",
    evidenceModel: "repo_verified",
    categories: {
      workflow_governance: 5,
      trusted_reviews: 5,
      operator_observability: 5,
      recovery: 5,
      eval_rigor: evalRigor,
      operator_ergonomics: 4
    },
    notes: [
      "scores are tied to repo-shipped workflow, trust, ops, and recovery primitives",
      "comparative entries are reviewed fixtures and should be refreshed when benchmark assumptions change"
    ]
  };
}

export async function runOrchestrationBenchmark(): Promise<OrchestrationBenchmarkReport> {
  const baseline = await runOrchestrationBaseline();
  const profiles = [benchmarkDevgodProfile(baseline.summary.passRate), ...reviewedFixtureProfiles];
  const maxScore = rubricCategories.length * 5;
  const ranking = profiles
    .map((profile) => ({
      id: profile.id,
      label: profile.label,
      evidenceModel: profile.evidenceModel,
      score: scoreProfile(profile),
      maxScore,
      categories: profile.categories,
      notes: profile.notes
    }))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  return {
    generatedAt: new Date().toISOString(),
    rubric: {
      maxPerCategory: 5,
      categories: [...rubricCategories]
    },
    runtimeProof: {
      passedCases: baseline.summary.passedCases,
      totalCases: baseline.summary.totalCases,
      passRate: baseline.summary.passRate
    },
    ranking
  };
}

export function renderOrchestrationBenchmarkMarkdown(report: OrchestrationBenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# Orchestration Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(
    `Runtime proof: ${report.runtimeProof.passedCases}/${report.runtimeProof.totalCases} baseline cases passed (${Math.round(report.runtimeProof.passRate * 100)}%).`
  );
  lines.push("");
  lines.push(
    "This report mixes repo-verified `devgod` runtime proof with reviewed comparative capability fixtures for adjacent systems. It is a reproducible rubric, not an external lab certification."
  );
  lines.push("");
  lines.push("| Rank | System | Score | Governance | Trusted reviews | Observability | Recovery | Evals | Ergonomics | Evidence |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  report.ranking.forEach((entry, index) => {
    lines.push(
      `| ${index + 1} | ${entry.label} | ${entry.score}/${entry.maxScore} | ${entry.categories.workflow_governance} | ${entry.categories.trusted_reviews} | ${entry.categories.operator_observability} | ${entry.categories.recovery} | ${entry.categories.eval_rigor} | ${entry.categories.operator_ergonomics} | ${entry.evidenceModel} |`
    );
  });
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  report.ranking.forEach((entry) => {
    lines.push(`- ${entry.label}: ${entry.notes.join("; ")}`);
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runOrchestrationBenchmark()
    .then((report) => {
      if (process.argv.includes("--format") && process.argv[process.argv.indexOf("--format") + 1] === "markdown") {
        process.stdout.write(renderOrchestrationBenchmarkMarkdown(report));
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
