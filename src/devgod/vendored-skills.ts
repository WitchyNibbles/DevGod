import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface VendoredSkillEntry {
  localSkillId: string;
  upstreamSkillId: string;
}

export interface ResolvedVendoredSkillEntry extends VendoredSkillEntry {
  sourcePath: string;
}

export interface ParsedSkillDocument {
  frontmatter: Record<string, string>;
  body: string;
}

export interface VendoredSkillVerificationIssue {
  localSkillId: string;
  problem: string;
}

export const vendoredSkillEntries = [
  { localSkillId: "devgod-agentic-engineering", upstreamSkillId: "agentic-engineering" },
  { localSkillId: "devgod-api-design", upstreamSkillId: "api-design" },
  { localSkillId: "devgod-article-writing", upstreamSkillId: "article-writing" },
  { localSkillId: "devgod-backend-patterns", upstreamSkillId: "backend-patterns" },
  { localSkillId: "devgod-database-migrations", upstreamSkillId: "database-migrations" },
  { localSkillId: "devgod-deployment-patterns", upstreamSkillId: "deployment-patterns" },
  { localSkillId: "devgod-docker-patterns", upstreamSkillId: "docker-patterns" },
  { localSkillId: "devgod-documentation-lookup", upstreamSkillId: "documentation-lookup" },
  { localSkillId: "devgod-e2e-testing", upstreamSkillId: "e2e-testing" },
  { localSkillId: "devgod-eval-harness", upstreamSkillId: "eval-harness" },
  { localSkillId: "devgod-frontend-patterns", upstreamSkillId: "frontend-patterns" },
  { localSkillId: "devgod-market-research", upstreamSkillId: "market-research" },
  { localSkillId: "devgod-mcp-server-patterns", upstreamSkillId: "mcp-server-patterns" },
  { localSkillId: "devgod-postgres-patterns", upstreamSkillId: "postgres-patterns" },
  { localSkillId: "devgod-search-first", upstreamSkillId: "search-first" },
  { localSkillId: "devgod-security-review", upstreamSkillId: "security-review" },
  { localSkillId: "devgod-security-scan", upstreamSkillId: "security-scan" },
  { localSkillId: "devgod-strategic-compact", upstreamSkillId: "strategic-compact" },
  { localSkillId: "devgod-tdd-workflow", upstreamSkillId: "tdd-workflow" },
  { localSkillId: "devgod-verification-loop", upstreamSkillId: "verification-loop" },
  { localSkillId: "devgod-web-design-guidelines", upstreamSkillId: "web-design-guidelines" }
] as const satisfies readonly VendoredSkillEntry[];

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSkillDocument(content: string): ParsedSkillDocument {
  const normalized = content.replace(/\r\n/g, "\n");
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    return {
      frontmatter: {},
      body: normalized.trimStart()
    };
  }

  const frontmatter: Record<string, string> = {};
  for (const rawLine of (frontmatterMatch[1] ?? "").split("\n")) {
    const match = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    frontmatter[match[1]] = stripQuotes(match[2] ?? "");
  }

  return {
    frontmatter,
    body: normalized.slice(frontmatterMatch[0].length).trimStart()
  };
}

export function defaultVendoredSkillSourceRoots(): string[] {
  const configuredRoots = process.env.DEVGOD_VENDORED_SKILL_SOURCE_ROOTS
    ?.split(path.delimiter)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (configuredRoots && configuredRoots.length > 0) {
    return configuredRoots;
  }

  const home = os.homedir();
  return [
    path.join(home, ".agents", "skills"),
    path.join(home, ".codex", "skills")
  ];
}

export async function resolveVendoredSkillEntries(input?: {
  sourceRoots?: readonly string[] | undefined;
}): Promise<ResolvedVendoredSkillEntry[]> {
  const sourceRoots = input?.sourceRoots?.length
    ? [...input.sourceRoots]
    : defaultVendoredSkillSourceRoots();
  const resolved: ResolvedVendoredSkillEntry[] = [];

  for (const entry of vendoredSkillEntries) {
    let sourcePath: string | undefined;
    for (const root of sourceRoots) {
      const candidate = path.join(root, entry.upstreamSkillId, "SKILL.md");
      try {
        await readFile(candidate, "utf8");
        sourcePath = candidate;
        break;
      } catch {
        continue;
      }
    }

    if (!sourcePath) {
      throw new Error(
        `Unable to resolve upstream skill ${entry.upstreamSkillId}. Checked: ${sourceRoots.join(", ")}`
      );
    }

    resolved.push({
      ...entry,
      sourcePath
    });
  }

  return resolved;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function renderVendoredSkillDocument(input: {
  localSkillId: string;
  upstreamSkillId: string;
  sourcePath: string;
  sourceContent: string;
  syncedAt: string;
}): string {
  const parsed = parseSkillDocument(input.sourceContent);
  const upstreamDescription = parsed.frontmatter.description || `Vendored mirror of ${input.upstreamSkillId}.`;
  const upstreamHash = hashContent(input.sourceContent);

  return [
    "---",
    `name: ${input.localSkillId}`,
    `description: ${JSON.stringify(`Vendored mirror of ${input.upstreamSkillId}: ${upstreamDescription}`)}`,
    "origin: devgod-vendored-skill",
    `upstream_skill: ${input.upstreamSkillId}`,
    `upstream_path: ${JSON.stringify(input.sourcePath)}`,
    `upstream_sha256: ${upstreamHash}`,
    `synced_at: ${input.syncedAt}`,
    "---",
    "",
    `<!-- Managed by src/devgod/sync-vendored-skills.ts from ${input.upstreamSkillId}. -->`,
    "",
    parsed.body.trimStart(),
    ""
  ].join("\n");
}

export async function syncVendoredSkills(input?: {
  repoRoot?: string | undefined;
  sourceRoots?: readonly string[] | undefined;
  now?: string | undefined;
}): Promise<string[]> {
  const repoRoot = path.resolve(input?.repoRoot ?? process.cwd());
  const syncedAt = input?.now ?? new Date().toISOString();
  const resolvedEntries = await resolveVendoredSkillEntries({ sourceRoots: input?.sourceRoots });
  const writtenPaths: string[] = [];

  for (const entry of resolvedEntries) {
    const sourceContent = await readFile(entry.sourcePath, "utf8");
    const targetPath = path.join(repoRoot, ".agents", "skills", entry.localSkillId, "SKILL.md");
    const rendered = renderVendoredSkillDocument({
      localSkillId: entry.localSkillId,
      upstreamSkillId: entry.upstreamSkillId,
      sourcePath: entry.sourcePath,
      sourceContent,
      syncedAt
    });
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, rendered, "utf8");
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}

export async function verifyVendoredSkills(input?: {
  repoRoot?: string | undefined;
  sourceRoots?: readonly string[] | undefined;
}): Promise<VendoredSkillVerificationIssue[]> {
  const repoRoot = path.resolve(input?.repoRoot ?? process.cwd());
  const resolvedEntries = await resolveVendoredSkillEntries({ sourceRoots: input?.sourceRoots });
  const issues: VendoredSkillVerificationIssue[] = [];

  for (const entry of resolvedEntries) {
    const sourceContent = await readFile(entry.sourcePath, "utf8");
    const upstreamHash = hashContent(sourceContent);
    const targetPath = path.join(repoRoot, ".agents", "skills", entry.localSkillId, "SKILL.md");
    let localContent: string;
    try {
      localContent = await readFile(targetPath, "utf8");
    } catch {
      issues.push({ localSkillId: entry.localSkillId, problem: `missing local file ${targetPath}` });
      continue;
    }

    const parsedLocal = parseSkillDocument(localContent);
    if (parsedLocal.frontmatter.upstream_skill !== entry.upstreamSkillId) {
      issues.push({
        localSkillId: entry.localSkillId,
        problem: `frontmatter upstream_skill mismatch: expected ${entry.upstreamSkillId}, got ${parsedLocal.frontmatter.upstream_skill ?? "missing"}`
      });
    }
    if (parsedLocal.frontmatter.upstream_sha256 !== upstreamHash) {
      issues.push({
        localSkillId: entry.localSkillId,
        problem: `upstream hash drift: expected ${upstreamHash}, got ${parsedLocal.frontmatter.upstream_sha256 ?? "missing"}`
      });
    }
  }

  return issues;
}
