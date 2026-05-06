import {
  buildArtifactSearchResult,
  buildMemorySearchResult,
  canRoleAccessRetrievalMetadata,
  compareMemorySearchResults
} from "../core/policy.ts";
import { DEFAULT_RETRIEVAL_ROLE } from "../domain/contracts.ts";
import type {
  ApprovalRecord,
  HandoffRecord,
  LockRecord,
  MarkdownArtifactRecord,
  MemoryEntryRecord,
  PlanArtifact,
  ProjectRecord,
  RetrievalRole,
  ReviewRecord,
  RunRecord,
  SearchMemoryResult,
  TaskRecord,
  WorkspaceRecord
} from "../domain/types.ts";
import type {
  CompleteEmbeddingJobInput,
  DevgodStore,
  EmbeddingJobRecord,
  EmbeddingJobSourceTable,
  EmbeddingSourceRecord,
  LeaseEmbeddingJobsInput,
  QueueEmbeddingJobInput
} from "./types.ts";

interface EmbeddingVectorRecord {
  embedding: readonly number[];
  embeddingModel: string;
  updatedAt: string;
}

function embeddingJobKey(input: Pick<QueueEmbeddingJobInput, "sourceTable" | "sourceId" | "embeddingModel">): string {
  return `${input.sourceTable}:${input.sourceId}:${input.embeddingModel}`;
}

export class MemoryStore implements DevgodStore {
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly plans = new Map<string, PlanArtifact>();
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly locks = new Map<string, LockRecord>();
  private readonly handoffs = new Map<string, HandoffRecord>();
  private readonly reviews = new Map<string, ReviewRecord>();
  private readonly approvals = new Map<string, ApprovalRecord>();
  private readonly memoryEntries = new Map<string, MemoryEntryRecord>();
  private readonly markdownArtifacts = new Map<string, MarkdownArtifactRecord>();
  private readonly embeddingJobs = new Map<string, EmbeddingJobRecord>();
  private readonly artifactEmbeddings = new Map<string, EmbeddingVectorRecord>();
  private readonly memoryEntryEmbeddings = new Map<string, EmbeddingVectorRecord>();

  async ensureProjectContext(params: {
    workspaceSlug: string;
    workspaceName?: string | undefined;
    projectSlug: string;
    projectName?: string | undefined;
    repoPath?: string | undefined;
  }): Promise<{ workspace: WorkspaceRecord; project: ProjectRecord }> {
    const now = new Date().toISOString();
    const workspace =
      this.workspaces.get(params.workspaceSlug) ??
      {
        id: `workspace:${params.workspaceSlug}`,
        slug: params.workspaceSlug,
        name: params.workspaceName ?? params.workspaceSlug,
        createdAt: now
      };
    this.workspaces.set(workspace.slug, workspace);

    const projectKey = `${params.workspaceSlug}:${params.projectSlug}`;
    const project =
      this.projects.get(projectKey) ??
      {
        id: `project:${projectKey}`,
        workspaceId: workspace.id,
        slug: params.projectSlug,
        name: params.projectName ?? params.projectSlug,
        repoPath: params.repoPath,
        createdAt: now
      };
    this.projects.set(projectKey, project);

    return { workspace, project };
  }

  async createRun(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId);
  }

  async findLatestRun(params: { workspaceSlug: string; projectSlug: string }): Promise<RunRecord | undefined> {
    const project = this.projects.get(`${params.workspaceSlug}:${params.projectSlug}`);
    if (!project) {
      return undefined;
    }

    return [...this.runs.values()]
      .filter((run) => run.projectId === project.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }

  async updateRun(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
  }

  async savePlan(plan: PlanArtifact): Promise<void> {
    this.plans.set(plan.runId, plan);
  }

  async getPlan(runId: string): Promise<PlanArtifact | undefined> {
    return this.plans.get(runId);
  }

  async replaceTasks(tasks: TaskRecord[]): Promise<void> {
    for (const task of [...this.tasks.values()]) {
      if (task.runId === tasks[0]?.runId) {
        this.tasks.delete(task.id);
      }
    }

    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  async getTasksByRun(runId: string): Promise<TaskRecord[]> {
    return [...this.tasks.values()].filter((task) => task.runId === runId);
  }

  async getTask(runId: string, taskId: string): Promise<TaskRecord | undefined> {
    return [...this.tasks.values()].find(
      (task) => task.runId === runId && task.packet.taskId === taskId
    );
  }

  async updateTask(task: TaskRecord): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async createLock(lock: LockRecord): Promise<void> {
    this.locks.set(lock.id, lock);
  }

  async releaseLocksForTask(runId: string, taskId: string, releasedAt: string): Promise<void> {
    for (const lock of this.locks.values()) {
      if (lock.runId === runId && lock.taskId === taskId && lock.status === "active") {
        this.locks.set(lock.id, {
          ...lock,
          status: "released",
          releasedAt
        });
      }
    }
  }

  async getActiveLocks(projectId: string): Promise<LockRecord[]> {
    return [...this.locks.values()].filter(
      (lock) => lock.projectId === projectId && lock.status === "active"
    );
  }

  async saveHandoff(handoff: HandoffRecord): Promise<void> {
    this.handoffs.set(handoff.id, handoff);
  }

  async getHandoffs(runId: string, taskId: string): Promise<HandoffRecord[]> {
    return [...this.handoffs.values()].filter((handoff) => handoff.runId === runId && handoff.taskId === taskId);
  }

  async saveReview(review: ReviewRecord): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async getReviews(runId: string, taskId: string): Promise<ReviewRecord[]> {
    return [...this.reviews.values()].filter((review) => review.runId === runId && review.taskId === taskId);
  }

  async saveApproval(approval: ApprovalRecord): Promise<void> {
    this.approvals.set(approval.id, approval);
  }

  async getApprovals(runId: string, taskId: string): Promise<ApprovalRecord[]> {
    return [...this.approvals.values()].filter((approval) => approval.runId === runId && approval.taskId === taskId);
  }

  async saveMemoryEntry(entry: MemoryEntryRecord): Promise<void> {
    this.memoryEntries.set(entry.id, entry);
  }

  async replaceMarkdownArtifacts(input: {
    workspaceId: string;
    projectId: string;
    runId: string;
    artifacts: readonly MarkdownArtifactRecord[];
  }): Promise<void> {
    const incomingIds = new Set(input.artifacts.map((artifact) => artifact.id));

    for (const artifact of [...this.markdownArtifacts.values()]) {
      if (artifact.projectId !== input.projectId) {
        continue;
      }

      if (incomingIds.has(artifact.id)) {
        continue;
      }

      this.markdownArtifacts.delete(artifact.id);
      this.artifactEmbeddings.delete(artifact.id);
      for (const job of [...this.embeddingJobs.values()]) {
        if (job.sourceTable === "artifacts" && job.sourceId === artifact.id) {
          this.embeddingJobs.delete(job.id);
        }
      }
    }

    for (const artifact of input.artifacts) {
      this.markdownArtifacts.set(artifact.id, artifact);
    }
  }

  async queueEmbeddingJob(input: QueueEmbeddingJobInput): Promise<EmbeddingJobRecord> {
    const timestamp = new Date().toISOString();
    this.clearDerivedEmbedding(input.sourceTable, input.sourceId);

    const existing = [...this.embeddingJobs.values()].find(
      (job) =>
        job.sourceTable === input.sourceTable &&
        job.sourceId === input.sourceId &&
        job.embeddingModel === input.embeddingModel
    );

    if (existing) {
      const queuedJob: EmbeddingJobRecord = {
        ...existing,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: "pending",
        errorMessage: undefined,
        updatedAt: timestamp
      };
      this.embeddingJobs.set(existing.id, queuedJob);
      return queuedJob;
    }

    const job: EmbeddingJobRecord = {
      id: `embedding-job:${embeddingJobKey(input)}`,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      embeddingModel: input.embeddingModel,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.embeddingJobs.set(job.id, job);
    return job;
  }

  async leaseEmbeddingJobs(input: LeaseEmbeddingJobsInput): Promise<EmbeddingJobRecord[]> {
    const leasedAt = new Date().toISOString();
    const pendingJobs = [...this.embeddingJobs.values()]
      .filter((job) => job.status === "pending")
      .sort((left, right) => {
        const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
        if (createdAtComparison !== 0) {
          return createdAtComparison;
        }

        return left.id.localeCompare(right.id);
      })
      .slice(0, input.limit)
      .map((job) => ({
        ...job,
        status: "processing" as const,
        updatedAt: leasedAt
      }));

    for (const job of pendingJobs) {
      this.embeddingJobs.set(job.id, job);
    }

    return pendingJobs;
  }

  async getEmbeddingSource(
    sourceTable: EmbeddingJobSourceTable,
    sourceId: string
  ): Promise<EmbeddingSourceRecord | undefined> {
    if (sourceTable === "memory_entries") {
      const entry = this.memoryEntries.get(sourceId);
      if (!entry) {
        return undefined;
      }

      return {
        sourceTable,
        sourceId,
        title: entry.title,
        content: entry.content
      };
    }

    const markdownArtifact = this.markdownArtifacts.get(sourceId);
    if (markdownArtifact) {
      return {
        sourceTable,
        sourceId,
        title: markdownArtifact.title,
        content: markdownArtifact.content
      };
    }

    const plan = [...this.plans.values()].find((candidate) => candidate.id === sourceId);
    if (plan) {
      return {
        sourceTable,
        sourceId,
        title: plan.title,
        content: JSON.stringify(plan.content)
      };
    }

    return undefined;
  }

  async completeEmbeddingJob(input: CompleteEmbeddingJobInput): Promise<void> {
    const existingJob = this.embeddingJobs.get(input.jobId);
    const completedAt = new Date().toISOString();

    if (!existingJob) {
      throw new Error(`embedding job not found: ${input.jobId}`);
    }

    if (
      existingJob.status !== "processing" ||
      existingJob.sourceTable !== input.sourceTable ||
      existingJob.sourceId !== input.sourceId ||
      existingJob.embeddingModel !== input.embeddingModel
    ) {
      throw new Error(`embedding job is not leased for completion: ${input.jobId}`);
    }

    this.setDerivedEmbedding(input.sourceTable, input.sourceId, {
      embedding: [...input.embedding],
      embeddingModel: input.embeddingModel,
      updatedAt: completedAt
    });
    this.embeddingJobs.set(input.jobId, {
      ...existingJob,
      status: "done",
      errorMessage: undefined,
      updatedAt: completedAt
    });
  }

  async failEmbeddingJob(jobId: string, errorMessage: string): Promise<void> {
    const existingJob = this.embeddingJobs.get(jobId);

    if (!existingJob) {
      throw new Error(`embedding job not found: ${jobId}`);
    }

    if (existingJob.status !== "processing") {
      throw new Error(`embedding job is not leased for failure: ${jobId}`);
    }

    this.embeddingJobs.set(jobId, {
      ...existingJob,
      status: "failed",
      errorMessage,
      updatedAt: new Date().toISOString()
    });
  }

  async searchMemory(params: {
    workspaceSlug: string;
    projectSlug: string;
    query: string;
    limit: number;
    includeGlobal: boolean;
    queryEmbedding?: readonly number[] | undefined;
    embeddingModel?: string | undefined;
    requesterRole?: RetrievalRole | undefined;
  }): Promise<SearchMemoryResult[]> {
    const requesterRole = params.requesterRole ?? DEFAULT_RETRIEVAL_ROLE;
    const projectKey = `${params.workspaceSlug}:${params.projectSlug}`;
    const project = this.projects.get(projectKey);
    const memoryResults = [...this.memoryEntries.values()]
      .filter((entry) => entry.status === "approved")
      .filter((entry) => {
        const sameProject = project ? entry.projectId === project.id : false;
        const sameWorkspace = project ? entry.workspaceId === project.workspaceId : false;
        return sameProject || (sameWorkspace && params.includeGlobal && entry.scope === "global");
      })
      .filter((entry) => canRoleAccessRetrievalMetadata(entry.metadata, requesterRole))
      .map((entry) => {
        const sameProject = project ? entry.projectId === project.id : false;
        const baseResult = buildMemorySearchResult(
          entry,
          params.query,
          sameProject,
          sameProject ? params.projectSlug : undefined
        );
        return {
          ...baseResult,
          score: baseResult.score + this.vectorScoreBoost(entry.id, params.queryEmbedding, params.embeddingModel)
        };
      });

    const artifactResults = project
      ? [...this.markdownArtifacts.values()]
          .filter((artifact) => artifact.projectId === project.id)
          .filter((artifact) => canRoleAccessRetrievalMetadata(artifact.metadata, requesterRole))
          .map((artifact) => {
            const baseResult = buildArtifactSearchResult(artifact, params.query, params.projectSlug);
            return {
              ...baseResult,
              score: baseResult.score + this.vectorScoreBoost(artifact.id, params.queryEmbedding, params.embeddingModel, "artifacts")
            };
          })
      : [];

    return [...memoryResults, ...artifactResults].sort(compareMemorySearchResults).slice(0, params.limit);
  }

  private clearDerivedEmbedding(sourceTable: EmbeddingJobSourceTable, sourceId: string): void {
    this.embeddingMapFor(sourceTable).delete(sourceId);
  }

  private setDerivedEmbedding(
    sourceTable: EmbeddingJobSourceTable,
    sourceId: string,
    embedding: EmbeddingVectorRecord
  ): void {
    this.embeddingMapFor(sourceTable).set(sourceId, embedding);
  }

  private embeddingMapFor(sourceTable: EmbeddingJobSourceTable): Map<string, EmbeddingVectorRecord> {
    return sourceTable === "artifacts" ? this.artifactEmbeddings : this.memoryEntryEmbeddings;
  }

  private vectorScoreBoost(
    entryId: string,
    queryEmbedding?: readonly number[] | undefined,
    embeddingModel?: string | undefined,
    sourceTable: EmbeddingJobSourceTable = "memory_entries"
  ): number {
    if (!queryEmbedding || !embeddingModel) {
      return 0;
    }

    const embeddingRecord = this.embeddingMapFor(sourceTable).get(entryId);
    if (!embeddingRecord || embeddingRecord.embeddingModel !== embeddingModel) {
      return 0;
    }

    return cosineSimilarity(queryEmbedding, embeddingRecord.embedding) * 6;
  }
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
