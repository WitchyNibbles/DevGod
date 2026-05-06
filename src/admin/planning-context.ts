import type { RetrievalRole, SearchMemoryResult } from "../domain/types.ts";

export interface PlanningContextItem {
  id: string;
  title: string;
  score: number;
  scope: string;
  authority: string;
  citation: string;
  freshness: string;
  preview: string;
  tags: string[];
  conflictDetected: boolean;
}

export interface PlanningContextReport {
  authorityLabel: "derived_only";
  query: string;
  requesterRole: RetrievalRole;
  totalResults: number;
  summary: string[];
  items: PlanningContextItem[];
}

export function buildPlanningContextReport(input: {
  query: string;
  requesterRole: RetrievalRole;
  results: readonly SearchMemoryResult[];
}): PlanningContextReport {
  const items = input.results.map((result) => ({
    id: result.id,
    title: result.title,
    score: Number(result.score.toFixed(2)),
    scope: result.scope,
    authority: `${result.authority.source}:${result.authority.precedence}`,
    citation: result.citation.canonicalRef,
    freshness: result.freshness.status,
    preview: summarize(result.content),
    tags: [...result.metadata.tags],
    conflictDetected: result.conflict.detected
  }));

  const summary = items.slice(0, 5).map((item) => {
    const conflict = item.conflictDetected ? " conflict" : "";
    return `${item.title} (${item.authority}, ${item.freshness}${conflict})`;
  });

  return {
    authorityLabel: "derived_only",
    query: input.query,
    requesterRole: input.requesterRole,
    totalResults: items.length,
    summary,
    items
  };
}

export function formatPlanningContextReportMarkdown(report: PlanningContextReport): string {
  const lines: string[] = [];
  lines.push(`# devgod planning context`);
  lines.push("");
  lines.push(`- query: ${report.query}`);
  lines.push(`- role: \`${report.requesterRole}\``);
  lines.push(`- results: ${report.totalResults}`);
  lines.push("");
  if (report.summary.length > 0) {
    lines.push(`## Summary`);
    lines.push("");
    for (const item of report.summary) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  lines.push(`## Items`);
  lines.push("");
  for (const item of report.items) {
    lines.push(`- ${item.title}`);
    lines.push(`  citation: ${item.citation}`);
    lines.push(`  authority: ${item.authority}`);
    lines.push(`  freshness: ${item.freshness}`);
    lines.push(`  preview: ${item.preview}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function summarize(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}
