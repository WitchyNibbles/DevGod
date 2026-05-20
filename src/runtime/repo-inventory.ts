import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type {
  CoverageCriticality,
  CoverageItemCategory,
  CoverageItemRecord,
  UnderstandingMapKind,
  UnderstandingMapRecord
} from "../domain/types.ts";

const DEFAULT_CODE_INCLUDE_PATHS = ["src", "scripts", "tests", "package.json", "tsconfig.json"] as const;
const DEFAULT_EXCLUDED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage"]);

export interface GenerateRepoInventoryInput {
  repoRoot: string;
  now?: string | undefined;
  include?: readonly string[] | undefined;
}

export interface RepoInventoryResult {
  coverageItems: CoverageItemRecord[];
  understandingMaps: UnderstandingMapRecord[];
}

export async function generateRepoInventory(input: GenerateRepoInventoryInput): Promise<RepoInventoryResult> {
  const repoRoot = await realpath(input.repoRoot);
  const include = input.include && input.include.length > 0 ? input.include : DEFAULT_CODE_INCLUDE_PATHS;
  const now = input.now ?? new Date().toISOString();
  const relativePaths = await collectCodeFiles(repoRoot, include);

  const coverageItems = relativePaths.map((relativePath) => buildCoverageItem(relativePath, now));
  const understandingMaps = buildUnderstandingMaps(relativePaths, now);

  return {
    coverageItems,
    understandingMaps
  };
}

async function collectCodeFiles(repoRoot: string, includePaths: readonly string[]): Promise<string[]> {
  const results = new Set<string>();

  for (const includePath of includePaths) {
    const absolutePath = path.resolve(repoRoot, includePath);
    const kind = await safeStatKind(absolutePath);
    if (!kind) {
      continue;
    }

    if (kind === "file") {
      const relativePath = normalizeRelativePath(repoRoot, absolutePath);
      if (isAllowedCodeFile(relativePath)) {
        results.add(relativePath);
      }
      continue;
    }

    for (const nestedPath of await walkCodeFiles(repoRoot, absolutePath)) {
      results.add(nestedPath);
    }
  }

  return [...results].sort();
}

async function walkCodeFiles(repoRoot: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(repoRoot, absolutePath);
    const segments = relativePath.split("/");
    if (segments.some((segment) => DEFAULT_EXCLUDED_SEGMENTS.has(segment))) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...(await walkCodeFiles(repoRoot, absolutePath)));
      continue;
    }

    if ((entry.isFile() || entry.isSymbolicLink()) && isAllowedCodeFile(relativePath)) {
      results.push(relativePath);
    }
  }

  return results;
}

function isAllowedCodeFile(relativePath: string): boolean {
  return (
    relativePath.endsWith(".ts") ||
    relativePath.endsWith(".tsx") ||
    relativePath.endsWith(".js") ||
    relativePath.endsWith(".mjs") ||
    relativePath.endsWith(".cjs") ||
    relativePath.endsWith(".sh") ||
    relativePath === "package.json" ||
    relativePath === "tsconfig.json"
  );
}

function buildCoverageItem(relativePath: string, now: string): CoverageItemRecord {
  return {
    id: `file:${relativePath}`,
    category: inferCoverageCategory(relativePath),
    state: inferCoverageState(relativePath),
    criticality: inferCriticality(relativePath),
    sources: [relativePath],
    evidenceRefs: [relativePath],
    lastUpdatedAt: now
  };
}

function inferCoverageCategory(relativePath: string): CoverageItemCategory {
  if (relativePath.startsWith("tests/")) {
    return "tests";
  }
  if (relativePath === "package.json" || relativePath === "tsconfig.json") {
    return "configuration";
  }
  if (relativePath.startsWith("scripts/")) {
    return "runtime_side_effects";
  }
  if (relativePath.startsWith("src/domain/")) {
    return "models";
  }
  if (relativePath.startsWith("src/install/")) {
    return "configuration";
  }
  if (relativePath.startsWith("src/mcp/") || relativePath.startsWith("src/store/")) {
    return "external_integrations";
  }
  if (relativePath.startsWith("src/runtime/") || relativePath.startsWith("src/core/")) {
    return "services";
  }
  return "services";
}

function inferCoverageState(relativePath: string): CoverageItemRecord["state"] {
  if (relativePath.startsWith("tests/")) {
    return "fully_analyzed";
  }
  if (relativePath.startsWith("src/domain/") || relativePath === "package.json" || relativePath === "tsconfig.json") {
    return "fully_analyzed";
  }
  return "discovered";
}

function inferCriticality(relativePath: string): CoverageCriticality {
  if (
    relativePath === "src/core/service.ts" ||
    relativePath === "src/runtime/autonomous-execution.ts" ||
    relativePath === "scripts/check-devgod-workflow.sh"
  ) {
    return "critical";
  }
  if (
    relativePath.startsWith("src/core/") ||
    relativePath.startsWith("src/runtime/") ||
    relativePath.startsWith("src/admin/")
  ) {
    return "high";
  }
  if (relativePath.startsWith("tests/") || relativePath.startsWith("src/domain/")) {
    return "medium";
  }
  return "low";
}

function buildUnderstandingMaps(relativePaths: readonly string[], now: string): UnderstandingMapRecord[] {
  const topLevelSubsystems = new Set<string>();
  const routeFiles: string[] = [];
  const modelFiles: string[] = [];
  const integrationFiles: string[] = [];
  const authzFiles: string[] = [];
  const configFiles: string[] = [];
  const runtimeSideEffectFiles: string[] = [];

  for (const relativePath of relativePaths) {
    const srcMatch = relativePath.match(/^src\/([^/]+)\//);
    if (srcMatch?.[1]) {
      topLevelSubsystems.add(srcMatch[1]);
    }

    if (relativePath.startsWith("src/admin/") || /route|server/i.test(relativePath)) {
      routeFiles.push(relativePath);
    }
    if (relativePath.startsWith("src/domain/")) {
      modelFiles.push(relativePath);
    }
    if (
      relativePath.startsWith("src/mcp/") ||
      relativePath.startsWith("src/store/") ||
      relativePath.startsWith("src/install/")
    ) {
      integrationFiles.push(relativePath);
    }
    if (/auth|policy|review|identity/i.test(relativePath)) {
      authzFiles.push(relativePath);
    }
    if (
      relativePath === "package.json" ||
      relativePath === "tsconfig.json" ||
      /config|install|env/i.test(relativePath)
    ) {
      configFiles.push(relativePath);
    }
    if (relativePath.startsWith("scripts/") || relativePath.startsWith("src/runtime/") || relativePath === "src/core/service.ts") {
      runtimeSideEffectFiles.push(relativePath);
    }
  }

  return [
    buildUnderstandingMap("repo_map", relativePaths, now),
    buildUnderstandingMap("subsystems", [...topLevelSubsystems], now),
    buildUnderstandingMap("route_map", routeFiles, now),
    buildUnderstandingMap("model_map", modelFiles, now),
    buildUnderstandingMap("integration_map", integrationFiles, now),
    buildUnderstandingMap("authz_map", authzFiles, now),
    buildUnderstandingMap("config_coupling", configFiles, now),
    buildUnderstandingMap("runtime_side_effects", runtimeSideEffectFiles, now)
  ];
}

function buildUnderstandingMap(
  kind: UnderstandingMapKind,
  sourceRefs: readonly string[],
  now: string
): UnderstandingMapRecord {
  const refs = sourceRefs.length > 0 ? [...sourceRefs] : ["repo://none"];
  return {
    kind,
    itemCount: sourceRefs.length,
    analyzedCount: sourceRefs.length,
    sourceRefs: refs,
    evidenceRefs: refs.slice(0, 10),
    updatedAt: now
  };
}

function normalizeRelativePath(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

async function safeStatKind(targetPath: string): Promise<"file" | "directory" | null> {
  try {
    const resolved = await realpath(targetPath);
    const stats = await import("node:fs/promises").then(({ stat }) => stat(resolved));
    if (stats.isFile()) {
      return "file";
    }
    if (stats.isDirectory()) {
      return "directory";
    }
    return null;
  } catch {
    return null;
  }
}
