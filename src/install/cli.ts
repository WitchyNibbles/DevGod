import { cp, lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";
import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";
import {
  grafanaCodexConfigFragment,
  mergeAgentsMd,
  mergeDotAgentsMd,
  mergeCodexConfig,
  mergeGitignore,
  mergePackageJson,
  playwrightCodexConfigFragment
} from "./merge.ts";
import { listCatalogRepoLocalSkillPaths } from "../devgod/repo-local-skill-surface.ts";
import { verifyNonUserFacingAgentCavemanContract } from "../devgod/caveman-policy.ts";
import {
  buildWorkflowReviewArtifactRelativePaths,
  workflowReviewActorRoles,
  workflowReviewExportPoliciesDisplay,
  workflowReviewProvenanceStatuses,
  workflowTemplateReviewRoles,
  type WorkflowTemplateReviewRole
} from "../devgod/workflow-schema.ts";
import { detectGrafanaRepoConfig } from "../grafana/config.ts";
import { resolveRuntimeEnvironmentConfig } from "../runtime/config.ts";
import type {
  InstallMode,
  InstallOptions,
  InstallSummary,
  VerifySummary,
  WorkflowScaffoldOptions,
  WorkflowScaffoldSummary
} from "./types.ts";

interface InstallFile {
  source: string;
  target: string;
  overwriteManaged: boolean;
}

type ManagedFileStrategy = "merge" | "replace";
type InstallPlanMode = "install-once" | "managed";

interface InstallPlanEntry {
  target: string;
  mode: InstallPlanMode;
  strategy: ManagedFileStrategy;
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
  withPlaywright?: boolean;
  withGrafana?: boolean;
}

interface ParsedVerifyCommand {
  command: "verify";
  targetArg: string;
}

interface ParsedScaffoldCommand {
  command: "scaffold-workflow";
  targetArg: string;
  taskId: string;
  force: boolean;
  forceActive: boolean;
}

interface ParsedHappyPathFixtureCommand {
  command: "seed-happy-path-fixture";
  targetArg: string;
  taskId: string;
  force: boolean;
  forceActive: boolean;
}

interface ParsedUpgradeReasoningWorkflowCommand {
  command: "upgrade-reasoning-workflow";
  targetArg: string;
  taskId: string;
  mode: "dual" | "strict";
  force: boolean;
}

type ParsedCliArgs =
  | ParsedInstallCommand
  | ParsedVerifyCommand
  | ParsedScaffoldCommand
  | ParsedHappyPathFixtureCommand
  | ParsedUpgradeReasoningWorkflowCommand;

const installManifestRelativePath = ".devgod/install-manifest.json";
const installManifestVersion = 1;
const legacyManagedCompatibilityTargets = [
  "scripts/install-devgod.ps1",
  "scripts/install-devgod.sh",
  "scripts/setup-devgod.ps1",
  "scripts/setup-devgod.sh",
  "scripts/verify-installed-repo-harness.sh"
] as const;

const generatedReviewIdentityAdapter = `import {
  createHeaderReviewIdentityAdapter,
  createReviewPrincipalAdapter
} from "devgod";

export const reviewIdentityAdapters = {
  auth_context_passthrough: createReviewPrincipalAdapter(async ({ authContext }) => {
    const candidate =
      typeof authContext === "object" && authContext !== null
        ? (authContext as Record<string, unknown>)
        : {};

    if (candidate.verified !== true) {
      throw new Error("Auth context principal is not verified");
    }

    return {
      provider: String(candidate.provider ?? ""),
      subject: String(candidate.subject ?? ""),
      verified: true,
      displayName: typeof candidate.displayName === "string" ? candidate.displayName : undefined,
      email: typeof candidate.email === "string" ? candidate.email : undefined
    };
  }),
  forwarded_headers: createHeaderReviewIdentityAdapter({
    provider: "forwarded_headers",
    subjectHeader: "x-devgod-review-subject",
    verifiedHeader: "x-devgod-review-verified",
    verifiedValue: "true",
    displayNameHeader: "x-devgod-review-name",
    emailHeader: "x-devgod-review-email",
    groupsHeader: "x-devgod-review-groups"
  })
};

export default createReviewPrincipalAdapter(async () => {
  throw new Error(
    "Implement devgod/review-identity-adapter.ts with your authenticated principal lookup or select DEVGOD_REVIEW_IDENTITY_BACKEND from reviewIdentityAdapters before trusting review actions"
  );
});
`;

function usage(): never {
  throw new Error(
    "Usage: node --experimental-strip-types src/install/cli.ts --dry-run [--with-playwright] [--with-grafana] --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts init (--apply | --dry-run) [--with-playwright] [--with-grafana] --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts upgrade (--apply | --dry-run) [--with-playwright] [--with-grafana] --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts verify --target <path> | <path>\n" +
      "   or: node --experimental-strip-types src/install/cli.ts scaffold-workflow --target <path> --task-id <task-id> [--force] [--force-active]\n" +
      "   or: node --experimental-strip-types src/install/cli.ts seed-happy-path-fixture --target <path> --task-id fixture-<name> [--force]\n" +
      "   or: node --experimental-strip-types src/install/cli.ts upgrade-reasoning-workflow --target <path> --task-id <task-id> [--mode dual|strict] [--force]"
  );
}

function buildNextSteps(
  command: "init" | "upgrade",
  mode: InstallMode,
  options: {
    withPlaywright: boolean;
    withGrafana: boolean;
  }
): string[] {
  if (command === "upgrade") {
    if (mode === "dry-run") {
      return [
        "Review the planned upgrade changes, conflicts, and orphans.",
        "Resolve any conflicts before applying the upgrade.",
        "Rerun in apply mode to write the planned managed-file updates.",
        "After apply, run npm install and then npm run devgod:setup:local for core runtime setup.",
        options.withPlaywright
          ? "Optional module: run npm run devgod:setup:playwright and npm run devgod:verify:playwright when you need Playwright-backed UI workflow proof."
          : "Optional module: rerun upgrade with --with-playwright to add Playwright MCP profiles and setup commands for UI workflow proof.",
        options.withGrafana
          ? "If you want Grafana-backed logs, set DEVGOD_GRAFANA_URL plus auth in .env.devgod, then use the grafana MCP tools from Codex."
          : "Optional module: rerun upgrade with --with-grafana to install the Grafana MCP server wiring for log-backed debugging and research.",
        "After apply, run npm run devgod:setup:git-guard and npm run devgod:verify:git-guard."
      ];
    }

    return [
      "Review any backups under .devgod/install-backups/ if you changed managed files locally.",
      "Run npm install, then npm run devgod:setup:local for core runtime setup.",
      options.withPlaywright
        ? "Optional module: run npm run devgod:setup:playwright and npm run devgod:verify:playwright when you need Playwright-backed UI workflow proof."
        : "Optional module: rerun upgrade with --with-playwright to add Playwright MCP profiles and setup commands for UI workflow proof.",
      options.withGrafana
        ? "Fill in DEVGOD_GRAFANA_URL plus auth and datasource settings in .env.devgod before using Grafana-backed log tools."
        : "Optional module: rerun upgrade with --with-grafana to install the Grafana MCP server wiring for log-backed debugging and research.",
      "Run npm run devgod:setup:git-guard and npm run devgod:verify:git-guard.",
      "Resolve any reported orphans manually if the current package no longer manages them."
    ];
  }

  if (mode === "dry-run") {
      return [
        "Review the planned file changes.",
        "Rerun in apply mode to write changes.",
        "After apply, run npm install in the target project.",
        "After npm install, run npm run devgod:setup:local for core runtime setup.",
        options.withPlaywright
          ? "Optional module: run npm run devgod:setup:playwright and npm run devgod:verify:playwright when you need Playwright-backed UI workflow proof."
          : "Optional module: rerun init with --with-playwright to add Playwright MCP profiles and setup commands for UI workflow proof.",
        options.withGrafana
          ? "If you want Grafana-backed logs, set DEVGOD_GRAFANA_URL plus auth and datasource settings in .env.devgod after apply."
          : "Optional module: rerun init with --with-grafana to add Grafana MCP wiring for log-backed debugging and research.",
        "Implement devgod/review-identity-adapter.ts before trusting review actions or running npm run devgod:record-review."
      ];
  }

  return [
    "cd into the target project",
    "npm install",
    "Run npm run devgod:setup:local for core runtime setup.",
    options.withPlaywright
      ? "Optional module: run npm run devgod:setup:playwright and npm run devgod:verify:playwright when you need Playwright-backed UI workflow proof."
      : "Optional module: rerun init with --with-playwright to add Playwright MCP profiles and setup commands for UI workflow proof.",
    options.withGrafana
      ? "Fill in DEVGOD_GRAFANA_URL plus auth and datasource settings in .env.devgod before using the Grafana MCP tools."
      : "Optional module: rerun init with --with-grafana to add Grafana MCP wiring for log-backed debugging and research.",
    "Implement devgod/review-identity-adapter.ts, run npm run devgod:verify:review-identity, then use npm run devgod:record-review for live review actions."
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

function isSafeDevgodEnvKey(candidate: string): boolean {
  return /^DEVGOD_[A-Z0-9_]+$/.test(candidate);
}

function parseDevgodEnvContent(content: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};

  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1] ?? "";
    if (!isSafeDevgodEnvKey(key)) {
      continue;
    }

    const rawValue = (match[2] ?? "").trim();
    if (rawValue.startsWith('"')) {
      const quotedMatch = rawValue.match(/^"((?:\\.|[^"])*)"(?:\s+#.*)?$/);
      if (quotedMatch) {
        parsed[key] = quotedMatch[1]
          ?.replace(/\\\\/g, "\\")
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\\$/g, "$");
        continue;
      }
    }

    if (rawValue.startsWith("'")) {
      const quotedMatch = rawValue.match(/^'([^']*)'(?:\s+#.*)?$/);
      if (quotedMatch) {
        parsed[key] = quotedMatch[1] ?? "";
        continue;
      }
    }

    parsed[key] = rawValue.replace(/\s+#.*$/, "").trimEnd();
  }

  return parsed;
}

async function loadTargetRuntimeEnv(targetRoot: string): Promise<NodeJS.ProcessEnv> {
  const targetEnv = { ...process.env };

  for (const relativePath of [".env.devgod.example", ".env.devgod"]) {
    const content = await readFileIfExists(path.join(targetRoot, relativePath));
    if (!content) {
      continue;
    }

    Object.assign(targetEnv, parseDevgodEnvContent(content));
  }

  return targetEnv;
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
    runtimeRegistration: undefined,
    runtimeBackupManifest: undefined,
    runtimeMigrationReport: undefined,
    nextSteps
  };
}

async function writeJsonArtifact(
  targetRoot: string,
  relativePath: string,
  payload: unknown,
  summary: InstallSummary
): Promise<void> {
  const inspection = await inspectManagedTarget(targetRoot, relativePath);
  if (inspection.invalidReason) {
    throw new Error(`Runtime artifact at ${relativePath} is not an in-root regular file.`);
  }

  const absolutePath = inspection.absolutePath;
  const nextContent = `${JSON.stringify(payload, null, 2)}\n`;
  const existingContent = inspection.content;

  if (existingContent === nextContent) {
    return;
  }

  await ensureDirectory(absolutePath);
  await writeFile(absolutePath, nextContent, "utf8");
  if (existingContent === undefined) {
    summary.created.push(relativePath);
  } else {
    summary.updated.push(relativePath);
  }
  summary.writesPerformed = true;
}

async function writeRuntimeMigrationArtifacts(params: {
  targetRoot: string;
  manifest: InstallManifest;
  summary: InstallSummary;
  orphans: readonly string[];
  conflicts: readonly string[];
}): Promise<void> {
  const projectSlug = path.basename(params.targetRoot);
  const runtimeEnv = await loadTargetRuntimeEnv(params.targetRoot);
  const runtimeConfig = resolveRuntimeEnvironmentConfig(runtimeEnv, {
    projectSlug,
    cwd: params.targetRoot
  });

  const registrationPath = ".devgod/runtime/registration-intent.json";
  const backupManifestPath = ".devgod/runtime/backup-manifest.json";
  const migrationReportPath = ".devgod/runtime/migration-report.json";
  params.summary.runtimeRegistration = registrationPath;
  params.summary.runtimeBackupManifest = backupManifestPath;
  params.summary.runtimeMigrationReport = migrationReportPath;

  await writeJsonArtifact(
    params.targetRoot,
    registrationPath,
    {
      repoPath: params.targetRoot,
      projectSlug,
      runtimeProfile: runtimeConfig.runtimeProfile,
      dataRoot: runtimeConfig.dataRoot,
      installManifestPath: runtimeConfig.installManifestPath
    },
    params.summary
  );

  await writeJsonArtifact(
    params.targetRoot,
    backupManifestPath,
    {
      version: params.manifest.version,
      files: params.manifest.files
    },
    params.summary
  );

  await writeJsonArtifact(
    params.targetRoot,
    migrationReportPath,
    {
      status: "planned",
      project: {
        repoPath: params.targetRoot,
        projectSlug
      },
      registrationIntentPath: registrationPath,
      backupManifestPath,
      orphans: [...params.orphans],
      conflicts: [...params.conflicts],
      cleanupRecommendation:
        params.orphans.length > 0
          ? "review orphaned managed files before deleting legacy artifacts"
          : "legacy compatibility window still active; archive legacy managed files after doctor and verify pass",
      verification: {
        commands: ["npm run devgod:doctor", "npm run devgod:verify:setup"]
      }
    },
    params.summary
  );
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

async function buildManifest(
  sourceRoot: string,
  options: {
    withPlaywright?: boolean;
  } = {}
): Promise<InstallFile[]> {
  const manifest: InstallFile[] = [];

  const recursiveRoots = [
    ".devgod/rules",
    ".devgod/templates",
    ".githooks",
    "plugins/caveman",
    "plugins/devgod"
  ];

  if (options.withPlaywright) {
    recursiveRoots.unshift(".devgod/playwright");
  }

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

  const scaffoldFiles = [".devgod/memory/README.md"];

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

  for (const relativePath of listCatalogRepoLocalSkillPaths()) {
    const skillPath = path.join(sourceRoot, relativePath);
    if (!(await fileExists(skillPath))) {
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
      source: path.join(sourceRoot, ".codex/hooks.json"),
      target: ".codex/hooks.json",
      overwriteManaged: true
    },
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
      source: path.join(sourceRoot, "scripts/check-devgod-happy-path.sh"),
      target: "scripts/check-devgod-happy-path.sh",
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
    },
    {
      source: path.join(sourceRoot, "scripts/check-devgod-branch-name.sh"),
      target: "scripts/check-devgod-branch-name.sh",
      overwriteManaged: true
    },
    {
      source: path.join(sourceRoot, "scripts/check-devgod-git-guard.sh"),
      target: "scripts/check-devgod-git-guard.sh",
      overwriteManaged: true
    },
    {
      source: path.join(sourceRoot, "scripts/check-devgod-commit-msg.sh"),
      target: "scripts/check-devgod-commit-msg.sh",
      overwriteManaged: true
    },
    {
      source: path.join(sourceRoot, "scripts/devgod-session-start.sh"),
      target: "scripts/devgod-session-start.sh",
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

async function buildInstallPlan(
  sourceRoot: string,
  options: {
    withPlaywright?: boolean;
    withGrafana?: boolean;
  } = {}
): Promise<InstallPlanEntry[]> {
  const plan: InstallPlanEntry[] = [];
  const copiedFiles = await buildManifest(sourceRoot, {
    ...(options.withPlaywright !== undefined ? { withPlaywright: options.withPlaywright } : {})
  });

  for (const file of copiedFiles) {
    plan.push({
      target: file.target,
      mode: file.overwriteManaged ? "managed" : "install-once",
      strategy: "replace",
      resolveDesiredContent: async () => readFile(file.source, "utf8")
    });
  }

  const sourceConfig = await readFile(path.join(sourceRoot, ".codex/config.toml"), "utf8");
  const sourceConfigTable = parseToml(sourceConfig) as Record<string, unknown>;
  const mcpServers =
    sourceConfigTable.mcp_servers &&
    typeof sourceConfigTable.mcp_servers === "object" &&
    !Array.isArray(sourceConfigTable.mcp_servers)
      ? { ...(sourceConfigTable.mcp_servers as Record<string, unknown>) }
      : {};
  delete mcpServers.playwright;
  delete mcpServers.playwright_vision;
  delete mcpServers.grafana;
  sourceConfigTable.mcp_servers = mcpServers;

  let codexConfigSource = `${stringifyToml(sourceConfigTable as Parameters<typeof stringifyToml>[0])}`.trimEnd() + "\n";
  if (options.withPlaywright) {
    codexConfigSource = mergeCodexConfig(codexConfigSource, playwrightCodexConfigFragment());
  }
  if (options.withGrafana) {
    codexConfigSource = mergeCodexConfig(codexConfigSource, grafanaCodexConfigFragment());
  }
  const setupScriptSh = await readFile(path.join(sourceRoot, "scripts/setup-devgod.sh"), "utf8");
  const setupScriptPs1 = await readFile(path.join(sourceRoot, "scripts/setup-devgod.ps1"), "utf8");

  plan.push(
    {
      target: ".codex/config.toml",
      mode: "managed",
      strategy: "merge",
      resolveDesiredContent: async (_targetRoot, currentContent) =>
        mergeCodexConfig(currentContent, codexConfigSource)
    },
    {
      target: ".agents.md",
      mode: "managed",
      strategy: "merge",
      resolveDesiredContent: async (_targetRoot, currentContent) => mergeDotAgentsMd(currentContent)
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
        return mergePackageJson(
          currentContent,
          dependencyPath,
          {
            ...(options.withPlaywright ? { withPlaywright: true } : {}),
            ...(options.withGrafana ? { withGrafana: true } : {})
          }
        );
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
      mode: "install-once",
      strategy: "replace",
      resolveDesiredContent: async () => generatedReviewIdentityAdapter
    }
  );

  return plan;
}

async function detectInstalledGrafana(targetRoot: string): Promise<boolean> {
  const detection = await detectGrafanaRepoConfig(targetRoot);
  return detection.configured || detection.codex.hasGrafanaMcp || detection.packageJson.hasManagedScript;
}

async function detectInstalledPlaywright(targetRoot: string): Promise<boolean> {
  const [codexConfig, packageJsonContent, hasPlaywrightDir] = await Promise.all([
    readFileIfExists(path.join(targetRoot, ".codex", "config.toml")),
    readFileIfExists(path.join(targetRoot, "package.json")),
    directoryExists(path.join(targetRoot, ".devgod", "playwright"))
  ]);

  const packageJson = packageJsonContent
    ? (JSON.parse(packageJsonContent) as { scripts?: Record<string, string> })
    : undefined;
  const scripts = packageJson?.scripts ?? {};

  return (
    codexConfig?.includes("[mcp_servers.playwright]") === true ||
    codexConfig?.includes("[mcp_servers.playwright_vision]") === true ||
    typeof scripts["devgod:setup:playwright"] === "string" ||
    typeof scripts["devgod:verify:playwright"] === "string" ||
    hasPlaywrightDir
  );
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

function resolveCliTarget(
  args: string[],
  ignoredArgs: ReadonlySet<string> = new Set(["--dry-run"]),
  ignoredArgsWithValues: ReadonlySet<string> = new Set()
): string {
  const targetIndex = args.indexOf("--target");

  if (targetIndex !== -1) {
    const targetArg = args[targetIndex + 1];
    if (!targetArg || targetArg.startsWith("-")) {
      throw new Error("Target path must follow --target and cannot start with '-'.");
    }
    return targetArg;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (ignoredArgs.has(arg)) {
      continue;
    }
    if (ignoredArgsWithValues.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      usage();
    }

    return arg;
  }

  usage();
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
    targetArg: resolveCliTarget(
      args,
      new Set(["--dry-run", "--apply", "--with-playwright", "--with-grafana"])
    ),
    ...(args.includes("--with-playwright") ? { withPlaywright: true } : {}),
    ...(args.includes("--with-grafana") ? { withGrafana: true } : {})
  };
}

function parseTaskId(
  args: string[],
  command: "scaffold-workflow" | "seed-happy-path-fixture" | "upgrade-reasoning-workflow"
): string {
  const taskIdIndex = args.indexOf("--task-id");

  if (taskIdIndex === -1) {
    throw new Error(`${command} requires --task-id <task-id>.`);
  }

  const taskId = args[taskIdIndex + 1];
  if (!taskId || taskId.startsWith("-")) {
    throw new Error("Task id must follow --task-id and cannot start with '-'.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId)) {
    throw new Error(`task_id must match ^[A-Za-z0-9][A-Za-z0-9._-]*$: ${taskId}`);
  }

  return taskId;
}

function parseWorkflowMutationCommand(
  command: "scaffold-workflow" | "seed-happy-path-fixture",
  args: string[]
): ParsedScaffoldCommand | ParsedHappyPathFixtureCommand {
  if (args.includes("--apply") || args.includes("--dry-run")) {
    throw new Error(`${command} does not support --apply or --dry-run.`);
  }

  const resolveScaffoldTarget = (): string => {
    const targetIndex = args.indexOf("--target");

    if (targetIndex !== -1) {
      const targetArg = args[targetIndex + 1];
      if (!targetArg || targetArg.startsWith("-")) {
        throw new Error("Target path must follow --target and cannot start with '-'.");
      }
      return targetArg;
    }

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--task-id") {
        index += 1;
        continue;
      }
      if (arg === "--force" || arg === "--force-active") {
        continue;
      }
      if (!arg.startsWith("-")) {
        return arg;
      }
      usage();
    }

    usage();
  };

  return {
    command,
    targetArg: resolveScaffoldTarget(),
    taskId: parseTaskId(args, command),
    force: args.includes("--force"),
    forceActive: args.includes("--force-active")
  };
}

function parseUpgradeReasoningWorkflowCommand(
  args: string[]
): ParsedUpgradeReasoningWorkflowCommand {
  if (args.includes("--apply") || args.includes("--dry-run") || args.includes("--force-active")) {
    throw new Error("upgrade-reasoning-workflow does not support --apply, --dry-run, or --force-active.");
  }

  const modeIndex = args.indexOf("--mode");
  const modeRaw = modeIndex === -1 ? "strict" : args[modeIndex + 1];
  if (!modeRaw || modeRaw.startsWith("-")) {
    throw new Error("Mode must follow --mode and cannot start with '-'.");
  }
  if (modeRaw !== "dual" && modeRaw !== "strict") {
    throw new Error("upgrade-reasoning-workflow mode must be dual or strict.");
  }

  return {
    command: "upgrade-reasoning-workflow",
    targetArg: resolveCliTarget(args, new Set(["--force"]), new Set(["--task-id", "--mode"])),
    taskId: parseTaskId(args, "upgrade-reasoning-workflow"),
    mode: modeRaw,
    force: args.includes("--force")
  };
}

export function parseCliArgs(rawArgs: string[]): ParsedCliArgs {
  const command = rawArgs[0];

  if (command === "init" || command === "upgrade") {
    return parseInstallCommand(command, rawArgs.slice(1));
  }

  if (command === "verify") {
    const commandArgs = rawArgs.slice(1);
    if (
      commandArgs.includes("--apply") ||
      commandArgs.includes("--dry-run") ||
      commandArgs.includes("--with-playwright") ||
      commandArgs.includes("--with-grafana")
    ) {
      throw new Error(
        "verify does not support --apply, --dry-run, --with-playwright, or --with-grafana."
      );
    }

    return {
      command: "verify",
      targetArg: resolveCliTarget(commandArgs)
    };
  }

  if (command === "scaffold-workflow") {
    return parseWorkflowMutationCommand("scaffold-workflow", rawArgs.slice(1));
  }

  if (command === "seed-happy-path-fixture") {
    return parseWorkflowMutationCommand("seed-happy-path-fixture", rawArgs.slice(1));
  }

  if (command === "upgrade-reasoning-workflow") {
    return parseUpgradeReasoningWorkflowCommand(rawArgs.slice(1));
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
    targetArg: resolveCliTarget(
      rawArgs,
      new Set(["--dry-run", "--with-playwright", "--with-grafana"])
    ),
    ...(rawArgs.includes("--with-playwright") ? { withPlaywright: true } : {}),
    ...(rawArgs.includes("--with-grafana") ? { withGrafana: true } : {})
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
      .filter((plannedWrite) => plannedWrite.entry.mode === "managed" || plannedWrite.entry.mode === "install-once")
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
        .filter((plannedWrite) => plannedWrite.entry.mode === "managed" || plannedWrite.entry.mode === "install-once")
        .map((plannedWrite) => ({
          target: plannedWrite.target,
          strategy: plannedWrite.entry.strategy as ManagedFileStrategy,
          contentHash:
            plannedWrite.entry.mode === "install-once" && plannedWrite.currentContent !== undefined
              ? hashContent(plannedWrite.currentContent)
              : hashContent(plannedWrite.desiredContent)
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

async function buildLegacyInstallManifest(
  sourceRoot: string,
  targetRoot: string,
  options: {
    withPlaywright?: boolean;
    withGrafana?: boolean;
  } = {}
): Promise<InstallManifest> {
  const planEntries = await buildInstallPlan(sourceRoot, options);
  const files: InstallManifestRecord[] = [];
  const trackedTargets = new Set<string>();

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
    trackedTargets.add(resolved.target);
  }

  for (const target of legacyManagedCompatibilityTargets) {
    if (trackedTargets.has(target)) {
      continue;
    }

    const inspection = await inspectManagedTarget(targetRoot, target);
    if (!inspection.exists && !inspection.invalidReason) {
      continue;
    }

    files.push({
      target,
      strategy: "replace",
      contentHash: hashContent(inspection.content ?? "")
    });
  }

  return {
    version: installManifestVersion,
    files
  };
}

async function loadInstallManifestOrBackfill(
  sourceRoot: string,
  targetRoot: string,
  options: {
    withPlaywright?: boolean;
    withGrafana?: boolean;
  } = {}
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
    manifest: await buildLegacyInstallManifest(sourceRoot, targetRoot, options)
  };
}

async function buildManagedUpgradePlan(
  sourceRoot: string,
  targetRoot: string,
  manifest: InstallManifest,
  options: {
    withPlaywright?: boolean;
    withGrafana?: boolean;
  } = {}
): Promise<{
  orphans: string[];
  plannedWrites: PlannedWrite[];
}> {
  const planEntries = await buildInstallPlan(sourceRoot, options);
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
    plannedWrites.push(
      entry.mode === "managed"
        ? resolveUpgradeAction(resolved, manifestRecords.get(entry.target))
        : resolveInstallAction(resolved)
    );
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
  const withPlaywright = options.withPlaywright ?? (await detectInstalledPlaywright(targetRoot));
  const withGrafana = options.withGrafana ?? (await detectInstalledGrafana(targetRoot));

  assertTargetRoot(sourceRoot, targetRoot);

  const summary = createInstallSummary(mode, buildNextSteps("init", mode, {
    withPlaywright,
    withGrafana
  }));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plannedWrites: PlannedWrite[] = [];

  for (const entry of await buildInstallPlan(sourceRoot, { withPlaywright, withGrafana })) {
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
  const withPlaywright = options.withPlaywright ?? (await detectInstalledPlaywright(targetRoot));
  const withGrafana = options.withGrafana ?? (await detectInstalledGrafana(targetRoot));

  assertTargetRoot(sourceRoot, targetRoot);

  const summary = createInstallSummary(mode, buildNextSteps("upgrade", mode, {
    withPlaywright,
    withGrafana
  }));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { existingManifest, manifest } = await loadInstallManifestOrBackfill(sourceRoot, targetRoot, {
    withPlaywright,
    withGrafana
  });
  const { orphans, plannedWrites } = await buildManagedUpgradePlan(sourceRoot, targetRoot, manifest, {
    withPlaywright,
    withGrafana
  });

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
    await writeRuntimeMigrationArtifacts({
      targetRoot,
      manifest: existingManifest ?? manifest,
      summary,
      orphans,
      conflicts: summary.conflicts
    });
  }

  return summary;
}

export async function verifyDevgodInstall(options: InstallOptions): Promise<VerifySummary> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRoot = path.resolve(options.targetRoot);
  const withPlaywright = options.withPlaywright ?? (await detectInstalledPlaywright(targetRoot));
  const withGrafana = options.withGrafana ?? (await detectInstalledGrafana(targetRoot));

  assertTargetRoot(sourceRoot, targetRoot);

  const { manifest } = await loadInstallManifestOrBackfill(sourceRoot, targetRoot, {
    withPlaywright,
    withGrafana
  });
  const planEntries = await buildInstallPlan(sourceRoot, { withPlaywright, withGrafana });
  const plannedTargets = new Set(planEntries.map((entry) => entry.target));

  const missing: string[] = [];
  const modified: string[] = [];
  const policyDrift: string[] = [];
  const prerequisiteDrift: string[] = [];
  const optionalModuleDrift: string[] = [];
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

    if (entry.mode === "managed" && resolved.currentContent !== resolved.desiredContent) {
      modified.push(entry.target);
    }

    if (entry.mode === "managed" && entry.target.startsWith(".codex/agents/")) {
      const parsed = parseToml(resolved.currentContent!) as { developer_instructions?: string };
      const cavemanResult = verifyNonUserFacingAgentCavemanContract(parsed.developer_instructions);
      if (cavemanResult.missingMarkers.length > 0) {
        policyDrift.push(
          `${entry.target}: missing caveman markers ${cavemanResult.missingMarkers.join("; ")}`
        );
      }
      if (cavemanResult.contradictionPhrases.length > 0) {
        policyDrift.push(
          `${entry.target}: contradictory caveman phrases ${cavemanResult.contradictionPhrases.join("; ")}`
        );
      }
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
    ok:
      missing.length === 0 &&
      modified.length === 0 &&
      orphans.length === 0 &&
      policyDrift.length === 0 &&
      prerequisiteDrift.length === 0,
    missing,
    modified,
    orphans: orphans.sort((left, right) => left.localeCompare(right)),
    policyDrift: [...policyDrift].sort((left, right) => left.localeCompare(right)),
    prerequisiteDrift: [...prerequisiteDrift].sort((left, right) => left.localeCompare(right)),
    optionalModuleDrift: [...optionalModuleDrift].sort((left, right) => left.localeCompare(right))
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
  console.log(`policy drift: ${summary.policyDrift.length}`);
  console.log(`prerequisite drift: ${summary.prerequisiteDrift.length}`);
  console.log(`optional module drift: ${summary.optionalModuleDrift.length}`);

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

  if (summary.policyDrift.length > 0) {
    console.log("Policy drift:");
    for (const item of summary.policyDrift) {
      console.log(`- ${item}`);
    }
  }

  if (summary.prerequisiteDrift.length > 0) {
    console.log("Prerequisite drift:");
    for (const item of summary.prerequisiteDrift) {
      console.log(`- ${item}`);
    }
  }

  if (summary.optionalModuleDrift.length > 0) {
    console.log("Optional module drift:");
    for (const item of summary.optionalModuleDrift) {
      console.log(`- ${item}`);
    }
  }
}

async function usesLegacyInstallCompatibilityPlan(targetRoot: string): Promise<boolean> {
  const manifestInspection = await inspectManagedTarget(targetRoot, installManifestRelativePath);
  return manifestInspection.invalidReason === undefined && !manifestInspection.exists;
}

function printWorkflowScaffoldSummary(targetRoot: string, summary: WorkflowScaffoldSummary): void {
  console.log(`devgod scaffold-workflow for ${targetRoot}`);
  console.log(`task_id: ${summary.taskId}`);
  console.log(`created: ${summary.created.length}`);
  console.log(`updated: ${summary.updated.length}`);

  if (summary.created.length > 0) {
    console.log("Created:");
    for (const filePath of summary.created) {
      console.log(`- ${filePath}`);
    }
  }

  if (summary.updated.length > 0) {
    console.log("Updated:");
    for (const filePath of summary.updated) {
      console.log(`- ${filePath}`);
    }
  }

  console.log("Next steps:");
  for (const [index, step] of summary.nextSteps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
}

function printHappyPathFixtureSummary(targetRoot: string, summary: WorkflowScaffoldSummary): void {
  console.log(`devgod seed-happy-path-fixture for ${targetRoot}`);
  console.log(`task_id: ${summary.taskId}`);
  console.log(`created: ${summary.created.length}`);
  console.log(`updated: ${summary.updated.length}`);

  if (summary.created.length > 0) {
    console.log("Created:");
    for (const filePath of summary.created) {
      console.log(`- ${filePath}`);
    }
  }

  if (summary.updated.length > 0) {
    console.log("Updated:");
    for (const filePath of summary.updated) {
      console.log(`- ${filePath}`);
    }
  }

  console.log("Next steps:");
  for (const [index, step] of summary.nextSteps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
}

function printUpgradeReasoningWorkflowSummary(targetRoot: string, summary: WorkflowScaffoldSummary): void {
  console.log(`devgod upgrade-reasoning-workflow for ${targetRoot}`);
  console.log(`task_id: ${summary.taskId}`);
  console.log(`created: ${summary.created.length}`);
  console.log(`updated: ${summary.updated.length}`);

  if (summary.created.length > 0) {
    console.log("Created:");
    for (const filePath of summary.created) {
      console.log(`- ${filePath}`);
    }
  }

  if (summary.updated.length > 0) {
    console.log("Updated:");
    for (const filePath of summary.updated) {
      console.log(`- ${filePath}`);
    }
  }

  console.log("Next steps:");
  for (const [index, step] of summary.nextSteps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
}

function replaceTemplateTaskId(templateContent: string, taskId: string): string {
  return templateContent.replaceAll("<task-id>", taskId);
}

function buildBriefFromTemplate(templateContent: string, taskId: string): string {
  return replaceTemplateTaskId(templateContent, taskId).replace(
    "Original user ask:",
    "Original user ask:\n\nFill in the substantive user request here."
  );
}

function buildPlanArtifact(taskId: string): string {
  return [
    "# Plan",
    "",
    "## Task ID",
    "",
    `\`${taskId}\``,
    "",
    "## Goal",
    "",
    "Fill in the concrete execution plan for this task before claiming completion.",
    "",
    "## Steps",
    "",
    "- record the implementation slices you will run",
    "- record the verification commands you will use",
    "- keep the plan aligned with the live task packet"
  ].join("\n");
}

function fillEmptySection(content: string, heading: string, body: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`(${escaped}\n\n)(?=(?:## |### |$))`), `$1${body}\n\n`);
}

function replaceSectionBody(content: string, heading: string, body: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`(${escaped}\n\n)([\\s\\S]*?)(?=\n## |\n### |$)`), `$1${body}\n`);
}

function buildTaskFromTemplate(templateContent: string, taskId: string): string {
  const scaffolded = replaceTemplateTaskId(templateContent, taskId)
    .replace("`<owner-role>`", "`planner`")
    .replace("`artifact_complete | specialist_verified`", "`artifact_complete`")
    .replace(/`(?:strict \| dual \| legacy|legacy \| dual \| strict)`/, "`strict`")
    .replace(`review_exports=${workflowReviewExportPoliciesDisplay}`, "review_exports=required");

  const hydrated = [
    ["## Goal", `Seed starter workflow metadata for \`${taskId}\` and replace these defaults before claiming completion.`],
    ["## Inputs", "- scaffold-workflow generated artifact set\n- repo-specific context to be filled before execution"],
    ["## Dependencies", "- none yet; add upstream tasks or runtime prerequisites before execution"],
    ["## Outputs", "- a specialized task packet, brief, plan, and review set for the real work"],
    ["## Required runtime traces", "- none yet; add task-specific runtime traces or state why none are required"],
    ["## Progress proof", "- replace with the first concrete progress proof once substantive execution starts"],
    ["## Allowed write scope", "- specialize this section before implementation; scaffold only covers workflow artifact setup"],
    ["## Out of scope", "- substantive product or code changes outside the eventual task-specific write scope"],
    ["## Acceptance criteria", "- replace scaffold defaults with task-specific completion criteria before execution"],
    ["## UI surface", "`none`"],
    ["## Playwright requirement", "`false`"],
    [
      "## Browser evidence expectations",
      "- not required for the scaffolded default; replace this block if the task becomes UI-affecting"
    ],
    ["## Verification steps", "- update with the exact commands, fixtures, and runtime proofs for this task"],
    ["## Security checks", "- confirm the scaffold does not widen trust boundaries or write scope unintentionally"],
    ["## Rollback notes", "- delete or regenerate the scaffolded workflow artifacts if this task is abandoned or replaced"],
    ["### Claim", `A specialized workflow packet for \`${taskId}\` must be completed before this task can be executed safely.`],
    ["### Facts", "- this artifact was generated by scaffold-workflow\n- the seeded values are starter defaults only"],
    ["### Assumptions", "- a manager or planner will replace the seeded defaults with task-specific content before execution"],
    ["### Hypotheses and alternatives", "- best path: specialize this scaffold in place before implementation\n- alternative: delete and regenerate the workflow artifacts if the task scope changes materially"],
    ["### Evidence refs", "- scaffold-workflow generated task packet template\n- installed workflow contract checks"],
    ["### Counter-evidence", "- a scaffolded packet alone is not proof that the underlying task is ready for execution"],
    ["### Confidence", "`low`"],
    ["### Verification plan", "- update the task packet with real scope and verification details\n- run the workflow checks after the packet is specialized"],
    ["### Research and debug budgets", "- implementation attempts: 1\n- verification passes: 1\n- repair loops: 1"]
  ].reduce((current, [heading, body]) => fillEmptySection(current, heading, body), scaffolded);

  const withRoleDefaults = replaceSectionBody(hydrated, "## Required specialist roles", "- `planner`");
  const withQualityGateDefaults = replaceSectionBody(withRoleDefaults, "## Quality gates", "- `product_acceptance`");
  const withCouncilDefaults = [
    ["### Required", "`false`"],
    [
      "### Trigger rationale",
      "- scaffold-only default: replace this once the task is specialized enough to know whether council review applies"
    ],
    ["### Decision packet", "`none`"],
    ["### Council members", "`none`"],
    ["### Dissent owner", "`none`"],
    ["### Outcome", "`inherited`"],
    ["### Exception expiry", "`none`"]
  ].reduce((current, [heading, body]) => replaceSectionBody(current, heading, body), withQualityGateDefaults);
  const withUiDefaults = replaceSectionBody(withCouncilDefaults, "## UI surface", "`none`");
  const withPlaywrightDefaults = replaceSectionBody(withUiDefaults, "## Playwright requirement", "`false`");
  return replaceSectionBody(
    withPlaywrightDefaults,
    "## Browser evidence expectations",
    "- not required for the scaffolded default; replace this block if the task becomes UI-affecting"
  );
}

function extractMarkdownSection(content: string, heading: string): string | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}\\n\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim();
}

function appendReasoningHardeningSections(
  content: string,
  mode: "dual" | "strict"
): string {
  if (content.includes("## Reasoning policy")) {
    return content;
  }

  const claim = extractMarkdownSection(content, "### Claim") ?? "- backfilled from legacy task packet";
  const evidenceRefs = extractMarkdownSection(content, "### Evidence refs") ?? "- none recorded yet";
  const verificationPlan =
    extractMarkdownSection(content, "### Verification plan") ??
    extractMarkdownSection(content, "## Verification steps") ??
    "- add verification evidence";
  const counterEvidence =
    extractMarkdownSection(content, "### Counter-evidence") ?? "- none recorded yet";

  const block = [
    "",
    "## Reasoning policy",
    "",
    "### Mode",
    "",
    `\`${mode}\``,
    "",
    "### Requirements",
    "",
    mode === "strict"
      ? "- require explicit reasoning block, attempt records, trace refs, verification records, critic verification, and a supported verdict before completion"
      : "- keep legacy-compatible routing while requiring explicit attempts, verification records, and a verdict for upgraded tasks",
    "",
    "### Max attempts",
    "",
    "- 3",
    "",
    "## Reasoning attempts",
    "",
    "### Attempt records",
    "",
    "- id: `attempt-1`",
    "- label: legacy reasoning upgrade backfill",
    `- hypothesis: ${claim.replace(/\n+/g, " ")}`,
    "- alternatives: add explicit competing hypotheses before final review",
    `- evidence refs: ${evidenceRefs.replace(/\n+/g, " ")}`,
    "- verification refs: verification-1",
    "- trace ref: add runtime or artifact trace ref",
    mode === "strict" ? "- outcome: inconclusive" : "- outcome: supported",
    "- summary: backfilled from legacy reasoning-quality sections during workflow upgrade",
    "",
    "### Verification records",
    "",
    "- id: `verification-1`",
    "- kind: `critic_review`",
    "- ref: add reviewer or critic evidence ref",
    mode === "strict" ? "- status: `pending`" : "- status: `passed`",
    `- summary: seeded from existing verification guidance: ${verificationPlan.replace(/\n+/g, " ")}`,
    "",
    "### Verdict",
    "",
    mode === "strict"
      ? "- status: `needs_review`"
      : "- status: `supported`",
    "- summary: upgraded from legacy semantics under the strict-by-default workflow; verify attempt, trace, and critic evidence before relying on this verdict",
    "- supporting attempt ids: `attempt-1`",
    `- blocking issues: ${counterEvidence.replace(/\n+/g, " ")}`,
    ""
  ].join("\n");

  return `${content.trimEnd()}\n${block}`;
}

function buildReviewFromTemplate(
  templateContent: string,
  taskId: string,
  reviewerRole: WorkflowTemplateReviewRole
): string {
  const reviewerRolePlaceholder = `\`${workflowTemplateReviewRoles.join(" | ")}\``;
  const actorRolePlaceholder = `\`${workflowReviewActorRoles.join(" | ")}\``;
  const provenancePlaceholder = `\`${workflowReviewProvenanceStatuses.join(" | ")}\``;
  return replaceTemplateTaskId(templateContent, taskId)
    .replace(reviewerRolePlaceholder, `\`${reviewerRole}\``)
    .replace("`<recorded-actor-id>`", "`pending-review`")
    .replace(actorRolePlaceholder, `\`${reviewerRole}\``)
    .replace(provenancePlaceholder, "`summary_only`")
    .replace("`pending | passed | blocked | waived`", "`pending`")
    .replace("`low | medium | high | critical`", "`low`")
    .replace("`none | manager | security_exception`", "`none`")
    .replace("`approved | blocked | waived`", "`blocked`")
    .replace(
      "## Specialist execution evidence\n\nList the evidence used to trust the claimed specialist ownership for this task.\n",
      "## Specialist execution evidence\n\nPending specialist execution evidence.\n"
    )
    .replace(
      "## Quality gate evidence\n\nList the evidence used to trust the declared quality gates for this task.\n",
      "## Quality gate evidence\n\nPending quality gate evidence.\n"
    )
    .replace(
      "## Findings\n",
      "## Findings\n\nReview has not run yet.\n\n"
    )
    .replace(
      "## Residual risk\n",
      "## Residual risk\n\nWorkflow remains blocked until this review is completed.\n\n"
    )
    .replace(
      "## Verification evidence\n\nList exact commands, fixtures, or repro steps used for this gate.\n",
      "## Verification evidence\n\nPending review execution. For Playwright-required QA reviews, cite Playwright evidence refs here.\n"
    )
    .replace(
      "## Waiver reason\n\nDo not waive a required gate without actor, actor role, authority, and explicit reason. Unauthorized waivers remain blocking.\n",
      "## Waiver reason\n\nNone.\n"
    )
    .replace(
      "## Source handoff\n\nManager-written summary of reviewer output. Cite the trusted source here when `Provenance status` is `runtime_verified`, because the markdown file alone is not proof.\n\nFor `specialist_verified` work with `runtime_verified` provenance, include a `Runtime proof:` line here that points to the same authenticated runtime artifact summarized above.\n",
      "## Source handoff\n\nPending reviewer handoff.\n"
    );
}

function buildHappyPathFixtureBrief(taskId: string): string {
  return [
    "## Task ID",
    "",
    `\`${taskId}\``,
    "",
    "## Fixture posture",
    "",
    "Synthetic install-proof only. Do not reuse these artifacts as live workflow evidence."
  ].join("\n");
}

function buildHappyPathFixtureTask(taskId: string): string {
  const requiredReviewLines = workflowTemplateReviewRoles.map((role) => `- ${role}`);
  const requiredSpecialistLines = [
    "- `backend_engineer`",
    ...workflowTemplateReviewRoles.map((role) => `- \`${role}\``)
  ];
  return [
    "## Task ID",
    "",
    `\`${taskId}\``,
    "",
    "## Owner role",
    "",
    "`backend_engineer`",
    "",
    "## Completion standard",
    "",
    "`specialist_verified`",
    "",
    "## Required specialist roles",
    "",
    ...requiredSpecialistLines,
    "",
    "## Quality gates",
    "",
    "- `workflow_happy_path_required`",
    "- `artifact_contract_required`",
    "- `advisory_retrieval_required`",
    "",
    "## Acceptance criteria",
    "",
    "- composed happy-path command passes",
    "- fixture remains synthetic and non-authoritative",
    "",
    "## Verification steps",
    "",
    "- bash scripts/check-devgod-happy-path.sh",
    "",
    "## Required reviews",
    "",
    ...requiredReviewLines,
    "",
    "## Rollback notes",
    "",
    "- delete the synthetic fixture artifacts"
  ].join("\n");
}

function buildHappyPathFixtureReview(
  taskId: string,
  reviewerRole: WorkflowTemplateReviewRole
): string {
  return [
    "# Review Gate",
    "",
    "## Task ID",
    "",
    `\`${taskId}\``,
    "",
    "## Reviewer role",
    "",
    `\`${reviewerRole}\``,
    "",
    "## Actor",
    "",
    "`synthetic-install-fixture`",
    "",
    "## Actor role",
    "",
    `\`${reviewerRole}\``,
    "",
    "## Provenance status",
    "",
    "`summary_only`",
    "",
    "## Review state",
    "",
    "`blocked`",
    "",
    "## Severity",
    "",
    "`low`",
    "",
    "## Findings",
    "",
    "- Synthetic install fixture only; replace with authenticated runtime review evidence before live work.",
    "",
    "## Residual risk",
    "",
    "Residual risk remains fully open because this fixture is not authenticated reviewer evidence.",
    "",
    "## Verification evidence",
    "",
    `- bash scripts/check-devgod-happy-path.sh --task-id ${taskId}`,
    "- fixture review is intentionally non-authoritative",
    "",
    "## Specialist execution evidence",
    "",
    "- specialist handoff references reviewed files",
    "",
    "## Quality gate evidence",
    "",
    "- happy-path composition references synthetic fixture checks and retrieval smoke",
    "",
    "## Waiver authority",
    "",
    "`none`",
    "",
    "## Waiver reason",
    "",
    "None.",
    "",
    "## Decision",
    "",
    "`blocked`",
    "",
    "## Source handoff",
    "",
    "Synthetic fixture summary. No authenticated reviewer source exists for this install proof."
  ].join("\n");
}

async function prepareWorkflowArtifactPaths(
  options: WorkflowScaffoldOptions,
  pathMode: "live-workflow" | "synthetic-fixture"
): Promise<{
  targetRoot: string;
  activeRelativePath: string;
  briefRelativePath: string;
  taskRelativePath: string;
  reviewRelativePaths: {
    reviewer: string;
    qa_engineer: string;
    security_reviewer: string;
  };
  resolvedArtifactPaths: Map<string, string>;
}> {
  const targetRoot = path.resolve(options.targetRoot);
  const activeRelativePath = ".devgod/ACTIVE";
  const briefRelativePath = `.devgod/work/briefs/brief-${options.taskId}.md`;
  const taskRelativePath = `.devgod/work/tasks/task-${options.taskId}.md`;
  const reviewRelativePaths = buildWorkflowReviewArtifactRelativePaths(options.taskId);

  if (pathMode === "live-workflow") {
    const activeInspection = await inspectManagedTarget(targetRoot, activeRelativePath);
    if (activeInspection.invalidReason) {
      throw new Error(`refusing to scaffold ${activeRelativePath}: ${activeInspection.invalidReason}`);
    }

    if (activeInspection.content) {
      const activeTaskId = activeInspection.content
        .split("\n")
        .map((line) => line.replace("\r", ""))
        .find((line) => line.startsWith("task_id="))
        ?.slice("task_id=".length);

      if (activeTaskId && activeTaskId !== options.taskId && !options.forceActive) {
        throw new Error(`refusing to replace active task ${activeTaskId} without --force-active`);
      }
    }
  }

  const artifactPaths = [
    briefRelativePath,
    taskRelativePath,
    reviewRelativePaths.reviewer,
    reviewRelativePaths.qa_engineer,
    reviewRelativePaths.security_reviewer
  ];
  if (pathMode === "live-workflow") {
    artifactPaths.unshift(activeRelativePath);
  }
  const existingArtifacts: string[] = [];
  const resolvedArtifactPaths = new Map<string, string>();

  for (const artifactPath of artifactPaths) {
    const inspection = await inspectManagedTarget(targetRoot, artifactPath);
    if (inspection.invalidReason) {
      throw new Error(`refusing to scaffold ${artifactPath}: ${inspection.invalidReason}`);
    }
    resolvedArtifactPaths.set(artifactPath, inspection.absolutePath);
    if (inspection.exists) {
      existingArtifacts.push(artifactPath);
    }
  }

  if (existingArtifacts.length > 0 && !options.force) {
    throw new Error(
      `refusing to overwrite existing workflow artifacts without --force: ${existingArtifacts.join(", ")}`
    );
  }

  return {
    targetRoot,
    activeRelativePath,
    briefRelativePath,
    taskRelativePath,
    reviewRelativePaths,
    resolvedArtifactPaths
  };
}

function assertHappyPathFixtureTaskId(taskId: string): void {
  if (!taskId.startsWith("fixture-")) {
    throw new Error("seed-happy-path-fixture requires a task id starting with fixture-");
  }
}

async function writeWorkflowArtifactSet(
  targetRoot: string,
  writes: Array<{ absolutePath: string; content: string }>
): Promise<Pick<WorkflowScaffoldSummary, "created" | "updated">> {
  const created: string[] = [];
  const updated: string[] = [];

  for (const write of writes) {
    await ensureDirectory(write.absolutePath);
    const existed = await fileExists(write.absolutePath);
    await writeFile(write.absolutePath, write.content, "utf8");
    const relativePath = path.relative(targetRoot, write.absolutePath);
    if (existed) {
      updated.push(relativePath);
    } else {
      created.push(relativePath);
    }
  }

  return {
    created,
    updated
  };
}

export async function scaffoldWorkflowArtifacts(options: WorkflowScaffoldOptions): Promise<WorkflowScaffoldSummary> {
  const {
    targetRoot,
    activeRelativePath,
    briefRelativePath,
    taskRelativePath,
    reviewRelativePaths,
    resolvedArtifactPaths
  } = await prepareWorkflowArtifactPaths(options, "live-workflow");
  const planRelativePath = `.devgod/work/plans/plan-${options.taskId}.md`;

  const briefTemplate = await readFile(
    path.join(options.sourceRoot, ".devgod", "templates", "intake-brief.md"),
    "utf8"
  );
  const taskTemplate = await readFile(
    path.join(options.sourceRoot, ".devgod", "templates", "task-packet.md"),
    "utf8"
  );
  const reviewTemplate = await readFile(
    path.join(options.sourceRoot, ".devgod", "templates", "review-gate.md"),
    "utf8"
  );

  const writes: Array<{ absolutePath: string; content: string }> = [
    {
      absolutePath: resolvedArtifactPaths.get(activeRelativePath) ?? path.join(targetRoot, activeRelativePath),
      content: `task_id=${options.taskId}\nworkflow=devgod\nstate=active\n`
    },
    {
      absolutePath: resolvedArtifactPaths.get(briefRelativePath) ?? path.join(targetRoot, briefRelativePath),
      content: `${buildBriefFromTemplate(briefTemplate, options.taskId).trimEnd()}\n`
    },
    {
      absolutePath: path.join(targetRoot, planRelativePath),
      content: `${buildPlanArtifact(options.taskId).trimEnd()}\n`
    },
    {
      absolutePath: resolvedArtifactPaths.get(taskRelativePath) ?? path.join(targetRoot, taskRelativePath),
      content: `${buildTaskFromTemplate(taskTemplate, options.taskId).trimEnd()}\n`
    },
    ...workflowTemplateReviewRoles.map((reviewerRole) => ({
      absolutePath:
        resolvedArtifactPaths.get(reviewRelativePaths[reviewerRole]) ??
        path.join(targetRoot, reviewRelativePaths[reviewerRole]),
      content: `${buildReviewFromTemplate(reviewTemplate, options.taskId, reviewerRole).trimEnd()}\n`
    }))
  ];

  const { created, updated } = await writeWorkflowArtifactSet(targetRoot, writes);

  return {
    taskId: options.taskId,
    created,
    updated,
    nextSteps: [
      "Fill in the brief and task packet with real request, scope, and verification details.",
      "Run specialists and replace pending review skeletons with real gate output.",
      `Run bash scripts/check-devgod-workflow.sh --task-id ${options.taskId} after required reviews pass.`,
      `Use npm run devgod:check:happy-path -- --task-id ${options.taskId} only after the workflow is review-complete.`
    ]
  };
}

export async function seedHappyPathFixtureArtifacts(
  options: WorkflowScaffoldOptions
): Promise<WorkflowScaffoldSummary> {
  assertHappyPathFixtureTaskId(options.taskId);
  if (options.forceActive) {
    throw new Error("seed-happy-path-fixture does not support --force-active because fixtures never become active");
  }
  const {
    targetRoot,
    briefRelativePath,
    taskRelativePath,
    reviewRelativePaths,
    resolvedArtifactPaths
  } = await prepareWorkflowArtifactPaths(options, "synthetic-fixture");

  const writes: Array<{ absolutePath: string; content: string }> = [
    {
      absolutePath: resolvedArtifactPaths.get(briefRelativePath) ?? path.join(targetRoot, briefRelativePath),
      content: `${buildHappyPathFixtureBrief(options.taskId).trimEnd()}\n`
    },
    {
      absolutePath: resolvedArtifactPaths.get(taskRelativePath) ?? path.join(targetRoot, taskRelativePath),
      content: `${buildHappyPathFixtureTask(options.taskId).trimEnd()}\n`
    },
    ...workflowTemplateReviewRoles.map((reviewerRole) => ({
      absolutePath:
        resolvedArtifactPaths.get(reviewRelativePaths[reviewerRole]) ??
        path.join(targetRoot, reviewRelativePaths[reviewerRole]),
      content: `${buildHappyPathFixtureReview(options.taskId, reviewerRole).trimEnd()}\n`
    }))
  ];

  const { created, updated } = await writeWorkflowArtifactSet(targetRoot, writes);

  return {
    taskId: options.taskId,
    created,
    updated,
    nextSteps: [
      `Run bash scripts/check-devgod-happy-path.sh --task-id ${options.taskId}.`,
      "Treat this fixture as synthetic install proof only; replace it with real workflow artifacts before live work.",
      "Do not point .devgod/ACTIVE at this fixture task id and do not treat the review markdown as gate authority."
    ]
  };
}

export async function upgradeReasoningWorkflowArtifacts(options: {
  sourceRoot: string;
  targetRoot: string;
  taskId: string;
  mode: "dual" | "strict";
  force?: boolean | undefined;
}): Promise<WorkflowScaffoldSummary> {
  const targetRoot = path.resolve(options.targetRoot);
  const taskRelativePath = `.devgod/work/tasks/task-${options.taskId}.md`;
  const inspection = await inspectManagedTarget(targetRoot, taskRelativePath);
  if (inspection.invalidReason) {
    throw new Error(`refusing to upgrade ${taskRelativePath}: ${inspection.invalidReason}`);
  }
  if (!inspection.exists || !inspection.content) {
    throw new Error(`missing task artifact: ${taskRelativePath}`);
  }

  const nextContent = `${appendReasoningHardeningSections(inspection.content, options.mode).trimEnd()}\n`;
  if (nextContent === inspection.content && !options.force) {
    return {
      taskId: options.taskId,
      created: [],
      updated: [],
      nextSteps: [
        "Task already contains reasoning hardening sections.",
        `If you want to rewrite the task packet in ${options.mode} mode anyway, rerun with --force.`,
        `Run bash scripts/check-devgod-workflow.sh --task-id ${options.taskId} after updating the content.`
      ]
    };
  }

  const { created, updated } = await writeWorkflowArtifactSet(targetRoot, [
    {
      absolutePath: inspection.absolutePath,
      content: nextContent
    }
  ]);

  return {
    taskId: options.taskId,
    created,
    updated,
    nextSteps: [
      `Fill the backfilled reasoning attempt, verification, and verdict sections with real evidence for ${options.taskId}.`,
      `If this task should hard-block on reasoning quality, keep mode \`${options.mode}\` and add passed critic verification plus a supported verdict.`,
      `Run bash scripts/check-devgod-workflow.sh --task-id ${options.taskId} after the upgraded packet is complete.`
    ]
  };
}

async function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));

  const sourceRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
  const targetRoot = path.resolve(parsedArgs.targetArg);

  if (parsedArgs.command === "scaffold-workflow") {
    const summary = await scaffoldWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId: parsedArgs.taskId,
      force: parsedArgs.force,
      forceActive: parsedArgs.forceActive
    });
    printWorkflowScaffoldSummary(targetRoot, summary);
    return;
  }

  if (parsedArgs.command === "seed-happy-path-fixture") {
    const summary = await seedHappyPathFixtureArtifacts({
      sourceRoot,
      targetRoot,
      taskId: parsedArgs.taskId,
      force: parsedArgs.force,
      forceActive: parsedArgs.forceActive
    });
    printHappyPathFixtureSummary(targetRoot, summary);
    return;
  }

  if (parsedArgs.command === "upgrade-reasoning-workflow") {
    const summary = await upgradeReasoningWorkflowArtifacts({
      sourceRoot,
      targetRoot,
      taskId: parsedArgs.taskId,
      mode: parsedArgs.mode,
      force: parsedArgs.force
    });
    printUpgradeReasoningWorkflowSummary(targetRoot, summary);
    return;
  }

  if (parsedArgs.command === "verify") {
    const legacyCompatibilityPlan = await usesLegacyInstallCompatibilityPlan(targetRoot);
    const summary = await verifyDevgodInstall({
      sourceRoot,
      targetRoot
    });
    printVerifySummary(targetRoot, summary);
    if (legacyCompatibilityPlan) {
      console.log(
        "compatibility plan: legacy install without .devgod/install-manifest.json; verify used a backfilled inventory from current repo state"
      );
    }
    if (!summary.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const legacyCompatibilityPlan =
    parsedArgs.command === "upgrade" ? await usesLegacyInstallCompatibilityPlan(targetRoot) : false;
  const summary = parsedArgs.command === "init"
    ? await installDevgodIntoProject({
        sourceRoot,
        targetRoot,
        dryRun: parsedArgs.dryRun,
        ...(parsedArgs.withPlaywright !== undefined ? { withPlaywright: parsedArgs.withPlaywright } : {}),
        ...(parsedArgs.withGrafana !== undefined ? { withGrafana: parsedArgs.withGrafana } : {})
      })
    : await upgradeDevgodInProject({
        sourceRoot,
        targetRoot,
        dryRun: parsedArgs.dryRun,
        ...(parsedArgs.withPlaywright !== undefined ? { withPlaywright: parsedArgs.withPlaywright } : {}),
        ...(parsedArgs.withGrafana !== undefined ? { withGrafana: parsedArgs.withGrafana } : {})
      });

  printInstallSummary(parsedArgs.command, targetRoot, summary);
  if (parsedArgs.command === "upgrade" && legacyCompatibilityPlan) {
    console.log(
      summary.mode === "dry-run"
        ? "compatibility plan: legacy install without .devgod/install-manifest.json; dry-run used a backfilled inventory and will write the manifest on apply"
        : "compatibility plan: legacy install without .devgod/install-manifest.json; upgrade backfilled the manifest and runtime migration plan"
    );
  }
  if (parsedArgs.command === "upgrade" && summary.conflicts.length > 0) {
    process.exitCode = 1;
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
