import { buildMemorySearchResult, compareMemorySearchResults } from "../core/policy.ts";
import type {
  ApprovalRecord,
  HandoffRecord,
  LockRecord,
  MemoryEntryRecord,
  PlanArtifact,
  ProjectRecord,
  ReviewRecord,
  RunRecord,
  SearchMemoryResult,
  TaskRecord,
  WorkspaceRecord
} from "../domain/types.ts";
import type { DevgodStore } from "./types.ts";

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

  async getHandoffs(taskId: string): Promise<HandoffRecord[]> {
    return [...this.handoffs.values()].filter((handoff) => handoff.taskId === taskId);
  }

  async saveReview(review: ReviewRecord): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async getReviews(taskId: string): Promise<ReviewRecord[]> {
    return [...this.reviews.values()].filter((review) => review.taskId === taskId);
  }

  async saveApproval(approval: ApprovalRecord): Promise<void> {
    this.approvals.set(approval.id, approval);
  }

  async getApprovals(taskId: string): Promise<ApprovalRecord[]> {
    return [...this.approvals.values()].filter((approval) => approval.taskId === taskId);
  }

  async saveMemoryEntry(entry: MemoryEntryRecord): Promise<void> {
    this.memoryEntries.set(entry.id, entry);
  }

  async searchMemory(params: {
    workspaceSlug: string;
    projectSlug: string;
    query: string;
    limit: number;
    includeGlobal: boolean;
  }): Promise<SearchMemoryResult[]> {
    const projectKey = `${params.workspaceSlug}:${params.projectSlug}`;
    const project = this.projects.get(projectKey);
    const results = [...this.memoryEntries.values()]
      .filter((entry) => entry.status === "approved")
      .filter((entry) => {
        const sameProject = project ? entry.projectId === project.id : false;
        const sameWorkspace = project ? entry.workspaceId === project.workspaceId : false;
        return sameProject || (sameWorkspace && params.includeGlobal && entry.scope === "global");
      })
      .map((entry) => {
        const sameProject = project ? entry.projectId === project.id : false;
        return buildMemorySearchResult(entry, params.query, sameProject, sameProject ? params.projectSlug : undefined);
      })
      .sort(compareMemorySearchResults)
      .slice(0, params.limit);

    return results;
  }
}
