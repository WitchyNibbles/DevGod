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
import { PostgresEmbeddingJobs } from "./postgres-embedding-jobs.ts";
import { searchMemory } from "./postgres-memory-search.ts";
import type {
  CompleteEmbeddingJobInput,
  DevgodStore,
  EmbeddingJobRecord,
  EmbeddingJobSourceTable,
  EmbeddingSourceRecord,
  LeaseEmbeddingJobsInput,
  QueueEmbeddingJobInput
} from "./types.ts";

export interface SqlQueryResult<Row> {
  rows: Row[];
  rowCount: number | null;
}

export interface SqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<SqlQueryResult<Row>>;
}

interface JsonRow<T> {
  payload: T;
}

function now(): string {
  return new Date().toISOString();
}

async function withTransaction<T>(client: SqlClient, work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const value = await work();
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export class PostgresStore implements DevgodStore {
  private readonly client: SqlClient;
  private readonly embeddingJobs: PostgresEmbeddingJobs;

  constructor(client: SqlClient) {
    this.client = client;
    this.embeddingJobs = new PostgresEmbeddingJobs(client);
  }

  async ensureProjectContext(params: {
    workspaceSlug: string;
    workspaceName?: string | undefined;
    projectSlug: string;
    projectName?: string | undefined;
    repoPath?: string | undefined;
  }): Promise<{ workspace: WorkspaceRecord; project: ProjectRecord }> {
    const workspace = {
      id: `workspace:${params.workspaceSlug}`,
      slug: params.workspaceSlug,
      name: params.workspaceName ?? params.workspaceSlug,
      createdAt: now()
    };

    await this.client.query(
      `insert into workspaces (id, slug, name)
       values ($1, $2, $3)
       on conflict (slug) do update set name = excluded.name`,
      [workspace.id, workspace.slug, workspace.name]
    );

    const project = {
      id: `project:${params.workspaceSlug}:${params.projectSlug}`,
      workspaceId: workspace.id,
      slug: params.projectSlug,
      name: params.projectName ?? params.projectSlug,
      repoPath: params.repoPath,
      createdAt: now()
    };

    await this.client.query(
      `insert into projects (id, workspace_id, slug, name, repo_path)
       values ($1, $2, $3, $4, $5)
       on conflict (workspace_id, slug) do update
       set name = excluded.name,
           repo_path = excluded.repo_path`,
      [project.id, project.workspaceId, project.slug, project.name, project.repoPath ?? null]
    );

    return { workspace, project };
  }

  async createRun(run: RunRecord): Promise<void> {
    await this.client.query(
      `insert into runs (id, workspace_id, project_id, actor, title, request_text, intake_summary, status)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        run.id,
        run.workspaceId,
        run.projectId,
        run.actor,
        run.title,
        run.request,
        JSON.stringify(run.summary),
        run.status
      ]
    );
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const result = await this.client.query<JsonRow<RunRecord>>(
      `select jsonb_build_object(
          'id', id,
          'workspaceId', workspace_id,
          'projectId', project_id,
          'actor', actor,
          'title', title,
          'request', request_text,
          'summary', intake_summary,
          'status', status,
          'createdAt', created_at,
          'updatedAt', updated_at
       ) as payload
       from runs
       where id = $1`,
      [runId]
    );
    return result.rows[0]?.payload;
  }

  async updateRun(run: RunRecord): Promise<void> {
    await this.client.query(
      `update runs
       set actor = $2,
           title = $3,
           request_text = $4,
           intake_summary = $5::jsonb,
           status = $6,
           updated_at = now()
       where id = $1`,
      [run.id, run.actor, run.title, run.request, JSON.stringify(run.summary), run.status]
    );
  }

  async savePlan(plan: PlanArtifact): Promise<void> {
    await this.client.query(
      `insert into artifacts (id, workspace_id, project_id, run_id, task_id, kind, title, content, metadata)
       select $1, r.workspace_id, r.project_id, $2, null, 'plan', $3, $4, $5::jsonb
       from runs r
       where r.id = $2
       on conflict (id) do update
       set title = excluded.title,
           content = excluded.content,
           metadata = excluded.metadata`,
      [plan.id, plan.runId, plan.title, JSON.stringify(plan.content), JSON.stringify({ kind: "plan" })]
    );
  }

  async getPlan(runId: string): Promise<PlanArtifact | undefined> {
    const result = await this.client.query<JsonRow<PlanArtifact>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'kind', 'plan',
          'title', title,
          'content', content::jsonb,
          'createdAt', created_at
       ) as payload
       from artifacts
       where run_id = $1 and kind = 'plan'
       order by created_at desc
       limit 1`,
      [runId]
    );
    return result.rows[0]?.payload;
  }

  async replaceTasks(tasks: TaskRecord[]): Promise<void> {
    if (tasks.length === 0) {
      return;
    }

    const runId = tasks[0].runId;
    await this.client.query(`delete from task_dependencies where task_id in (select id from tasks where run_id = $1)`, [runId]);
    await this.client.query(`delete from tasks where run_id = $1`, [runId]);

    for (const task of tasks) {
      await this.client.query(
        `insert into tasks (
          id, workspace_id, project_id, run_id, task_key, title, owner_role, status,
          allowed_write_scope, out_of_scope, acceptance_criteria, verification_steps,
          required_reviews, security_checks, anti_patterns, rollback_notes, handoff_format,
          payload, claimed_by
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18::jsonb, $19
        )`,
        [
          task.id,
          task.workspaceId,
          task.projectId,
          task.runId,
          task.packet.taskId,
          task.packet.title,
          task.packet.ownerRole,
          task.status,
          task.packet.allowedWriteScope,
          task.packet.outOfScope,
          task.packet.acceptanceCriteria,
          task.packet.verificationSteps,
          task.packet.requiredReviews,
          task.packet.securityChecks,
          task.packet.antiPatterns,
          task.packet.rollbackNotes,
          task.packet.handoffFormat,
          JSON.stringify(task.packet),
          task.claimedBy ?? null
        ]
      );

      for (const dependency of task.packet.dependencies) {
        await this.client.query(
          `insert into task_dependencies (task_id, depends_on_task_key) values ($1, $2)`,
          [task.id, dependency]
        );
      }
    }
  }

  async getTasksByRun(runId: string): Promise<TaskRecord[]> {
    const result = await this.client.query<JsonRow<TaskRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'workspaceId', workspace_id,
          'projectId', project_id,
          'packet', payload::jsonb,
          'status', status,
          'claimedBy', claimed_by,
          'createdAt', created_at,
          'updatedAt', updated_at
       ) as payload
       from tasks
       where run_id = $1
       order by created_at asc`,
      [runId]
    );
    return result.rows.map((row) => row.payload);
  }

  async getTask(runId: string, taskId: string): Promise<TaskRecord | undefined> {
    const result = await this.client.query<JsonRow<TaskRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'workspaceId', workspace_id,
          'projectId', project_id,
          'packet', payload::jsonb,
          'status', status,
          'claimedBy', claimed_by,
          'createdAt', created_at,
          'updatedAt', updated_at
       ) as payload
       from tasks
       where run_id = $1 and task_key = $2`,
      [runId, taskId]
    );
    return result.rows[0]?.payload;
  }

  async updateTask(task: TaskRecord): Promise<void> {
    await this.client.query(
      `update tasks
       set status = $2,
           claimed_by = $3,
           payload = $4::jsonb,
           updated_at = now()
       where id = $1`,
      [task.id, task.status, task.claimedBy ?? null, JSON.stringify(task.packet)]
    );
  }

  async createLock(lock: LockRecord): Promise<void> {
    await this.client.query(
      `insert into locks (id, workspace_id, project_id, run_id, task_id, scope_paths, status)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [lock.id, lock.workspaceId, lock.projectId, lock.runId, lock.taskId, lock.scopePaths, lock.status]
    );
  }

  async releaseLocksForTask(runId: string, taskId: string, releasedAt: string): Promise<void> {
    await this.client.query(
      `update locks
       set status = 'released',
           released_at = $3
       where run_id = $1 and task_id = $2 and status = 'active'`,
      [runId, taskId, releasedAt]
    );
  }

  async getActiveLocks(projectId: string): Promise<LockRecord[]> {
    const result = await this.client.query<JsonRow<LockRecord>>(
      `select jsonb_build_object(
          'id', id,
          'workspaceId', workspace_id,
          'projectId', project_id,
          'runId', run_id,
          'taskId', task_id,
          'scopePaths', scope_paths,
          'status', status,
          'createdAt', created_at,
          'releasedAt', released_at
       ) as payload
       from locks
       where project_id = $1 and status = 'active'`,
      [projectId]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveHandoff(handoff: HandoffRecord): Promise<void> {
    await this.client.query(
      `insert into handoffs (
         id, workspace_id, project_id, run_id, task_id, actor, summary,
         changed_files, blockers, verification_notes, context_refs
       )
       select $1, r.workspace_id, r.project_id, $2, $3, $4, $5, $6, $7, $8, $9
       from runs r
       where r.id = $2`,
      [
        handoff.id,
        handoff.runId,
        handoff.taskId,
        handoff.actor,
        handoff.summary,
        handoff.changedFiles,
        handoff.blockers,
        handoff.verificationNotes,
        handoff.contextRefs
      ]
    );
  }

  async getHandoffs(runId: string, taskId: string): Promise<HandoffRecord[]> {
    const result = await this.client.query<JsonRow<HandoffRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'taskId', task_id,
          'actor', actor,
          'summary', summary,
          'changedFiles', changed_files,
          'blockers', blockers,
          'verificationNotes', verification_notes,
          'contextRefs', context_refs,
          'createdAt', created_at
       ) as payload
       from handoffs
       where run_id = $1
         and task_id = $2
       order by created_at asc`,
      [runId, taskId]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveReview(review: ReviewRecord): Promise<void> {
    await this.client.query(
      `insert into reviews (
         id, workspace_id, project_id, run_id, task_id, reviewer_role, actor, actor_role,
         identity_assurance, state, severity, findings, waiver_reason, waiver_authority
       )
       select $1, r.workspace_id, r.project_id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       from runs r
       where r.id = $2`,
      [
        review.id,
        review.runId,
        review.taskId,
        review.reviewerRole,
        review.actor,
        review.actorRole,
        review.identityAssurance,
        review.state,
        review.severity,
        review.findings,
        review.waiverReason ?? null,
        review.waiverAuthority
      ]
    );
  }

  async getReviews(runId: string, taskId: string): Promise<ReviewRecord[]> {
    const result = await this.client.query<JsonRow<ReviewRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'taskId', task_id,
          'reviewerRole', reviewer_role,
          'actor', actor,
          'actorRole', actor_role,
          'identityAssurance', identity_assurance,
          'state', state,
          'severity', severity,
          'findings', findings,
          'waiverReason', waiver_reason,
          'waiverAuthority', waiver_authority,
          'createdAt', created_at
       ) as payload
       from reviews
       where run_id = $1
         and task_id = $2
       order by created_at asc`,
      [runId, taskId]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveApproval(approval: ApprovalRecord): Promise<void> {
    await this.client.query(
      `insert into approvals (
         id, workspace_id, project_id, run_id, task_id, actor, actor_role, identity_assurance, decision, rationale
       )
       select $1, r.workspace_id, r.project_id, $2, $3, $4, $5, $6, $7, $8
       from runs r
       where r.id = $2`,
      [
        approval.id,
        approval.runId,
        approval.taskId,
        approval.actor,
        approval.actorRole,
        approval.identityAssurance,
        approval.decision,
        approval.rationale
      ]
    );
  }

  async getApprovals(runId: string, taskId: string): Promise<ApprovalRecord[]> {
    const result = await this.client.query<JsonRow<ApprovalRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'taskId', task_id,
          'actor', actor,
          'actorRole', actor_role,
          'identityAssurance', identity_assurance,
          'decision', decision,
          'rationale', rationale,
          'createdAt', created_at
       ) as payload
       from approvals
       where run_id = $1
         and task_id = $2
       order by created_at asc`,
      [runId, taskId]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveMemoryEntry(entry: MemoryEntryRecord): Promise<void> {
    await this.client.query(
      `insert into memory_entries (
         id, workspace_id, project_id, run_id, task_id, scope, entry_type, title,
         content, reviewer, actor, status, source_path, source_anchor, metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)`,
      [
        entry.id,
        entry.workspaceId,
        entry.projectId ?? null,
        entry.runId,
        entry.taskId ?? null,
        entry.scope,
        entry.entryType,
        entry.title,
        entry.content,
        entry.reviewer,
        entry.actor,
        entry.status,
        entry.sourcePath ?? null,
        entry.sourceAnchor ?? null,
        JSON.stringify(entry.metadata ?? {})
      ]
    );
  }

  async replaceMarkdownArtifacts(input: {
    workspaceId: string;
    projectId: string;
    runId: string;
    artifacts: readonly MarkdownArtifactRecord[];
  }): Promise<void> {
    await withTransaction(this.client, async () => {
      await this.client.query(
        `delete from embedding_jobs
         where source_table = 'artifacts'
           and project_id = $1`,
        [input.projectId]
      );

      await this.client.query(
        `delete from artifacts
         where project_id = $1
           and kind = 'markdown_chunk'`,
        [input.projectId]
      );

      for (const artifact of input.artifacts) {
        await this.client.query(
          `insert into artifacts (
             id, workspace_id, project_id, run_id, task_id, kind, title, content, metadata
           )
           values ($1, $2, $3, $4, null, 'markdown_chunk', $5, $6::jsonb, $7::jsonb)`,
          [
            artifact.id,
            artifact.workspaceId,
            artifact.projectId,
            input.runId,
            artifact.title,
            JSON.stringify({ text: artifact.content }),
            JSON.stringify({
              ...artifact.metadata,
              sourcePath: artifact.sourcePath,
              sourceAnchor: artifact.sourceAnchor ?? null
            })
          ]
        );
      }
    });
  }

  async queueEmbeddingJob(input: QueueEmbeddingJobInput): Promise<EmbeddingJobRecord> {
    return this.embeddingJobs.queueEmbeddingJob(input);
  }

  async leaseEmbeddingJobs(input: LeaseEmbeddingJobsInput): Promise<EmbeddingJobRecord[]> {
    return this.embeddingJobs.leaseEmbeddingJobs(input);
  }

  async getEmbeddingSource(
    sourceTable: EmbeddingJobSourceTable,
    sourceId: string
  ): Promise<EmbeddingSourceRecord | undefined> {
    return this.embeddingJobs.getEmbeddingSource(sourceTable, sourceId);
  }

  async completeEmbeddingJob(input: CompleteEmbeddingJobInput): Promise<void> {
    return this.embeddingJobs.completeEmbeddingJob(input);
  }

  async failEmbeddingJob(jobId: string, errorMessage: string): Promise<void> {
    return this.embeddingJobs.failEmbeddingJob(jobId, errorMessage);
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
    return searchMemory(this.client, params);
  }

}
