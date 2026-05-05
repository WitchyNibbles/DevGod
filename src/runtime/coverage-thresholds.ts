export interface CoverageSummary {
  line: number;
  branch: number;
  funcs: number;
}

export interface CoverageThresholds {
  line: number;
  branch: number;
  funcs: number;
}

const summaryPattern =
  /# all files\s+\|\s+([0-9]+(?:\.[0-9]+)?)\s+\|\s+([0-9]+(?:\.[0-9]+)?)\s+\|\s+([0-9]+(?:\.[0-9]+)?)/;

export function parseCoverageSummary(output: string): CoverageSummary | null {
  const match = output.match(summaryPattern);
  if (!match) {
    return null;
  }

  const [, line, branch, funcs] = match;
  return {
    line: Number.parseFloat(line),
    branch: Number.parseFloat(branch),
    funcs: Number.parseFloat(funcs)
  };
}

export function validateCoverageThresholds(
  summary: CoverageSummary,
  thresholds: CoverageThresholds
): string[] {
  const failures: string[] = [];

  if (summary.line < thresholds.line) {
    failures.push(`line coverage ${summary.line.toFixed(2)}% is below ${thresholds.line.toFixed(2)}%`);
  }

  if (summary.branch < thresholds.branch) {
    failures.push(`branch coverage ${summary.branch.toFixed(2)}% is below ${thresholds.branch.toFixed(2)}%`);
  }

  if (summary.funcs < thresholds.funcs) {
    failures.push(`function coverage ${summary.funcs.toFixed(2)}% is below ${thresholds.funcs.toFixed(2)}%`);
  }

  return failures;
}
