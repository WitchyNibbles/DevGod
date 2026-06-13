import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { currentIsoDateInTimezone, resolveDateRangeFromQuery } from "../src/docs-export/date-resolver.ts";
import { resolveObsidianConfig, validateObsidianConfig } from "../src/docs-export/obsidian-config.ts";
import type { ExportDocsRequest, WorklogEntry } from "../src/docs-export/models.ts";
import { parseExportDocsRequest } from "../src/docs-export/parser.ts";
import { ObsidianMarkdownRenderer } from "../src/docs-export/renderer.ts";
import { DocsSummarizer } from "../src/docs-export/summarizer.ts";
import { RuntimeWorklogProvider } from "../src/docs-export/worklog-provider.ts";
import type {
  ApprovalRecord,
  HandoffRecord,
  IntakeSummary,
  MemoryEntryRecord,
  PlanArtifact,
  ReviewRecord,
  RunRecord,
  TaskRecord
} from "../src/domain/types.ts";

function createConfig() {
  return {
    enabled: true,
    vaultPath: "/vault",
    defaultProject: "devgod",
    dailyFolder: "Devgod/Daily",
    docsFolder: "Devgod/Docs",
    adrFolder: "Devgod/ADR",
    timezone: "Europe/Madrid"
  };
}

function createSummary(): IntakeSummary {
  return {
    goal: "Export work notes",
    audience: ["maintainers"],
    constraints: [],
    risks: [],
    unknowns: [],
    successCriteria: ["note written"],
    outOfScope: [],
    trustBoundaries: [],
    destructiveActions: [],
    externalIntegrations: [],
    stopGo: "go"
  };
}

function createRequest(overrides: Partial<ExportDocsRequest> = {}): ExportDocsRequest {
  return {
    rawQuery: "summarize the recent work",
    dateFrom: "2026-05-12",
    dateTo: "2026-05-12",
    project: "devgod",
    format: "daily_summary",
    style: "listed",
    includeSections: ["summary", "topics", "decisions", "tasks", "bugs", "files", "next_steps"],
    destination: "Devgod/Daily",
    timezone: "Europe/Madrid",
    ...overrides
  };
}

function createWorklogEntry(): WorklogEntry {
  const run: RunRecord = {
    id: "run-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    actor: "manager",
    title: "Export docs implementation",
    request: "Document the export pipeline",
    summary: createSummary(),
    status: "approved",
    createdAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T12:00:00.000Z"
  };

  const plan: PlanArtifact = {
    id: "plan-1",
    runId: run.id,
    kind: "plan",
    title: "Export docs plan",
    content: {
      runId: run.id,
      title: "Export docs plan",
      summary: "Ship the export pipeline.",
      milestones: ["parser", "renderer"],
      decisions: ["Use runtime history as the export source."],
      residualRisks: ["Summaries can miss nuance."],
      acceptanceCriteria: ["Markdown note written"]
    },
    createdAt: "2026-05-12T08:30:00.000Z"
  };

  const tasks: TaskRecord[] = [
    {
      id: "task-record-1",
      runId: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      status: "approved",
      claimedBy: "backend-worker",
      createdAt: "2026-05-12T09:00:00.000Z",
      updatedAt: "2026-05-12T10:00:00.000Z",
      packet: {
        taskId: "parser",
        title: "Implement request parser",
        ownerRole: "backend_engineer",
        completionStandard: "specialist_verified",
        requiredSpecialistRoles: ["backend_engineer"],
        qualityGates: ["product_acceptance"],
        goal: "Parse natural-language export requests",
        inputs: ["brief"],
        outputs: ["parser"],
        dependencies: [],
        allowedWriteScope: ["src/docs-export"],
        outOfScope: ["installer changes"],
        acceptanceCriteria: ["parsing works"],
        verificationSteps: ["run parser tests"],
        requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
        securityChecks: ["no path traversal"],
        antiPatterns: ["giant parser"],
        rollbackNotes: "remove parser",
        handoffFormat: "summary"
      }
    },
    {
      id: "task-record-2",
      runId: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      status: "in_progress",
      claimedBy: "backend-worker",
      createdAt: "2026-05-12T09:30:00.000Z",
      updatedAt: "2026-05-12T11:00:00.000Z",
      packet: {
        taskId: "renderer",
        title: "Implement markdown renderer",
        ownerRole: "backend_engineer",
        completionStandard: "specialist_verified",
        requiredSpecialistRoles: ["backend_engineer"],
        qualityGates: ["product_acceptance"],
        goal: "Render markdown summaries",
        inputs: ["summary"],
        outputs: ["markdown"],
        dependencies: ["parser"],
        allowedWriteScope: ["src/docs-export"],
        outOfScope: ["installer changes"],
        acceptanceCriteria: ["renderer works"],
        verificationSteps: ["run renderer tests"],
        requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
        securityChecks: ["no unsafe output"],
        antiPatterns: ["skip headings"],
        rollbackNotes: "remove renderer",
        handoffFormat: "summary"
      }
    }
  ];

  const handoffsByTask: Record<string, HandoffRecord[]> = {
    parser: [
      {
        id: "handoff-1",
        runId: run.id,
        taskId: "parser",
        actor: "backend-worker",
        ownerRole: "backend_engineer",
        completionStandard: "specialist_verified",
        summary: "Parser complete",
        changedFiles: ["src/docs-export/parser.ts", "src/docs-export/parser.ts"],
        blockers: [],
        verificationNotes: ["parser tests added"],
        executionEvidence: ["request object produced"],
        qualityGateEvidence: ["dates resolved"],
        contextRefs: ["brief://obsidian-export"],
        createdAt: "2026-05-12T10:15:00.000Z"
      }
    ],
    renderer: [
      {
        id: "handoff-2",
        runId: run.id,
        taskId: "renderer",
        actor: "backend-worker",
        ownerRole: "backend_engineer",
        completionStandard: "specialist_verified",
        summary: "Renderer in progress",
        changedFiles: ["src/docs-export/renderer.ts"],
        blockers: ["Need richer title heuristics"],
        verificationNotes: ["renderer scaffolded"],
        executionEvidence: ["markdown rendered"],
        qualityGateEvidence: ["frontmatter added"],
        contextRefs: ["brief://obsidian-export"],
        createdAt: "2026-05-12T11:15:00.000Z"
      }
    ]
  };

  const reviewsByTask: Record<string, ReviewRecord[]> = {
    parser: [],
    renderer: [
      {
        id: "review-1",
        runId: run.id,
        taskId: "renderer",
        reviewerRole: "reviewer",
        actor: "reviewer-1",
        actorRole: "reviewer",
        identityAssurance: "authenticated",
        state: "blocked",
        severity: "medium",
        findings: ["Need richer title heuristics"],
        waiverAuthority: "none",
        createdAt: "2026-05-12T11:30:00.000Z"
      }
    ]
  };

  const approvalsByTask: Record<string, ApprovalRecord[]> = {
    parser: [
      {
        id: "approval-1",
        runId: run.id,
        taskId: "parser",
        actor: "manager",
        actorRole: "reviewer",
        identityAssurance: "authenticated",
        decision: "approved",
        rationale: "Parser is clean and matches the current command architecture.",
        createdAt: "2026-05-12T10:30:00.000Z"
      }
    ],
    renderer: [
      {
        id: "approval-2",
        runId: run.id,
        taskId: "renderer",
        actor: "manager",
        actorRole: "reviewer",
        identityAssurance: "authenticated",
        decision: "approved",
        rationale: "All required reviews passed",
        createdAt: "2026-05-12T11:45:00.000Z"
      }
    ]
  };

  const decisionMemoryEntries: MemoryEntryRecord[] = [
    {
      id: "memory-1",
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      runId: run.id,
      taskId: "renderer",
      scope: "project",
      entryType: "decision",
      title: "Fallback title policy",
      content: "Prefer project summaries when the request is broad.",
      reviewer: "memory_curator",
      actor: "memory_curator",
      status: "approved",
      metadata: { authorityLevel: "reviewed_memory" },
      createdAt: "2026-05-12T11:00:00.000Z"
    }
  ];

  return {
    run,
    plan,
    tasks,
    handoffsByTask,
    reviewsByTask,
    approvalsByTask,
    decisionMemoryEntries
  };
}

test("docs-export source modules resolve request parsing and timezone-aware date defaults in-process", () => {
  const config = createConfig();
  const now = new Date("2026-05-12T10:00:00.000Z");

  const request = parseExportDocsRequest("give me a listed summary of all things we worked on the 10th of this month", config, {
    now
  });
  assert.deepEqual(
    {
      format: request.format,
      style: request.style,
      dateFrom: request.dateFrom,
      dateTo: request.dateTo,
      destination: request.destination
    },
    {
      format: "daily_summary",
      style: "listed",
      dateFrom: "2026-05-10",
      dateTo: "2026-05-10",
      destination: "Devgod/Daily"
    }
  );
  assert.deepEqual(request.includeSections, ["summary", "topics", "decisions", "tasks", "bugs", "files", "next_steps"]);

  const decisionRequest = parseExportDocsRequest("adr bugs files from 2026-05-01 to 2026-05-03", config, { now });
  assert.deepEqual(
    {
      format: decisionRequest.format,
      destination: decisionRequest.destination,
      dateFrom: decisionRequest.dateFrom,
      dateTo: decisionRequest.dateTo
    },
    {
      format: "decision_log",
      destination: "Devgod/ADR",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03"
    }
  );

  assert.throws(() => parseExportDocsRequest("   ", config), /requires a natural-language request/);
  assert.deepEqual(resolveDateRangeFromQuery("this month", { timezone: config.timezone, now }), {
    dateFrom: "2026-05-01",
    dateTo: "2026-05-12"
  });
  assert.deepEqual(resolveDateRangeFromQuery("sometime later", { timezone: config.timezone, now }), {});
  assert.throws(() => resolveDateRangeFromQuery("today", { timezone: "Mars/Base", now }), /Invalid timezone: Mars\/Base/);
  assert.equal(currentIsoDateInTimezone(new Date("2026-05-12T23:30:00.000Z"), "America/New_York"), "2026-05-12");
});

test("docs-export source modules resolve, validate, and normalize Obsidian config in-process", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-docs-export-source-config-"));
  const vaultPath = path.join(directory, "vault");

  try {
    await mkdir(vaultPath, { recursive: true });

    const config = resolveObsidianConfig(
      {
        DEVGOD_PROJECT_NAME: "fallback-project",
        DEVGOD_OBSIDIAN_DEFAULT_PROJECT: "obsidian-project",
        DEVGOD_OBSIDIAN_ENABLED: "Yes",
        DEVGOD_OBSIDIAN_VAULT_PATH: "./vault",
        DEVGOD_OBSIDIAN_DAILY_FOLDER: "/Daily\\/",
        DEVGOD_OBSIDIAN_DOCS_FOLDER: " Docs ",
        DEVGOD_OBSIDIAN_ADR_FOLDER: "\\ADR\\",
        DEVGOD_OBSIDIAN_TIMEZONE: "Europe/Madrid"
      },
      {
        cwd: directory,
        projectSlug: "devgod"
      }
    );

    assert.deepEqual(
      {
        enabled: config.enabled,
        defaultProject: config.defaultProject,
        vaultPath: config.vaultPath,
        dailyFolder: config.dailyFolder,
        docsFolder: config.docsFolder,
        adrFolder: config.adrFolder,
        timezone: config.timezone
      },
      {
        enabled: true,
        defaultProject: "obsidian-project",
        vaultPath,
        dailyFolder: "Daily",
        docsFolder: "Docs",
        adrFolder: "ADR",
        timezone: "Europe/Madrid"
      }
    );

    await validateObsidianConfig(config);
    await assert.rejects(() => validateObsidianConfig({ ...config, enabled: false }), /Obsidian export is disabled/);
    await assert.rejects(
      () => validateObsidianConfig({ ...config, vaultPath: path.join(directory, "missing-vault") }),
      /does not exist/
    );

    const fallback = resolveObsidianConfig(
      {
        DEVGOD_PROJECT_NAME: "devgod",
        DEVGOD_OBSIDIAN_ENABLED: "",
        DEVGOD_OBSIDIAN_VAULT_PATH: "   ",
        DEVGOD_OBSIDIAN_DAILY_FOLDER: "   ",
        DEVGOD_OBSIDIAN_DOCS_FOLDER: "   ",
        DEVGOD_OBSIDIAN_ADR_FOLDER: "   "
      },
      {
        cwd: directory,
        projectSlug: "devgod"
      }
    );
    assert.equal(fallback.enabled, false);
    assert.equal(fallback.vaultPath, undefined);
    assert.equal(fallback.dailyFolder, "Devgod/Daily");
    assert.equal(fallback.docsFolder, "Devgod/Docs");
    assert.equal(fallback.adrFolder, "Devgod/ADR");

    assert.throws(
      () => resolveObsidianConfig({ DEVGOD_OBSIDIAN_ENABLED: "maybe" }, { cwd: directory, projectSlug: "devgod" }),
      /Invalid boolean value: maybe/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("docs-export source modules render markdown summaries and synthesize user-facing titles in-process", () => {
  const request = createRequest();
  const entry = createWorklogEntry();
  const summary = new DocsSummarizer().summarize([entry], request);
  const markdown = new ObsidianMarkdownRenderer().render(summary, request);

  assert.equal(summary.title, "Devgod work summary - 2026-05-12");
  assert.match(summary.summary, /1 run matched 2026-05-12/);
  assert.deepEqual(summary.topics, [
    "Export docs implementation",
    "parser",
    "renderer",
    "Implement request parser",
    "Implement markdown renderer"
  ]);
  assert.deepEqual(summary.decisions, [
    "Use runtime history as the export source.",
    "Prefer project summaries when the request is broad.",
    "Parser is clean and matches the current command architecture."
  ]);
  assert.deepEqual(summary.files, ["src/docs-export/parser.ts", "src/docs-export/renderer.ts"]);
  assert.deepEqual(summary.bugs, ["Need richer title heuristics"]);
  assert.deepEqual(summary.nextSteps, ["Implement markdown renderer (in_progress)", "Summaries can miss nuance.", "Need richer title heuristics"]);
  assert.deepEqual(summary.relatedNotes, ["[[Devgod]]"]);
  assert.doesNotMatch(summary.decisions.join("\n"), /All required reviews passed/);

  assert.match(markdown, /^---\n/m);
  assert.match(markdown, /title: "Devgod work summary - 2026-05-12"/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Main topics/);
  assert.match(markdown, /## Decisions made/);
  assert.match(markdown, /## Tasks/);
  assert.match(markdown, /## Bugs \/ issues/);
  assert.match(markdown, /## Files or areas touched/);
  assert.match(markdown, /## Next steps/);
  assert.match(markdown, /## Related notes/);
  assert.match(markdown, /- \[ \] Implement markdown renderer \(in_progress\)/);
});

test("RuntimeWorklogProvider collects plan, task-scoped records, and decision memories in-process", async () => {
  const request = createRequest({ dateFrom: "2026-05-10", dateTo: "2026-05-12" });
  const run: RunRecord = {
    id: "run-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    actor: "manager",
    title: "Export docs implementation",
    request: "Document the export pipeline",
    summary: createSummary(),
    status: "approved",
    createdAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T12:00:00.000Z"
  };
  const plan: PlanArtifact = {
    id: "plan-1",
    runId: run.id,
    kind: "plan",
    title: "Export docs plan",
    content: {
      runId: run.id,
      title: "Export docs plan",
      summary: "Ship the export pipeline.",
      milestones: ["parser"],
      decisions: ["Use runtime history as the export source."],
      residualRisks: [],
      acceptanceCriteria: ["Markdown note written"]
    },
    createdAt: "2026-05-12T08:30:00.000Z"
  };
  const tasks: TaskRecord[] = [
    {
      id: "task-record-1",
      runId: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      status: "approved",
      claimedBy: "backend-worker",
      createdAt: "2026-05-12T09:00:00.000Z",
      updatedAt: "2026-05-12T10:00:00.000Z",
      packet: {
        taskId: "parser",
        title: "Implement request parser",
        ownerRole: "backend_engineer",
        completionStandard: "specialist_verified",
        requiredSpecialistRoles: ["backend_engineer"],
        qualityGates: ["product_acceptance"],
        goal: "Parse natural-language export requests",
        inputs: ["brief"],
        outputs: ["parser"],
        dependencies: [],
        allowedWriteScope: ["src/docs-export"],
        outOfScope: ["installer changes"],
        acceptanceCriteria: ["parsing works"],
        verificationSteps: ["run parser tests"],
        requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
        securityChecks: ["no path traversal"],
        antiPatterns: ["giant parser"],
        rollbackNotes: "remove parser",
        handoffFormat: "summary"
      }
    }
  ];
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const store = {
    async findRunsByProjectActivity(input: Record<string, unknown>) {
      calls.push({ method: "findRunsByProjectActivity", args: [input] });
      return [run];
    },
    async getPlan(runId: string) {
      calls.push({ method: "getPlan", args: [runId] });
      return plan;
    },
    async getTasksByRun(runId: string) {
      calls.push({ method: "getTasksByRun", args: [runId] });
      return tasks;
    },
    async getHandoffs(runId: string, taskId: string) {
      calls.push({ method: "getHandoffs", args: [runId, taskId] });
      return [
        {
          id: "handoff-1",
          runId,
          taskId,
          actor: "backend-worker",
          ownerRole: "backend_engineer",
          completionStandard: "specialist_verified",
          summary: "Parser complete",
          changedFiles: ["src/docs-export/parser.ts"],
          blockers: [],
          verificationNotes: ["parser tests added"],
          executionEvidence: ["request object produced"],
          qualityGateEvidence: ["dates resolved"],
          contextRefs: ["brief://obsidian-export"],
          createdAt: "2026-05-12T10:15:00.000Z"
        }
      ];
    },
    async getReviews(runId: string, taskId: string) {
      calls.push({ method: "getReviews", args: [runId, taskId] });
      return [
        {
          id: "review-1",
          runId,
          taskId,
          reviewerRole: "reviewer",
          actor: "reviewer-1",
          actorRole: "reviewer",
          identityAssurance: "authenticated",
          state: "approved",
          severity: "low",
          findings: [],
          waiverAuthority: "none",
          createdAt: "2026-05-12T10:30:00.000Z"
        }
      ];
    },
    async getApprovals(runId: string, taskId: string) {
      calls.push({ method: "getApprovals", args: [runId, taskId] });
      return [
        {
          id: "approval-1",
          runId,
          taskId,
          actor: "manager",
          actorRole: "reviewer",
          identityAssurance: "authenticated",
          decision: "approved",
          rationale: "Parser is clean and matches the current command architecture.",
          createdAt: "2026-05-12T10:45:00.000Z"
        }
      ];
    },
    async listMemoryEntries(input: Record<string, unknown>) {
      calls.push({ method: "listMemoryEntries", args: [input] });
      return [
        {
          id: "memory-1",
          workspaceId: run.workspaceId,
          projectId: run.projectId,
          runId: run.id,
          taskId: "parser",
          scope: "project",
          entryType: "decision",
          title: "Parser fallback",
          content: "Prefer explicit dates when the request includes a range.",
          reviewer: "memory_curator",
          actor: "memory_curator",
          status: "approved",
          metadata: { authorityLevel: "reviewed_memory" },
          createdAt: "2026-05-12T10:00:00.000Z"
        }
      ];
    }
  };

  const provider = new RuntimeWorklogProvider(store as never, {
    workspaceSlug: "team",
    projectSlug: "devgod"
  });
  const entries = await provider.getEntries(request);

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0]?.run, run);
  assert.deepEqual(entries[0]?.plan, plan);
  assert.deepEqual(entries[0]?.tasks, tasks);
  assert.equal(entries[0]?.handoffsByTask.parser.length, 1);
  assert.equal(entries[0]?.reviewsByTask.parser.length, 1);
  assert.equal(entries[0]?.approvalsByTask.parser.length, 1);
  assert.equal(entries[0]?.decisionMemoryEntries.length, 1);
  assert.deepEqual(calls, [
    {
      method: "findRunsByProjectActivity",
      args: [
        {
          workspaceSlug: "team",
          projectSlug: "devgod",
          dateFrom: "2026-05-10",
          dateTo: "2026-05-12",
          timezone: "Europe/Madrid"
        }
      ]
    },
    { method: "getPlan", args: ["run-1"] },
    { method: "getTasksByRun", args: ["run-1"] },
    { method: "getHandoffs", args: ["run-1", "parser"] },
    { method: "getReviews", args: ["run-1", "parser"] },
    { method: "getApprovals", args: ["run-1", "parser"] },
    {
      method: "listMemoryEntries",
      args: [
        {
          runId: "run-1",
          entryType: "decision",
          status: "approved"
        }
      ]
    }
  ]);
});
