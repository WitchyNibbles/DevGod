import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { MarkdownArtifactRecord, RunRecord } from "../domain/types.ts";
import type { DevgodStore } from "../store/types.ts";

const DEFAULT_INCLUDE_PATHS = ["README.md", "docs", ".devgod"] as const;
const DEFAULT_EXCLUDED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const MARKDOWN_INDEX_RUN_ACTOR = "repo_indexer";
const MARKDOWN_INDEX_RUN_TITLE = "Repo markdown index";

export interface IndexRepoMarkdownInput {
  store: Pick<
    DevgodStore,
    "ensureProjectContext" | "getRun" | "createRun" | "replaceMarkdownArtifacts" | "queueEmbeddingJob"
  >;
  repoRoot: string;
  workspaceSlug: string;
  workspaceName?: string | undefined;
  projectSlug: string;
  projectName?: string | undefined;
  include?: readonly string[] | undefined;
  embeddingModel?: string | undefined;
}

export interface IndexRepoMarkdownResult {
  runId: string;
  filesIndexed: number;
  chunksStored: number;
  jobsQueued: number;
}

interface MarkdownSection {
  title: string;
  sourceAnchor?: string | undefined;
  lines: string[];
}

export async function indexRepoMarkdown(input: IndexRepoMarkdownInput): Promise<IndexRepoMarkdownResult> {
  const { workspace, project } = await input.store.ensureProjectContext({
    workspaceSlug: input.workspaceSlug,
    workspaceName: input.workspaceName,
    projectSlug: input.projectSlug,
    projectName: input.projectName,
    repoPath: input.repoRoot
  });
  const runId = deterministicUuid(`markdown-index:${workspace.id}:${project.id}`);
  const run = await ensureIndexRun(input.store, {
    id: runId,
    workspaceId: workspace.id,
    projectId: project.id
  });

  const includePaths = input.include && input.include.length > 0 ? input.include : DEFAULT_INCLUDE_PATHS;
  const relativePaths = await collectMarkdownFiles(input.repoRoot, includePaths);
  const artifacts: MarkdownArtifactRecord[] = [];

  for (const relativePath of relativePaths) {
    const markdown = await readFile(path.join(input.repoRoot, relativePath), "utf8");
    const sections = splitMarkdownSections(relativePath, markdown);

    for (const artifact of buildArtifactsForFile({
      projectId: project.id,
      workspaceId: workspace.id,
      runId: run.id,
      relativePath,
      sections
    })) {
      artifacts.push(artifact);
    }
  }

  await input.store.replaceMarkdownArtifacts({
    workspaceId: workspace.id,
    projectId: project.id,
    runId: run.id,
    artifacts
  });

  let jobsQueued = 0;
  if (input.embeddingModel) {
    for (const artifact of artifacts) {
      await input.store.queueEmbeddingJob({
        workspaceId: artifact.workspaceId,
        projectId: artifact.projectId,
        sourceTable: "artifacts",
        sourceId: artifact.id,
        embeddingModel: input.embeddingModel
      });
      jobsQueued += 1;
    }
  }

  return {
    runId: run.id,
    filesIndexed: relativePaths.length,
    chunksStored: artifacts.length,
    jobsQueued
  };
}

async function ensureIndexRun(
  store: Pick<DevgodStore, "getRun" | "createRun">,
  context: { id: string; workspaceId: string; projectId: string }
): Promise<RunRecord> {
  const existing = await store.getRun(context.id);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const run: RunRecord = {
    id: context.id,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    actor: MARKDOWN_INDEX_RUN_ACTOR,
    title: MARKDOWN_INDEX_RUN_TITLE,
    request: "Index repository markdown into retrievable project artifacts.",
    summary: {
      goal: "Keep repo markdown retrievable before external augmentation.",
      audience: ["devgod operators"],
      constraints: ["allowlisted markdown only"],
      risks: ["stale chunks if indexing is skipped"],
      unknowns: [],
      successCriteria: ["markdown chunks stored with citations"],
      outOfScope: ["external sync layers"],
      trustBoundaries: ["repo-local markdown"],
      destructiveActions: [],
      externalIntegrations: [],
      stopGo: "go"
    },
    status: "done",
    createdAt: now,
    updatedAt: now
  };
  await store.createRun(run);
  return run;
}

async function collectMarkdownFiles(repoRoot: string, includePaths: readonly string[]): Promise<string[]> {
  const results = new Set<string>();

  for (const includePath of includePaths) {
    const absolutePath = path.resolve(repoRoot, includePath);
    const relativePath = normalizeRelativePath(repoRoot, absolutePath);
    const stats = await safeStatKind(absolutePath);
    if (!stats) {
      continue;
    }

    if (stats === "file") {
      if (absolutePath.endsWith(".md")) {
        results.add(relativePath);
      }
      continue;
    }

    for (const nestedPath of await walkMarkdownFiles(repoRoot, absolutePath)) {
      results.add(nestedPath);
    }
  }

  return [...results].sort();
}

async function walkMarkdownFiles(repoRoot: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(repoRoot, absolutePath);
    const pathSegments = relativePath.split("/");
    if (pathSegments.some((segment) => DEFAULT_EXCLUDED_SEGMENTS.has(segment))) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...(await walkMarkdownFiles(repoRoot, absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(relativePath);
    }
  }

  return results;
}

function buildArtifactsForFile(input: {
  workspaceId: string;
  projectId: string;
  runId: string;
  relativePath: string;
  sections: readonly MarkdownSection[];
}) {
  const artifacts: MarkdownArtifactRecord[] = [];

  for (const section of input.sections) {
    const chunks = chunkMarkdownSection(section.lines.join("\n").trim());

    chunks.forEach((content, chunkIndex) => {
      artifacts.push({
        id: deterministicUuid(
          `markdown:${input.projectId}:${input.relativePath}:${section.sourceAnchor ?? "root"}:${chunkIndex}`
        ),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        runId: input.runId,
        kind: "markdown_chunk" as const,
        title: section.title,
        content,
        sourcePath: input.relativePath,
        sourceAnchor: section.sourceAnchor,
        metadata: {
          chunkIndex
        },
        createdAt: new Date().toISOString()
      });
    });
  }

  return artifacts;
}

function splitMarkdownSections(relativePath: string, markdown: string): MarkdownSection[] {
  const fallbackTitle = path.basename(relativePath, ".md");
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection = {
    title: fallbackTitle,
    lines: []
  };

  for (const line of markdown.split(/\r?\n/)) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      if (current.lines.some((candidate) => candidate.trim().length > 0)) {
        sections.push(current);
      }

      const headingTitle = headingMatch[2]?.trim() || fallbackTitle;
      current = {
        title: headingTitle,
        sourceAnchor: slugifyHeading(headingTitle),
        lines: [line]
      };
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.some((candidate) => candidate.trim().length > 0)) {
    sections.push(current);
  }

  return sections.length > 0 ? sections : [{ title: fallbackTitle, lines: [markdown.trim()] }];
}

function chunkMarkdownSection(sectionText: string): string[] {
  const normalized = sectionText.trim();
  if (normalized.length === 0) {
    return [];
  }

  const maxChars = 1200;
  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    return [normalized];
  }

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length <= maxChars || current.length === 0) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    current = paragraph;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRelativePath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha1").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function safeStatKind(targetPath: string): Promise<"file" | "directory" | undefined> {
  try {
    const entries = await readdir(path.dirname(targetPath), { withFileTypes: true });
    const entry = entries.find((candidate) => path.join(path.dirname(targetPath), candidate.name) === targetPath);
    if (!entry) {
      return undefined;
    }
    if (entry.isDirectory()) {
      return "directory";
    }
    if (entry.isFile()) {
      return "file";
    }
    return undefined;
  } catch {
    return undefined;
  }
}
