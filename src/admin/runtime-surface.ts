import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createPlanContextEmbedQuery,
  createRuntimeStore,
  executeDoctorCommandFromArgs,
  executeOpsCommandFromArgs,
  executePlanContextCommandFromArgs,
  executeReportCommandFromArgs,
  executeStatusCommandFromArgs
} from "../admin.ts";
import { DevgodCoreService } from "../core/service.ts";
import type {
  RecoveryInspectionReport,
  RetrievalRole,
  RoutingRecommendationReport,
  RunStatusSnapshot,
  SearchMemoryResult
} from "../domain/types.ts";
import { PostgresStore } from "../store/postgres-store.ts";
import { loadDotEnv, withClient } from "./db.ts";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../..");

interface RuntimeSurfaceService {
  getStatus(runId: string): Promise<RunStatusSnapshot>;
  recommendRouting(runId: string): Promise<RoutingRecommendationReport>;
  inspectRecovery(runId: string, input: { staleAfterHours: number }): Promise<RecoveryInspectionReport>;
  searchMemory(input: {
    workspaceSlug: string;
    projectSlug: string;
    query: string;
    limit: number;
    includeGlobal: boolean;
    queryEmbedding?: readonly number[] | undefined;
    embeddingModel?: string | undefined;
    requesterRole?: RetrievalRole | undefined;
  }): Promise<readonly SearchMemoryResult[]>;
}

type RuntimeClient = Parameters<Parameters<typeof withClient>[0]>[0];

export interface RuntimeSurfaceDependencies {
  loadDotEnv?: typeof loadDotEnv;
  withClient?: typeof withClient;
  createStore?: (client: RuntimeClient) => PostgresStore;
  createService?: (store: PostgresStore) => RuntimeSurfaceService;
  createPlanContextEmbedQuery?: typeof createPlanContextEmbedQuery;
}

export interface RuntimeSurfaceOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  dependencies?: RuntimeSurfaceDependencies | undefined;
}

function resolveContext(options: RuntimeSurfaceOptions) {
  return {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env
  };
}

async function withRuntime<T>(
  options: RuntimeSurfaceOptions,
  callback: (input: { store: PostgresStore; service: RuntimeSurfaceService; env: NodeJS.ProcessEnv; cwd: string }) => Promise<T>
): Promise<T> {
  const context = resolveContext(options);
  const dependencies = options.dependencies ?? {};
  const loadDotEnvImpl = dependencies.loadDotEnv ?? loadDotEnv;
  const withClientImpl = dependencies.withClient ?? withClient;
  const createStoreImpl = dependencies.createStore ?? ((client: RuntimeClient) => createRuntimeStore(client));
  const createServiceImpl = dependencies.createService ?? ((store: PostgresStore) => new DevgodCoreService(store));

  await loadDotEnvImpl();

  return withClientImpl(async (client) => {
    const store = createStoreImpl(client);
    const service = createServiceImpl(store);
    return callback({
      store,
      service,
      env: context.env,
      cwd: context.cwd
    });
  });
}

export async function getStatusSurface(args: readonly string[], options: RuntimeSurfaceOptions = {}) {
  return withRuntime(options, async ({ store, service, env, cwd }) =>
    executeStatusCommandFromArgs(args, {
      cwd,
      env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      }
    })
  );
}

export async function getRuntimeHealthSurface(args: readonly string[], options: RuntimeSurfaceOptions = {}) {
  return withRuntime(options, async ({ store, service, env, cwd }) =>
    executeDoctorCommandFromArgs(args, {
      cwd,
      env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      findProjectContext(workspaceSlug, projectSlug) {
        return store.getProjectContext({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getProjectRuntimeRegistration(projectId) {
        return store.getProjectRuntimeRegistration(projectId);
      }
    })
  );
}

export async function getOpsSurface(args: readonly string[], options: RuntimeSurfaceOptions = {}) {
  return withRuntime(options, async ({ store, service, env, cwd }) =>
    executeOpsCommandFromArgs(args, {
      cwd,
      env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getRoutingReport(runId) {
        return service.recommendRouting(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      }
    })
  );
}

export async function getReportSurface(args: readonly string[], options: RuntimeSurfaceOptions = {}) {
  return withRuntime(options, async ({ store, service, env, cwd }) =>
    executeReportCommandFromArgs(args, {
      cwd,
      env,
      findLatestRun(workspaceSlug, projectSlug) {
        return store.findLatestRun({ workspaceSlug, projectSlug });
      },
      getStatusSnapshot(runId) {
        return service.getStatus(runId);
      },
      getRoutingReport(runId) {
        return service.recommendRouting(runId);
      },
      inspectRecovery(runId, staleAfterHours) {
        return service.inspectRecovery(runId, { staleAfterHours });
      },
      getHandoffs(runId, taskId) {
        return store.getHandoffs(runId, taskId);
      },
      getReviews(runId, taskId) {
        return store.getReviews(runId, taskId);
      },
      getApprovals(runId, taskId) {
        return store.getApprovals(runId, taskId);
      }
    })
  );
}

export async function getPlanContextSurface(args: readonly string[], options: RuntimeSurfaceOptions = {}) {
  const createPlanContextEmbedQueryImpl =
    options.dependencies?.createPlanContextEmbedQuery ?? createPlanContextEmbedQuery;

  return withRuntime(options, async ({ service, env }) => {
    const embedQuery = await createPlanContextEmbedQueryImpl(env);
    return executePlanContextCommandFromArgs(args, {
      env,
      searchMemory(input) {
        return service.searchMemory(input);
      },
      embedQuery
    });
  });
}

export function getRepoRoot(): string {
  return repoRoot;
}
