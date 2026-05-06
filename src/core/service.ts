import { randomUUID } from "node:crypto";
import {
  validateReviewAction,
  validateHandoff,
  normalizeIntakeRequest,
  normalizeRetrievalMetadata,
  normalizeSearchInput,
  validateMemoryPromotion,
  validateTaskPacket
} from "../domain/contracts.ts";
import {
  canRoleAccessSearchResult,
  collectUnsatisfiedReviewRoles,
  evaluateReviewDecision,
  findBlockingReasonsForTask,
  findTaskDependencies,
  getRoleRetrievalGuidance
} from "./policy.ts";
import { annotateConflictSignals, isProvenancedSearchResult } from "./search-memory-results.ts";
import type {
  ResolveReviewActionContext,
  ReviewActionContextResolverInput
} from "./review-context.ts";
import type {
  HandoffInput,
  IntakeRequestInput,
  LockRecord,
  MemoryPromotionInput,
  PlanArtifact,
  PlanInput,
  ReviewInput,
  ReviewRecord,
  RecoveryApplyResult,
  RecoveryInspectionReport,
  RecoveryIssue,
  RecoveryAction,
  RoutingRecommendation,
  RoutingRecommendationReport,
  RunRecord,
  RunStatusSnapshot,
  SearchMemoryInput,
  SearchMemoryResult,
  TaskPacketInput,
  TaskRecord
} from "../domain/types.ts";
import type { DevgodStore } from "../store/types.ts";

export interface DevgodCoreServiceOptions {
  resolveReviewActionContext?: ResolveReviewActionContext | undefined;
}

function timestamp(): string {
  return new Date().toISOString();
}

function parseHoursSince(createdAt: string, now: string): number | undefined {
  const createdAtMs = Date.parse(createdAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(createdAtMs) || Number.isNaN(nowMs) || nowMs < createdAtMs) {
    return undefined;
  }

  return Number(((nowMs - createdAtMs) / (1000 * 60 * 60)).toFixed(2));
}

function deriveRunStatus(tasks: readonly TaskRecord[]): RunRecord["status"] {
  if (tasks.length === 0) {
    return "decomposed";
  }

  if (tasks.every((task) => task.status === "done")) {
    return "done";
  }

  if (tasks.some((task) => task.status === "in_progress")) {
    return "in_progress";
  }

  if (tasks.some((task) => task.status === "review_blocked")) {
    return "review_blocked";
  }

  if (tasks.every((task) => task.status === "approved" || task.status === "done")) {
    return "approved";
  }

  return "ready";
}

export class DevgodCoreService {
  private readonly store: DevgodStore;
  private readonly resolveReviewActionContext?: ResolveReviewActionContext | undefined;

  constructor(store: DevgodStore, options: DevgodCoreServiceOptions = {}) {
    this.store = store;
    this.resolveReviewActionContext = options.resolveReviewActionContext;
  }

  async intakeRequest(input: IntakeRequestInput): Promise<RunRecord> {
    const { workspace, project } = await this.store.ensureProjectContext(input);
    const now = timestamp();
    const run: RunRecord = {
      id: randomUUID(),
      workspaceId: workspace.id,
      projectId: project.id,
      actor: input.actor,
      title: input.title.trim(),
      request: input.request.trim(),
      summary: normalizeIntakeRequest(input),
      status: "intake",
      createdAt: now,
      updatedAt: now
    };
    await this.store.createRun(run);
    return run;
  }

  async createPlan(plan: PlanInput): Promise<PlanArtifact> {
    const run = await this.requireRun(plan.runId);
    const now = timestamp();
    const artifact: PlanArtifact = {
      id: randomUUID(),
      runId: run.id,
      kind: "plan",
      title: plan.title,
      content: plan,
      createdAt: now
    };

    await this.store.savePlan(artifact);
    await this.store.updateRun({
      ...run,
      status: "planned",
      updatedAt: now
    });
    return artifact;
  }

  async createTaskGraph(runId: string, taskPackets: TaskPacketInput[]): Promise<TaskRecord[]> {
    const run = await this.requireRun(runId);
    const knownTaskIds = new Set(taskPackets.map((packet) => packet.taskId));
    const validationErrors = taskPackets.flatMap((packet) =>
      validateTaskPacket(packet).map((error) => `${packet.taskId}: ${error}`)
    );

    for (const packet of taskPackets) {
      for (const dependency of packet.dependencies) {
        if (!knownTaskIds.has(dependency)) {
          validationErrors.push(`${packet.taskId}: unknown dependency ${dependency}`);
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(`Invalid task graph: ${validationErrors.join("; ")}`);
    }

    const now = timestamp();
    const tasks: TaskRecord[] = taskPackets.map((packet) => ({
      id: randomUUID(),
      runId,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      packet,
      status: "ready",
      createdAt: now,
      updatedAt: now
    }));

    await this.store.replaceTasks(tasks);
    await this.store.updateRun({
      ...run,
      status: "decomposed",
      updatedAt: now
    });
    return tasks;
  }

  async claimTask(runId: string, taskId: string, actor: string): Promise<TaskRecord> {
    const task = await this.requireTask(runId, taskId);
    if (task.status !== "ready") {
      throw new Error(`Task ${taskId} must be ready before it can be claimed`);
    }

    const allTasks = await this.store.getTasksByRun(runId);
    const activeLocks = await this.store.getActiveLocks(task.projectId);
    const blockers = await this.findTaskBlockers(task, allTasks, activeLocks);

    if (blockers.length > 0) {
      throw new Error(`Task cannot be claimed: ${blockers.join("; ")}`);
    }

    const claimedTask: TaskRecord = {
      ...task,
      status: "in_progress",
      claimedBy: actor,
      updatedAt: timestamp()
    };

    await this.store.updateTask(claimedTask);
    await this.store.createLock({
      id: randomUUID(),
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      runId,
      taskId,
      scopePaths: [...task.packet.allowedWriteScope],
      status: "active",
      createdAt: timestamp()
    });
    await this.bumpRunState(runId, "in_progress");
    return claimedTask;
  }

  async submitHandoff(runId: string, taskId: string, handoff: HandoffInput) {
    const task = await this.requireTask(runId, taskId);
    if (task.status !== "in_progress") {
      throw new Error(`Task ${taskId} must be in progress before handoff`);
    }

    const validationErrors = validateHandoff(handoff);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid handoff: ${validationErrors.join("; ")}`);
    }

    if (handoff.ownerRole !== task.packet.ownerRole) {
      throw new Error(`Invalid handoff: ownerRole must match task ownerRole ${task.packet.ownerRole}`);
    }

    if (handoff.completionStandard !== task.packet.completionStandard) {
      throw new Error(
        `Invalid handoff: completionStandard must match task completionStandard ${task.packet.completionStandard}`
      );
    }

    const record = {
      id: randomUUID(),
      runId,
      taskId,
      actor: handoff.actor,
      ownerRole: handoff.ownerRole,
      completionStandard: handoff.completionStandard,
      summary: handoff.summary,
      changedFiles: [...handoff.changedFiles],
      blockers: [...handoff.blockers],
      verificationNotes: [...handoff.verificationNotes],
      executionEvidence: [...handoff.executionEvidence],
      qualityGateEvidence: [...handoff.qualityGateEvidence],
      contextRefs: [...handoff.contextRefs],
      createdAt: timestamp()
    };

    await this.store.saveHandoff(record);
    await this.store.updateTask({
      ...task,
      status: "review_blocked",
      updatedAt: timestamp()
    });
    await this.bumpRunState(runId, "review_blocked");
    return record;
  }

  async recordReview(runId: string, taskId: string, actor: string, review: ReviewInput) {
    if (!this.resolveReviewActionContext) {
      throw new Error("recordReview requires a trusted review action context resolver");
    }

    const task = await this.requireTask(runId, taskId);
    if (task.status !== "review_blocked") {
      throw new Error(`Task ${taskId} must be review_blocked before reviews can be recorded`);
    }

    let context;
    try {
      context = await this.resolveReviewActionContext({
        runId,
        taskId,
        actor,
        reviewerRole: review.reviewerRole,
        reviewState: review.state
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid review action: ${message}`);
    }

    const validationErrors = validateReviewAction(context, review);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid review action: ${validationErrors.join("; ")}`);
    }

    const reviewRecord: ReviewRecord = {
      id: randomUUID(),
      runId,
      taskId,
      reviewerRole: review.reviewerRole,
      actor: context.actor,
      actorRole: context.actorRole,
      identityAssurance: "authenticated",
      state: review.state,
      severity: review.severity,
      findings: [...review.findings],
      waiverReason: review.waiverReason,
      waiverAuthority: context.waiverAuthority ?? "none",
      createdAt: timestamp()
    };

    await this.store.saveReview(reviewRecord);
    const reviews = await this.store.getReviews(runId, taskId);
    const decision = evaluateReviewDecision(task, reviews);

    await this.store.saveApproval({
      id: randomUUID(),
      runId,
      taskId,
      actor: context.actor,
      actorRole: context.actorRole,
      identityAssurance: "authenticated",
      decision: decision.decision,
      rationale:
        decision.blockers.length > 0 ? decision.blockers.join("; ") : "All required reviews passed",
      createdAt: timestamp()
    });

    const nextStatus = decision.decision === "approved" ? "approved" : "review_blocked";
    const updatedTask: TaskRecord = {
      ...task,
      status: nextStatus,
      updatedAt: timestamp()
    };

    if (nextStatus === "approved") {
      await this.store.releaseLocksForTask(runId, taskId, timestamp());
    }

    await this.store.updateTask(updatedTask);
    await this.bumpRunState(runId, nextStatus);
    return {
      review: reviewRecord,
      blockers: decision.blockers,
      task: updatedTask
    };
  }

  async promoteMemory(runId: string, input: MemoryPromotionInput) {
    const run = await this.requireRun(runId);
    const errors = validateMemoryPromotion(input);
    if (errors.length > 0) {
      throw new Error(`Memory promotion rejected: ${errors.join("; ")}`);
    }

    const createdAt = timestamp();
    const metadata = normalizeRetrievalMetadata({
      ...input.metadata,
      reviewedAt: input.metadata?.reviewedAt ?? createdAt,
      authorityLevel: input.metadata?.authorityLevel ?? "reviewed_memory"
    });

    const entry = {
      id: randomUUID(),
      workspaceId: run.workspaceId,
      projectId: input.scope === "project" ? run.projectId : undefined,
      runId,
      taskId: input.sourceTaskId,
      scope: input.scope,
      entryType: input.entryType,
      title: input.title,
      content: input.content,
      reviewer: input.reviewer,
      actor: input.actor,
      status: "approved" as const,
      metadata,
      createdAt
    };

    await this.store.saveMemoryEntry(entry);
    await this.bumpRunState(runId, "memorized");
    return entry;
  }

  async searchMemory(input: SearchMemoryInput): Promise<SearchMemoryResult[]> {
    const normalized = normalizeSearchInput(input);
    const results = await this.store.searchMemory({
      workspaceSlug: normalized.workspaceSlug,
      projectSlug: normalized.projectSlug,
      query: normalized.query,
      limit: normalized.limit,
      includeGlobal: normalized.includeGlobal,
      queryEmbedding: normalized.queryEmbedding,
      embeddingModel: normalized.embeddingModel,
      requesterRole: normalized.requesterRole
    });

    return annotateConflictSignals(
      results
        .filter((result) => canRoleAccessSearchResult(result, normalized.requesterRole))
        .filter(isProvenancedSearchResult)
    );
  }

  async getStatus(runId: string): Promise<RunStatusSnapshot> {
    const run = await this.requireRun(runId);
    const plan = await this.store.getPlan(runId);
    const tasks = await this.store.getTasksByRun(runId);
    const activeLocks = await this.store.getActiveLocks(run.projectId);
    const blockerEntries = await Promise.all(
      tasks.map(async (task) => ({
        taskId: task.packet.taskId,
        blockers: await this.findTaskBlockers(task, tasks, activeLocks)
      }))
    );
    const blockers = blockerEntries.flatMap((entry) => entry.blockers);
    const blockerMap = new Map(blockerEntries.map((entry) => [entry.taskId, entry.blockers]));
    const nextTaskIds = tasks
      .filter((task) => (blockerMap.get(task.packet.taskId) ?? []).length === 0)
      .filter((task) => task.status === "ready")
      .map((task) => task.packet.taskId);

    return {
      run,
      plan,
      tasks,
      activeLocks,
      blockers,
      nextTaskIds
    };
  }

  async resumeRun(runId: string): Promise<RunStatusSnapshot> {
    return this.getStatus(runId);
  }

  async recommendRouting(runId: string): Promise<RoutingRecommendationReport> {
    const snapshot = await this.getStatus(runId);
    const blockerMap = new Map<string, string[]>();
    const recommendations: RoutingRecommendation[] = [];

    for (const task of snapshot.tasks) {
      const blockers = await this.findTaskBlockers(task, snapshot.tasks, snapshot.activeLocks);
      blockerMap.set(task.packet.taskId, blockers);
      const ownerRole = task.packet.ownerRole as TaskPacketInput["requiredSpecialistRoles"][number];

      if (task.status === "ready" && blockers.length === 0) {
        recommendations.push({
          taskId: task.packet.taskId,
          taskStatus: task.status,
          recommendation: "owner_dispatch",
          authorityLabel: "derived_only",
          targetRole: ownerRole,
          rationale: [
            "task is ready with dependencies satisfied",
            `owner role is ${ownerRole}`
          ],
          blockers: [],
          allowedWriteScope: [...task.packet.allowedWriteScope],
          retrievalGuidance: getRoleRetrievalGuidance(ownerRole),
          approvalCheckpoints: [
            "manager must explicitly choose to route this task",
            `writer must claim ${task.packet.taskId} before edits`,
            `required reviews before completion: ${task.packet.requiredReviews.join(", ")}`
          ]
        });
        continue;
      }

      if (task.status === "review_blocked") {
        const reviews = await this.store.getReviews(runId, task.packet.taskId);
        const missingReviewRoles = collectUnsatisfiedReviewRoles(task, reviews);

        for (const reviewRole of missingReviewRoles) {
          recommendations.push({
            taskId: task.packet.taskId,
            taskStatus: task.status,
            recommendation: "review_dispatch",
            authorityLabel: "derived_only",
            targetRole: reviewRole,
            targetReviewRole: reviewRole,
            rationale: [`review gate ${reviewRole} is still unsatisfied`],
            blockers: blockers.length > 0 ? [...blockers] : [`missing required review: ${reviewRole}`],
            allowedWriteScope: [],
            retrievalGuidance: getRoleRetrievalGuidance(reviewRole),
            approvalCheckpoints: [
              "review actor must authenticate through the trusted review identity resolver",
              "manager must persist or attach authenticated reviewer evidence before completion"
            ]
          });
        }
        continue;
      }

      if (task.status === "in_progress" || blockers.length > 0) {
        recommendations.push({
          taskId: task.packet.taskId,
          taskStatus: task.status,
          recommendation: "wait",
          authorityLabel: "derived_only",
          targetRole: ownerRole,
          rationale:
            task.status === "in_progress" && task.claimedBy
              ? [`task is already claimed by ${task.claimedBy}`]
              : ["task is not yet ready for routing"],
          blockers: [...blockers],
          allowedWriteScope: [...task.packet.allowedWriteScope],
          retrievalGuidance: getRoleRetrievalGuidance(ownerRole),
          approvalCheckpoints: [
            "do not route an overlapping writer while the task remains claimed or blocked",
            "clear blockers before assigning the next specialist"
          ]
        });
      }
    }

    return {
      mode: "advisory_only",
      runId: snapshot.run.id,
      recommendations
    };
  }

  async inspectRecovery(
    runId: string,
    options: {
      staleAfterHours?: number | undefined;
      now?: string | undefined;
    } = {}
  ): Promise<RecoveryInspectionReport> {
    const staleAfterHours = options.staleAfterHours ?? 24;
    if (!Number.isInteger(staleAfterHours) || staleAfterHours < 0) {
      throw new Error(`staleAfterHours must be a non-negative integer: ${staleAfterHours}`);
    }

    const snapshot = await this.getStatus(runId);
    const now = options.now ?? timestamp();
    const issues: RecoveryIssue[] = [];
    const actions: RecoveryAction[] = [];
    const taskById = new Map(snapshot.tasks.map((task) => [task.packet.taskId, task]));

    for (const task of snapshot.tasks) {
      const ageHours = parseHoursSince(task.updatedAt, now);
      const reviews = await this.store.getReviews(runId, task.packet.taskId);
      const handoffs = await this.store.getHandoffs(runId, task.packet.taskId);

      if (task.status === "in_progress" && ageHours !== undefined && ageHours >= staleAfterHours) {
        const actionId = `reset-task:${task.packet.taskId}`;
        issues.push({
          id: `stalled-task:${task.packet.taskId}`,
          authorityLabel: "derived_only",
          kind: "stalled_task",
          taskId: task.packet.taskId,
          ageHours,
          details: [
            `task has been in progress for ${ageHours} hours`,
            task.claimedBy ? `claimed by ${task.claimedBy}` : "task is unclaimed"
          ],
          suggestedActionIds: handoffs.length === 0 ? [actionId] : []
        });

        if (handoffs.length === 0) {
          actions.push({
            id: actionId,
            authorityLabel: "derived_only",
            kind: "reset_task_to_ready",
            taskId: task.packet.taskId,
            safeToApply: true,
            rationale: [
              "stalled in-progress task has no recorded handoff",
              "safe reset releases writer lock and requeues the task"
            ]
          });
        }
      }

      if (task.status === "review_blocked" && ageHours !== undefined && ageHours >= staleAfterHours) {
        const missingReviewRoles = collectUnsatisfiedReviewRoles(task, reviews);
        if (missingReviewRoles.length > 0) {
          const actionId = `request-reviews:${task.packet.taskId}`;
          issues.push({
            id: `stale-review:${task.packet.taskId}`,
            authorityLabel: "derived_only",
            kind: "stale_review_block",
            taskId: task.packet.taskId,
            ageHours,
            details: [
              `task has been waiting on review for ${ageHours} hours`,
              `missing reviews: ${missingReviewRoles.join(", ")}`
            ],
            suggestedActionIds: [actionId]
          });
          actions.push({
            id: actionId,
            authorityLabel: "derived_only",
            kind: "request_missing_reviews",
            taskId: task.packet.taskId,
            safeToApply: false,
            rationale: [
              `missing authenticated reviews: ${missingReviewRoles.join(", ")}`,
              "operator action required; no state change is applied automatically"
            ]
          });
        }
      }

      if (task.status === "approved") {
        const decision = evaluateReviewDecision(task, reviews);
        if (decision.decision !== "approved") {
          const actionId = `reblock-approved:${task.packet.taskId}`;
          issues.push({
            id: `stale-approval:${task.packet.taskId}`,
            authorityLabel: "derived_only",
            kind: "stale_approval",
            taskId: task.packet.taskId,
            details: [`approval is stale: ${decision.blockers.join("; ")}`],
            suggestedActionIds: [actionId]
          });
          actions.push({
            id: actionId,
            authorityLabel: "derived_only",
            kind: "reblock_stale_approval",
            taskId: task.packet.taskId,
            safeToApply: true,
            rationale: [
              "task is approved but current review evidence no longer satisfies required gates",
              "safe reblock restores explicit review state before routing dependents"
            ]
          });
        }
      }
    }

    for (const lock of snapshot.activeLocks) {
      const task = taskById.get(lock.taskId);
      if (task && task.status === "in_progress") {
        continue;
      }

      const actionId = `release-lock:${lock.taskId}`;
      issues.push({
        id: `orphan-lock:${lock.taskId}`,
        authorityLabel: "derived_only",
        kind: "orphan_lock",
        taskId: task?.packet.taskId,
        lockTaskId: lock.taskId,
        ageHours: parseHoursSince(lock.createdAt, now),
        details: [
          `active lock exists for ${lock.taskId}`,
          task ? `task status is ${task.status}` : "task no longer exists for this active lock"
        ],
        suggestedActionIds: [actionId]
      });
      actions.push({
        id: actionId,
        authorityLabel: "derived_only",
        kind: "release_orphan_lock",
        taskId: lock.taskId,
        safeToApply: true,
        rationale: [
          "active lock does not correspond to an in-progress task",
          "safe release restores routing capacity without approving work"
        ]
      });
    }

    const uniqueIssues = dedupeById(issues);
    const uniqueActions = dedupeById(actions);

    return {
      mode: "advisory_only",
      runId: snapshot.run.id,
      staleAfterHours,
      issues: uniqueIssues,
      actions: uniqueActions,
      summary: {
        totalIssues: uniqueIssues.length,
        safeActions: uniqueActions.filter((action) => action.safeToApply).length,
        blockedTasks: uniqueIssues.flatMap((issue) => (issue.taskId ? [issue.taskId] : [])),
        staleTaskIds: uniqueIssues
          .filter((issue) => issue.kind === "stalled_task" || issue.kind === "stale_review_block")
          .flatMap((issue) => (issue.taskId ? [issue.taskId] : [])),
        orphanLockTaskIds: uniqueIssues
          .filter((issue) => issue.kind === "orphan_lock")
          .flatMap((issue) => (issue.lockTaskId ? [issue.lockTaskId] : []))
      }
    };
  }

  async applyRecovery(
    runId: string,
    actionIds: readonly string[],
    options: {
      staleAfterHours?: number | undefined;
      now?: string | undefined;
    } = {}
  ): Promise<RecoveryApplyResult> {
    const inspection = await this.inspectRecovery(runId, options);
    const selectableActionIds =
      actionIds.length > 0
        ? new Set(actionIds)
        : new Set(inspection.actions.filter((action) => action.safeToApply).map((action) => action.id));
    const actionMap = new Map(inspection.actions.map((action) => [action.id, action]));
    const appliedActionIds: string[] = [];
    const skippedActionIds: string[] = [];
    const appliedAt = options.now ?? timestamp();

    for (const actionId of selectableActionIds) {
      const action = actionMap.get(actionId);
      if (!action || !action.taskId) {
        skippedActionIds.push(actionId);
        continue;
      }

      if (!action.safeToApply) {
        skippedActionIds.push(actionId);
        continue;
      }

      if (action.kind === "release_orphan_lock") {
        await this.store.releaseLocksForTask(runId, action.taskId, appliedAt);
        appliedActionIds.push(actionId);
        continue;
      }

      const task = await this.requireTask(runId, action.taskId);
      if (action.kind === "reset_task_to_ready") {
        const handoffs = await this.store.getHandoffs(runId, action.taskId);
        if (task.status !== "in_progress" || handoffs.length > 0) {
          skippedActionIds.push(actionId);
          continue;
        }

        await this.store.updateTask({
          ...task,
          status: "ready",
          claimedBy: undefined,
          updatedAt: appliedAt
        });
        await this.store.releaseLocksForTask(runId, action.taskId, appliedAt);
        appliedActionIds.push(actionId);
        continue;
      }

      if (action.kind === "reblock_stale_approval") {
        if (task.status !== "approved") {
          skippedActionIds.push(actionId);
          continue;
        }

        await this.store.updateTask({
          ...task,
          status: "review_blocked",
          updatedAt: appliedAt
        });
        appliedActionIds.push(actionId);
        continue;
      }

      skippedActionIds.push(actionId);
    }

    await this.syncRunState(runId);

    return {
      mode: "applied",
      runId,
      appliedActionIds,
      skippedActionIds,
      snapshot: await this.getStatus(runId)
    };
  }

  private async requireRun(runId: string): Promise<RunRecord> {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new Error(`Unknown run: ${runId}`);
    }
    return run;
  }

  private async requireTask(runId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.store.getTask(runId, taskId);
    if (!task) {
      throw new Error(`Unknown task ${taskId} for run ${runId}`);
    }
    return task;
  }

  private async bumpRunState(runId: string, status: RunRecord["status"]) {
    const run = await this.requireRun(runId);
    await this.store.updateRun({
      ...run,
      status,
      updatedAt: timestamp()
    });
  }

  private async syncRunState(runId: string) {
    const run = await this.requireRun(runId);
    const tasks = await this.store.getTasksByRun(runId);
    await this.store.updateRun({
      ...run,
      status: deriveRunStatus(tasks),
      updatedAt: timestamp()
    });
  }

  private async findTaskBlockers(
    task: TaskRecord,
    allTasks: readonly TaskRecord[],
    activeLocks: readonly LockRecord[]
  ): Promise<string[]> {
    const blockers = findBlockingReasonsForTask(task, allTasks, activeLocks);

    for (const dependency of findTaskDependencies(task.packet, allTasks)) {
      if (dependency.status !== "approved") {
        continue;
      }

      const reviews = await this.store.getReviews(dependency.runId, dependency.packet.taskId);
      const decision = evaluateReviewDecision(dependency, reviews);
      if (decision.decision === "approved") {
        continue;
      }

      blockers.push(
        `dependency ${dependency.packet.taskId} has stale approval: ${decision.blockers.join("; ")}`
      );
    }

    return blockers;
  }
}

function dedupeById<T extends { id: string }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    deduped.push(entry);
  }

  return deduped;
}
