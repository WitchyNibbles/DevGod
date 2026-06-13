import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  executeExportDocsCommandFromArgs
} from "../src/admin.ts";
import { currentIsoDateInTimezone, resolveDateRangeFromQuery } from "../src/docs-export/date-resolver.ts";
import { resolveObsidianConfig, validateObsidianConfig } from "../src/docs-export/obsidian-config.ts";
import { sanitizeMarkdownFilename, ObsidianVaultWriter } from "../src/docs-export/obsidian-writer.ts";
import { parseExportDocsRequest } from "../src/docs-export/parser.ts";
import { ObsidianMarkdownRenderer } from "../src/docs-export/renderer.ts";
import { DocsSummarizer } from "../src/docs-export/summarizer.ts";
import { buildObsidianTargetPath } from "../src/docs-export/targets.ts";
import type { ExportDocsRequest, ExportDocsSummary, WorklogEntry } from "../src/docs-export/models.ts";
import { RuntimeWorklogProvider } from "../src/docs-export/worklog-provider.ts";
import type { IntakeSummary, MemoryEntryRecord, PlanArtifact, RunRecord, TaskRecord } from "../src/domain/types.ts";
import { MemoryStore } from "../src/store/memory-store.ts";

function buildSummary(): IntakeSummary {
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

async function seedExportFixture(store: MemoryStore) {
  const { workspace, project } = await store.ensureProjectContext({
    workspaceSlug: "team",
    projectSlug: "devgod",
    projectName: "devgod"
  });

  const matchingRun: RunRecord = {
    id: "run-2026-05-10",
    workspaceId: workspace.id,
    projectId: project.id,
    actor: "manager",
    title: "Obsidian export implementation",
    request: "Build the export-docs feature",
    summary: buildSummary(),
    status: "approved",
    createdAt: "2026-05-09T09:00:00.000Z",
    updatedAt: "2026-05-10T16:00:00.000Z"
  };
  await store.createRun(matchingRun);

  const plan: PlanArtifact = {
    id: "plan-1",
    runId: matchingRun.id,
    kind: "plan",
    title: "Export docs plan",
    content: {
      runId: matchingRun.id,
      title: "Export docs plan",
      summary: "Ship a modular export pipeline.",
      milestones: ["parser", "writer"],
      decisions: ["Use runtime history as the worklog source."],
      residualRisks: ["LLM-free summaries may miss nuance."],
      acceptanceCriteria: ["Markdown note written"]
    },
    createdAt: "2026-05-10T09:30:00.000Z"
  };
  await store.savePlan(plan);

  const tasks: TaskRecord[] = [
    {
      id: "task-1",
      runId: matchingRun.id,
      workspaceId: workspace.id,
      projectId: project.id,
      status: "approved",
      claimedBy: "backend-worker",
      createdAt: "2026-05-10T10:00:00.000Z",
      updatedAt: "2026-05-10T12:00:00.000Z",
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
      id: "task-2",
      runId: matchingRun.id,
      workspaceId: workspace.id,
      projectId: project.id,
      status: "in_progress",
      claimedBy: "backend-worker",
      createdAt: "2026-05-10T10:30:00.000Z",
      updatedAt: "2026-05-10T16:00:00.000Z",
      packet: {
        taskId: "writer",
        title: "Implement vault writer",
        ownerRole: "backend_engineer",
        completionStandard: "specialist_verified",
        requiredSpecialistRoles: ["backend_engineer"],
        qualityGates: ["product_acceptance"],
        goal: "Write Markdown into the Obsidian vault safely",
        inputs: ["brief"],
        outputs: ["writer"],
        dependencies: ["parser"],
        allowedWriteScope: ["src/docs-export"],
        outOfScope: ["UI work"],
        acceptanceCriteria: ["writer blocks traversal"],
        verificationSteps: ["run writer tests"],
        requiredReviews: ["reviewer", "security_reviewer", "qa_engineer"],
        securityChecks: ["guard vault root"],
        antiPatterns: ["unsafe resolve"],
        rollbackNotes: "remove writer",
        handoffFormat: "summary"
      }
    }
  ];
  await store.replaceTasks(tasks);

  await store.saveHandoff({
    id: "handoff-1",
    runId: matchingRun.id,
    taskId: "parser",
    actor: "backend-worker",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    summary: "Parser complete",
    changedFiles: ["src/docs-export/parser.ts", "src/docs-export/date-resolver.ts"],
    blockers: [],
    verificationNotes: ["parser tests added"],
    executionEvidence: ["request object produced"],
    qualityGateEvidence: ["dates resolved"],
    contextRefs: ["brief://obsidian-export"],
    createdAt: "2026-05-10T12:30:00.000Z"
  });

  await store.saveHandoff({
    id: "handoff-2",
    runId: matchingRun.id,
    taskId: "writer",
    actor: "backend-worker",
    ownerRole: "backend_engineer",
    completionStandard: "specialist_verified",
    summary: "Writer in progress",
    changedFiles: ["src/docs-export/obsidian-writer.ts"],
    blockers: ["Need overwrite semantics"],
    verificationNotes: ["writer scaffolded"],
    executionEvidence: ["vault writer added"],
    qualityGateEvidence: ["path checks covered"],
    contextRefs: ["brief://obsidian-export"],
    createdAt: "2026-05-10T15:00:00.000Z"
  });

  await store.saveReview({
    id: "review-1",
    runId: matchingRun.id,
    taskId: "writer",
    reviewerRole: "reviewer",
    actor: "reviewer-1",
    actorRole: "reviewer",
    identityAssurance: "authenticated",
    state: "blocked",
    severity: "medium",
    findings: ["Writer still needs overwrite-by-default protection tests."],
    waiverAuthority: "none",
    createdAt: "2026-05-10T15:30:00.000Z"
  });

  await store.saveApproval({
    id: "approval-1",
    runId: matchingRun.id,
    taskId: "parser",
    actor: "manager",
    actorRole: "reviewer",
    identityAssurance: "authenticated",
    decision: "approved",
    rationale: "Parser is clean and matches the current command architecture.",
    createdAt: "2026-05-10T14:00:00.000Z"
  });

  const memoryOnlyRun: RunRecord = {
    id: "run-2026-05-08",
    workspaceId: workspace.id,
    projectId: project.id,
    actor: "manager",
    title: "Decision-memory follow-up",
    request: "Capture a reviewed runtime decision",
    summary: buildSummary(),
    status: "approved",
    createdAt: "2026-05-08T09:00:00.000Z",
    updatedAt: "2026-05-08T12:00:00.000Z"
  };
  await store.createRun(memoryOnlyRun);

  const decisionMemoryEntry: MemoryEntryRecord = {
    id: "memory-1",
    workspaceId: workspace.id,
    projectId: project.id,
    runId: memoryOnlyRun.id,
    taskId: "memory-review",
    scope: "project",
    entryType: "decision",
    title: "Export promoted decisions",
    content: "Promoted decision memory should appear in exports.",
    reviewer: "memory_curator",
    actor: "memory_curator",
    status: "approved",
    metadata: {
      authorityLevel: "reviewed_memory"
    },
    createdAt: "2026-05-10T11:00:00.000Z"
  };
  await store.saveMemoryEntry(decisionMemoryEntry);

  const outsideRun: RunRecord = {
    id: "run-2026-05-12",
    workspaceId: workspace.id,
    projectId: project.id,
    actor: "manager",
    title: "Unrelated follow-up",
    request: "Refine docs later",
    summary: buildSummary(),
    status: "done",
    createdAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T09:00:00.000Z"
  };
  await store.createRun(outsideRun);
}

test("parseExportDocsRequest parses natural-language defaults and sections", () => {
  const request = parseExportDocsRequest(
    "give me a listed summary of all things we worked on the 10th of this month",
    {
      enabled: true,
      vaultPath: "/vault",
      defaultProject: "devgod",
      dailyFolder: "Devgod/Daily",
      docsFolder: "Devgod/Docs",
      adrFolder: "Devgod/ADR",
      timezone: "Europe/Madrid"
    },
    {
      now: new Date("2026-05-12T10:00:00.000Z")
    }
  );

  assert.equal(request.format, "daily_summary");
  assert.equal(request.style, "listed");
  assert.equal(request.dateFrom, "2026-05-10");
  assert.equal(request.dateTo, "2026-05-10");
  assert.deepEqual(request.includeSections, [
    "summary",
    "topics",
    "decisions",
    "tasks",
    "bugs",
    "files",
    "next_steps"
  ]);
});

test("parseExportDocsRequest routes feature, project, and decision exports to the configured folders", () => {
  const config = {
    enabled: true,
    vaultPath: "/vault",
    defaultProject: "devgod",
    dailyFolder: "Devgod/Daily",
    docsFolder: "Devgod/Docs",
    adrFolder: "Devgod/ADR",
    timezone: "Europe/Madrid"
  };

  const featureRequest = parseExportDocsRequest("document auth retries in a concise format", config, {
    now: new Date("2026-05-12T10:00:00.000Z")
  });
  const projectSummaryRequest = parseExportDocsRequest("project summary this week", config, {
    now: new Date("2026-05-12T10:00:00.000Z")
  });
  const decisionLogRequest = parseExportDocsRequest("adr bugs files from 2026-05-01 to 2026-05-03", config, {
    now: new Date("2026-05-12T10:00:00.000Z")
  });

  assert.equal(featureRequest.format, "feature_doc");
  assert.equal(featureRequest.style, "concise");
  assert.equal(featureRequest.destination, "Devgod/Docs");
  assert.equal(featureRequest.dateFrom, undefined);
  assert.equal(featureRequest.dateTo, undefined);

  assert.equal(projectSummaryRequest.format, "project_summary");
  assert.equal(projectSummaryRequest.destination, "Devgod/Docs");
  assert.deepEqual(
    { dateFrom: projectSummaryRequest.dateFrom, dateTo: projectSummaryRequest.dateTo },
    { dateFrom: "2026-05-11", dateTo: "2026-05-12" }
  );

  assert.equal(decisionLogRequest.format, "decision_log");
  assert.equal(decisionLogRequest.destination, "Devgod/ADR");
  assert.deepEqual(
    { dateFrom: decisionLogRequest.dateFrom, dateTo: decisionLogRequest.dateTo },
    { dateFrom: "2026-05-01", dateTo: "2026-05-03" }
  );
  assert.deepEqual(decisionLogRequest.includeSections, [
    "summary",
    "topics",
    "decisions",
    "tasks",
    "next_steps",
    "bugs",
    "files"
  ]);
});

test("parseExportDocsRequest defaults undated daily summaries to today in the configured timezone", () => {
  const request = parseExportDocsRequest(
    "summarize the recent work",
    {
      enabled: true,
      vaultPath: "/vault",
      defaultProject: "devgod",
      dailyFolder: "Devgod/Daily",
      docsFolder: "Devgod/Docs",
      adrFolder: "Devgod/ADR",
      timezone: "Europe/Madrid"
    },
    {
      now: new Date("2026-05-12T10:00:00.000Z")
    }
  );

  assert.equal(request.format, "daily_summary");
  assert.deepEqual(
    { dateFrom: request.dateFrom, dateTo: request.dateTo },
    { dateFrom: "2026-05-12", dateTo: "2026-05-12" }
  );
  assert.equal(request.destination, "Devgod/Daily");
});

test("parseExportDocsRequest rejects blank input and preserves task-oriented section requests without a style hint", () => {
  const config = {
    enabled: true,
    vaultPath: "/vault",
    defaultProject: "devgod",
    dailyFolder: "Devgod/Daily",
    docsFolder: "Devgod/Docs",
    adrFolder: "Devgod/ADR",
    timezone: "Europe/Madrid"
  };

  assert.throws(() => parseExportDocsRequest("   ", config), /requires a natural-language request/);

  const request = parseExportDocsRequest("topics tasks next steps until 2026-05-03", config, {
    now: new Date("2026-05-12T10:00:00.000Z")
  });

  assert.equal(request.style, undefined);
  assert.deepEqual(request.includeSections, ["summary", "topics", "decisions", "tasks", "next_steps"]);
  assert.deepEqual(
    { dateFrom: request.dateFrom, dateTo: request.dateTo },
    { dateFrom: "2026-05-03", dateTo: "2026-05-03" }
  );
});

test("resolveDateRangeFromQuery resolves the 10th of this month explicitly", () => {
  const range = resolveDateRangeFromQuery("all things we worked on the 10th of this month", {
    timezone: "Europe/Madrid",
    now: new Date("2026-05-12T10:00:00.000Z")
  });

  assert.deepEqual(range, {
    dateFrom: "2026-05-10",
    dateTo: "2026-05-10"
  });
});

test("resolveDateRangeFromQuery handles explicit dates, relative windows, and invalid timezones", () => {
  const now = new Date("2026-05-12T10:00:00.000Z");

  assert.deepEqual(resolveDateRangeFromQuery("from 2026-05-01 to 2026-05-03", { timezone: "Europe/Madrid", now }), {
    dateFrom: "2026-05-01",
    dateTo: "2026-05-03"
  });
  assert.deepEqual(resolveDateRangeFromQuery("on 2026-05-02", { timezone: "Europe/Madrid", now }), {
    dateFrom: "2026-05-02",
    dateTo: "2026-05-02"
  });
  assert.deepEqual(resolveDateRangeFromQuery("yesterday", { timezone: "Europe/Madrid", now }), {
    dateFrom: "2026-05-11",
    dateTo: "2026-05-11"
  });
  assert.deepEqual(resolveDateRangeFromQuery("today", { timezone: "Europe/Madrid", now }), {
    dateFrom: "2026-05-12",
    dateTo: "2026-05-12"
  });
  assert.deepEqual(resolveDateRangeFromQuery("this week", { timezone: "Europe/Madrid", now }), {
    dateFrom: "2026-05-11",
    dateTo: "2026-05-12"
  });
  assert.deepEqual(resolveDateRangeFromQuery("this month", { timezone: "Europe/Madrid", now }), {
    dateFrom: "2026-05-01",
    dateTo: "2026-05-12"
  });
  assert.deepEqual(resolveDateRangeFromQuery("sometime later", { timezone: "Europe/Madrid", now }), {});
  assert.throws(
    () => resolveDateRangeFromQuery("today", { timezone: "Mars/Base", now }),
    /Invalid timezone: Mars\/Base/
  );
});

test("resolveObsidianConfig and validateObsidianConfig enforce enabled vault settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-obsidian-config-"));

  try {
    const config = resolveObsidianConfig(
      {
        DEVGOD_PROJECT_NAME: "devgod",
        DEVGOD_OBSIDIAN_ENABLED: "true",
        DEVGOD_OBSIDIAN_VAULT_PATH: directory
      },
      {
        cwd: directory,
        projectSlug: "devgod"
      }
    );

    assert.equal(config.defaultProject, "devgod");
    assert.equal(config.timezone, "Europe/Madrid");
    await validateObsidianConfig(config);

    await assert.rejects(
      () =>
        validateObsidianConfig({
          ...config,
          vaultPath: path.join(directory, "missing-vault")
        }),
      /does not exist/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolveObsidianConfig normalizes folder values and validateObsidianConfig rejects disabled or incomplete config", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-obsidian-config-shape-"));

  try {
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

    assert.equal(config.enabled, true);
    assert.equal(config.defaultProject, "obsidian-project");
    assert.equal(config.vaultPath, path.resolve(directory, "./vault"));
    assert.equal(config.dailyFolder, "Daily");
    assert.equal(config.docsFolder, "Docs");
    assert.equal(config.adrFolder, "ADR");

    await assert.rejects(() => validateObsidianConfig({ ...config, enabled: false }), /Obsidian export is disabled/);
    await assert.rejects(
      () => validateObsidianConfig({ ...config, vaultPath: undefined }),
      /Obsidian vault path is not configured/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolveObsidianConfig rejects invalid boolean and timezone values", () => {
  assert.throws(
    () =>
      resolveObsidianConfig(
        {
          DEVGOD_OBSIDIAN_ENABLED: "maybe"
        },
        {
          projectSlug: "devgod"
        }
      ),
    /Invalid boolean value: maybe/
  );

  assert.throws(
    () =>
      resolveObsidianConfig(
        {
          DEVGOD_OBSIDIAN_TIMEZONE: "Mars/Base"
        },
        {
          projectSlug: "devgod"
        }
      ),
    /Invalid timezone: Mars\/Base/
  );
});

test("resolveObsidianConfig falls back to disabled exports and default folder names when env values are blank", () => {
  const config = resolveObsidianConfig(
    {
      DEVGOD_PROJECT_NAME: "fallback-project",
      DEVGOD_OBSIDIAN_DAILY_FOLDER: "   ",
      DEVGOD_OBSIDIAN_DOCS_FOLDER: "///",
      DEVGOD_OBSIDIAN_ADR_FOLDER: "\\\\"
    },
    {
      projectSlug: "devgod"
    }
  );

  assert.equal(config.enabled, false);
  assert.equal(config.defaultProject, "fallback-project");
  assert.equal(config.dailyFolder, "Devgod/Daily");
  assert.equal(config.docsFolder, "Devgod/Docs");
  assert.equal(config.adrFolder, "Devgod/ADR");
});

test("currentIsoDateInTimezone resolves the local calendar day across timezone boundaries", () => {
  const now = new Date("2026-05-12T23:30:00.000Z");

  assert.equal(currentIsoDateInTimezone(now, "Europe/Madrid"), "2026-05-13");
  assert.equal(currentIsoDateInTimezone(now, "America/New_York"), "2026-05-12");
});

test("currentIsoDateInTimezone rejects unresolved calendar parts from Intl formatting", () => {
  const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;

  Intl.DateTimeFormat.prototype.formatToParts = (() => [{ type: "literal", value: "/" }]) as typeof originalFormatToParts;

  try {
    assert.throws(
      () => currentIsoDateInTimezone(new Date("2026-05-12T23:30:00.000Z"), "Europe/Madrid"),
      /Could not resolve date parts/
    );
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = originalFormatToParts;
  }
});

test("sanitizeMarkdownFilename strips unsafe characters", () => {
  assert.equal(sanitizeMarkdownFilename("Obsidian Export: Feature/Doc?"), "obsidian-export-feature-doc");
  assert.equal(sanitizeMarkdownFilename("   !!!   "), "note");
});

test("ObsidianMarkdownRenderer renders frontmatter, headings, and task checkboxes", () => {
  const renderer = new ObsidianMarkdownRenderer();
  const request: ExportDocsRequest = {
    rawQuery: "summarize today",
    dateFrom: "2026-05-10",
    dateTo: "2026-05-10",
    project: "devgod",
    format: "daily_summary",
    includeSections: ["summary", "topics", "decisions", "tasks", "next_steps"],
    destination: "Devgod/Daily",
    timezone: "Europe/Madrid"
  };
  const summary: ExportDocsSummary = {
    title: "Devgod work summary - 2026-05-10",
    summary: "1 run matched 2026-05-10.",
    topics: ["Parser", "Writer"],
    decisions: ["Use runtime history as the worklog source."],
    tasks: ["Implement request parser (approved)"],
    bugs: [],
    files: [],
    nextSteps: ["Finish overwrite handling"],
    relatedNotes: ["[[Devgod]]"]
  };

  const markdown = renderer.render(summary, request);
  assert.match(markdown, /^---/);
  assert.match(markdown, /# Devgod work summary - 2026-05-10/);
  assert.match(markdown, /## Tasks/);
  assert.match(markdown, /- \[ \] Implement request parser \(approved\)/);
  assert.match(markdown, /\[\[Devgod\]\]/);
});

test("ObsidianMarkdownRenderer renders empty optional sections with default project metadata", () => {
  const renderer = new ObsidianMarkdownRenderer();
  const request: ExportDocsRequest = {
    rawQuery: "document the export pipeline",
    dateFrom: "2026-05-10",
    project: undefined,
    format: "feature_doc",
    includeSections: ["summary", "topics", "decisions", "tasks", "bugs", "files", "next_steps"],
    destination: "Devgod/Docs",
    timezone: "Europe/Madrid"
  };
  const summary: ExportDocsSummary = {
    title: "export pipeline",
    summary: "No work recorded yet.",
    topics: [],
    decisions: [],
    tasks: [],
    bugs: [],
    files: [],
    nextSteps: [],
    relatedNotes: []
  };

  const markdown = renderer.render(summary, request);
  assert.match(markdown, /project: devgod/);
  assert.match(markdown, /source: devgod/);
  assert.match(markdown, /## Bugs \/ issues/);
  assert.match(markdown, /## Files or areas touched/);
  assert.match(markdown, /- \[ \] none recorded/);
  assert.match(markdown, /- none/);
});

test("DocsSummarizer dedupes export sections and filters boilerplate approval rationales", () => {
  const summarizer = new DocsSummarizer();
  const request: ExportDocsRequest = {
    rawQuery: "adr export docs",
    dateFrom: "2026-05-10",
    dateTo: "2026-05-11",
    project: "devgod",
    format: "decision_log",
    includeSections: ["summary", "topics", "decisions", "tasks", "bugs", "files", "next_steps"],
    destination: "Devgod/ADR",
    timezone: "Europe/Madrid"
  };
  const summary = summarizer.summarize(
    [
      {
        run: {
          title: "Parser rollout"
        },
        plan: {
          content: {
            milestones: ["Parser rollout", "Parser rollout"],
            decisions: ["Use runtime history", "Use runtime history"],
            residualRisks: ["Need overwrite handling", "Need overwrite handling"]
          }
        },
        tasks: [
          {
            status: "approved",
            packet: { title: "Implement parser" }
          },
          {
            status: "in_progress",
            packet: { title: "Implement writer" }
          }
        ],
        handoffsByTask: {
          writer: [
            {
              changedFiles: ["src/docs-export/parser.ts", "src/docs-export/parser.ts"],
              blockers: ["Missing overwrite protection", "Missing overwrite protection"]
            }
          ]
        },
        reviewsByTask: {
          writer: [
            {
              findings: ["Missing overwrite protection"]
            }
          ]
        },
        approvalsByTask: {
          writer: [
            {
              decision: "approved",
              rationale: "All required reviews passed"
            },
            {
              decision: "approved",
              rationale: "Keep runtime history as the source of truth."
            },
            {
              decision: "approved",
              rationale: "required review reviewer passed"
            },
            {
              decision: "rejected",
              rationale: "Needs more work"
            }
          ]
        },
        decisionMemoryEntries: [
          {
            title: "Fallback to decision title",
            content: "   "
          },
          {
            title: "Runtime memory",
            content: "  Use reviewed memory decision. "
          }
        ]
      } as unknown as WorklogEntry
    ],
    request
  );

  assert.equal(summary.title, "Devgod decision log");
  assert.equal(
    summary.summary,
    "1 run matched 2026-05-10 to 2026-05-11. 2 tasks, 1 handoff, 1 review, and 4 approvals were included."
  );
  assert.deepEqual(summary.topics, ["Parser rollout", "Implement parser", "Implement writer"]);
  assert.deepEqual(summary.decisions, [
    "Use runtime history",
    "Fallback to decision title",
    "Use reviewed memory decision.",
    "Keep runtime history as the source of truth."
  ]);
  assert.deepEqual(summary.tasks, ["Implement parser (approved)", "Implement writer (in_progress)"]);
  assert.deepEqual(summary.files, ["src/docs-export/parser.ts"]);
  assert.deepEqual(summary.bugs, ["Missing overwrite protection"]);
  assert.deepEqual(summary.nextSteps, [
    "Implement writer (in_progress)",
    "Need overwrite handling",
    "Missing overwrite protection"
  ]);
  assert.deepEqual(summary.relatedNotes, ["[[Devgod]]"]);
});

test("DocsSummarizer derives feature and project-summary titles from requests", () => {
  const summarizer = new DocsSummarizer();
  const baseRequest = {
    includeSections: ["summary"],
    destination: "Devgod/Docs",
    timezone: "Europe/Madrid"
  } satisfies Pick<ExportDocsRequest, "includeSections" | "destination" | "timezone">;

  const featureSummary = summarizer.summarize([], {
    rawQuery: "create documentation for export docs pipeline.",
    format: "feature_doc",
    project: "devgod",
    ...baseRequest
  });
  const projectSummary = summarizer.summarize([], {
    rawQuery: "project summary",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-03",
    format: "project_summary",
    project: "devgod_cli",
    ...baseRequest
  });

  assert.equal(featureSummary.title, "export docs pipeline");
  assert.equal(projectSummary.title, "Devgod Cli project summary - 2026-05-01 to 2026-05-03");
  assert.equal(
    summarizer.summarize([], {
      rawQuery: "project summary",
      dateFrom: "2026-05-01",
      format: "project_summary",
      project: "devgod_cli",
      ...baseRequest
    }).title,
    "Devgod Cli project summary - from 2026-05-01"
  );
  assert.equal(
    summarizer.summarize([], {
      rawQuery: "project summary",
      dateTo: "2026-05-03",
      format: "project_summary",
      project: "devgod_cli",
      ...baseRequest
    }).title,
    "Devgod Cli project summary - through 2026-05-03"
  );
});

test("buildObsidianTargetPath selects the right target format for daily, decision, and docs exports", () => {
  const summary: ExportDocsSummary = {
    title: "Decision: Export/Docs?",
    summary: "",
    topics: [],
    decisions: [],
    tasks: [],
    bugs: [],
    files: [],
    nextSteps: [],
    relatedNotes: []
  };

  const dailyPath = buildObsidianTargetPath(
    {
      rawQuery: "summarize today",
      dateFrom: "2026-05-10",
      dateTo: "2026-05-10",
      project: "devgod",
      format: "daily_summary",
      includeSections: ["summary"],
      destination: "Devgod/Daily",
      timezone: "Europe/Madrid"
    },
    summary
  );
  const decisionPath = buildObsidianTargetPath(
    {
      rawQuery: "adr export docs",
      dateFrom: "2026-05-10",
      dateTo: "2026-05-12",
      project: "devgod",
      format: "decision_log",
      includeSections: ["summary"],
      destination: "Devgod/ADR",
      timezone: "Europe/Madrid"
    },
    summary
  );
  const docPath = buildObsidianTargetPath(
    {
      rawQuery: "document export docs",
      project: "devgod",
      format: "project_summary",
      includeSections: ["summary"],
      destination: "Devgod/Docs",
      timezone: "Europe/Madrid"
    },
    summary
  );

  assert.equal(dailyPath, path.join("Devgod/Daily", "2026-05-10.md"));
  assert.equal(decisionPath, path.join("Devgod/ADR", "2026-05-10-2026-05-12-decision-export-docs.md"));
  assert.equal(docPath, path.join("Devgod/Docs", "decision-export-docs.md"));
});

test("buildObsidianTargetPath falls back to the current date when no export range is available", () => {
  const RealDate = Date;
  const fixedNow = new RealDate("2026-06-13T08:00:00.000Z");

  class FixedDate extends RealDate {
    constructor(value?: ConstructorParameters<typeof Date>[0]) {
      super(value ?? fixedNow.toISOString());
    }

    static now(): number {
      return fixedNow.valueOf();
    }

    static parse = RealDate.parse;
    static UTC = RealDate.UTC;
  }

  globalThis.Date = FixedDate as DateConstructor;

  try {
    const targetPath = buildObsidianTargetPath(
      {
        rawQuery: "adr export docs",
        project: "devgod",
        format: "decision_log",
        includeSections: ["summary"],
        destination: "Devgod/ADR",
        timezone: "Europe/Madrid"
      },
      {
        title: "!!!",
        summary: "",
        topics: [],
        decisions: [],
        tasks: [],
        bugs: [],
        files: [],
        nextSteps: [],
        relatedNotes: []
      }
    );

    assert.equal(targetPath, path.join("Devgod/ADR", "2026-06-13-note.md"));
  } finally {
    globalThis.Date = RealDate;
  }
});

test("buildObsidianTargetPath keeps a single-day decision export compact", () => {
  const targetPath = buildObsidianTargetPath(
    {
      rawQuery: "adr export docs",
      dateFrom: "2026-05-10",
      dateTo: "2026-05-10",
      project: "devgod",
      format: "decision_log",
      includeSections: ["summary"],
      destination: "Devgod/ADR",
      timezone: "Europe/Madrid"
    },
    {
      title: "Decision: Export/Docs?",
      summary: "",
      topics: [],
      decisions: [],
      tasks: [],
      bugs: [],
      files: [],
      nextSteps: [],
      relatedNotes: []
    }
  );

  assert.equal(targetPath, path.join("Devgod/ADR", "2026-05-10-decision-export-docs.md"));
});

test("ObsidianVaultWriter blocks path traversal and refuses overwrite by default", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-obsidian-writer-"));
  const writer = new ObsidianVaultWriter(directory);

  try {
    await assert.rejects(() => writer.writeNote("# nope\n", "../escape.md"), /outside the configured Obsidian vault/);

    const writtenPath = await writer.writeNote("# first\n", "Devgod/Daily/2026-05-10.md");
    assert.equal(writtenPath, path.join(directory, "Devgod/Daily/2026-05-10.md"));

    await assert.rejects(
      () => writer.writeNote("# second\n", "Devgod/Daily/2026-05-10.md"),
      /Refusing to overwrite existing Obsidian note/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ObsidianVaultWriter overwrites existing notes only when explicitly allowed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-obsidian-writer-overwrite-"));
  const writer = new ObsidianVaultWriter(directory);

  try {
    const targetPath = path.join("Devgod/Daily", "2026-05-10.md");
    await writer.writeNote("# first\n", targetPath);
    await writer.writeNote("# second\n", targetPath, true);

    assert.equal(writer.resolveTargetPath(targetPath), path.join(directory, targetPath));
    assert.equal(await readFile(path.join(directory, targetPath), "utf8"), "# second\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeExportDocsCommandFromArgs writes a daily note for the 10th of this month", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-export-docs-"));
  const store = new MemoryStore();

  try {
    await seedExportFixture(store);

    const result = await executeExportDocsCommandFromArgs(
      ["give", "me", "a", "listed", "summary", "of", "all", "things", "we", "worked", "on", "the", "10th", "of", "this", "month"],
      {
        cwd: directory,
        env: {
          ...process.env,
          DEVGOD_WORKSPACE_SLUG: "team",
          DEVGOD_PROJECT_SLUG: "devgod",
          DEVGOD_PROJECT_NAME: "devgod",
          DEVGOD_OBSIDIAN_ENABLED: "true",
          DEVGOD_OBSIDIAN_VAULT_PATH: directory
        },
        now: new Date("2026-05-12T10:00:00.000Z"),
        createWorklogProvider({ workspaceSlug, projectSlug }) {
          return new RuntimeWorklogProvider(store, {
            workspaceSlug,
            projectSlug
          });
        }
      }
    );

    assert.equal(result.matchedEntries, 2);
    assert.equal(result.targetPath, path.join(directory, "Devgod/Daily/2026-05-10.md"));

    const markdown = await readFile(result.targetPath!, "utf8");
    assert.match(markdown, /title: "Devgod work summary - 2026-05-10"/);
    assert.match(markdown, /## Main topics/);
    assert.match(markdown, /Use runtime history as the worklog source\./);
    assert.match(markdown, /Promoted decision memory should appear in exports\./);
    assert.match(markdown, /src\/docs-export\/parser\.ts/);
    assert.match(markdown, /Need overwrite semantics/);
    assert.match(markdown, /## Next steps/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executeExportDocsCommandFromArgs returns a helpful no-match message", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "devgod-export-docs-empty-"));
  const store = new MemoryStore();

  try {
    await seedExportFixture(store);

    const result = await executeExportDocsCommandFromArgs(["summarize", "work", "from", "2026-05-01", "to", "2026-05-01"], {
      cwd: directory,
      env: {
        ...process.env,
        DEVGOD_WORKSPACE_SLUG: "team",
        DEVGOD_PROJECT_SLUG: "devgod",
        DEVGOD_PROJECT_NAME: "devgod",
        DEVGOD_OBSIDIAN_ENABLED: "true",
        DEVGOD_OBSIDIAN_VAULT_PATH: directory
      },
      now: new Date("2026-05-12T10:00:00.000Z"),
      createWorklogProvider({ workspaceSlug, projectSlug }) {
        return new RuntimeWorklogProvider(store, {
          workspaceSlug,
          projectSlug
        });
      }
    });

    assert.equal(result.matchedEntries, 0);
    assert.match(result.message, /No matching worklog entries found for 2026-05-01/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
