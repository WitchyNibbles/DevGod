import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PublishedPackageJson {
  exports?: { ".": { types?: string; default?: string } };
  files?: string[];
}

export async function readPublishedPackageJson(repoRoot: string): Promise<PublishedPackageJson> {
  return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as PublishedPackageJson;
}

export function readPublishedTypesEntrypoint(packageJson: PublishedPackageJson): string {
  const typesEntrypoint = packageJson.exports?.["."].types;

  if (typeof typesEntrypoint !== "string") {
    throw new Error("package.json exports['.'].types must be a string");
  }

  assert.equal(typesEntrypoint, "./dist/index.d.ts");

  return typesEntrypoint;
}

export function stripDotSlashPrefix(relativePath: string): string {
  assert.match(relativePath, /^\.\//);
  return relativePath.slice(2);
}

export async function readPublishedTypesRelativePath(repoRoot: string): Promise<string> {
  return stripDotSlashPrefix(readPublishedTypesEntrypoint(await readPublishedPackageJson(repoRoot)));
}

export async function readPublishedTypesModuleRelativePath(repoRoot: string): Promise<string> {
  const typesRelativePath = await readPublishedTypesRelativePath(repoRoot);
  const typesSource = await readFile(path.join(repoRoot, typesRelativePath), "utf8");
  const reExportSpecifier = typesSource.match(/^export \* from "(\.\/.+)\.js";$/m)?.[1];

  assert.ok(reExportSpecifier, `${typesRelativePath} must re-export a concrete declaration module`);

  return path
    .join(path.dirname(typesRelativePath), `${reExportSpecifier}.d.ts`)
    .replace(/\\/g, "/");
}

export async function listPublishedPackFixturePaths(repoRoot: string): Promise<string[]> {
  const fixturePaths = [
    "src/public.ts",
    "src/devgod/managed-policy-renderer.ts",
    await readPublishedTypesRelativePath(repoRoot),
    await readPublishedTypesModuleRelativePath(repoRoot)
  ];

  return [...new Set(fixturePaths.filter((relativePath) => !relativePath.startsWith("dist/")))].sort();
}
