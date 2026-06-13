import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectPublishedPublicValueExports,
  renderPublishedIndexEntrypoint
} from "../src/install/merge.ts";
import { listCanonicalPackageFileEntries } from "../src/devgod/package-surface.ts";
import {
  listPublishedPackFixturePaths,
  readPublishedPackageJson,
  readPublishedTypesEntrypoint,
  readPublishedTypesRelativePath
} from "./published-package-test-helpers.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

function packFixtureEnv(sourceRoot: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_PATH: [path.join(sourceRoot, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
  };
}

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function collectGeneratedWrapperExports(sourceText: string): string[] {
  return [...new Set([...sourceText.matchAll(/^export const (\w+) = publicApi\.\w+;$/gm)].map((match) => match[1]))].sort();
}

interface PackFixtureStageOptions {
  intendedTrackedRelativePaths?: string[];
}

function normalizeFixtureRelativePath(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join(path.posix.sep);
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Pack fixture paths must stay repo-relative; received "${relativePath}"`);
  }
  return normalized;
}

async function listTrackedFixturePaths(sourceRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: sourceRoot,
    encoding: "utf8"
  });
  return stdout
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => normalizeFixtureRelativePath(entry))
    .sort();
}

async function listUntrackedFixturePaths(sourceRoot: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: sourceRoot,
    encoding: "utf8"
  });
  return new Set(
    stdout
      .split("\0")
      .filter((entry) => entry.length > 0)
      .map((entry) => normalizeFixtureRelativePath(entry))
  );
}

async function copyFixturePath(sourceRoot: string, stagedRoot: string, relativePath: string): Promise<void> {
  const sourcePath = path.join(sourceRoot, relativePath);
  const stagedPath = path.join(stagedRoot, relativePath);
  await mkdir(path.dirname(stagedPath), { recursive: true });
  await cp(sourcePath, stagedPath, {
    force: true,
    recursive: false
  });
}

async function stagePackSourceRoot(
  sourceRoot: string,
  options: PackFixtureStageOptions = {}
): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const stagedRoot = await mkdtemp(path.join(tmpdir(), "devgod-cli-surface-pack-source-"));
  const trackedPaths = await listTrackedFixturePaths(sourceRoot);
  const trackedPathSet = new Set(trackedPaths);
  const untrackedPaths = await listUntrackedFixturePaths(sourceRoot);
  const intendedTrackedPaths = (options.intendedTrackedRelativePaths ?? []).map((entry) =>
    normalizeFixtureRelativePath(entry)
  );

  for (const relativePath of intendedTrackedPaths) {
    if (!trackedPathSet.has(relativePath) && !untrackedPaths.has(relativePath)) {
      throw new Error(
        `Intended tracked pack fixture path must exist in the workspace before staging: ${relativePath}`
      );
    }
  }

  const fixturePaths = [...new Set([...trackedPaths, ...intendedTrackedPaths])];

  try {
    for (const relativePath of fixturePaths) {
      await copyFixturePath(sourceRoot, stagedRoot, relativePath);
    }

    return {
      root: stagedRoot,
      cleanup: async () => rm(stagedRoot, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(stagedRoot, { recursive: true, force: true });
    throw error;
  }
}

async function runNpmPackJsonDryRun(sourceRoot: string, options: PackFixtureStageOptions = {}): Promise<string> {
  const npmCacheDir = await mkdtemp(path.join(tmpdir(), "devgod-cli-surface-npm-pack-cache-"));
  const outputPath = path.join(npmCacheDir, "npm-pack-output.json");
  const staged = await stagePackSourceRoot(sourceRoot, options);

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "set -euo pipefail",
          `npm pack --json --dry-run --cache ${JSON.stringify(npmCacheDir)} > ${JSON.stringify(outputPath)}`
        ].join("\n")
      ],
      {
        cwd: staged.root,
        encoding: "utf8",
        env: packFixtureEnv(sourceRoot)
      }
    );

    return await readFile(outputPath, "utf8");
  } finally {
    await staged.cleanup();
    await rm(npmCacheDir, { recursive: true, force: true });
  }
}

test("published dist index wrapper stays in parity with the declared public API", async () => {
  const publicSource = await readRepoFile("src/public.ts");
  const publishedWrapperSource = await readRepoFile("dist/index.js");

  assert.deepEqual(
    collectGeneratedWrapperExports(publishedWrapperSource),
    collectPublishedPublicValueExports(publicSource)
  );
  assert.equal(publishedWrapperSource, renderPublishedIndexEntrypoint(publicSource));
  assert.match(publishedWrapperSource, /importDevgodTypeScriptModule\("src\/public\.ts"\)/);
  assert.doesNotMatch(publishedWrapperSource, /^export type /m);
  assert.ok(!publishedWrapperSource.includes("buildEmbeddingText"));
});

test("package surface keeps src/public.ts and the published root types entry in canonical files and staged pack output", async () => {
  const packageJson = await readPublishedPackageJson(repoRoot);
  const publishedTypesRelativePath = await readPublishedTypesRelativePath(repoRoot);
  const canonicalEntries = listCanonicalPackageFileEntries();
  const packResult = JSON.parse(
    await runNpmPackJsonDryRun(repoRoot, {
      intendedTrackedRelativePaths: await listPublishedPackFixturePaths(repoRoot)
    })
  ) as Array<{
    files: Array<{ path: string }>;
  }>;
  const packedFiles = new Set(packResult.flatMap((entry) => entry.files.map((file) => file.path)));

  assert.ok(canonicalEntries.includes("src/public.ts"));
  assert.ok(canonicalEntries.includes("dist/"));
  assert.match(publishedTypesRelativePath, /^dist\/.+\.d\.ts$/);
  assert.equal(readPublishedTypesEntrypoint(packageJson), packageJson.exports?.["."].types);
  assert.ok(packageJson.files?.includes("src/public.ts"));
  assert.ok(packageJson.files?.includes("dist/"));
  assert.ok(packedFiles.has(publishedTypesRelativePath));
  assert.ok(packedFiles.has("src/public.ts"));
  assert.ok(packedFiles.has("dist/index.js"));
});
