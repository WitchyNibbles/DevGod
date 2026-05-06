import type {
  RecoveryInspectionReport,
  RoutingRecommendationReport
} from "../domain/types.ts";
import type { OperatorStatusReport } from "./status.ts";

export interface OperatorDashboardReport {
  authorityLabel: "derived_only";
  runId: string;
  status: OperatorStatusReport;
  routing: RoutingRecommendationReport;
  recovery: RecoveryInspectionReport;
  alerts: string[];
  nextActions: string[];
}

export function buildOperatorDashboardReport(input: {
  status: OperatorStatusReport;
  routing: RoutingRecommendationReport;
  recovery: RecoveryInspectionReport;
}): OperatorDashboardReport {
  const alerts: string[] = [];
  const nextActions: string[] = [];

  if (!input.status.reviewIdentity.liveTrustReady) {
    alerts.push(`review identity not live-ready: ${input.status.reviewIdentity.notes.join("; ")}`);
  }

  for (const issue of input.recovery.issues) {
    if (issue.kind === "stalled_task") {
      alerts.push(`stalled task: ${issue.taskId}`);
    }
    if (issue.kind === "stale_review_block") {
      alerts.push(`stale review queue: ${issue.taskId}`);
    }
    if (issue.kind === "stale_approval") {
      alerts.push(`stale approval: ${issue.taskId}`);
    }
    if (issue.kind === "orphan_lock") {
      alerts.push(`orphan lock: ${issue.lockTaskId}`);
    }
  }

  for (const recommendation of input.routing.recommendations) {
    if (recommendation.recommendation === "owner_dispatch" && recommendation.targetRole) {
      nextActions.push(`route ${recommendation.taskId} to ${recommendation.targetRole}`);
    }

    if (recommendation.recommendation === "review_dispatch" && recommendation.targetReviewRole) {
      nextActions.push(`request ${recommendation.targetReviewRole} for ${recommendation.taskId}`);
    }
  }

  for (const action of input.recovery.actions.filter((entry) => entry.safeToApply)) {
    nextActions.push(`recover ${action.id}`);
  }

  return {
    authorityLabel: "derived_only",
    runId: input.status.run.id,
    status: input.status,
    routing: input.routing,
    recovery: input.recovery,
    alerts: unique(alerts),
    nextActions: unique(nextActions)
  };
}

export function formatOperatorDashboardReport(report: OperatorDashboardReport): string {
  const lines: string[] = [];
  lines.push(`Run ${report.runId}`);
  lines.push(`status: ${report.status.run.status}`);
  lines.push(
    `tasks: ready=${report.status.run.taskCounts.ready} in_progress=${report.status.run.taskCounts.in_progress} review_blocked=${report.status.run.taskCounts.review_blocked} approved=${report.status.run.taskCounts.approved} done=${report.status.run.taskCounts.done} blocked=${report.status.run.taskCounts.blocked}`
  );
  lines.push(
    `review-identity: ${report.status.reviewIdentity.liveTrustReady ? "live-ready" : "not-ready"}`
  );
  if (report.status.reviewIdentity.selectedBackend) {
    lines.push(`review-backend: ${report.status.reviewIdentity.selectedBackend}`);
  }
  if (report.status.reviewIdentity.availableBackends.length > 0) {
    lines.push(`available-backends: ${report.status.reviewIdentity.availableBackends.join(", ")}`);
  }
  lines.push(`recovery-issues: ${report.recovery.summary.totalIssues}`);
  lines.push(`safe-recovery-actions: ${report.recovery.summary.safeActions}`);
  lines.push(`next-ready: ${report.status.orchestration.nextTaskIds.join(", ") || "none"}`);

  if (report.alerts.length > 0) {
    lines.push("alerts:");
    for (const alert of report.alerts) {
      lines.push(`- ${alert}`);
    }
  }

  if (report.nextActions.length > 0) {
    lines.push("next-actions:");
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}
