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
  evaluateReviewDecision,
  findBlockingReasonsForTask,
  findTaskDependencies
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
