import type {
  ApprovalRecord,
  HandoffRecord,
  ReasoningWorkflowMode,
  ReviewRecord,
  RoutingRecommendationReport,
  SearchMemoryResult,
  RunStatusSnapshot,
  RecoveryInspectionReport
} from "../domain/types.ts";
import type { OperatorStatusReport } from "./status.ts";
import { assessPlanReasoning, assessTaskPacketReasoning } from "../core/reasoning-quality.ts";
import type { ReasoningQualityAssessment } from "../core/reasoning-quality.ts";

type TimelineAuthority = "runtime_authoritative" | "derived_only";

export interface RunEvidenceTaskReport {
  taskId: string;
  title: string;
  status: string;
  ownerRole: string;
  claimedBy?: string | undefined;
  updatedAt: string;
  dependencies: string[];
  allowedWriteScope: string[];
  handoffCount: number;
  reviewCount: number;
  approvalCount: number;
  latestHandoffAt?: string | undefined;
  latestReviewAt?: string | undefined;
  latestApprovalAt?: string | undefined;
  reasoningMode: ReasoningWorkflowMode;
  reasoningVerdictStatus?: string | undefined;
  reasoningQuality: ReasoningQualityAssessment;
}

export interface RunEvidenceTimelineEntry {
  authorityLabel: TimelineAuthority;
  at: string;
  kind:
    | "run_created"
    | "plan_created"
    | "task_created"
    | "task_updated"
    | "handoff_recorded"
    | "review_recorded"
    | "approval_recorded"
    | "loop_execution_recorded"
    | "recovery_issue_observed";
  taskId?: string | undefined;
  title: string;
  detail: string[];
}

export interface RunEvidenceLoopHistoryEntry {
  authorityLabel: "runtime_authoritative";
  at: string;
  taskId?: string | undefined;
  directiveKind: string;
  outcome: string;
  nextDirectiveKind?: string | undefined;
  actor?: string | undefined;
  reviewRole?: string | undefined;
  title: string;
  detail: string[];
  citation: string;
}

export interface RunEvidenceReport {
  authorityLabel: "derived_only";
  generatedAt: string;
  runId: string;
  status: OperatorStatusReport;
  routing: RoutingRecommendationReport;
  recovery: RecoveryInspectionReport;
  plan?: {
    title: string;
    createdAt: string;
    milestones: string[];
    decisions: string[];
    acceptanceCriteria: string[];
  } | undefined;
  tasks: RunEvidenceTaskReport[];
  reasoningQuality: {
    authorityLabel: "derived_only";
    status: "pass" | "warn";
    warningCount: number;
    plan: ReasoningQualityAssessment;
    legacyTaskIds: string[];
    dualTaskIds: string[];
    strictTaskIds: string[];
    taskIdsWithWarnings: string[];
    warnings: string[];
  };
  loopHistory: RunEvidenceLoopHistoryEntry[];
  timeline: RunEvidenceTimelineEntry[];
  summary: {
    totalTasks: number;
    totalHandoffs: number;
    totalReviews: number;
    totalApprovals: number;
    totalLoopExecutions: number;
    reviewBlockedTaskIds: string[];
    inProgressTaskIds: string[];
  };
}

export function buildRunEvidenceReport(input: {
  snapshot: RunStatusSnapshot;
  status: OperatorStatusReport;
  routing: RoutingRecommendationReport;
  recovery: RecoveryInspectionReport;
  handoffsByTask: Record<string, HandoffRecord[]>;
  reviewsByTask: Record<string, ReviewRecord[]>;
  approvalsByTask: Record<string, ApprovalRecord[]>;
  loopHistoryResults?: readonly SearchMemoryResult[] | undefined;
  now?: string | undefined;
}): RunEvidenceReport {
  const tasks = input.snapshot.tasks.map((task) => {
    const handoffs = input.handoffsByTask[task.packet.taskId] ?? [];
    const reviews = input.reviewsByTask[task.packet.taskId] ?? [];
    const approvals = input.approvalsByTask[task.packet.taskId] ?? [];
    const reasoningQuality = assessTaskPacketReasoning(task.packet);

    return {
      taskId: task.packet.taskId,
      title: task.packet.title,
      status: task.status,
      ownerRole: task.packet.ownerRole,
      claimedBy: task.claimedBy,
      updatedAt: task.updatedAt,
      dependencies: [...task.packet.dependencies],
      allowedWriteScope: [...task.packet.allowedWriteScope],
      handoffCount: handoffs.length,
      reviewCount: reviews.length,
      approvalCount: approvals.length,
      latestHandoffAt: latestCreatedAt(handoffs),
      latestReviewAt: latestCreatedAt(reviews),
      latestApprovalAt: latestCreatedAt(approvals),
      reasoningMode: reasoningQuality.mode,
      reasoningVerdictStatus: reasoningQuality.verdictStatus,
      reasoningQuality
    };
  });

  const planReasoning = assessPlanReasoning(input.snapshot.plan?.content);
  const reasoningWarnings = [
    ...planReasoning.warnings.map((warning) => `plan: ${warning.message}`),
    ...tasks.flatMap((task) =>
      task.reasoningQuality.warnings.map((warning) => `${task.taskId}: ${warning.message}`)
    )
  ];

  const loopHistory = buildLoopHistory(input.loopHistoryResults ?? []);
  const timeline = buildTimeline({
    snapshot: input.snapshot,
    recovery: input.recovery,
    handoffsByTask: input.handoffsByTask,
    reviewsByTask: input.reviewsByTask,
    approvalsByTask: input.approvalsByTask,
    loopHistory
  });

  const totalHandoffs = sumCounts(tasks.map((task) => task.handoffCount));
  const totalReviews = sumCounts(tasks.map((task) => task.reviewCount));
  const totalApprovals = sumCounts(tasks.map((task) => task.approvalCount));

  return {
    authorityLabel: "derived_only",
    generatedAt: input.now ?? new Date().toISOString(),
    runId: input.snapshot.run.id,
    status: input.status,
    routing: input.routing,
    recovery: input.recovery,
    plan: input.snapshot.plan
      ? {
          title: input.snapshot.plan.title,
          createdAt: input.snapshot.plan.createdAt,
          milestones: [...input.snapshot.plan.content.milestones],
          decisions: [...input.snapshot.plan.content.decisions],
          acceptanceCriteria: [...input.snapshot.plan.content.acceptanceCriteria]
        }
      : undefined,
    tasks,
    reasoningQuality: {
      authorityLabel: "derived_only",
      status: reasoningWarnings.length > 0 ? "warn" : "pass",
      warningCount: reasoningWarnings.length,
      plan: planReasoning,
      legacyTaskIds: tasks.filter((task) => task.reasoningMode === "legacy").map((task) => task.taskId),
      dualTaskIds: tasks.filter((task) => task.reasoningMode === "dual").map((task) => task.taskId),
      strictTaskIds: tasks.filter((task) => task.reasoningMode === "strict").map((task) => task.taskId),
      taskIdsWithWarnings: tasks
        .filter((task) => task.reasoningQuality.status === "warn")
        .map((task) => task.taskId),
      warnings: reasoningWarnings
    },
    loopHistory,
    timeline,
    summary: {
      totalTasks: tasks.length,
      totalHandoffs,
      totalReviews,
      totalApprovals,
      totalLoopExecutions: loopHistory.length,
      reviewBlockedTaskIds: tasks
        .filter((task) => task.status === "review_blocked")
        .map((task) => task.taskId),
      inProgressTaskIds: tasks
        .filter((task) => task.status === "in_progress")
        .map((task) => task.taskId)
    }
  };
}

export function formatRunEvidenceReportMarkdown(report: RunEvidenceReport): string {
  const lines: string[] = [];
  lines.push(`# devgod run report`);
  lines.push("");
  lines.push(`- run: \`${report.runId}\``);
  lines.push(`- generated: \`${report.generatedAt}\``);
  lines.push(`- status: \`${report.status.run.status}\``);
  lines.push(`- tasks: ${report.summary.totalTasks}`);
  lines.push(`- handoffs: ${report.summary.totalHandoffs}`);
  lines.push(`- reviews: ${report.summary.totalReviews}`);
  lines.push(`- approvals: ${report.summary.totalApprovals}`);
  lines.push(`- loop executions: ${report.summary.totalLoopExecutions}`);
  lines.push(`- recovery issues: ${report.recovery.summary.totalIssues}`);
  lines.push(`- reasoning-quality: ${report.reasoningQuality.status} (${report.reasoningQuality.warningCount} warnings)`);
  lines.push("");

  if (report.plan) {
    lines.push(`## Plan`);
    lines.push("");
    lines.push(`- title: ${report.plan.title}`);
    lines.push(`- created: \`${report.plan.createdAt}\``);
    if (report.plan.milestones.length > 0) {
      lines.push(`- milestones: ${report.plan.milestones.join("; ")}`);
    }
    if (report.plan.decisions.length > 0) {
      lines.push(`- decisions: ${report.plan.decisions.join("; ")}`);
    }
    lines.push("");
  }

  lines.push(`## Tasks`);
  lines.push("");
  for (const task of report.tasks) {
    lines.push(
      `- \`${task.taskId}\` ${task.status} owner=${task.ownerRole} handoffs=${task.handoffCount} reviews=${task.reviewCount} approvals=${task.approvalCount} reasoning=${task.reasoningQuality.status}/${task.reasoningMode}${task.reasoningVerdictStatus ? ` verdict=${task.reasoningVerdictStatus}` : ""}`
    );
  }
  lines.push("");

  lines.push(`## Reasoning Quality`);
  lines.push("");
  lines.push(`- legacy tasks: ${report.reasoningQuality.legacyTaskIds.join(", ") || "none"}`);
  lines.push(`- dual tasks: ${report.reasoningQuality.dualTaskIds.join(", ") || "none"}`);
  lines.push(`- strict tasks: ${report.reasoningQuality.strictTaskIds.join(", ") || "none"}`);
  if (report.reasoningQuality.warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of report.reasoningQuality.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push("");

  lines.push(`## Alerts`);
  lines.push("");
  if (report.recovery.issues.length === 0 && report.status.orchestration.blockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of report.status.orchestration.blockers) {
      lines.push(`- blocker: ${blocker}`);
    }
    for (const issue of report.recovery.issues) {
      lines.push(`- recovery:${issue.kind}: ${(issue.taskId ?? issue.lockTaskId ?? issue.id)}`);
    }
  }
  lines.push("");

  lines.push(`## Loop History`);
  lines.push("");
  if (report.loopHistory.length === 0) {
    lines.push("- none");
  } else {
    for (const entry of report.loopHistory) {
      const taskLabel = entry.taskId ? ` task=\`${entry.taskId}\`` : "";
      lines.push(
        `- \`${entry.at}\`${taskLabel} ${entry.directiveKind}/${entry.outcome} next=${entry.nextDirectiveKind ?? "unknown"}`
      );
    }
  }
  lines.push("");

  lines.push(`## Timeline`);
  lines.push("");
  for (const entry of report.timeline) {
    const taskLabel = entry.taskId ? ` task=\`${entry.taskId}\`` : "";
    lines.push(`- \`${entry.at}\` ${entry.kind}${taskLabel}: ${entry.title}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function buildTimeline(input: {
  snapshot: RunStatusSnapshot;
  recovery: RecoveryInspectionReport;
  handoffsByTask: Record<string, HandoffRecord[]>;
  reviewsByTask: Record<string, ReviewRecord[]>;
  approvalsByTask: Record<string, ApprovalRecord[]>;
  loopHistory: readonly RunEvidenceLoopHistoryEntry[];
}): RunEvidenceTimelineEntry[] {
  const events: RunEvidenceTimelineEntry[] = [
    {
      authorityLabel: "runtime_authoritative",
      at: input.snapshot.run.createdAt,
      kind: "run_created",
      title: input.snapshot.run.title,
      detail: [input.snapshot.run.status, input.snapshot.run.actor]
    }
  ];

  if (input.snapshot.plan) {
    events.push({
      authorityLabel: "runtime_authoritative",
      at: input.snapshot.plan.createdAt,
      kind: "plan_created",
      title: input.snapshot.plan.title,
      detail: [...input.snapshot.plan.content.milestones]
    });
  }

  for (const task of input.snapshot.tasks) {
    events.push({
      authorityLabel: "runtime_authoritative",
      at: task.createdAt,
      kind: "task_created",
      taskId: task.packet.taskId,
      title: task.packet.title,
      detail: [`owner=${task.packet.ownerRole}`, `status=${task.status}`]
    });

    if (task.updatedAt !== task.createdAt) {
      events.push({
        authorityLabel: "runtime_authoritative",
        at: task.updatedAt,
        kind: "task_updated",
        taskId: task.packet.taskId,
        title: `${task.packet.taskId} updated`,
        detail: [`status=${task.status}`, task.claimedBy ? `claimedBy=${task.claimedBy}` : "claimedBy=none"]
      });
    }

    for (const handoff of input.handoffsByTask[task.packet.taskId] ?? []) {
      events.push({
        authorityLabel: "runtime_authoritative",
        at: handoff.createdAt,
        kind: "handoff_recorded",
        taskId: task.packet.taskId,
        title: `handoff by ${handoff.actor}`,
        detail: [handoff.ownerRole, handoff.completionStandard]
      });
    }

    for (const review of input.reviewsByTask[task.packet.taskId] ?? []) {
      events.push({
        authorityLabel: "runtime_authoritative",
        at: review.createdAt,
        kind: "review_recorded",
        taskId: task.packet.taskId,
        title: `${review.reviewerRole} ${review.state}`,
        detail: [review.actor, review.identityAssurance]
      });
    }

    for (const approval of input.approvalsByTask[task.packet.taskId] ?? []) {
      events.push({
        authorityLabel: "runtime_authoritative",
        at: approval.createdAt,
        kind: "approval_recorded",
        taskId: task.packet.taskId,
        title: `${approval.decision} by ${approval.actor}`,
        detail: [approval.actorRole, approval.identityAssurance]
      });
    }
  }

  for (const entry of input.loopHistory) {
    events.push({
      authorityLabel: entry.authorityLabel,
      at: entry.at,
      kind: "loop_execution_recorded",
      taskId: entry.taskId,
      title: entry.title,
      detail: [
        `directive=${entry.directiveKind}`,
        `outcome=${entry.outcome}`,
        ...(entry.nextDirectiveKind ? [`next=${entry.nextDirectiveKind}`] : []),
        ...entry.detail
      ]
    });
  }

  for (const issue of input.recovery.issues) {
    events.push({
      authorityLabel: "derived_only",
      at: input.snapshot.run.updatedAt,
      kind: "recovery_issue_observed",
      taskId: issue.taskId,
      title: issue.kind,
      detail: [...issue.details]
    });
  }

  return events.sort((left, right) => left.at.localeCompare(right.at));
}

function buildLoopHistory(results: readonly SearchMemoryResult[]): RunEvidenceLoopHistoryEntry[] {
  const entries: RunEvidenceLoopHistoryEntry[] = [];

  for (const result of results) {
    const directiveKind = readTaggedValue(result, "directive:");
    const outcome = readTaggedValue(result, "outcome:");
    if (!directiveKind || !outcome) {
      continue;
    }

    entries.push({
      authorityLabel: "runtime_authoritative",
      at: result.provenance.createdAt,
      taskId: readTaggedValue(result, "task:") ?? result.provenance.taskId,
      directiveKind,
      outcome,
      nextDirectiveKind: readTaggedValue(result, "next:"),
      actor: readTaggedValue(result, "actor:"),
      reviewRole: readTaggedValue(result, "reviewRole:"),
      title: result.title,
      detail: result.content
        .split("\n")
        .filter((line) => line.startsWith("evidence="))
        .map((line) => line.slice("evidence=".length)),
      citation: result.citation.canonicalRef
    });
  }

  return entries.sort((left, right) => left.at.localeCompare(right.at));
}

function readTaggedValue(result: SearchMemoryResult, prefix: string): string | undefined {
  const tag = result.metadata.tags.find((candidate) => candidate.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : undefined;
}

function latestCreatedAt(records: ReadonlyArray<{ createdAt: string }>): string | undefined {
  return records
    .map((record) => record.createdAt)
    .sort((left, right) => right.localeCompare(left))[0];
}

function sumCounts(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
