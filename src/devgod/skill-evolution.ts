import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSkillDocument } from "./vendored-skills.ts";

const overlaySkillsRoot = ".devgod/skills/overlay";
const archivedSkillsRoot = ".devgod/skills/archive";
const skillEvidenceRoot = ".devgod/skills/evidence";
const overlaySkillIndexPath = ".devgod/skills/index.json";
const skillPromotionRoot = ".devgod/work/skill-promotions";
const explicitEvidenceRedactionPolicyRef = "docs/plans/2026-06-08-skill-evidence-redaction-policy.md";
const allowedSupportDirectories = ["references", "templates", "scripts"] as const;

export interface OverlaySkillSupportFile {
  relativePath: string;
  content: string;
}

export interface OverlaySkillEvidenceRecord {
  summary: string;
  refs: string[];
  snippets?: string[] | undefined;
}

export interface OverlaySkillIndexEntry {
  skillId: string;
  overlaySkillPath: string;
  canonicalSkillPath: string;
  evidenceDirectory: string;
  lifecycleStatus?: "draft" | "active_local" | "promotion_ready" | "promoted" | "rejected" | "archived" | undefined;
  sourceTaskId?: string | undefined;
  sourceSkillId?: string | undefined;
  promotionStatus: "draft" | "promotion_generated";
  lastPromotionId?: string | undefined;
  lastEval?:
    | {
        passed: boolean;
        score: number;
        summary: string;
        evaluatedAt: string;
      }
    | undefined;
  lastTraceUpdate?:
    | {
        minedAt: string;
        artifactRefs: string[];
        commandSnippets: string[];
        notesAdded: string[];
      }
    | undefined;
  promotionSuggestion?:
    | {
        ready: boolean;
        score: number;
        summary: string;
        reasons: string[];
        blockers: string[];
        suggestedAt: string;
      }
    | undefined;
  archive?:
    | {
        archivedAt: string;
        archivePath: string;
        reason: string;
      }
    | undefined;
  lastUpdatedAt: string;
}

export interface OverlaySkillIndex {
  version: 1;
  skills: OverlaySkillIndexEntry[];
}

export interface WriteOverlaySkillDraftInput {
  repoRoot?: string | undefined;
  skillId: string;
  content: string;
  supportFiles?: readonly OverlaySkillSupportFile[] | undefined;
  sourceTaskId?: string | undefined;
  sourceSkillId?: string | undefined;
  evidence?: OverlaySkillEvidenceRecord | undefined;
  persistEvidence?: boolean | undefined;
  redactionPolicyRef?: string | undefined;
  now?: string | undefined;
}

export interface WriteOverlaySkillDraftResult {
  skillId: string;
  overlaySkillPath: string;
  canonicalSkillPath: string;
  evidenceDirectory: string;
  indexPath: string;
  persistedEvidence: boolean;
}

export interface OverlaySkillValidationResult {
  ok: boolean;
  issues: string[];
  skillPath: string;
  supportFiles: string[];
}

export interface OverlaySkillReplayCase {
  prompt: string;
  expectedTerms: string[];
}

export interface OverlaySkillEvalResult {
  skillId: string;
  passed: boolean;
  score: number;
  reasons: string[];
  summary: string;
}

export interface OverlaySkillDuplicateRecord {
  skillId: string;
  candidateSkillId: string;
  candidateKind: "overlay" | "canonical";
  score: number;
  reasons: string[];
}

export interface OverlaySkillTraceMiningResult {
  skillId: string;
  updated: boolean;
  notesAdded: string[];
  commandSnippets: string[];
  artifactRefs: string[];
  summary: string;
}

export interface OverlaySkillPromotionReadinessSuggestion {
  skillId: string;
  ready: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
  summary: string;
  suggestedAt: string;
}

export interface GenerateSkillPromotionArtifactsInput {
  repoRoot?: string | undefined;
  skillId: string;
  summary?: string | undefined;
  riskNotes?: readonly string[] | undefined;
  overlapNotes?: readonly string[] | undefined;
  now?: string | undefined;
}

export interface GenerateSkillPromotionArtifactsResult {
  promotionId: string;
  packetPath: string;
  patchPath: string;
  canonicalSkillPath: string;
  overlaySkillPath: string;
  createdCanonicalSkill: boolean;
}

export interface ArchiveOverlaySkillResult {
  skillId: string;
  archivePath: string;
  archivedAt: string;
}

function nowIso(now?: string | undefined): string {
  return now ?? new Date().toISOString();
}

function normalizeSkillId(skillId: string): string {
  const normalized = skillId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error(`Invalid skill id "${skillId}"`);
  }
  return normalized;
}

function normalizeSupportFileRelativePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.trim());
  if (
    normalized.length === 0 ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Invalid overlay support file path "${relativePath}"`);
  }

  const [topLevelDirectory] = normalized.split("/", 1);
  if (!allowedSupportDirectories.includes(topLevelDirectory as (typeof allowedSupportDirectories)[number])) {
    throw new Error(
      `Overlay support files must live under ${allowedSupportDirectories.join(", ")}; got "${relativePath}"`
    );
  }

  return normalized;
}

function overlaySkillPathForId(skillId: string): string {
  return path.posix.join(overlaySkillsRoot, skillId, "SKILL.md");
}

function canonicalSkillPathForId(skillId: string): string {
  return path.posix.join(".agents/skills", skillId, "SKILL.md");
}

function evidenceDirectoryForId(skillId: string): string {
  return path.posix.join(skillEvidenceRoot, skillId);
}

function archiveDirectoryForId(skillId: string, now: string): string {
  return path.posix.join(archivedSkillsRoot, `${skillId}-${now.replace(/[^0-9]/g, "").slice(0, 14)}`);
}

function promotionIdFor(skillId: string, now: string): string {
  return `${skillId}-${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function shortGitLikeHash(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 7);
}

function splitPatchLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized.length === 0) {
    return [];
  }
  const trimmedTrailingNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmedTrailingNewline.length === 0 ? [] : trimmedTrailingNewline.split("\n");
}

function renderFullFilePatch(relativePath: string, before: string | undefined, after: string): string {
  if (before === after) {
    return "";
  }

  const afterLines = splitPatchLines(after);
  if (before === undefined) {
    return [
      `diff --git a/${relativePath} b/${relativePath}`,
      "new file mode 100644",
      `index 0000000..${shortGitLikeHash(after)}`,
      "--- /dev/null",
      `+++ b/${relativePath}`,
      `@@ -0,0 +1,${afterLines.length} @@`,
      ...afterLines.map((line) => `+${line}`)
    ].join("\n").concat("\n");
  }

  const beforeLines = splitPatchLines(before);
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    `index ${shortGitLikeHash(before)}..${shortGitLikeHash(after)} 100644`,
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`)
  ].join("\n").concat("\n");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function readOverlaySkillIndex(repoRoot: string): Promise<OverlaySkillIndex> {
  const indexPath = path.join(repoRoot, overlaySkillIndexPath);
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8")) as OverlaySkillIndex;
    return {
      version: 1,
      skills: Array.isArray(parsed.skills) ? parsed.skills : []
    };
  } catch {
    return {
      version: 1,
      skills: []
    };
  }
}

async function writeOverlaySkillIndex(repoRoot: string, index: OverlaySkillIndex): Promise<void> {
  const indexPath = path.join(repoRoot, overlaySkillIndexPath);
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function collectRelativeFiles(rootDirectory: string, currentDirectory = rootDirectory): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRelativeFiles(rootDirectory, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    files.push(path.posix.normalize(path.relative(rootDirectory, absolutePath).split(path.sep).join(path.posix.sep)));
  }

  return files.sort();
}

function tokenizeSkillText(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function computeTokenOverlapScore(left: Set<string>, right: Set<string>): number {
  const union = new Set<string>([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return shared / union.size;
}

function extractInlineCommandSnippets(content: string): string[] {
  const matches = content.matchAll(/`([^`\n]+)`/g);
  const snippets = new Set<string>();
  for (const match of matches) {
    const snippet = match[1]?.trim();
    if (!snippet) {
      continue;
    }
    if (!/^(npm|pnpm|yarn|bun|node|bash|git)\b/i.test(snippet)) {
      continue;
    }
    snippets.add(snippet);
  }
  return [...snippets];
}

function slugLikeTokens(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function artifactMatchesSkill(content: string, entry: Pick<OverlaySkillIndexEntry, "skillId" | "sourceTaskId" | "sourceSkillId">): boolean {
  const normalized = content.toLowerCase();
  const searchTerms = new Set<string>([
    entry.skillId.toLowerCase(),
    ...slugLikeTokens(entry.skillId),
    ...slugLikeTokens(entry.sourceTaskId),
    ...slugLikeTokens(entry.sourceSkillId)
  ]);
  for (const term of searchTerms) {
    if (normalized.includes(term)) {
      return true;
    }
  }
  return false;
}

function buildTraceNotesSection(notes: readonly string[], artifactRefs: readonly string[]): string {
  return [
    "## Local Trace Notes",
    "",
    "_Non-canonical local notes mined from reviewed workflow artifacts._",
    "",
    ...notes.map((note) => `- ${note}`),
    "",
    "### Trace Refs",
    "",
    ...artifactRefs.map((ref) => `- \`${ref}\``)
  ].join("\n").concat("\n");
}

function replaceManagedTraceNotesSection(content: string, section: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  const sectionPattern = /\n## Local Trace Notes\n[\s\S]*?(?=\n## [^\n]+\n|$)/;
  if (sectionPattern.test(normalized)) {
    return normalized.replace(sectionPattern, `\n${section.trimEnd()}`).concat("\n");
  }
  return `${normalized}\n\n${section}`;
}

async function collectTraceArtifactPaths(repoRoot: string): Promise<string[]> {
  const candidateDirectories = [
    ".devgod/work/reviews",
    ".devgod/work/checkpoints",
    ".devgod/work/skill-promotions"
  ];
  const artifactPaths: string[] = [];
  for (const relativeDirectory of candidateDirectories) {
    const absoluteDirectory = path.join(repoRoot, relativeDirectory);
    try {
      const files = await collectRelativeFiles(absoluteDirectory);
      artifactPaths.push(
        ...files
          .filter((relativePath) => relativePath.endsWith(".md"))
          .map((relativePath) => path.posix.join(relativeDirectory, relativePath))
      );
    } catch {
      continue;
    }
  }
  return artifactPaths.sort();
}

async function loadSkillContentIfExists(filePath: string): Promise<string | undefined> {
  if (!(await fileExists(filePath))) {
    return undefined;
  }
  return readFile(filePath, "utf8");
}

export async function writeOverlaySkillDraft(input: WriteOverlaySkillDraftInput): Promise<WriteOverlaySkillDraftResult> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const issues = validateSkillDocument(input.content, { expectedName: skillId });
  if (issues.length > 0) {
    throw new Error(`Overlay skill draft is invalid: ${issues.join("; ")}`);
  }

  if (input.evidence && input.persistEvidence !== true) {
    throw new Error(
      `Overlay skill evidence requires persistEvidence=true and ${explicitEvidenceRedactionPolicyRef}`
    );
  }

  if (input.persistEvidence === true && input.redactionPolicyRef !== explicitEvidenceRedactionPolicyRef) {
    throw new Error(`Overlay skill evidence requires redactionPolicyRef=${explicitEvidenceRedactionPolicyRef}`);
  }

  const overlaySkillPath = overlaySkillPathForId(skillId);
  const canonicalSkillPath = canonicalSkillPathForId(skillId);
  const evidenceDirectory = evidenceDirectoryForId(skillId);
  const absoluteOverlaySkillPath = path.join(repoRoot, overlaySkillPath);
  await mkdir(path.dirname(absoluteOverlaySkillPath), { recursive: true });
  await writeFile(absoluteOverlaySkillPath, input.content, "utf8");

  for (const supportFile of input.supportFiles ?? []) {
    const relativePath = normalizeSupportFileRelativePath(supportFile.relativePath);
    const absolutePath = path.join(repoRoot, overlaySkillsRoot, skillId, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, supportFile.content, "utf8");
  }

  if (input.evidence && input.persistEvidence === true) {
    const evidencePath = path.join(repoRoot, evidenceDirectory, "evidence.json");
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          ...input.evidence,
          skillId,
          redactionPolicyRef: input.redactionPolicyRef
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  const updatedAt = nowIso(input.now);
  const index = await readOverlaySkillIndex(repoRoot);
  const nextEntry: OverlaySkillIndexEntry = {
    skillId,
    overlaySkillPath,
    canonicalSkillPath,
    evidenceDirectory,
    lifecycleStatus: "draft",
    sourceTaskId: input.sourceTaskId,
    sourceSkillId: input.sourceSkillId,
    promotionStatus: "draft",
    lastUpdatedAt: updatedAt
  };
  const remainingEntries = index.skills.filter((entry) => entry.skillId !== skillId);
  remainingEntries.push(nextEntry);
  remainingEntries.sort((left, right) => left.skillId.localeCompare(right.skillId));
  await writeOverlaySkillIndex(repoRoot, {
    version: 1,
    skills: remainingEntries
  });

  return {
    skillId,
    overlaySkillPath,
    canonicalSkillPath,
    evidenceDirectory,
    indexPath: overlaySkillIndexPath,
    persistedEvidence: input.evidence !== undefined && input.persistEvidence === true
  };
}

export async function validateOverlaySkillDraft(input: {
  repoRoot?: string | undefined;
  skillId: string;
}): Promise<OverlaySkillValidationResult> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const skillDirectory = path.join(repoRoot, overlaySkillsRoot, skillId);
  const skillPath = path.join(skillDirectory, "SKILL.md");
  const content = await readFile(skillPath, "utf8");
  const issues = [...validateSkillDocument(content, { expectedName: skillId })];

  const supportFiles = (await collectRelativeFiles(skillDirectory)).filter((relativePath) => relativePath !== "SKILL.md");
  for (const relativePath of supportFiles) {
    try {
      normalizeSupportFileRelativePath(relativePath);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    skillPath: overlaySkillPathForId(skillId),
    supportFiles
  };
}

export async function generateSkillPromotionArtifacts(
  input: GenerateSkillPromotionArtifactsInput
): Promise<GenerateSkillPromotionArtifactsResult> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const validation = await validateOverlaySkillDraft({ repoRoot, skillId });
  if (!validation.ok) {
    throw new Error(`Cannot generate promotion artifacts for invalid overlay skill: ${validation.issues.join("; ")}`);
  }

  const overlaySkillPath = overlaySkillPathForId(skillId);
  const canonicalSkillPath = canonicalSkillPathForId(skillId);
  const absoluteOverlaySkillPath = path.join(repoRoot, overlaySkillPath);
  const absoluteCanonicalSkillPath = path.join(repoRoot, canonicalSkillPath);
  const overlayContent = await readFile(absoluteOverlaySkillPath, "utf8");
  const canonicalExists = await fileExists(absoluteCanonicalSkillPath);
  const canonicalContent = canonicalExists ? await readFile(absoluteCanonicalSkillPath, "utf8") : undefined;
  const currentNow = nowIso(input.now);
  const promotionId = promotionIdFor(skillId, currentNow);
  const packetRelativePath = path.posix.join(skillPromotionRoot, `promotion-${promotionId}.md`);
  const patchRelativePath = path.posix.join(skillPromotionRoot, `patch-${promotionId}.diff`);
  const overlapNotes = input.overlapNotes?.length
    ? [...input.overlapNotes]
    : canonicalExists
      ? [`Canonical skill ${canonicalSkillPath} already exists and will be patched through review.`]
      : [`Canonical skill ${canonicalSkillPath} does not exist yet; promotion would add it.`];
  const riskNotes = input.riskNotes?.length
    ? [...input.riskNotes]
    : [
        "Canonical .agents/skills stays read-only during overlay drafting and promotion artifact generation.",
        "Evidence persistence remains guarded by the explicit redaction policy."
      ];
  const patchContent = renderFullFilePatch(canonicalSkillPath, canonicalContent, overlayContent);
  const packetContent = [
    `# Skill Promotion ${promotionId}`,
    "",
    "## Summary",
    "",
    input.summary ?? `Promote overlay skill \`${skillId}\` into canonical review flow without mutating canonical authority directly.`,
    "",
    "## Paths",
    "",
    `- overlay: \`${overlaySkillPath}\``,
    `- canonical: \`${canonicalSkillPath}\``,
    `- patch: \`${patchRelativePath}\``,
    "",
    "## Validation",
    "",
    "- shared SKILL.md validation passed",
    "- overlay support files are constrained to references/, templates/, and scripts/",
    "",
    "## Overlap Notes",
    "",
    ...overlapNotes.map((note) => `- ${note}`),
    "",
    "## Risk Notes",
    "",
    ...riskNotes.map((note) => `- ${note}`),
    "",
    "## Evidence Policy",
    "",
    `- evidence persistence is allowed only when explicitly guarded by \`${explicitEvidenceRedactionPolicyRef}\``
  ].join("\n").concat("\n");

  const absolutePacketPath = path.join(repoRoot, packetRelativePath);
  const absolutePatchPath = path.join(repoRoot, patchRelativePath);
  await mkdir(path.dirname(absolutePacketPath), { recursive: true });
  await writeFile(absolutePacketPath, packetContent, "utf8");
  await writeFile(absolutePatchPath, patchContent, "utf8");

  const index = await readOverlaySkillIndex(repoRoot);
  const currentEntry = index.skills.find((entry) => entry.skillId === skillId);
  const remainingEntries = index.skills.filter((entry) => entry.skillId !== skillId);
  remainingEntries.push({
    skillId,
    overlaySkillPath,
    canonicalSkillPath,
    evidenceDirectory: evidenceDirectoryForId(skillId),
    lifecycleStatus: "promotion_ready",
    sourceTaskId: currentEntry?.sourceTaskId,
    sourceSkillId: currentEntry?.sourceSkillId,
    promotionStatus: "promotion_generated",
    lastPromotionId: promotionId,
    lastEval: currentEntry?.lastEval,
    lastTraceUpdate: currentEntry?.lastTraceUpdate,
    promotionSuggestion: currentEntry?.promotionSuggestion,
    archive: currentEntry?.archive,
    lastUpdatedAt: currentNow
  });
  remainingEntries.sort((left, right) => left.skillId.localeCompare(right.skillId));
  await writeOverlaySkillIndex(repoRoot, {
    version: 1,
    skills: remainingEntries
  });

  return {
    promotionId,
    packetPath: packetRelativePath,
    patchPath: patchRelativePath,
    canonicalSkillPath,
    overlaySkillPath,
    createdCanonicalSkill: !canonicalExists
  };
}

export {
  archivedSkillsRoot,
  explicitEvidenceRedactionPolicyRef,
  overlaySkillsRoot,
  overlaySkillIndexPath,
  skillEvidenceRoot,
  skillPromotionRoot
};

export async function evolveOverlaySkillFromTraces(input: {
  repoRoot?: string | undefined;
  skillId: string;
  maxNotes?: number | undefined;
  now?: string | undefined;
}): Promise<OverlaySkillTraceMiningResult> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const currentNow = nowIso(input.now);
  const index = await readOverlaySkillIndex(repoRoot);
  const currentEntry = index.skills.find((entry) => entry.skillId === skillId);
  if (!currentEntry) {
    throw new Error(`Overlay skill ${skillId} is not indexed`);
  }

  const overlaySkillAbsolutePath = path.join(repoRoot, currentEntry.overlaySkillPath);
  const overlayContent = await readFile(overlaySkillAbsolutePath, "utf8");
  const commandCounts = new Map<string, number>();
  const artifactRefs: string[] = [];

  for (const relativeArtifactPath of await collectTraceArtifactPaths(repoRoot)) {
    const artifactContent = await readFile(path.join(repoRoot, relativeArtifactPath), "utf8");
    if (!artifactMatchesSkill(artifactContent, currentEntry)) {
      continue;
    }
    const commands = extractInlineCommandSnippets(artifactContent);
    if (commands.length === 0) {
      continue;
    }
    artifactRefs.push(relativeArtifactPath);
    for (const command of commands) {
      commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1);
    }
  }

  const evidencePath = path.join(repoRoot, currentEntry.evidenceDirectory, "evidence.json");
  if (await fileExists(evidencePath)) {
    const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as { snippets?: string[] };
    const commands = (evidence.snippets ?? []).filter((snippet) => /^(npm|pnpm|yarn|bun|node|bash|git)\b/i.test(snippet));
    if (commands.length > 0) {
      artifactRefs.push(path.posix.join(currentEntry.evidenceDirectory, "evidence.json"));
      for (const command of commands) {
        commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1);
      }
    }
  }

  const rankedCommands = [...commandCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([command]) => command);
  const maxNotes = Math.max(1, input.maxNotes ?? 4);
  const notesAdded = rankedCommands
    .filter((command) => !overlayContent.includes(`\`${command}\``))
    .slice(0, maxNotes)
    .map((command) => `Repeat verified step: \`${command}\``);
  const uniqueArtifactRefs = [...new Set(artifactRefs)].sort();
  const commandSnippets = rankedCommands.slice(0, maxNotes);
  let updated = false;

  if (notesAdded.length > 0) {
    const nextContent = replaceManagedTraceNotesSection(
      overlayContent,
      buildTraceNotesSection(notesAdded, uniqueArtifactRefs)
    );
    const issues = validateSkillDocument(nextContent, { expectedName: skillId });
    if (issues.length > 0) {
      throw new Error(`Trace-evolved overlay skill is invalid: ${issues.join("; ")}`);
    }
    await writeFile(overlaySkillAbsolutePath, nextContent, "utf8");
    updated = true;
  }

  const remainingEntries = index.skills.filter((entry) => entry.skillId !== skillId);
  remainingEntries.push({
    ...currentEntry,
    lifecycleStatus:
      currentEntry.lifecycleStatus === "archived" || currentEntry.lifecycleStatus === "promoted"
        ? currentEntry.lifecycleStatus
        : "active_local",
    lastTraceUpdate: {
      minedAt: currentNow,
      artifactRefs: uniqueArtifactRefs,
      commandSnippets,
      notesAdded
    },
    lastUpdatedAt: currentNow
  });
  remainingEntries.sort((left, right) => left.skillId.localeCompare(right.skillId));
  await writeOverlaySkillIndex(repoRoot, {
    version: 1,
    skills: remainingEntries
  });

  return {
    skillId,
    updated,
    notesAdded,
    commandSnippets,
    artifactRefs: uniqueArtifactRefs,
    summary:
      notesAdded.length > 0
        ? `Overlay skill ${skillId} gained ${notesAdded.length} trace-informed local notes`
        : `Overlay skill ${skillId} found no new trace-informed notes to apply`
  };
}

export async function evaluateOverlaySkill(input: {
  repoRoot?: string | undefined;
  skillId: string;
  replayCases?: readonly OverlaySkillReplayCase[] | undefined;
  now?: string | undefined;
}): Promise<OverlaySkillEvalResult> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const validation = await validateOverlaySkillDraft({ repoRoot, skillId });
  const replayCases = [...(input.replayCases ?? [])];
  const reasons = [...validation.issues];
  const skillContent = await readFile(path.join(repoRoot, validation.skillPath), "utf8");
  const tokenSet = tokenizeSkillText(skillContent);
  let passedReplays = 0;

  for (const replayCase of replayCases) {
    const expectedTerms = replayCase.expectedTerms.map((term) => term.toLowerCase().trim()).filter(Boolean);
    const matchedTerms = expectedTerms.filter((term) => tokenSet.has(term));
    if (matchedTerms.length === expectedTerms.length) {
      passedReplays += 1;
      continue;
    }
    reasons.push(
      `Replay case "${replayCase.prompt}" matched ${matchedTerms.length}/${expectedTerms.length} expected terms`
    );
  }

  const structureScore = validation.ok ? 1 : Math.max(0, 1 - validation.issues.length * 0.25);
  const replayScore = replayCases.length === 0 ? 1 : passedReplays / replayCases.length;
  const score = Number(((structureScore * 0.6) + (replayScore * 0.4)).toFixed(2));
  const passed = validation.ok && score >= 0.7;
  const summary = passed
    ? `Overlay skill ${skillId} passed advisory local evaluation`
    : `Overlay skill ${skillId} needs follow-up before promotion`;

  const index = await readOverlaySkillIndex(repoRoot);
  const currentNow = nowIso(input.now);
  const currentEntry = index.skills.find((entry) => entry.skillId === skillId);
  if (currentEntry) {
    const remainingEntries = index.skills.filter((entry) => entry.skillId !== skillId);
    remainingEntries.push({
      ...currentEntry,
      lifecycleStatus: passed ? "active_local" : currentEntry.lifecycleStatus ?? "draft",
      lastEval: {
        passed,
        score,
        summary,
        evaluatedAt: currentNow
      },
      lastTraceUpdate: currentEntry.lastTraceUpdate,
      promotionSuggestion: currentEntry.promotionSuggestion,
      lastUpdatedAt: currentNow
    });
    remainingEntries.sort((left, right) => left.skillId.localeCompare(right.skillId));
    await writeOverlaySkillIndex(repoRoot, {
      version: 1,
      skills: remainingEntries
    });
  }

  return {
    skillId,
    passed,
    score,
    reasons,
    summary
  };
}

export async function detectOverlaySkillDuplicates(input: {
  repoRoot?: string | undefined;
  skillId: string;
}): Promise<OverlaySkillDuplicateRecord[]> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const overlaySkillAbsolutePath = path.join(repoRoot, overlaySkillPathForId(skillId));
  const overlayContent = await readFile(overlaySkillAbsolutePath, "utf8");
  const overlayTokens = tokenizeSkillText(overlayContent);
  const duplicates: OverlaySkillDuplicateRecord[] = [];
  const index = await readOverlaySkillIndex(repoRoot);

  for (const entry of index.skills) {
    if (entry.skillId === skillId || entry.lifecycleStatus === "archived") {
      continue;
    }
    const candidateContent = await loadSkillContentIfExists(path.join(repoRoot, entry.overlaySkillPath));
    if (!candidateContent) {
      continue;
    }
    const score = Number(computeTokenOverlapScore(overlayTokens, tokenizeSkillText(candidateContent)).toFixed(2));
    if (score >= 0.35) {
      duplicates.push({
        skillId,
        candidateSkillId: entry.skillId,
        candidateKind: "overlay",
        score,
        reasons: ["overlay token overlap exceeds advisory threshold"]
      });
    }
  }

  const canonicalContent = await loadSkillContentIfExists(path.join(repoRoot, canonicalSkillPathForId(skillId)));
  if (canonicalContent) {
    const score = Number(computeTokenOverlapScore(overlayTokens, tokenizeSkillText(canonicalContent)).toFixed(2));
    if (score >= 0.35) {
      duplicates.push({
        skillId,
        candidateSkillId: skillId,
        candidateKind: "canonical",
        score,
        reasons: ["canonical token overlap exceeds advisory threshold"]
      });
    }
  }

  return duplicates.sort((left, right) => right.score - left.score);
}

export async function archiveOverlaySkill(input: {
  repoRoot?: string | undefined;
  skillId: string;
  reason: string;
  now?: string | undefined;
}): Promise<ArchiveOverlaySkillResult> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const currentNow = nowIso(input.now);
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("Archive reason is required");
  }

  const sourceDirectory = path.join(repoRoot, overlaySkillsRoot, skillId);
  const archivePath = archiveDirectoryForId(skillId, currentNow);
  const absoluteArchivePath = path.join(repoRoot, archivePath);
  await mkdir(path.dirname(absoluteArchivePath), { recursive: true });
  await rename(sourceDirectory, absoluteArchivePath);

  const index = await readOverlaySkillIndex(repoRoot);
  const remainingEntries = index.skills.filter((entry) => entry.skillId !== skillId);
  const currentEntry = index.skills.find((entry) => entry.skillId === skillId);
  if (currentEntry) {
    remainingEntries.push({
      ...currentEntry,
      lifecycleStatus: "archived",
      archive: {
        archivedAt: currentNow,
        archivePath,
        reason
      },
      promotionSuggestion: currentEntry.promotionSuggestion,
      lastUpdatedAt: currentNow
    });
  }
  remainingEntries.sort((left, right) => left.skillId.localeCompare(right.skillId));
  await writeOverlaySkillIndex(repoRoot, {
    version: 1,
    skills: remainingEntries
  });

  return {
    skillId,
    archivePath,
    archivedAt: currentNow
  };
}

export async function suggestOverlaySkillPromotionReadiness(input: {
  repoRoot?: string | undefined;
  skillId: string;
  now?: string | undefined;
}): Promise<OverlaySkillPromotionReadinessSuggestion> {
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const skillId = normalizeSkillId(input.skillId);
  const currentNow = nowIso(input.now);
  const index = await readOverlaySkillIndex(repoRoot);
  const currentEntry = index.skills.find((entry) => entry.skillId === skillId);
  if (!currentEntry) {
    throw new Error(`Overlay skill ${skillId} is not indexed`);
  }

  const validation = await validateOverlaySkillDraft({ repoRoot, skillId });
  const duplicates = await detectOverlaySkillDuplicates({ repoRoot, skillId });
  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 0;

  if (validation.ok) {
    score += 0.2;
    reasons.push("shared SKILL.md validation still passes");
  } else {
    blockers.push("overlay skill validation is failing");
  }

  if (currentEntry.lastEval?.passed === true) {
    score += 0.4;
    reasons.push(`latest advisory replay evaluation passed at score ${currentEntry.lastEval.score}`);
  } else {
    blockers.push("latest advisory replay evaluation has not passed");
  }

  if ((currentEntry.lastTraceUpdate?.commandSnippets.length ?? 0) > 0) {
    score += 0.25;
    reasons.push(`${currentEntry.lastTraceUpdate?.commandSnippets.length ?? 0} trace-informed command snippets were mined`);
  } else {
    blockers.push("no trace-informed command snippets have been mined yet");
  }

  const highestOverlap = duplicates[0]?.score ?? 0;
  if (highestOverlap >= 0.6) {
    blockers.push(`high advisory duplicate overlap remains (${highestOverlap})`);
  } else if (duplicates.length > 0) {
    score += 0.05;
    reasons.push("advisory duplicate overlap exists but stays below the blocking threshold");
  } else {
    score += 0.15;
    reasons.push("no advisory duplicate conflicts were found");
  }

  const roundedScore = Number(score.toFixed(2));
  const ready = blockers.length === 0 && roundedScore >= 0.75;
  const summary = ready
    ? `Overlay skill ${skillId} is ready for promotion review`
    : `Overlay skill ${skillId} is not ready for promotion review yet`;

  const remainingEntries = index.skills.filter((entry) => entry.skillId !== skillId);
  remainingEntries.push({
    ...currentEntry,
    promotionSuggestion: {
      ready,
      score: roundedScore,
      summary,
      reasons,
      blockers,
      suggestedAt: currentNow
    },
    lastUpdatedAt: currentNow
  });
  remainingEntries.sort((left, right) => left.skillId.localeCompare(right.skillId));
  await writeOverlaySkillIndex(repoRoot, {
    version: 1,
    skills: remainingEntries
  });

  return {
    skillId,
    ready,
    score: roundedScore,
    reasons,
    blockers,
    summary,
    suggestedAt: currentNow
  };
}
