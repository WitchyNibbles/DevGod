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
    await readFile(path.join(sourceRoot, "scripts/setup-devgod.sh"), "utf8"),
    timestamp,
    summary
  );

  await writeMergedFile(
    targetRoot,
    "scripts/devgod-setup.ps1",
    await readFile(path.join(sourceRoot, "scripts/setup-devgod.ps1"), "utf8"),
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
