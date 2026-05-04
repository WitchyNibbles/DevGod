import type {
  ApprovalRecord,
  HandoffRecord,
  LockRecord,
  MarkdownArtifactRecord,
  MemoryEntryRecord,
  PlanArtifact,
  ProjectRecord,
  RetrievalMetadata,
  RetrievalRole,
  ReviewRecord,
  RunRecord,
  SearchMemoryResult,
  TaskRecord,
  WorkspaceRecord
} from "../domain/types.ts";
import { DEFAULT_RETRIEVAL_ROLE } from "../domain/contracts.ts";
import {
  buildArtifactSearchResult,
  buildMemorySearchResult,
  canRoleAccessRetrievalMetadata,
  compareMemorySearchResults
} from "../core/policy.ts";
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

interface SearchMemoryRow {
  id: string;
  sourceKind: "memory_entry" | "artifact";
  title: string;
  content: string;
  scope: SearchMemoryResult["scope"];
  metadata?: RetrievalMetadata | null;
  entryType?: MemoryEntryRecord["entryType"] | null;
  artifactKind?: MarkdownArtifactRecord["kind"] | null;
  actor?: string | null;
  reviewer?: string | null;
  runId: string;
  taskId: string | null;
  sourcePath?: string | null;
  sourceAnchor?: string | null;
  projectId: string | null;
  createdAt: string;
  vectorScore?: number | null;
}

interface EmbeddingJobRow {
  id: string;
  workspaceId: string;
  projectId: string | null;
  sourceTable: EmbeddingJobSourceTable;
  sourceId: string;
  embeddingModel: string;
  status: EmbeddingJobRecord["status"];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmbeddingSourceRow {
  sourceTable: EmbeddingJobSourceTable;
  sourceId: string;
  title: string;
  content: string;
}

function now(): string {
  return new Date().toISOString();
}

function mapEmbeddingJobRow(row: EmbeddingJobRow): EmbeddingJobRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId ?? undefined,
    sourceTable: row.sourceTable,
    sourceId: row.sourceId,
    embeddingModel: row.embeddingModel,
    status: row.status,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
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

  constructor(client: SqlClient) {
    this.client = client;
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

  async getHandoffs(taskId: string): Promise<HandoffRecord[]> {
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
       where task_id = $1
       order by created_at asc`,
      [taskId]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveReview(review: ReviewRecord): Promise<void> {
    await this.client.query(
      `insert into reviews (id, workspace_id, project_id, run_id, task_id, reviewer_role, state, severity, findings, waiver_reason)
       select $1, r.workspace_id, r.project_id, $2, $3, $4, $5, $6, $7, $8
       from runs r
       where r.id = $2`,
      [
        review.id,
        review.runId,
        review.taskId,
        review.reviewerRole,
        review.state,
        review.severity,
        review.findings,
        review.waiverReason ?? null
      ]
    );
  }

  async getReviews(taskId: string): Promise<ReviewRecord[]> {
    const result = await this.client.query<JsonRow<ReviewRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'taskId', task_id,
          'reviewerRole', reviewer_role,
          'state', state,
          'severity', severity,
          'findings', findings,
          'waiverReason', waiver_reason,
          'createdAt', created_at
       ) as payload
       from reviews
       where task_id = $1
       order by created_at asc`,
      [taskId]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveApproval(approval: ApprovalRecord): Promise<void> {
    await this.client.query(
      `insert into approvals (id, workspace_id, project_id, run_id, task_id, actor, decision, rationale)
       select $1, r.workspace_id, r.project_id, $2, $3, $4, $5, $6
       from runs r
       where r.id = $2`,
      [approval.id, approval.runId, approval.taskId, approval.actor, approval.decision, approval.rationale]
    );
  }

  async getApprovals(taskId: string): Promise<ApprovalRecord[]> {
    const result = await this.client.query<JsonRow<ApprovalRecord>>(
      `select jsonb_build_object(
          'id', id,
          'runId', run_id,
          'taskId', task_id,
          'actor', actor,
          'decision', decision,
          'rationale', rationale,
          'createdAt', created_at
       ) as payload
       from approvals
       where task_id = $1
       order by created_at asc`,
      [taskId]
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
    await this.clearDerivedEmbedding(input.sourceTable, input.sourceId);

    const queuedJob = await this.client.query<EmbeddingJobRow>(
      `insert into embedding_jobs (
         workspace_id, project_id, source_table, source_id, embedding_model, status
       )
       values ($1, $2, $3, $4, $5, 'pending')
       on conflict (source_table, source_id, embedding_model) do update
       set workspace_id = excluded.workspace_id,
           project_id = excluded.project_id,
           status = 'pending',
           error_message = null,
           updated_at = now()
       returning
         id,
         workspace_id as "workspaceId",
         project_id as "projectId",
         source_table as "sourceTable",
         source_id as "sourceId",
         embedding_model as "embeddingModel",
         status,
         error_message as "errorMessage",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [input.workspaceId, input.projectId ?? null, input.sourceTable, input.sourceId, input.embeddingModel]
    );

    const [job] = queuedJob.rows;
    if (!job) {
      throw new Error("failed to enqueue embedding job");
    }

    return mapEmbeddingJobRow(job);
  }

  async leaseEmbeddingJobs(input: LeaseEmbeddingJobsInput): Promise<EmbeddingJobRecord[]> {
    const leasedJobs = await this.client.query<EmbeddingJobRow>(
      `with leased as (
         select id
         from embedding_jobs
         where status = 'pending'
         order by created_at asc, id asc
         limit $1
         for update skip locked
       )
       update embedding_jobs j
       set status = 'processing',
           error_message = null,
           updated_at = now()
       where j.id in (select id from leased)
       returning
         j.id,
         j.workspace_id as "workspaceId",
         j.project_id as "projectId",
         j.source_table as "sourceTable",
         j.source_id as "sourceId",
         j.embedding_model as "embeddingModel",
         j.status,
         j.error_message as "errorMessage",
         j.created_at as "createdAt",
         j.updated_at as "updatedAt"`
      ,
      [input.limit]
    );

    return leasedJobs.rows.map(mapEmbeddingJobRow);
  }

  async getEmbeddingSource(
    sourceTable: EmbeddingJobSourceTable,
    sourceId: string
  ): Promise<EmbeddingSourceRecord | undefined> {
    if (sourceTable === "memory_entries") {
      const result = await this.client.query<EmbeddingSourceRow>(
        `select
           'memory_entries'::text as "sourceTable",
           id as "sourceId",
           title,
           content
         from memory_entries
         where id = $1`,
        [sourceId]
      );
      return result.rows[0];
    }

    const result = await this.client.query<EmbeddingSourceRow>(
      `select
         'artifacts'::text as "sourceTable",
         id as "sourceId",
         title,
         coalesce(content->>'text', content::text) as content
       from artifacts
       where id = $1`,
      [sourceId]
    );
    return result.rows[0];
  }

  async completeEmbeddingJob(input: CompleteEmbeddingJobInput): Promise<void> {
    await withTransaction(this.client, async () => {
      const completedJob = await this.client.query<EmbeddingJobRow>(
        `update embedding_jobs
         set status = 'done',
             error_message = null,
             updated_at = now()
         where id = $1
           and source_table = $2
           and source_id = $3
           and embedding_model = $4
           and status = 'processing'
         returning
           id,
           workspace_id as "workspaceId",
           project_id as "projectId",
           source_table as "sourceTable",
           source_id as "sourceId",
           embedding_model as "embeddingModel",
           status,
           error_message as "errorMessage",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        [input.jobId, input.sourceTable, input.sourceId, input.embeddingModel]
      );

      if (!completedJob.rows[0]) {
        throw new Error(`embedding job is not leased for completion: ${input.jobId}`);
      }

      const updatedRows = await this.writeDerivedEmbedding(
        input.sourceTable,
        input.sourceId,
        input.embedding,
        input.embeddingModel
      );

      if (updatedRows !== 1) {
        throw new Error(`embedding source not found for completion: ${input.sourceTable}:${input.sourceId}`);
      }
    });
  }

  async failEmbeddingJob(jobId: string, errorMessage: string): Promise<void> {
    await withTransaction(this.client, async () => {
      const result = await this.client.query(
        `update embedding_jobs
         set status = 'failed',
             error_message = $2,
             updated_at = now()
         where id = $1
           and status = 'processing'`,
        [jobId, errorMessage]
      );

      if ((result.rowCount ?? 0) !== 1) {
        throw new Error(`embedding job is not leased for failure: ${jobId}`);
      }
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
    const projectId = `project:${params.workspaceSlug}:${params.projectSlug}`;
    const recentLimit = Math.min(Math.max(params.limit * 5, 25), 200);
    const backfillLimit = Math.min(Math.max(params.limit * 3, 15), 100);
    const vectorLimit = Math.min(Math.max(params.limit * 3, 15), 100);
    const lexicalClauses = buildLexicalBackfillClauses(params.query, 5, "m", "m.content");

    const recentMemoryResult = await this.client.query<SearchMemoryRow>(
      `with project_context as (
         select p.id as project_id
         from projects p
         join workspaces w on w.id = p.workspace_id
         where w.slug = $1 and p.slug = $2
       )
       select
         m.id,
         'memory_entry'::text as "sourceKind",
         m.title,
         m.content,
         m.scope,
         m.metadata as metadata,
         m.entry_type as "entryType",
         m.actor,
         m.reviewer,
         m.run_id as "runId",
         m.task_id as "taskId",
         m.source_path as "sourcePath",
         m.source_anchor as "sourceAnchor",
         m.project_id as "projectId",
         m.created_at as "createdAt"
       from memory_entries m
       join project_context pc on true
       join workspaces w on w.id = m.workspace_id
       where w.slug = $1
         and m.status = 'approved'
         and (
           m.project_id = pc.project_id
           or ($3::boolean and m.scope = 'global')
         )
       order by
         case when m.project_id = pc.project_id then 0 else 1 end,
         m.created_at desc
       limit $4`,
      [params.workspaceSlug, params.projectSlug, params.includeGlobal, recentLimit]
    );

    const backfillMemoryResult = await this.client.query<SearchMemoryRow>(
      `with project_context as (
         select p.id as project_id
         from projects p
         join workspaces w on w.id = p.workspace_id
         where w.slug = $1 and p.slug = $2
       )
       select
         m.id,
         'memory_entry'::text as "sourceKind",
         m.title,
         m.content,
         m.scope,
         m.metadata as metadata,
         m.entry_type as "entryType",
         m.actor,
         m.reviewer,
         m.run_id as "runId",
         m.task_id as "taskId",
         m.source_path as "sourcePath",
         m.source_anchor as "sourceAnchor",
         m.project_id as "projectId",
         m.created_at as "createdAt"
       from memory_entries m
       join project_context pc on true
       join workspaces w on w.id = m.workspace_id
       where w.slug = $1
         and m.status = 'approved'
         and (
           m.project_id = pc.project_id
           or ($3::boolean and m.scope = 'global')
         )
         and ${lexicalClauses.sql}
       order by
         case when m.project_id = pc.project_id then 0 else 1 end,
         case when m.title ilike $4 then 0 else 1 end,
         m.created_at desc
       limit $${lexicalClauses.nextParam}`,
      [params.workspaceSlug, params.projectSlug, params.includeGlobal, `%${params.query}%`, ...lexicalClauses.values, backfillLimit]
    );

    const vectorMemoryResult =
      params.queryEmbedding && params.embeddingModel
        ? await this.client.query<SearchMemoryRow>(
            `with project_context as (
               select p.id as project_id
               from projects p
               join workspaces w on w.id = p.workspace_id
               where w.slug = $1 and p.slug = $2
             )
             select
               m.id,
               'memory_entry'::text as "sourceKind",
               m.title,
               m.content,
               m.scope,
               m.metadata as metadata,
               m.entry_type as "entryType",
               m.actor,
               m.reviewer,
               m.run_id as "runId",
               m.task_id as "taskId",
               m.source_path as "sourcePath",
               m.source_anchor as "sourceAnchor",
               m.project_id as "projectId",
               m.created_at as "createdAt",
               greatest(0, 1 - (m.embedding <=> $4::vector)) as "vectorScore"
             from memory_entries m
             join project_context pc on true
             join workspaces w on w.id = m.workspace_id
             where w.slug = $1
               and m.status = 'approved'
               and m.embedding is not null
               and m.embedding_model = $5
               and (
                 m.project_id = pc.project_id
                 or ($3::boolean and m.scope = 'global')
               )
             order by
               case when m.project_id = pc.project_id then 0 else 1 end,
               m.embedding <=> $4::vector asc,
               m.created_at desc
             limit $6`,
            [
              params.workspaceSlug,
              params.projectSlug,
              params.includeGlobal,
              formatVector(params.queryEmbedding),
              params.embeddingModel,
              vectorLimit
            ]
          )
        : { rows: [], rowCount: 0 };

    const recentArtifactResult = await this.client.query<SearchMemoryRow>(
      `with project_context as (
         select p.id as project_id
         from projects p
         join workspaces w on w.id = p.workspace_id
         where w.slug = $1 and p.slug = $2
       )
       select
         a.id,
         'artifact'::text as "sourceKind",
         a.title,
         coalesce(a.content->>'text', a.content::text) as content,
         'project'::text as scope,
         a.metadata as metadata,
         null::text as "entryType",
         a.kind as "artifactKind",
         null::text as actor,
         null::text as reviewer,
         a.run_id as "runId",
         null::text as "taskId",
         a.metadata->>'sourcePath' as "sourcePath",
         a.metadata->>'sourceAnchor' as "sourceAnchor",
         a.project_id as "projectId",
         a.created_at as "createdAt"
       from artifacts a
       join project_context pc on a.project_id = pc.project_id
       where a.kind = 'markdown_chunk'
       order by a.created_at desc
       limit $3`,
      [params.workspaceSlug, params.projectSlug, recentLimit]
    );

    const artifactLexicalClauses = buildLexicalBackfillClauses(
      params.query,
      4,
      "a",
      "coalesce(a.content->>'text', a.content::text)"
    );
    const backfillArtifactResult = await this.client.query<SearchMemoryRow>(
      `with project_context as (
         select p.id as project_id
         from projects p
         join workspaces w on w.id = p.workspace_id
         where w.slug = $1 and p.slug = $2
       )
       select
         a.id,
         'artifact'::text as "sourceKind",
         a.title,
         coalesce(a.content->>'text', a.content::text) as content,
         'project'::text as scope,
         a.metadata as metadata,
         null::text as "entryType",
         a.kind as "artifactKind",
         null::text as actor,
         null::text as reviewer,
         a.run_id as "runId",
         null::text as "taskId",
         a.metadata->>'sourcePath' as "sourcePath",
         a.metadata->>'sourceAnchor' as "sourceAnchor",
         a.project_id as "projectId",
         a.created_at as "createdAt"
       from artifacts a
       join project_context pc on a.project_id = pc.project_id
       where a.kind = 'markdown_chunk'
         and ${artifactLexicalClauses.sql}
       order by
         case when a.title ilike $3 then 0 else 1 end,
         a.created_at desc
       limit $${artifactLexicalClauses.nextParam}`,
      [`${params.workspaceSlug}`, `${params.projectSlug}`, `%${params.query}%`, ...artifactLexicalClauses.values, backfillLimit]
    );

    const vectorArtifactResult =
      params.queryEmbedding && params.embeddingModel
        ? await this.client.query<SearchMemoryRow>(
            `with project_context as (
               select p.id as project_id
               from projects p
               join workspaces w on w.id = p.workspace_id
               where w.slug = $1 and p.slug = $2
             )
             select
               a.id,
               'artifact'::text as "sourceKind",
               a.title,
               coalesce(a.content->>'text', a.content::text) as content,
               'project'::text as scope,
               a.metadata as metadata,
               null::text as "entryType",
               a.kind as "artifactKind",
               null::text as actor,
               null::text as reviewer,
               a.run_id as "runId",
               null::text as "taskId",
               a.metadata->>'sourcePath' as "sourcePath",
               a.metadata->>'sourceAnchor' as "sourceAnchor",
               a.project_id as "projectId",
               a.created_at as "createdAt",
               greatest(0, 1 - (a.embedding <=> $3::vector)) as "vectorScore"
             from artifacts a
             join project_context pc on a.project_id = pc.project_id
             where a.kind = 'markdown_chunk'
               and a.embedding is not null
               and a.embedding_model = $4
             order by a.embedding <=> $3::vector asc, a.created_at desc
             limit $5`,
            [params.workspaceSlug, params.projectSlug, formatVector(params.queryEmbedding), params.embeddingModel, vectorLimit]
          )
        : { rows: [], rowCount: 0 };

    return dedupeMemoryRows([
      ...recentMemoryResult.rows,
      ...backfillMemoryResult.rows,
      ...vectorMemoryResult.rows,
      ...recentArtifactResult.rows,
      ...backfillArtifactResult.rows,
      ...vectorArtifactResult.rows
    ])
      .filter((entry) => canRoleAccessRetrievalMetadata(entry.metadata ?? undefined, requesterRole))
      .map((entry) => {
        if (entry.sourceKind === "artifact") {
          const baseResult = buildArtifactSearchResult(
            {
              id: entry.id,
              kind: "markdown_chunk",
              title: entry.title,
              content: entry.content,
              sourcePath: entry.sourcePath ?? `artifact://${entry.id}`,
              sourceAnchor: entry.sourceAnchor ?? undefined,
              metadata: (entry.metadata ?? {}) as MarkdownArtifactRecord["metadata"],
              createdAt: entry.createdAt,
              runId: entry.runId
            },
            params.query,
            params.projectSlug
          );
          return {
            ...baseResult,
            score: baseResult.score + vectorScoreBoost(entry.vectorScore)
          };
        }

        const sameProject = entry.projectId === projectId;
        const baseResult = buildMemorySearchResult(
          {
            id: entry.id,
            title: entry.title,
            content: entry.content,
            scope: entry.scope,
            entryType: entry.entryType ?? "fact",
            actor: entry.actor ?? "",
            reviewer: entry.reviewer ?? "",
            runId: entry.runId,
            taskId: entry.taskId ?? undefined,
            sourcePath: entry.sourcePath ?? undefined,
            sourceAnchor: entry.sourceAnchor ?? undefined,
            metadata: entry.metadata ?? {},
            createdAt: entry.createdAt
          },
          params.query,
          sameProject,
          sameProject ? params.projectSlug : undefined
        );
        return {
          ...baseResult,
          score: baseResult.score + vectorScoreBoost(entry.vectorScore)
        };
      })
      .sort(compareMemorySearchResults)
      .slice(0, params.limit);
  }

  private async clearDerivedEmbedding(sourceTable: EmbeddingJobSourceTable, sourceId: string): Promise<void> {
    if (sourceTable === "memory_entries") {
      await this.client.query(
        `update memory_entries
         set embedding = null,
             embedding_model = null,
             updated_at = now()
         where id = $1`,
        [sourceId]
      );
      return;
    }

    await this.client.query(
      `update artifacts
       set embedding = null,
           embedding_model = null
       where id = $1`,
      [sourceId]
    );
  }

  private async writeDerivedEmbedding(
    sourceTable: EmbeddingJobSourceTable,
    sourceId: string,
    embedding: readonly number[],
    embeddingModel: string
  ): Promise<number> {
    const vectorValue = `[${embedding.join(",")}]`;

    if (sourceTable === "memory_entries") {
      const result = await this.client.query(
        `update memory_entries
         set embedding = $2::vector,
             embedding_model = $3,
             updated_at = now()
         where id = $1`,
        [sourceId, vectorValue, embeddingModel]
      );
      return result.rowCount ?? 0;
    }

    const result = await this.client.query(
      `update artifacts
       set embedding = $2::vector,
           embedding_model = $3
       where id = $1`,
      [sourceId, vectorValue, embeddingModel]
    );
    return result.rowCount ?? 0;
  }
}

function formatVector(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}

function vectorScoreBoost(vectorScore?: number | null): number {
  if (vectorScore === null || vectorScore === undefined || !Number.isFinite(vectorScore)) {
    return 0;
  }

  return Math.max(0, vectorScore) * 6;
}

function buildLexicalBackfillClauses(
  query: string,
  startParam: number,
  alias: string,
  contentExpression: string
): {
  sql: string;
  values: string[];
  nextParam: number;
} {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].slice(0, 5);
  const values = terms.map((term) => `%${term}%`);
  const clauses = values.map(
    (_value, index) => `(${alias}.title ilike $${startParam + index} or ${contentExpression} ilike $${startParam + index})`
  );

  return {
    sql: clauses.length > 0 ? clauses.join(" and ") : "true",
    values,
    nextParam: startParam + values.length
  };
}

function dedupeMemoryRows(rows: readonly SearchMemoryRow[]): SearchMemoryRow[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
