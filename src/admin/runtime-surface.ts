import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  executeOpsCommandFromArgs,
  executePlanContextCommandFromArgs,
  executeReportCommandFromArgs,
  executeStatusCommandFromArgs
} from "../admin.ts";
import { DevgodCoreService } from "../core/service.ts";
import { PostgresStore } from "../store/postgres-store.ts";
import { loadDotEnv, withClient } from "./db.ts";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../..");

export interface RuntimeSurfaceOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function resolveContext(options: RuntimeSurfaceOptions) {
  return {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env
  };
}

async function withRuntime<T>(
  options: RuntimeSurfaceOptions,
  callback: (input: { store: PostgresStore; service: DevgodCoreService; env: NodeJS.ProcessEnv; cwd: string }) => Promise<T>
): Promise<T> {
  await loadDotEnv();
  const context = resolveContext(options);

  return withClient(async (client) => {
    const store = new PostgresStore(client);
    const service = new DevgodCoreService(store);
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
  return withRuntime(options, async ({ service, env }) =>
    executePlanContextCommandFromArgs(args, {
      env,
      searchMemory(input) {
        return service.searchMemory(input);
      }
    })
  );
}

export function getRepoRoot(): string {
  return repoRoot;
}
