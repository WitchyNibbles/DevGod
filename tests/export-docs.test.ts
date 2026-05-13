import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  executeExportDocsCommandFromArgs
} from "../src/admin.ts";
import { resolveDateRangeFromQuery } from "../src/docs-export/date-resolver.ts";
import { resolveObsidianConfig, validateObsidianConfig } from "../src/docs-export/obsidian-config.ts";
import { sanitizeMarkdownFilename, ObsidianVaultWriter } from "../src/docs-export/obsidian-writer.ts";
import { parseExportDocsRequest } from "../src/docs-export/parser.ts";
import { ObsidianMarkdownRenderer } from "../src/docs-export/renderer.ts";
import type { ExportDocsRequest, ExportDocsSummary } from "../src/docs-export/models.ts";
import { RuntimeWorklogProvider } from "../src/docs-export/worklog-provider.ts";
import type { IntakeSummary, PlanArtifact, RunRecord, TaskRecord } from "../src/domain/types.ts";
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

test("sanitizeMarkdownFilename strips unsafe characters", () => {
  assert.equal(sanitizeMarkdownFilename("Obsidian Export: Feature/Doc?"), "obsidian-export-feature-doc");
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

    assert.equal(result.matchedEntries, 1);
    assert.equal(result.targetPath, path.join(directory, "Devgod/Daily/2026-05-10.md"));

    const markdown = await readFile(result.targetPath!, "utf8");
    assert.match(markdown, /title: "Devgod work summary - 2026-05-10"/);
    assert.match(markdown, /## Main topics/);
    assert.match(markdown, /Use runtime history as the worklog source\./);
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
