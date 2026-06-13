import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  ProjectRecord,
  RuntimeProjectRegistrationRecord,
  WorkspaceRecord
} from "../src/domain/types.ts";
import {
  embedQueryText,
  runEmbeddingJobs,
  type EmbeddingProvider
} from "../src/runtime/embedding-runner.ts";
import {
  generateRepoInventory
} from "../src/runtime/repo-inventory.ts";
import {
  inspectRepoContextFreshness,
  probeRepoContextProfile,
  readRepoContextProfile,
  type RepoContextProfileRecord
} from "../src/runtime/repo-context-profile.ts";
import { PostgresEmbeddingJobs } from "../src/store/postgres-embedding-jobs.ts";
import { searchMemory } from "../src/store/postgres-memory-search.ts";
import { PostgresStore, type SqlClient, type SqlQueryResult } from "../src/store/postgres-store.ts";

interface QueryCapture {
  text: string;
  values: readonly unknown[] | undefined;
}

type QueryResponse<Row = Record<string, unknown>> =
  | Row[]
  | {
      rows: Row[];
      rowCount?: number | null;
    };

function sqlClientWithResponses(
  responses: readonly QueryResponse[],
  capture?: QueryCapture[]
): SqlClient {
  let callIndex = 0;

  return {
    async query<T>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<T>> {
      capture?.push({ text, values });
      const response = responses[Math.min(callIndex, responses.length - 1)] ?? [];
      callIndex += 1;

      if (Array.isArray(response)) {
        return {
          rows: response as T[],
          rowCount: response.length
        };
      }

      return {
        rows: response.rows as T[],
        rowCount: response.rowCount ?? response.rows.length
      };
    }
  };
}

function projectContext(): {
  workspace: WorkspaceRecord;
  project: ProjectRecord;
} {
  return {
    workspace: {
      id: "workspace:team",
      slug: "team",
      name: "Team",
      createdAt: "2026-06-13T08:00:00.000Z"
    },
    project: {
      id: "project:team:devgod",
      workspaceId: "workspace:team",
      slug: "devgod",
      name: "Devgod",
      repoPath: undefined,
      createdAt: "2026-06-13T08:00:00.000Z"
    }
  };
}

function runtimeRegistrationWithProfile(
  repoPath: string,
  profile: RepoContextProfileRecord | Record<string, unknown>
): RuntimeProjectRegistrationRecord {
  return {
    projectId: "project:team:devgod",
    workspaceId: "workspace:team",
    repoPath,
    runtimeProfile: "local-docker",
    dataRoot: path.join(repoPath, ".devgod"),
    installManifestPath: ".devgod/install-manifest.json",
    manifest: {
      repoContextProfile: profile
    },
    provenance: {
      authority: "runtime_authoritative"
    },
    createdAt: "2026-06-13T08:00:00.000Z",
    updatedAt: "2026-06-13T08:00:00.000Z"
  };
}

test("probeRepoContextProfile finds nested Python signals and inspectRepoContextFreshness reports fresh and stale states", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-repo-context-direct-"));

  try {
    await mkdir(path.join(repoRoot, "env"), { recursive: true });
    await mkdir(path.join(repoRoot, "services", "app"), { recursive: true });
    await writeFile(path.join(repoRoot, "env", "pyvenv.cfg"), "home = /usr/bin/python3\n", "utf8");
    await writeFile(path.join(repoRoot, "services", "app", "manage.py"), "print('manage')\n", "utf8");
    await writeFile(
      path.join(repoRoot, "services", "app", "settings.py"),
      ["import os", "TARGET = os.environ.get('DATABASE_TARGET', 'dev')", "print(TARGET)"].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          scripts: {
            test: "pytest",
            lint: "ruff check .",
            typecheck: "pyright ."
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const profile = await probeRepoContextProfile({
      repoRoot,
      now: "2026-06-13T08:00:00.000Z"
    });

    assert.equal(profile.status, "ready");
    assert.equal(profile.slots["python.virtualenvPath"]?.value, "env");
    assert.equal(profile.slots["django.managePyPath"]?.value, "services/app/manage.py");
    assert.equal(profile.slots["django.dbEnvSelectorVariable"]?.value, "DATABASE_TARGET");
    assert.equal(profile.slots["django.dbEnvSelectorVariable"]?.confidence, "medium");
    assert.equal(profile.slots["commands.typecheck"]?.value, "pyright .");

    const store = {
      async getProjectContext() {
        return projectContext();
      },
      async getProjectRuntimeRegistration() {
        return runtimeRegistrationWithProfile(repoRoot, profile);
      }
    };

    const fresh = await inspectRepoContextFreshness({
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      store
    });

    assert.equal(fresh.state, "fresh");
    assert.equal(fresh.items.length >= 4, true);

    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          scripts: {
            test: "pytest -q",
            lint: "ruff check .",
            typecheck: "pyright ."
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const stale = await inspectRepoContextFreshness({
      env: {
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod"
      },
      store
    });

    assert.equal(stale.state, "stale");
    assert.match(stale.summary, /no longer matches/);
    assert.equal(stale.items.every((item) => item.freshness === "stale"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("inspectRepoContextFreshness handles missing metadata and probe failures defensively", async () => {
  const missingEnv = await inspectRepoContextFreshness({
    env: {},
    store: {
      async getProjectContext() {
        assert.fail("store should not be queried when env is incomplete");
      },
      async getProjectRuntimeRegistration() {
        assert.fail("store should not be queried when env is incomplete");
      }
    }
  });
  assert.equal(missingEnv.state, "degraded");

  const missingProject = await inspectRepoContextFreshness({
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    store: {
      async getProjectContext() {
        return undefined;
      },
      async getProjectRuntimeRegistration() {
        assert.fail("registration lookup should not run without project context");
      }
    }
  });
  assert.equal(missingProject.state, "degraded");

  const missingRegistration = await inspectRepoContextFreshness({
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    store: {
      async getProjectContext() {
        return projectContext();
      },
      async getProjectRuntimeRegistration() {
        return undefined;
      }
    }
  });
  assert.equal(missingRegistration.state, "missing");

  const missingProfile = await inspectRepoContextFreshness({
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    store: {
      async getProjectContext() {
        return projectContext();
      },
      async getProjectRuntimeRegistration() {
        return {
          ...runtimeRegistrationWithProfile(process.cwd(), {}),
          manifest: {}
        };
      }
    }
  });
  assert.equal(missingProfile.state, "missing");

  const syntheticProfile: RepoContextProfileRecord = {
    status: "ready",
    repoRoot: "/missing/repo",
    fingerprint: "fingerprint",
    refreshedAt: "2026-06-13T08:00:00.000Z",
    slots: {
      "commands.test": {
        slotKey: "commands.test",
        title: "Test command",
        value: "npm test",
        sourceKind: "derived_manifest",
        sourceRefs: ["package.json"],
        capturedAt: "2026-06-13T08:00:00.000Z",
        lastValidatedAt: "2026-06-13T08:00:00.000Z",
        staleAfterDays: 30,
        confidence: "high"
      }
    }
  };

  const degraded = await inspectRepoContextFreshness({
    env: {
      DEVGOD_WORKSPACE_SLUG: "team",
      DEVGOD_PROJECT_SLUG: "devgod"
    },
    store: {
      async getProjectContext() {
        return projectContext();
      },
      async getProjectRuntimeRegistration() {
        return runtimeRegistrationWithProfile("/missing/repo", syntheticProfile);
      }
    }
  });
  assert.equal(degraded.state, "degraded");
  assert.equal(degraded.items[0]?.freshness, "stale");
  const malformedRegistration = runtimeRegistrationWithProfile(process.cwd(), {});
  malformedRegistration.manifest.repoContextProfile = "bad";
  assert.equal(readRepoContextProfile(malformedRegistration), undefined);
});

test("probeRepoContextProfile degrades cleanly when no runtime hints are present", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-repo-context-empty-"));

  try {
    await writeFile(path.join(repoRoot, "README.md"), "no runtime hints\n", "utf8");

    const profile = await probeRepoContextProfile({
      repoRoot,
      now: "2026-06-13T08:00:00.000Z"
    });

    assert.equal(profile.status, "degraded");
    assert.deepEqual(profile.slots, {});
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("embedQueryText prefers embedQuery and falls back to a synthetic job payload", async () => {
  const directProvider: EmbeddingProvider = {
    async embed() {
      assert.fail("embed should not run when embedQuery is available");
    },
    async embedQuery(input) {
      assert.deepEqual(input, {
        model: "text-embedding-3-small",
        text: "deploy rollback"
      });
      return [0.1, 0.2];
    }
  };

  assert.deepEqual(
    await embedQueryText({
      provider: directProvider,
      model: "text-embedding-3-small",
      text: "deploy rollback"
    }),
    [0.1, 0.2]
  );

  let fallbackCall:
    | {
        jobId: string;
        title: string;
        content: string;
      }
    | undefined;

  const fallbackEmbedding = await embedQueryText({
    provider: {
      async embed(input) {
        fallbackCall = {
          jobId: input.job.id,
          title: input.source.title,
          content: input.source.content
        };
        return [0.9, 0.8, 0.7];
      }
    },
    model: "text-embedding-3-large",
    text: "find similar incidents"
  });

  assert.deepEqual(fallbackEmbedding, [0.9, 0.8, 0.7]);
  assert.deepEqual(fallbackCall, {
    jobId: "query:text-embedding-3-large",
    title: "query",
    content: "find similar incidents"
  });
});

test("runEmbeddingJobs rejects invalid vectors and redacts provider secrets", async () => {
  const leasedJob = {
    id: "job-1",
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries" as const,
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small",
    status: "processing" as const,
    createdAt: "2026-06-13T08:00:00.000Z",
    updatedAt: "2026-06-13T08:00:00.000Z"
  };
  const source = {
    sourceTable: "memory_entries" as const,
    sourceId: "memory-1",
    title: " Incident playbook ",
    content: " rollback notes "
  };
  const failures: string[] = [];

  const invalidResult = await runEmbeddingJobs({
    limit: 5,
    provider: {
      async embed(input) {
        assert.equal(input.text, "Incident playbook\n\nrollback notes");
        return [Number.NaN];
      }
    },
    store: {
      async leaseEmbeddingJobs() {
        return [leasedJob];
      },
      async getEmbeddingSource() {
        return source;
      },
      async completeEmbeddingJob() {
        assert.fail("invalid embeddings should not be completed");
      },
      async failEmbeddingJob(_jobId, errorMessage) {
        failures.push(errorMessage);
      }
    }
  });

  assert.deepEqual(invalidResult, { leased: 1, completed: 0, failed: 1 });
  assert.equal(failures[0], "embedding provider returned an invalid vector");

  failures.length = 0;

  const redactedResult = await runEmbeddingJobs({
    limit: 5,
    provider: {
      async embed() {
        throw new Error(
          "AKIA1234567890ABCDEF postgres://alice:secret@db.internal token=live api_key=secret"
        );
      }
    },
    store: {
      async leaseEmbeddingJobs() {
        return [leasedJob];
      },
      async getEmbeddingSource() {
        return source;
      },
      async completeEmbeddingJob() {
        assert.fail("failed embeddings should not be completed");
      },
      async failEmbeddingJob(_jobId, errorMessage) {
        failures.push(errorMessage);
      }
    }
  });

  assert.deepEqual(redactedResult, { leased: 1, completed: 0, failed: 1 });
  assert.equal(failures[0]?.includes("AKIA1234567890ABCDEF"), false);
  assert.equal(failures[0]?.includes("alice:secret"), false);
  assert.equal(failures[0]?.includes("api_key=secret"), false);
  assert.match(failures[0] ?? "", /\[REDACTED_AWS_KEY\]/);
  assert.match(failures[0] ?? "", /postgres:\/\/\[REDACTED\]@/);
  assert.match(failures[0] ?? "", /\[REDACTED_SECRET\]/);
});

test("generateRepoInventory recognizes additional signals, export aliases, and unreadable symlinks", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-repo-inventory-direct-"));

  try {
    await mkdir(path.join(repoRoot, "src", "admin"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "mcp"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "runtime"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "shared"), { recursive: true });
    await mkdir(path.join(repoRoot, "scripts"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "src", "shared", "worker.ts"),
      [
        "export function loadToken() { return 'token'; }",
        "export function applyPolicy() { return 'policy'; }",
        "export const authority = 'principal';",
        "export { loadToken as authorizeAlias };"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(repoRoot, "src", "admin", "router.ts"),
      [
        "import workerDefault, * as sharedNs from '../shared/worker.ts';",
        "import { loadToken as authToken, applyPolicy } from '../shared/worker.ts';",
        "const envKey = 'ADMIN_API_URL';",
        "const handlers = { status: () => authToken() };",
        "export function route(command, app, method) {",
        "  handlers[command]?.();",
        "  app[method]('/status', () => workerDefault?.() ?? sharedNs.authority);",
        "  return applyPolicy() + process.env[envKey];",
        "}"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(repoRoot, "src", "runtime", "effects.ts"),
      [
        "import { mkdir, rm } from 'node:fs/promises';",
        "import { exec, spawn } from 'node:child_process';",
        "export async function persistRuntime() {",
        "  await mkdir('tmp');",
        "  await rm('tmp', { recursive: true, force: true });",
        "  spawn('echo', ['ok']);",
        "  exec('echo ok');",
        "}"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(repoRoot, "src", "mcp", "client.ts"),
      "export async function fetchMcp() { return fetch('https://example.com'); }\n",
      "utf8"
    );
    await writeFile(path.join(repoRoot, "scripts", "bootstrap.sh"), "echo boot\n", "utf8");
    await symlink(
      path.join(repoRoot, "src", "runtime", "missing-target.ts"),
      path.join(repoRoot, "src", "runtime", "broken.ts")
    );

    const result = await generateRepoInventory({
      repoRoot,
      include: ["src", "scripts", "src/admin/router.ts"],
      now: "2026-06-13T08:00:00.000Z"
    });

    const routeSignal = result.coverageItems.find((item) => item.id === "route:src/admin/router.ts");
    const authSignal = result.coverageItems.find((item) => item.category === "authentication");
    const authzSignal = result.coverageItems.find((item) => item.category === "authorization");
    const runtimeSignal = result.coverageItems.find((item) => item.id === "runtime-side-effects:src/runtime/effects.ts");
    const integrationSignal = result.coverageItems.find((item) => item.id === "integration:src/mcp/client.ts");
    const brokenFile = result.coverageItems.find((item) => item.id === "file:src/runtime/broken.ts");
    const adminGap = result.gaps.find((gap) => gap.targetId === "file:src/admin/router.ts");

    assert.equal(routeSignal?.state, "partially_analyzed");
    assert.equal(authSignal?.sources.includes("src/admin/router.ts") || authSignal?.sources.includes("src/shared/worker.ts"), true);
    assert.equal(authzSignal?.sources.includes("src/admin/router.ts") || authzSignal?.sources.includes("src/shared/worker.ts"), true);
    assert.deepEqual(runtimeSignal?.sideEffects, [
      "changes filesystem layout",
      "executes subprocesses"
    ]);
    assert.equal(integrationSignal?.category, "external_integrations");
    assert.equal(brokenFile?.sources[0], "src/runtime/broken.ts");
    assert.equal(adminGap?.severity, "high");
    assert.ok(
      result.understandingMaps.some(
        (map) =>
          map.kind === "authz_map" &&
          (map.sourceRefs.includes("src/admin/router.ts") || map.sourceRefs.includes("src/shared/worker.ts"))
      )
    );
    assert.ok(
      result.understandingMaps.some(
        (map) =>
          map.kind === "symbol_graph" &&
          map.sourceRefs.includes("symbol:src/shared/worker.ts#authorizeAlias")
      )
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("generateRepoInventory classifies domain, config, install, test, and script surfaces", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-repo-inventory-categories-"));

  try {
    await mkdir(path.join(repoRoot, "src", "domain"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "install"), { recursive: true });
    await mkdir(path.join(repoRoot, "scripts"), { recursive: true });
    await mkdir(path.join(repoRoot, "tests"), { recursive: true });
    await writeFile(path.join(repoRoot, "package.json"), '{"name":"fixture"}\n', "utf8");
    await writeFile(path.join(repoRoot, "tsconfig.json"), '{"compilerOptions":{"module":"nodenext"}}\n', "utf8");
    await writeFile(path.join(repoRoot, "src", "domain", "model.ts"), "export interface Proof {}\n", "utf8");
    await writeFile(
      path.join(repoRoot, "src", "install", "setup.ts"),
      "export async function installConfig() { return process.env.DEVGOD_TOKEN; }\n",
      "utf8"
    );
    await writeFile(path.join(repoRoot, "scripts", "setup.sh"), "echo setup\n", "utf8");
    await writeFile(path.join(repoRoot, "tests", "proof.test.ts"), "export const ok = true;\n", "utf8");

    const result = await generateRepoInventory({
      repoRoot,
      include: ["src", "scripts", "tests", "package.json", "tsconfig.json", "missing"],
      now: "2026-06-13T08:00:00.000Z"
    });

    assert.equal(result.coverageItems.find((item) => item.id === "file:src/domain/model.ts")?.category, "models");
    assert.equal(
      result.coverageItems.find((item) => item.id === "file:src/install/setup.ts")?.category,
      "configuration"
    );
    assert.equal(
      result.coverageItems.find((item) => item.id === "file:scripts/setup.sh")?.category,
      "runtime_side_effects"
    );
    assert.equal(result.coverageItems.find((item) => item.id === "file:tests/proof.test.ts")?.state, "fully_analyzed");
    assert.equal(result.coverageItems.find((item) => item.id === "file:package.json")?.category, "configuration");
    assert.equal(result.coverageItems.find((item) => item.id === "file:tsconfig.json")?.criticality, "low");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("searchMemory directly exercises vector, artifact, workflow, and empty-lexical query paths", async () => {
  const capture: QueryCapture[] = [];
  const client = sqlClientWithResponses(
    [
      [
        {
          id: "memory-1",
          sourceKind: "memory_entry",
          title: "Project note",
          content: "retrieval alpha",
          scope: "project",
          metadata: {},
          entryType: "pattern",
          actor: "memory_curator",
          reviewer: "memory_curator",
          runId: "run-memory",
          taskId: null,
          sourcePath: ".devgod/memory/project.md",
          sourceAnchor: "alpha",
          projectId: "project:team:devgod",
          createdAt: "2026-06-13T08:00:00.000Z"
        }
      ],
      [],
      [],
      [
        {
          id: "artifact-1",
          sourceKind: "artifact",
          title: "Artifact note",
          content: "retrieval alpha artifact",
          scope: "project",
          metadata: {
            sourcePath: "docs/runbook.md"
          },
          artifactKind: "markdown_chunk",
          actor: null,
          reviewer: null,
          runId: "run-artifact",
          taskId: null,
          sourcePath: "docs/runbook.md",
          sourceAnchor: "artifact-alpha",
          projectId: "project:team:devgod",
          createdAt: "2026-06-13T07:00:00.000Z"
        }
      ],
      [],
      [
        {
          id: "artifact-vector",
          sourceKind: "artifact",
          title: "Vector artifact",
          content: "retrieval alpha vector",
          scope: "project",
          metadata: {},
          artifactKind: "markdown_chunk",
          actor: null,
          reviewer: null,
          runId: "run-artifact-vector",
          taskId: null,
          sourcePath: "docs/vector.md",
          sourceAnchor: null,
          projectId: "project:team:devgod",
          createdAt: "2026-06-13T06:00:00.000Z",
          vectorScore: 0.99
        }
      ],
      [
        {
          id: "workflow-1",
          sourceKind: "workflow_document",
          title: "Execution brief",
          content: "retrieval alpha workflow",
          scope: "project",
          metadata: {},
          workflowDocumentKind: "brief",
          actor: null,
          reviewer: null,
          runId: "run-brief",
          taskId: "task-1",
          sourcePath: null,
          sourceAnchor: null,
          projectId: "project:team:devgod",
          createdAt: "2026-06-13T05:00:00.000Z"
        }
      ]
    ],
    capture
  );

  const results = await searchMemory(client, {
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "retrieval alpha",
    limit: 5,
    includeGlobal: false,
    queryEmbedding: [0.1, 0.2],
    embeddingModel: "text-embedding-3-small"
  });

  assert.equal(capture.length, 7);
  assert.match(capture[2]?.text ?? "", /m\.embedding <=> \$4::vector/);
  assert.match(capture[5]?.text ?? "", /a\.embedding <=> \$3::vector/);
  assert.deepEqual(
    new Set(results.map((result) => result.id)),
    new Set(["artifact-vector", "artifact-1", "workflow-1", "memory-1"])
  );

  const lexicalCapture: QueryCapture[] = [];
  await searchMemory(
    sqlClientWithResponses([[], [], [], [], []], lexicalCapture),
    {
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "!!!",
      limit: 3,
      includeGlobal: false
    }
  );

  assert.match(lexicalCapture[1]?.text ?? "", /and true/);
  assert.match(lexicalCapture[3]?.text ?? "", /and true/);
  assert.match(lexicalCapture[4]?.text ?? "", /where true/);
});

test("searchMemory directly filters restricted rows and redacts global provenance", async () => {
  const restrictedRows = [
    [
      {
        id: "restricted-1",
        sourceKind: "memory_entry",
        title: "Security-only note",
        content: "incident response details",
        scope: "project",
        metadata: {
          retrievalRoles: ["security_reviewer"],
          tags: ["incident"]
        },
        entryType: "pattern",
        actor: "memory_curator",
        reviewer: "memory_curator",
        runId: "run-project",
        taskId: null,
        sourcePath: ".devgod/memory/security.md",
        sourceAnchor: null,
        projectId: "project:team:devgod",
        createdAt: "2026-06-13T08:00:00.000Z"
      }
    ],
    [],
    [],
    [],
    []
  ];

  const plannerResults = await searchMemory(sqlClientWithResponses(restrictedRows), {
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident response details",
    limit: 5,
    includeGlobal: false
  });
  assert.equal(plannerResults.length, 0);

  const securityResults = await searchMemory(sqlClientWithResponses(restrictedRows), {
    workspaceSlug: "team",
    projectSlug: "devgod",
    query: "incident response details",
    limit: 5,
    includeGlobal: false,
    requesterRole: "security_reviewer"
  });
  assert.deepEqual(securityResults[0]?.metadata.allowedRoles, ["security_reviewer"]);

  const globalResults = await searchMemory(
    sqlClientWithResponses([
      [
        {
          id: "global-1",
          sourceKind: "memory_entry",
          title: "Global note",
          content: "shared orchestration",
          scope: "global",
          metadata: {},
          entryType: "pattern",
          actor: "memory_curator@example.com",
          reviewer: "memory_curator@example.com",
          runId: "run-global",
          taskId: "task-global",
          sourcePath: null,
          sourceAnchor: null,
          projectId: null,
          createdAt: "2026-06-13T08:00:00.000Z"
        }
      ],
      [],
      [],
      [],
      []
    ]),
    {
      workspaceSlug: "team",
      projectSlug: "devgod",
      query: "shared orchestration",
      limit: 5,
      includeGlobal: true
    }
  );

  assert.equal(globalResults[0]?.provenance.actor, undefined);
  assert.equal(globalResults[0]?.citation.runId, undefined);
});

test("PostgresEmbeddingJobs handles enqueue and transaction failure paths", async () => {
  const enqueueCapture: QueryCapture[] = [];
  const enqueueJobs = new PostgresEmbeddingJobs(
    sqlClientWithResponses(
      [
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 }
      ],
      enqueueCapture
    )
  );

  await assert.rejects(
    enqueueJobs.queueEmbeddingJob({
      workspaceId: "workspace:team",
      projectId: "project:team:devgod",
      sourceTable: "artifacts",
      sourceId: "artifact-1",
      embeddingModel: "text-embedding-3-small"
    }),
    /failed to enqueue embedding job/
  );
  assert.match(enqueueCapture[0]?.text ?? "", /update artifacts/);
  assert.match(enqueueCapture[1]?.text ?? "", /insert into embedding_jobs/);

  const completeCapture: QueryCapture[] = [];
  const completionJobs = new PostgresEmbeddingJobs(
    sqlClientWithResponses(
      [
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              id: "job-1",
              workspaceId: "workspace:team",
              projectId: "project:team:devgod",
              sourceTable: "memory_entries",
              sourceId: "memory-1",
              embeddingModel: "text-embedding-3-small",
              status: "processing",
              errorMessage: null,
              createdAt: "2026-06-13T08:00:00.000Z",
              updatedAt: "2026-06-13T08:00:00.000Z"
            }
          ],
          rowCount: 1
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 }
      ],
      completeCapture
    )
  );

  await assert.rejects(
    completionJobs.completeEmbeddingJob({
      jobId: "job-1",
      sourceTable: "memory_entries",
      sourceId: "memory-1",
      embeddingModel: "text-embedding-3-small",
      embedding: [0.1, 0.2]
    }),
    /embedding source not found for completion/
  );
  assert.deepEqual(
    completeCapture.map((query) => query.text.trim().split("\n")[0]),
    ["begin", "select", "update memory_entries", "rollback"]
  );

  const failureCapture: QueryCapture[] = [];
  const failingJobs = new PostgresEmbeddingJobs(
    sqlClientWithResponses(
      [
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 }
      ],
      failureCapture
    )
  );

  await assert.rejects(failingJobs.failEmbeddingJob("job-1", "provider timeout"), /not leased for failure/);
  assert.deepEqual(
    failureCapture.map((query) => query.text.trim()),
    ["begin", "update embedding_jobs\n         set status = 'failed',\n             error_message = $2,\n             updated_at = now()\n         where id = $1\n           and status = 'processing'", "rollback"]
  );
});

test("PostgresEmbeddingJobs supports successful queue, lease, source lookup, and completion flows", async () => {
  const capture: QueryCapture[] = [];
  const jobs = new PostgresEmbeddingJobs(
    sqlClientWithResponses(
      [
        { rows: [], rowCount: 1 },
        {
          rows: [
            {
              id: "job-memory",
              workspaceId: "workspace:team",
              projectId: "project:team:devgod",
              sourceTable: "memory_entries",
              sourceId: "memory-1",
              embeddingModel: "text-embedding-3-small",
              status: "pending",
              errorMessage: null,
              createdAt: "2026-06-13T08:00:00.000Z",
              updatedAt: "2026-06-13T08:00:00.000Z"
            }
          ],
          rowCount: 1
        },
        {
          rows: [
            {
              id: "job-memory",
              workspaceId: "workspace:team",
              projectId: "project:team:devgod",
              sourceTable: "memory_entries",
              sourceId: "memory-1",
              embeddingModel: "text-embedding-3-small",
              status: "processing",
              errorMessage: null,
              createdAt: "2026-06-13T08:00:00.000Z",
              updatedAt: "2026-06-13T08:00:01.000Z"
            }
          ],
          rowCount: 1
        },
        {
          rows: [
            {
              sourceTable: "memory_entries",
              sourceId: "memory-1",
              title: "Incident playbook",
              content: "rollback notes"
            }
          ],
          rowCount: 1
        },
        {
          rows: [
            {
              sourceTable: "artifacts",
              sourceId: "artifact-1",
              title: "Artifact note",
              content: "artifact body"
            }
          ],
          rowCount: 1
        },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              id: "job-memory",
              workspaceId: "workspace:team",
              projectId: "project:team:devgod",
              sourceTable: "memory_entries",
              sourceId: "memory-1",
              embeddingModel: "text-embedding-3-small",
              status: "processing",
              errorMessage: null,
              createdAt: "2026-06-13T08:00:00.000Z",
              updatedAt: "2026-06-13T08:00:01.000Z"
            }
          ],
          rowCount: 1
        },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 }
      ],
      capture
    )
  );

  const queued = await jobs.queueEmbeddingJob({
    workspaceId: "workspace:team",
    projectId: "project:team:devgod",
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small"
  });
  assert.equal(queued.status, "pending");

  const leased = await jobs.leaseEmbeddingJobs({ limit: 1 });
  assert.equal(leased[0]?.status, "processing");

  const memorySource = await jobs.getEmbeddingSource("memory_entries", "memory-1");
  const artifactSource = await jobs.getEmbeddingSource("artifacts", "artifact-1");
  assert.equal(memorySource?.title, "Incident playbook");
  assert.equal(artifactSource?.content, "artifact body");

  await jobs.completeEmbeddingJob({
    jobId: "job-memory",
    sourceTable: "memory_entries",
    sourceId: "memory-1",
    embeddingModel: "text-embedding-3-small",
    embedding: [0.1, 0.2, 0.3]
  });

  assert.equal(capture.some((query) => /update memory_entries/.test(query.text)), true);
  assert.equal(capture.some((query) => /commit/.test(query.text)), true);
});

test("PostgresStore private artifact hydration preserves requested order and short-circuits empty ids", async () => {
  const store = new PostgresStore(
    sqlClientWithResponses([
      [
        {
          id: "artifact-2",
          runId: "run-2",
          kind: "markdown_chunk",
          title: "Second",
          content: "beta",
          sourcePath: "docs/two.md",
          sourceAnchor: null,
          metadata: { chunkIndex: 2 },
          createdAt: "2026-06-13T08:00:00.000Z"
        },
        {
          id: "artifact-1",
          runId: "run-1",
          kind: "markdown_chunk",
          title: "First",
          content: "alpha",
          sourcePath: "docs/one.md",
          sourceAnchor: "top",
          metadata: { chunkIndex: 1 },
          createdAt: "2026-06-13T07:00:00.000Z"
        }
      ]
    ])
  );

  const loader = store as unknown as {
    loadArtifactsByIds(
      projectSlug: string,
      artifactIds: readonly string[]
    ): Promise<Array<{ id: string; title: string }>>;
  };

  assert.deepEqual(await loader.loadArtifactsByIds("devgod", []), []);

  const hydrated = await loader.loadArtifactsByIds("devgod", ["artifact-1", "artifact-2", "missing"]);
  assert.deepEqual(
    hydrated.map((artifact) => artifact.id),
    ["artifact-1", "artifact-2"]
  );
});
