import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import {
  mergeAgentsMd,
  mergeCodexConfig,
  mergeGitignore,
  mergePackageJson
} from "./merge.ts";
import type { InstallOptions, InstallSummary } from "./types.ts";

interface InstallFile {
  source: string;
  target: string;
  overwriteManaged: boolean;
}

const generatedSetupScript = `#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.devgod && -f .env.devgod.example ]]; then
  cp .env.devgod.example .env.devgod
  echo "created .env.devgod from .env.devgod.example"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for local devgod setup unless you provide a managed Postgres backend" >&2
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  echo "docker is installed but not usable from this environment; enable Docker Desktop integration or provide a managed Postgres backend" >&2
  exit 1
fi

set -a
source ./.env.devgod
set +a

if [[ -z "\${DEVGOD_PROJECT_REPO_PATH:-}" || "\${DEVGOD_PROJECT_REPO_PATH}" == "/absolute/path/to/repo" ]]; then
  export DEVGOD_PROJECT_REPO_PATH="$(pwd)"
fi

if [[ -z "\${DEVGOD_PROJECT_SLUG:-}" ]]; then
  export DEVGOD_PROJECT_SLUG="$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]')"
fi

if [[ -z "\${DEVGOD_PROJECT_NAME:-}" ]]; then
  export DEVGOD_PROJECT_NAME="\${DEVGOD_PROJECT_SLUG}"
fi

if [[ -z "\${DEVGOD_DOCKER_CONTAINER_NAME:-}" ]]; then
  export DEVGOD_DOCKER_CONTAINER_NAME="devgod-postgres-\${DEVGOD_PROJECT_SLUG}"
fi

docker compose -f docker-compose.devgod.yml up -d devgod-postgres

echo "waiting for devgod-postgres to become healthy"
for _ in {1..60}; do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "\${DEVGOD_DOCKER_CONTAINER_NAME}" 2>/dev/null || true)" == "healthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$(docker inspect -f '{{.State.Health.Status}}' "\${DEVGOD_DOCKER_CONTAINER_NAME}" 2>/dev/null || true)" != "healthy" ]]; then
  echo "devgod-postgres did not become healthy" >&2
  docker logs "\${DEVGOD_DOCKER_CONTAINER_NAME}" --tail 100 >&2 || true
  exit 1
fi

npm install
npm run devgod:migrate
npm run devgod:bootstrap
npm run devgod:verify:setup

echo ""
echo "devgod local setup complete"
echo "workspace: \${DEVGOD_WORKSPACE_SLUG}"
echo "project: \${DEVGOD_PROJECT_SLUG}"
echo "database: configured"
echo "review identity: run npm run devgod:verify:review-identity after implementing devgod/review-identity-adapter.ts"
`;

const generatedPowerShellSetupScript = `Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath ".env.devgod") -and (Test-Path -LiteralPath ".env.devgod.example")) {
    Copy-Item -LiteralPath ".env.devgod.example" -Destination ".env.devgod"
    Write-Host "created .env.devgod from .env.devgod.example"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is required for local devgod setup unless you provide a managed Postgres backend"
}

try {
    docker version | Out-Null
} catch {
    throw "docker is installed but not usable from this environment; enable Docker Desktop integration or provide a managed Postgres backend"
}

Get-Content ".env.devgod" | ForEach-Object {
    if ($_ -match '^\\s*#' -or $_ -notmatch '=') {
        return
    }

    $parts = $_ -split '=', 2
    $value = $parts[1].Trim('"')
    [System.Environment]::SetEnvironmentVariable($parts[0], $value)
}

if (-not $env:DEVGOD_PROJECT_REPO_PATH -or $env:DEVGOD_PROJECT_REPO_PATH -eq "/absolute/path/to/repo") {
    $env:DEVGOD_PROJECT_REPO_PATH = (Get-Location).Path
}

if (-not $env:DEVGOD_PROJECT_SLUG) {
    $env:DEVGOD_PROJECT_SLUG = Split-Path -Leaf (Get-Location)
}

if (-not $env:DEVGOD_PROJECT_NAME) {
    $env:DEVGOD_PROJECT_NAME = $env:DEVGOD_PROJECT_SLUG
}

if (-not $env:DEVGOD_DOCKER_CONTAINER_NAME) {
    $env:DEVGOD_DOCKER_CONTAINER_NAME = "devgod-postgres-$($env:DEVGOD_PROJECT_SLUG)"
}

docker compose -f docker-compose.devgod.yml up -d devgod-postgres

Write-Host "waiting for devgod-postgres to become healthy"
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    $status = ""
    try {
        $status = docker inspect -f "{{.State.Health.Status}}" $env:DEVGOD_DOCKER_CONTAINER_NAME 2>$null
    } catch {
        $status = ""
    }

    if ($status -eq "healthy") {
        $healthy = $true
        break
    }

    Start-Sleep -Seconds 2
}

if (-not $healthy) {
    docker logs $env:DEVGOD_DOCKER_CONTAINER_NAME --tail 100
    throw "devgod-postgres did not become healthy"
}

npm install
npm run devgod:migrate
npm run devgod:bootstrap
npm run devgod:verify:setup

Write-Host ""
Write-Host "devgod local setup complete"
Write-Host "workspace: $($env:DEVGOD_WORKSPACE_SLUG)"
Write-Host "project: $($env:DEVGOD_PROJECT_SLUG)"
Write-Host "database: configured"
Write-Host "review identity: run npm run devgod:verify:review-identity after implementing devgod/review-identity-adapter.ts"
`;

const generatedReviewIdentityAdapter = `import { createReviewPrincipalAdapter } from "devgod/src/index.ts";

export default createReviewPrincipalAdapter(async () => {
  throw new Error(
    "Implement devgod/review-identity-adapter.ts with your server-side authenticated principal lookup before trusting review actions"
  );
});
`;

function usage(): never {
  throw new Error("Usage: node --experimental-strip-types src/install/cli.ts --target <path> | <path>");
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

async function backupExistingFile(
  targetRoot: string,
  relativePath: string,
  timestamp: string,
  summary: InstallSummary
): Promise<void> {
  const backupPath = path.join(targetRoot, ".devgod/install-backups", timestamp, relativePath);
  await ensureDirectory(backupPath);
  await cp(path.join(targetRoot, relativePath), backupPath);
  summary.backups.push(path.relative(targetRoot, backupPath));
}

async function writeMergedFile(
  targetRoot: string,
  relativePath: string,
  content: string,
  timestamp: string,
  summary: InstallSummary
): Promise<void> {
  const absolutePath = path.join(targetRoot, relativePath);
  const exists = await fileExists(absolutePath);
  if (exists) {
    const existingContent = await readFile(absolutePath, "utf8");
    if (existingContent === content) {
      summary.skipped.push(relativePath);
      return;
    }
    await backupExistingFile(targetRoot, relativePath, timestamp, summary);
    summary.updated.push(relativePath);
  } else {
    summary.created.push(relativePath);
  }

  await ensureDirectory(absolutePath);
  await writeFile(absolutePath, content, "utf8");
}

async function copyManagedFile(
  targetRoot: string,
  file: InstallFile,
  timestamp: string,
  summary: InstallSummary
): Promise<void> {
  const targetPath = path.join(targetRoot, file.target);
  const exists = await fileExists(targetPath);

  if (!exists) {
    await ensureDirectory(targetPath);
    await cp(file.source, targetPath);
    summary.created.push(file.target);
    return;
  }

  const [sourceContent, existingContent] = await Promise.all([
    readFile(file.source, "utf8"),
    readFile(targetPath, "utf8")
  ]);

  if (sourceContent === existingContent) {
    summary.skipped.push(file.target);
    return;
  }

  if (!file.overwriteManaged) {
    summary.skipped.push(file.target);
    return;
  }

  await backupExistingFile(targetRoot, file.target, timestamp, summary);
  await writeFile(targetPath, sourceContent, "utf8");
  summary.updated.push(file.target);
}

async function writeScaffoldFileIfMissing(
  targetRoot: string,
  relativePath: string,
  content: string,
  summary: InstallSummary
): Promise<void> {
  const targetPath = path.join(targetRoot, relativePath);
  if (await fileExists(targetPath)) {
    summary.skipped.push(relativePath);
    return;
  }

  await ensureDirectory(targetPath);
  await writeFile(targetPath, content, "utf8");
  summary.created.push(relativePath);
}

export async function installDevgodIntoProject(options: InstallOptions): Promise<InstallSummary> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const targetRoot = path.resolve(options.targetRoot);

  if (sourceRoot === targetRoot) {
    throw new Error("Refusing to install into the devgod source repository");
  }

  const summary: InstallSummary = {
    created: [],
    updated: [],
    skipped: [],
    backups: []
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const manifest = await buildManifest(sourceRoot);
  for (const file of manifest) {
    await copyManagedFile(targetRoot, file, timestamp, summary);
  }

  const sourceConfig = await readFile(path.join(sourceRoot, ".codex/config.toml"), "utf8");
  const targetConfigPath = path.join(targetRoot, ".codex/config.toml");
  const targetConfig = (await fileExists(targetConfigPath)) ? await readFile(targetConfigPath, "utf8") : undefined;
  await writeMergedFile(
    targetRoot,
    ".codex/config.toml",
    mergeCodexConfig(targetConfig, sourceConfig),
    timestamp,
    summary
  );

  const targetAgentsPath = path.join(targetRoot, "AGENTS.md");
  const targetAgents = (await fileExists(targetAgentsPath)) ? await readFile(targetAgentsPath, "utf8") : undefined;
  await writeMergedFile(targetRoot, "AGENTS.md", mergeAgentsMd(targetAgents), timestamp, summary);

  const packageJsonPath = path.join(targetRoot, "package.json");
  const packageJson = (await fileExists(packageJsonPath)) ? await readFile(packageJsonPath, "utf8") : undefined;
  const dependencyPath = path.relative(targetRoot, sourceRoot);
  await writeMergedFile(
    targetRoot,
    "package.json",
    mergePackageJson(packageJson, dependencyPath),
    timestamp,
    summary
  );

  const gitignorePath = path.join(targetRoot, ".gitignore");
  const gitignore = (await fileExists(gitignorePath)) ? await readFile(gitignorePath, "utf8") : undefined;
  await writeMergedFile(targetRoot, ".gitignore", mergeGitignore(gitignore), timestamp, summary);

  await writeMergedFile(
    targetRoot,
    "scripts/devgod-setup.sh",
    generatedSetupScript,
    timestamp,
    summary
  );

  await writeMergedFile(
    targetRoot,
    "scripts/devgod-setup.ps1",
    generatedPowerShellSetupScript,
    timestamp,
    summary
  );

  await writeScaffoldFileIfMissing(
    targetRoot,
    "devgod/review-identity-adapter.ts",
    generatedReviewIdentityAdapter,
    summary
  );

  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf("--target");
  const targetArg = targetIndex !== -1 ? args[targetIndex + 1] : args[0];
  if (!targetArg) {
    usage();
  }

  const sourceRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
  const targetRoot = path.resolve(targetArg);
  const summary = await installDevgodIntoProject({
    sourceRoot,
    targetRoot
  });

  console.log(`devgod installed into ${targetRoot}`);
  console.log(`created: ${summary.created.length}`);
  console.log(`updated: ${summary.updated.length}`);
  console.log(`skipped: ${summary.skipped.length}`);
  if (summary.backups.length > 0) {
    console.log(`backups: ${summary.backups.length}`);
  }
  console.log("Next steps:");
  console.log("1. cd into the target project");
  console.log("2. npm install");
  console.log("3. npm run devgod:setup:local");
  console.log("4. implement devgod/review-identity-adapter.ts and run npm run devgod:verify:review-identity");
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
