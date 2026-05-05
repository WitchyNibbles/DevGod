import { cp, lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import {
  mergeAgentsMd,
  mergeCodexConfig,
  mergeGitignore,
  mergePackageJson
} from "./merge.ts";
import type { InstallMode, InstallOptions, InstallSummary, VerifySummary } from "./types.ts";

interface InstallFile {
  source: string;
  target: string;
  overwriteManaged: boolean;
}

type ManagedFileStrategy = "merge" | "replace";
type InstallPlanMode = "install-once" | "managed" | "seed";

interface InstallPlanEntry {
  target: string;
  mode: InstallPlanMode;
  strategy: ManagedFileStrategy | "seed";
  resolveDesiredContent: (targetRoot: string, currentContent: string | undefined) => Promise<string>;
}

interface InstallManifestRecord {
  target: string;
  strategy: ManagedFileStrategy;
  contentHash: string;
}

interface InstallManifest {
  version: number;
  files: InstallManifestRecord[];
}

interface ResolvedPlanEntry {
  absolutePath: string;
  entry: InstallPlanEntry;
  invalidReason: string | undefined;
  target: string;
  currentContent: string | undefined;
  currentExists: boolean;
  desiredContent: string;
}

interface PlannedWrite extends ResolvedPlanEntry {
  action: "conflict" | "create" | "skip" | "update";
}

interface ParsedInstallCommand {
  command: "init" | "upgrade";
  dryRun: boolean;
  targetArg: string;
}

interface ParsedVerifyCommand {
  command: "verify";
  targetArg: string;
}

type ParsedCliArgs = ParsedInstallCommand | ParsedVerifyCommand;

const installManifestRelativePath = ".devgod/install-manifest.json";
const installManifestVersion = 1;

const generatedReviewIdentityAdapter = `import { createReviewPrincipalAdapter } from "devgod/src/index.ts";

export default createReviewPrincipalAdapter(async () => {
  throw new Error(
    "Implement devgod/review-identity-adapter.ts with your server-side authenticated principal lookup before trusting review actions"
  );
});
`;

function usage(): never {
  throw new Error(
    "Usage: node --experimental-strip-types src/install/cli.ts --dry-run --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts init (--apply | --dry-run) --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts upgrade (--apply | --dry-run) --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts verify --target <path> | <path>"
  );
}

function buildNextSteps(command: "init" | "upgrade", mode: InstallMode): string[] {
  if (command === "upgrade") {
    if (mode === "dry-run") {
      return [
        "Review the planned upgrade changes, conflicts, and orphans.",
        "Resolve any conflicts before applying the upgrade.",
        "Rerun in apply mode to write the planned managed-file updates.",
        "Run verify after the upgrade to confirm the managed surface is clean."
      ];
    }

    return [
      "Review any backups under .devgod/install-backups/ if you changed managed files locally.",
      "Run verify to confirm the managed surface is clean.",
      "Resolve any reported orphans manually if the current package no longer manages them."
    ];
  }

  if (mode === "dry-run") {
    return [
      "Review the planned file changes.",
      "Rerun in apply mode to write changes.",
      "After apply, run npm install in the target project.",
      "If you want the shipped local Docker bootstrap path, run npm run devgod:setup:local.",
      "Implement devgod/review-identity-adapter.ts before trusting review actions."
    ];
  }

  return [
    "cd into the target project",
    "npm install",
    "If you want the shipped local Docker bootstrap path, run npm run devgod:setup:local.",
    "Implement devgod/review-identity-adapter.ts and run npm run devgod:verify:review-identity."
  ];
}

async function ensureDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isDirectory();
  } catch {
    return false;
  }
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  if (!(await fileExists(filePath))) {
    return undefined;
  }

  return readFile(filePath, "utf8");
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function inspectManagedTarget(
  targetRoot: string,
  relativePath: string
): Promise<{
  absolutePath: string;
  content: string | undefined;
  exists: boolean;
  invalidReason: string | undefined;
}> {
  const absolutePath = path.resolve(targetRoot, relativePath);
  const rootRealPath = await realpath(targetRoot);

  if (!isPathWithinRoot(targetRoot, absolutePath)) {
    return {
      absolutePath,
      content: undefined,
      exists: false,
      invalidReason: "target path escapes the target root"
    };
  }

  const relativeFromRoot = path.relative(targetRoot, absolutePath);
  const pathSegments = relativeFromRoot.split(path.sep).filter((segment) => segment.length > 0);
  const parentSegments = pathSegments.slice(0, -1);
  let currentPath = targetRoot;

  for (const segment of parentSegments) {
    currentPath = path.join(currentPath, segment);

    let currentStat;
    try {
      currentStat = await lstat(currentPath);
    } catch (error: unknown) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        currentPath = path.join(currentPath, ...parentSegments.slice(parentSegments.indexOf(segment) + 1));
        break;
      }
      throw error;
    }

    if (!currentStat.isDirectory()) {
      return {
        absolutePath,
        content: undefined,
        exists: false,
        invalidReason: "managed path parent is not an in-root directory"
      };
    }

    const currentRealPath = await realpath(currentPath);
    if (!isPathWithinRoot(rootRealPath, currentRealPath)) {
      return {
        absolutePath,
        content: undefined,
        exists: false,
        invalidReason: "managed path parent resolves outside the target root"
      };
    }
  }

  try {
    const targetStat = await lstat(absolutePath);
    if (!targetStat.isFile()) {
      return {
        absolutePath,
        content: undefined,
        exists: false,
        invalidReason: "managed path is not an in-root regular file"
      };
    }

    const targetRealPath = await realpath(absolutePath);
    if (!isPathWithinRoot(rootRealPath, targetRealPath)) {
      return {
        absolutePath,
        content: undefined,
        exists: false,
        invalidReason: "managed path resolves outside the target root"
      };
    }

    return {
      absolutePath,
      content: await readFile(absolutePath, "utf8"),
      exists: true,
      invalidReason: undefined
    };
  } catch (error: unknown) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      throw error;
    }

    return {
      absolutePath,
      content: undefined,
      exists: false,
      invalidReason: undefined
    };
  }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentRoot: string) {
    const entries = await import("node:fs/promises").then(({ readdir }) =>
      readdir(currentRoot, { withFileTypes: true })
    );
    for (const entry of entries) {
      const fullPath = path.join(currentRoot, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function createInstallSummary(mode: InstallMode, nextSteps: string[]): InstallSummary {
  return {
    mode,
    writesPerformed: false,
    created: [],
    updated: [],
    skipped: [],
    backups: [],
    plannedBackups: [],
    conflicts: [],
    orphans: [],
    nextSteps
  };
}

function normalizeManifestRecord(record: InstallManifestRecord): InstallManifestRecord {
  return {
    target: record.target.replace(/\\/g, "/"),
    strategy: record.strategy,
    contentHash: record.contentHash
  };
}

function serializeInstallManifest(manifest: InstallManifest): string {
  return `${JSON.stringify(
    {
      version: installManifestVersion,
      files: [...manifest.files]
        .map(normalizeManifestRecord)
        .sort((left, right) => left.target.localeCompare(right.target))
    },
    null,
    2
  )}\n`;
}

async function readInstallManifest(targetRoot: string): Promise<InstallManifest | undefined> {
  const manifestPath = path.join(targetRoot, installManifestRelativePath);
  const inspection = await inspectManagedTarget(targetRoot, installManifestRelativePath);
  if (inspection.invalidReason) {
    throw new Error(`Install manifest at ${installManifestRelativePath} is not an in-root regular file.`);
  }

  const manifestContent = inspection.content;
  if (!manifestContent) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestContent);
  } catch {
    throw new Error(`Install manifest at ${installManifestRelativePath} is not valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Install manifest at ${installManifestRelativePath} has an invalid shape.`);
  }

  const candidate = parsed as {
    files?: unknown;
    version?: unknown;
  };

  if (candidate.version !== installManifestVersion) {
    throw new Error(
      `Install manifest at ${installManifestRelativePath} has unsupported version ${String(candidate.version)}.`
    );
  }

  if (!Array.isArray(candidate.files)) {
    throw new Error(`Install manifest at ${installManifestRelativePath} is missing its files list.`);
  }

  const files = candidate.files.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Install manifest at ${installManifestRelativePath} has an invalid file record.`);
    }

    const record = entry as {
      contentHash?: unknown;
      strategy?: unknown;
      target?: unknown;
    };

    if (typeof record.target !== "string" || typeof record.contentHash !== "string") {
      throw new Error(`Install manifest at ${installManifestRelativePath} has an invalid file record.`);
    }

    if (record.strategy !== "merge" && record.strategy !== "replace") {
      throw new Error(`Install manifest at ${installManifestRelativePath} has an unsupported strategy.`);
    }

    return normalizeManifestRecord({
      target: record.target,
      strategy: record.strategy,
      contentHash: record.contentHash
    });
  });

  return {
    version: installManifestVersion,
    files
  };
}

async function buildManifest(sourceRoot: string): Promise<InstallFile[]> {
  const manifest: InstallFile[] = [];

  const recursiveRoots = [".devgod/rules", ".devgod/templates"];

  for (const relativeRoot of recursiveRoots) {
    const sourcePath = path.join(sourceRoot, relativeRoot);
    if (!(await directoryExists(sourcePath))) {
      continue;
    }

    for (const filePath of await listFilesRecursive(sourcePath)) {
      const relativePath = path.relative(sourceRoot, filePath);
      const overwriteManaged = !relativePath.startsWith(".devgod/memory/");
      manifest.push({
        source: filePath,
        target: relativePath,
        overwriteManaged
      });
    }
  }

  const scaffoldFiles = [
    ".devgod/work/README.md",
    ".devgod/work/briefs/README.md",
    ".devgod/work/plans/README.md",
    ".devgod/work/reviews/README.md",
    ".devgod/work/tasks/README.md",
    ".devgod/work/release/README.md",
    ".devgod/memory/README.md"
  ];

  for (const relativePath of scaffoldFiles) {
    const sourcePath = path.join(sourceRoot, relativePath);
    if (!(await fileExists(sourcePath))) {
      continue;
    }

    manifest.push({
      source: sourcePath,
      target: relativePath,
      overwriteManaged: true
    });
  }

  const skillsRoot = path.join(sourceRoot, ".agents/skills");
  for (const skillPath of await listFilesRecursive(skillsRoot)) {
    const relativePath = path.relative(sourceRoot, skillPath);
    if (!relativePath.startsWith(".agents/skills/devgod-")) {
      continue;
    }

    manifest.push({
      source: skillPath,
      target: relativePath,
      overwriteManaged: true
    });
  }

  const agentsRoot = path.join(sourceRoot, ".codex/agents");
  for (const agentPath of await listFilesRecursive(agentsRoot)) {
    const baseName = path.basename(agentPath);
    const prefixedName = baseName.startsWith("devgod-") ? baseName : `devgod-${baseName}`;
    manifest.push({
      source: agentPath,
      target: path.join(".codex/agents", prefixedName),
      overwriteManaged: true
    });
  }

  manifest.push(
    {
      source: path.join(sourceRoot, ".env.example"),
      target: ".env.devgod.example",
      overwriteManaged: true
    },
    {
      source: path.join(sourceRoot, "docker-compose.yml"),
      target: "docker-compose.devgod.yml",
      overwriteManaged: true
    },
    {
      source: path.join(sourceRoot, "scripts/check-devgod-workflow.sh"),
      target: "scripts/check-devgod-workflow.sh",
      overwriteManaged: true
    },
    {
      source: path.join(sourceRoot, "scripts/check-devgod-workflow-live.sh"),
      target: "scripts/check-devgod-workflow-live.sh",
      overwriteManaged: true
    }
  );

  const installedPolicyFiles: InstallFile[] = [
    {
      source: path.join(sourceRoot, ".devgod/templates/review-identity-bindings.json"),
      target: ".devgod/review-identity-bindings.json",
      overwriteManaged: false
    },
    {
      source: path.join(sourceRoot, ".devgod/templates/review-identity-adapter.fixture.json"),
      target: ".devgod/review-identity-adapter.fixture.json",
      overwriteManaged: false
    }
  ];

  for (const file of installedPolicyFiles) {
    if (await fileExists(file.source)) {
      manifest.push(file);
    }
  }

  return manifest;
}

async function buildInstallPlan(sourceRoot: string): Promise<InstallPlanEntry[]> {
  const plan: InstallPlanEntry[] = [];
  const copiedFiles = await buildManifest(sourceRoot);

  for (const file of copiedFiles) {
    plan.push({
      target: file.target,
      mode: file.overwriteManaged ? "managed" : "install-once",
      strategy: "replace",
      resolveDesiredContent: async () => readFile(file.source, "utf8")
    });
  }

  const sourceConfig = await readFile(path.join(sourceRoot, ".codex/config.toml"), "utf8");
  const setupScriptSh = await readFile(path.join(sourceRoot, "scripts/setup-devgod.sh"), "utf8");
  const setupScriptPs1 = await readFile(path.join(sourceRoot, "scripts/setup-devgod.ps1"), "utf8");

  plan.push(
    {
      target: ".codex/config.toml",
      mode: "managed",
      strategy: "merge",
      resolveDesiredContent: async (_targetRoot, currentContent) => mergeCodexConfig(currentContent, sourceConfig)
    },
    {
      target: "AGENTS.md",
      mode: "managed",
      strategy: "merge",
      resolveDesiredContent: async (_targetRoot, currentContent) => mergeAgentsMd(currentContent)
    },
    {
      target: "package.json",
      mode: "managed",
      strategy: "merge",
      resolveDesiredContent: async (targetRoot, currentContent) => {
        const dependencyPath = path.relative(targetRoot, sourceRoot);
        return mergePackageJson(currentContent, dependencyPath);
      }
    },
    {
      target: ".gitignore",
      mode: "managed",
      strategy: "merge",
      resolveDesiredContent: async (_targetRoot, currentContent) => mergeGitignore(currentContent)
    },
    {
      target: "scripts/devgod-setup.sh",
      mode: "managed",
      strategy: "replace",
      resolveDesiredContent: async () => setupScriptSh
    },
    {
      target: "scripts/devgod-setup.ps1",
      mode: "managed",
      strategy: "replace",
      resolveDesiredContent: async () => setupScriptPs1
    },
    {
      target: "devgod/review-identity-adapter.ts",
      mode: "seed",
      strategy: "seed",
      resolveDesiredContent: async () => generatedReviewIdentityAdapter
    }
  );

  return plan;
}

async function backupExistingFile(
  targetRoot: string,
  relativePath: string,
  timestamp: string,
  summary: InstallSummary,
  dryRun: boolean
): Promise<void> {
  const backupPath = path.join(targetRoot, ".devgod/install-backups", timestamp, relativePath);
  const relativeBackupPath = path.relative(targetRoot, backupPath);
  summary.plannedBackups.push(relativeBackupPath);
  if (dryRun) {
    return;
  }

  await ensureDirectory(backupPath);
  await cp(path.join(targetRoot, relativePath), backupPath);
  summary.backups.push(relativeBackupPath);
  summary.writesPerformed = true;
}

function resolveCliTarget(args: string[], ignoredArgs: ReadonlySet<string> = new Set(["--dry-run"])): string {
  const targetIndex = args.indexOf("--target");

  if (targetIndex !== -1) {
    const targetArg = args[targetIndex + 1];
    if (!targetArg || targetArg.startsWith("-")) {
      throw new Error("Target path must follow --target and cannot start with '-'.");
    }
    return targetArg;
  }

  const positionalTarget = args.find((arg) => !ignoredArgs.has(arg));
  if (!positionalTarget || positionalTarget.startsWith("-")) {
    usage();
  }

  return positionalTarget;
}

function parseInstallCommand(command: "init" | "upgrade", args: string[]): ParsedInstallCommand {
  const hasDryRun = args.includes("--dry-run");
  const hasApply = args.includes("--apply");

  if (Number(hasDryRun) + Number(hasApply) !== 1) {
    throw new Error(`${command} requires exactly one of --apply or --dry-run.`);
  }

  return {
    command,
    dryRun: hasDryRun,
    targetArg: resolveCliTarget(args, new Set(["--dry-run", "--apply"]))
  };
}

function parseCliArgs(rawArgs: string[]): ParsedCliArgs {
  const command = rawArgs[0];

  if (command === "init" || command === "upgrade") {
    return parseInstallCommand(command, rawArgs.slice(1));
  }

  if (command === "verify") {
    const commandArgs = rawArgs.slice(1);
    if (commandArgs.includes("--apply") || commandArgs.includes("--dry-run")) {
      throw new Error("verify does not support --apply or --dry-run.");
    }

    return {
      command: "verify",
      targetArg: resolveCliTarget(commandArgs)
    };
  }

  if (rawArgs.includes("--apply")) {
    throw new Error("--apply is only supported with the init or upgrade commands.");
  }

  if (!rawArgs.includes("--dry-run")) {
    throw new Error(
      "Mutating installs require 'init --apply'. Legacy direct invocation without 'init' is dry-run only."
    );
  }

  return {
    command: "init",
    dryRun: true,
    targetArg: resolveCliTarget(rawArgs)
  };
}

async function resolvePlanEntry(entry: InstallPlanEntry, targetRoot: string): Promise<ResolvedPlanEntry> {
  const inspection = await inspectManagedTarget(targetRoot, entry.target);
  const currentContent = inspection.content;
  const desiredContent = await entry.resolveDesiredContent(targetRoot, currentContent);

  return {
    absolutePath: inspection.absolutePath,
    entry,
    invalidReason: inspection.invalidReason,
    target: entry.target,
    currentContent,
    currentExists: inspection.exists,
    desiredContent
  };
}

function resolveInstallAction(resolved: ResolvedPlanEntry): PlannedWrite {
  if (resolved.invalidReason) {
    return { ...resolved, action: "conflict" };
  }

  if (!resolved.currentExists) {
    return { ...resolved, action: "create" };
  }

  if (resolved.currentContent === resolved.desiredContent) {
    return { ...resolved, action: "skip" };
  }

  if (resolved.entry.mode === "managed") {
    return { ...resolved, action: "update" };
  }

  return { ...resolved, action: "skip" };
}

function resolveUpgradeAction(
  resolved: ResolvedPlanEntry,
  manifestRecord: InstallManifestRecord | undefined
): PlannedWrite {
  if (resolved.invalidReason) {
    return { ...resolved, action: "conflict" };
  }

  if (!resolved.currentExists) {
    return { ...resolved, action: "create" };
  }

  if (resolved.currentContent === resolved.desiredContent) {
    return { ...resolved, action: "skip" };
  }

  if (!manifestRecord) {
    return { ...resolved, action: "conflict" };
  }

  if (resolved.entry.strategy !== "replace") {
    return { ...resolved, action: "update" };
  }

  const currentContent = resolved.currentContent;
  if (currentContent === undefined) {
    return { ...resolved, action: "conflict" };
  }

  const currentHash = hashContent(currentContent);
  const desiredHash = hashContent(resolved.desiredContent);
  if (currentHash !== manifestRecord.contentHash && desiredHash !== manifestRecord.contentHash) {
    return { ...resolved, action: "conflict" };
  }

  return { ...resolved, action: "update" };
}

async function writeFileContent(absolutePath: string, content: string): Promise<void> {
  await ensureDirectory(absolutePath);
  await writeFile(absolutePath, content, "utf8");
}

async function applyPlannedWrite(
  targetRoot: string,
  plannedWrite: PlannedWrite,
  timestamp: string,
  summary: InstallSummary,
  dryRun: boolean
): Promise<void> {
  if (plannedWrite.action === "skip" || plannedWrite.action === "conflict") {
    summary.skipped.push(plannedWrite.target);
    return;
  }

  if (plannedWrite.action === "create") {
    summary.created.push(plannedWrite.target);
    if (dryRun) {
      return;
    }

    await writeFileContent(plannedWrite.absolutePath, plannedWrite.desiredContent);
    summary.writesPerformed = true;
    return;
  }

  await backupExistingFile(targetRoot, plannedWrite.target, timestamp, summary, dryRun);
  summary.updated.push(plannedWrite.target);
  if (dryRun) {
    return;
  }

  await writeFileContent(plannedWrite.absolutePath, plannedWrite.desiredContent);
  summary.writesPerformed = true;
}

async function writeInstallManifest(
  targetRoot: string,
  plannedWrites: PlannedWrite[],
  existingManifest?: InstallManifest
): Promise<boolean> {
  const activeManagedTargets = new Set(
    plannedWrites
      .filter((plannedWrite) => plannedWrite.entry.mode === "managed")
      .map((plannedWrite) => plannedWrite.target)
  );

  const orphanRecords: InstallManifestRecord[] = [];
  for (const record of existingManifest?.files ?? []) {
    if (activeManagedTargets.has(record.target)) {
      continue;
    }

    if (await fileExists(path.join(targetRoot, record.target))) {
      orphanRecords.push(record);
    }
  }

  const manifest: InstallManifest = {
    version: installManifestVersion,
    files: [
      ...plannedWrites
        .filter((plannedWrite) => plannedWrite.entry.mode === "managed")
        .map((plannedWrite) => ({
          target: plannedWrite.target,
          strategy: plannedWrite.entry.strategy as ManagedFileStrategy,
          contentHash: hashContent(plannedWrite.desiredContent)
        })),
      ...orphanRecords
    ]
  };

  const manifestContent = serializeInstallManifest(manifest);
  const manifestInspection = await inspectManagedTarget(targetRoot, installManifestRelativePath);
  if (manifestInspection.invalidReason) {
    throw new Error(`Install manifest at ${installManifestRelativePath} is not an in-root regular file.`);
  }

  if (manifestInspection.content === manifestContent) {
    return false;
  }

  await writeFileContent(manifestInspection.absolutePath, manifestContent);
  return true;
}

async function buildLegacyInstallManifest(sourceRoot: string, targetRoot: string): Promise<InstallManifest> {
  const planEntries = (await buildInstallPlan(sourceRoot)).filter((entry) => entry.mode === "managed");
  const files: InstallManifestRecord[] = [];

  for (const entry of planEntries) {
    const resolved = await resolvePlanEntry(entry, targetRoot);
    if (!resolved.currentExists || resolved.invalidReason || resolved.currentContent === undefined) {
      continue;
    }

    files.push({
      target: resolved.target,
      strategy: resolved.entry.strategy as ManagedFileStrategy,
      contentHash: hashContent(resolved.currentContent)
    });
  }

  return {
    version: installManifestVersion,
    files
  };
}

async function loadInstallManifestOrBackfill(
  sourceRoot: string,
  targetRoot: string
): Promise<{
  existingManifest: InstallManifest | undefined;
  manifest: InstallManifest;
}> {
  const existingManifest = await readInstallManifest(targetRoot);
  if (existingManifest) {
    return {
      existingManifest,
      manifest: existingManifest
    };
  }

  return {
    existingManifest: undefined,
    manifest: await buildLegacyInstallManifest(sourceRoot, targetRoot)
  };
}

async function buildManagedUpgradePlan(
  sourceRoot: string,
  targetRoot: string,
  manifest: InstallManifest
): Promise<{
  orphans: string[];
  plannedWrites: PlannedWrite[];
}> {
  const planEntries = (await buildInstallPlan(sourceRoot)).filter((entry) => entry.mode === "managed");
  const manifestRecords = new Map(manifest.files.map((record) => [record.target, record] as const));
  const plannedTargets = new Set(planEntries.map((entry) => entry.target));

  const orphans: string[] = [];
  for (const record of manifest.files) {
    if (plannedTargets.has(record.target)) {
      continue;
    }

    const inspection = await inspectManagedTarget(targetRoot, record.target);
    if (inspection.exists || inspection.invalidReason) {
      orphans.push(record.target);
    }
  }

  const plannedWrites: PlannedWrite[] = [];
  for (const entry of planEntries) {
    const resolved = await resolvePlanEntry(entry, targetRoot);
    plannedWrites.push(resolveUpgradeAction(resolved, manifestRecords.get(entry.target)));
  }

  return {
    orphans: orphans.sort((left, right) => left.localeCompare(right)),
    plannedWrites
  };
}

function assertTargetRoot(sourceRoot: string, targetRoot: string): void {
  if (sourceRoot === targetRoot) {
    throw new Error("Refusing to install into the devgod source repository");
  }
}

export async function installDevgodIntoProject(options: InstallOptions): Promise<InstallSummary> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRoot = path.resolve(options.targetRoot);
  const mode: InstallMode = options.dryRun ? "dry-run" : "apply";
  const dryRun = mode === "dry-run";

  assertTargetRoot(sourceRoot, targetRoot);

  const summary = createInstallSummary(mode, buildNextSteps("init", mode));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plannedWrites: PlannedWrite[] = [];

  for (const entry of await buildInstallPlan(sourceRoot)) {
    const plannedWrite = resolveInstallAction(await resolvePlanEntry(entry, targetRoot));
    plannedWrites.push(plannedWrite);
    if (plannedWrite.action === "conflict") {
      summary.conflicts.push(plannedWrite.target);
    }
    await applyPlannedWrite(targetRoot, plannedWrite, timestamp, summary, dryRun);
  }

  if (!dryRun) {
    if (await writeInstallManifest(targetRoot, plannedWrites)) {
      summary.writesPerformed = true;
    }
  }

  return summary;
}

export async function upgradeDevgodInProject(options: InstallOptions): Promise<InstallSummary> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRoot = path.resolve(options.targetRoot);
  const mode: InstallMode = options.dryRun ? "dry-run" : "apply";
  const dryRun = mode === "dry-run";

  assertTargetRoot(sourceRoot, targetRoot);

  const summary = createInstallSummary(mode, buildNextSteps("upgrade", mode));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { existingManifest, manifest } = await loadInstallManifestOrBackfill(sourceRoot, targetRoot);
  const { orphans, plannedWrites } = await buildManagedUpgradePlan(sourceRoot, targetRoot, manifest);

  summary.orphans.push(...orphans);
  for (const plannedWrite of plannedWrites) {
    if (plannedWrite.action === "conflict") {
      summary.conflicts.push(plannedWrite.target);
    }
  }

  if (summary.conflicts.length > 0 && !dryRun) {
    return summary;
  }

  for (const plannedWrite of plannedWrites) {
    await applyPlannedWrite(targetRoot, plannedWrite, timestamp, summary, dryRun);
  }

  if (!dryRun) {
    if (await writeInstallManifest(targetRoot, plannedWrites, existingManifest ?? manifest)) {
      summary.writesPerformed = true;
    }
  }

  return summary;
}

export async function verifyDevgodInstall(options: InstallOptions): Promise<VerifySummary> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRoot = path.resolve(options.targetRoot);

  assertTargetRoot(sourceRoot, targetRoot);

  const { manifest } = await loadInstallManifestOrBackfill(sourceRoot, targetRoot);
  const planEntries = (await buildInstallPlan(sourceRoot)).filter((entry) => entry.mode === "managed");
  const plannedTargets = new Set(planEntries.map((entry) => entry.target));

  const missing: string[] = [];
  const modified: string[] = [];
  for (const entry of planEntries) {
    const resolved = await resolvePlanEntry(entry, targetRoot);
    if (resolved.invalidReason) {
      modified.push(entry.target);
      continue;
    }

    if (!resolved.currentExists) {
      missing.push(entry.target);
      continue;
    }

    if (resolved.currentContent !== resolved.desiredContent) {
      modified.push(entry.target);
    }
  }

  const orphans: string[] = [];
  for (const record of manifest.files) {
    if (plannedTargets.has(record.target)) {
      continue;
    }

    const inspection = await inspectManagedTarget(targetRoot, record.target);
    if (inspection.exists || inspection.invalidReason) {
      orphans.push(record.target);
    }
  }

  return {
    ok: missing.length === 0 && modified.length === 0 && orphans.length === 0,
    missing,
    modified,
    orphans: orphans.sort((left, right) => left.localeCompare(right))
  };
}

function printInstallSummary(command: "init" | "upgrade", targetRoot: string, summary: InstallSummary): void {
  if (command === "upgrade") {
    console.log(
      summary.mode === "dry-run"
        ? `devgod upgrade plan for ${targetRoot}`
        : `devgod upgraded ${targetRoot}`
    );
  } else {
    console.log(
      summary.mode === "dry-run"
        ? `devgod dry run for ${targetRoot}`
        : `devgod installed into ${targetRoot}`
    );
  }

  console.log(`mode: ${summary.mode}`);
  console.log(`created: ${summary.created.length}`);
  console.log(`updated: ${summary.updated.length}`);
  console.log(`skipped: ${summary.skipped.length}`);
  console.log(`conflicts: ${summary.conflicts.length}`);
  console.log(`orphans: ${summary.orphans.length}`);
  console.log(`backups created: ${summary.backups.length}`);
  console.log(`backups planned: ${summary.plannedBackups.length}`);
  console.log(`writes performed: ${summary.writesPerformed ? "yes" : "no"}`);

  if (summary.conflicts.length > 0) {
    console.log("Conflicts:");
    for (const filePath of summary.conflicts) {
      console.log(`- ${filePath}`);
    }
  }

  if (summary.orphans.length > 0) {
    console.log("Orphans:");
    for (const filePath of summary.orphans) {
      console.log(`- ${filePath}`);
    }
  }

  console.log("Next steps:");
  for (const [index, step] of summary.nextSteps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
}

function printVerifySummary(targetRoot: string, summary: VerifySummary): void {
  console.log(`devgod verify for ${targetRoot}`);
  console.log(`status: ${summary.ok ? "ok" : "drifted"}`);
  console.log(`missing: ${summary.missing.length}`);
  console.log(`modified: ${summary.modified.length}`);
  console.log(`orphans: ${summary.orphans.length}`);

  if (summary.missing.length > 0) {
    console.log("Missing:");
    for (const filePath of summary.missing) {
      console.log(`- ${filePath}`);
    }
  }

  if (summary.modified.length > 0) {
    console.log("Modified:");
    for (const filePath of summary.modified) {
      console.log(`- ${filePath}`);
    }
  }

  if (summary.orphans.length > 0) {
    console.log("Orphans:");
    for (const filePath of summary.orphans) {
      console.log(`- ${filePath}`);
    }
  }
}

async function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));

  const sourceRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
  const targetRoot = path.resolve(parsedArgs.targetArg);

  if (parsedArgs.command === "verify") {
    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });
    printVerifySummary(targetRoot, summary);
    if (!summary.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const summary = parsedArgs.command === "init"
    ? await installDevgodIntoProject({
        sourceRoot,
        targetRoot,
        dryRun: parsedArgs.dryRun
      })
    : await upgradeDevgodInProject({
        sourceRoot,
        targetRoot,
        dryRun: parsedArgs.dryRun
      });

  printInstallSummary(parsedArgs.command, targetRoot, summary);
  if (parsedArgs.command === "upgrade" && summary.conflicts.length > 0) {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
