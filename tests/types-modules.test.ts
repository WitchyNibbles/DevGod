import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

test("package.json root export map keeps the public package entrypoint pointed at the package-safe surface", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json")) as {
    exports?: { ".": { types?: string; default?: string } };
  };

  assert.equal(packageJson.exports?.["."].types, "./src/public.ts");
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

test("install types module loads as a shipped runtime module", async () => {
  const module = await import("../src/install/types.ts");

  assert.equal(typeof module, "object");
});

test("store types module loads as a shipped runtime module", async () => {
  const module = await import("../src/store/types.ts");

  assert.equal(typeof module, "object");
});
