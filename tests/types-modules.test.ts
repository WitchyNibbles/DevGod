import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readPublishedPackageJson,
  readPublishedTypesEntrypoint,
  readPublishedTypesModuleRelativePath,
  stripDotSlashPrefix
} from "./published-package-test-helpers.ts";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedPublicValueExports = [
  "DevgodCoreService",
  "MemoryStore",
  "composeReviewIdentityAdapters",
  "createHeaderReviewIdentityAdapter",
  "createReviewActionContextResolver",
  "createReviewPrincipalAdapter",
  "createStaticReviewIdentityAdapter",
  "executeReportCommandFromArgs",
  "executeSeedModernizationProofCommandFromArgs",
  "executeStatusCommandFromArgs",
  "loadReviewIdentityBindings",
  "loadReviewIdentityFixtures",
  "validateReviewIdentityBindings",
  "validateReviewIdentityFixtures",
  "verifyReviewIdentityAdapter"
].sort();

const expectedPublicTypeExports = [
  "AuthenticatedPrincipal",
  "CreateReviewActionContextResolverOptions",
  "ResolveReviewActionContext",
  "ReviewActionContextResolverInput",
  "ReviewIdentityActorBinding",
  "ReviewIdentityBindings",
  "ReviewIdentityFixture",
  "ReviewIdentityFixtureDocument",
  "ReviewPrincipalAdapter",
  "ReviewPrincipalAdapterInput",
  "ReviewPrincipalBinding"
].sort();

const expectedLazyAdminWrappers = [
  "executeReportCommandFromArgs",
  "executeSeedModernizationProofCommandFromArgs",
  "executeStatusCommandFromArgs"
].sort();

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(sourceRoot, relativePath), "utf8");
}

function collectReExportedNames(sourceText: string): { valueExports: string[]; typeExports: string[] } {
  const valueExports = new Set<string>();
  const typeExports = new Set<string>();

  for (const match of sourceText.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*"[^"]+";/g)) {
    const entries = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      if (entry.startsWith("type ")) {
        typeExports.add(entry.slice("type ".length).trim());
        continue;
      }

      valueExports.add(entry);
    }
  }

  return {
    valueExports: [...valueExports].sort(),
    typeExports: [...typeExports].sort()
  };
}

function collectNamedExports(sourceText: string, pattern: RegExp): string[] {
  return [...new Set([...sourceText.matchAll(pattern)].map((match) => match[1]))].sort();
}

test("package.json root export map keeps the published types at the package root and runtime on dist", async () => {
  const packageJson = await readPublishedPackageJson(sourceRoot);

  assert.equal(readPublishedTypesEntrypoint(packageJson), packageJson.exports?.["."].types);
  assert.equal(packageJson.exports?.["."].default, "./dist/index.js");
});

test("public source barrel preserves the package-safe api and lazy admin wrappers", async () => {
  const publicSource = await readRepoFile("src/public.ts");
  const { valueExports, typeExports } = collectReExportedNames(publicSource);
  const wrapperExports = collectNamedExports(publicSource, /^export const (\w+): AdminModule\["\w+"\] = async /gm);
  const publicValueExports = [...new Set([...valueExports, ...wrapperExports])].sort();

  assert.deepEqual(publicValueExports, expectedPublicValueExports);
  assert.deepEqual(typeExports, expectedPublicTypeExports);
  assert.deepEqual(wrapperExports, expectedLazyAdminWrappers);
  assert.ok(!publicValueExports.includes("buildEmbeddingText"));
  assert.ok(!publicValueExports.includes("createHostedUiRequestHandler"));
  assert.match(publicSource, /type AdminModule = typeof import\("\.\/admin\.ts"\);/);
  assert.match(publicSource, /return import\("\.\/admin\.ts"\);/);
});

test("published root declaration surface stays package-safe and avoids raw TypeScript implementation imports", async () => {
  const publishedTypesRoot = await readRepoFile(
    stripDotSlashPrefix(readPublishedTypesEntrypoint(await readPublishedPackageJson(sourceRoot)))
  );
  const publishedTypes = await readRepoFile(await readPublishedTypesModuleRelativePath(sourceRoot));
  const safeWrapperSignaturePattern =
    /\(\s*args: readonly string\[],\s*options: \{\s*cwd\?: string \| undefined;\s*env\?: Record<string, string \| undefined> \| undefined;\s*\[key: string\]: unknown;\s*\}\s*\) => Promise<unknown>/;

  assert.match(publishedTypesRoot, /^export \* from "\.\/types\/public\.js";$/m);
  assert.match(publishedTypes, /export \{ DevgodCoreService \} from "\.\/core\/service\.js";/);
  assert.match(
    publishedTypes,
    new RegExp(`export declare const executeStatusCommandFromArgs: ${safeWrapperSignaturePattern.source};`)
  );
  assert.match(
    publishedTypes,
    new RegExp(`export declare const executeReportCommandFromArgs: ${safeWrapperSignaturePattern.source};`)
  );
  assert.match(
    publishedTypes,
    new RegExp(`export declare const executeSeedModernizationProofCommandFromArgs: ${safeWrapperSignaturePattern.source};`)
  );
  assert.doesNotMatch(publishedTypesRoot, /\.ts"/);
  assert.doesNotMatch(publishedTypes, /type AdminModule = typeof import/);
  assert.doesNotMatch(publishedTypes, /\.\/admin\.js/);
  assert.doesNotMatch(publishedTypes, /\bpg\b/);
  assert.doesNotMatch(publishedTypes, /getStatusSnapshot/);
  assert.doesNotMatch(publishedTypes, /\.ts"/);
});

test("install types module loads as a shipped runtime module", async () => {
  const module = await import("../src/install/types.ts");

  assert.equal(typeof module, "object");
});

test("store types module loads as a shipped runtime module", async () => {
  const module = await import("../src/store/types.ts");

  assert.equal(typeof module, "object");
});
