import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  renderManagedAgentsBlock,
  renderManagedDotAgentsBlock
} from "../devgod/managed-policy-renderer.ts";

const AGENTS_BEGIN = "<!-- BEGIN DEVGOD MANAGED -->";
const AGENTS_END = "<!-- END DEVGOD MANAGED -->";
const DOT_AGENTS_BEGIN = "<!-- BEGIN DEVGOD KERNEL -->";
const DOT_AGENTS_END = "<!-- END DEVGOD KERNEL -->";

interface InstallModuleSettings {
  withPlaywright?: boolean;
  withGrafana?: boolean;
}

const enforcedCodexConfigKeys = ["approval_policy", "sandbox_mode"] as const;
const require = createRequire(import.meta.url);
function getTomlModule(): typeof import("@iarna/toml") {
  return require("@iarna/toml") as typeof import("@iarna/toml");
}
function getTypeScriptModule(): typeof import("typescript") {
  return require("typescript") as typeof import("typescript");
}

function normalizeManagedCodexConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...config };
  const features =
    normalized.features &&
    typeof normalized.features === "object" &&
    !Array.isArray(normalized.features)
      ? { ...(normalized.features as Record<string, unknown>) }
      : undefined;

  if (features?.plugin_hooks === true && normalized.suppress_unstable_features_warning === undefined) {
    normalized.suppress_unstable_features_warning = true;
  }

  if (features) {
    normalized.features = features;
  }

  return normalized;
}

function sortObjectKeys<T>(value: T): T {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => [key, sortObjectKeys(nestedValue)]);

  return Object.fromEntries(entries) as T;
}

export function mergeAgentsMd(existingContent: string | undefined): string {
  const managedAgentsBlock = renderManagedAgentsBlock();

  if (!existingContent || existingContent.trim().length === 0) {
    return managedAgentsBlock;
  }

  const blockPattern = new RegExp(`${AGENTS_BEGIN}[\\s\\S]*?${AGENTS_END}`, "m");
  if (blockPattern.test(existingContent)) {
    return existingContent.replace(blockPattern, managedAgentsBlock);
  }

  return `${existingContent.trimEnd()}\n\n${managedAgentsBlock}\n`;
}

export function mergeDotAgentsMd(existingContent: string | undefined): string {
  const managedDotAgentsBlock = renderManagedDotAgentsBlock();

  if (!existingContent || existingContent.trim().length === 0) {
    return `${managedDotAgentsBlock}\n`;
  }

  const blockPattern = new RegExp(`${DOT_AGENTS_BEGIN}[\\s\\S]*?${DOT_AGENTS_END}`, "m");
  if (blockPattern.test(existingContent)) {
    return `${existingContent.replace(blockPattern, managedDotAgentsBlock).trimEnd()}\n`;
  }

  return `${existingContent.trimEnd()}\n\n${managedDotAgentsBlock}\n`;
}

function ensureStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.filter((item): item is string => typeof item === "string");
}

const managedCodexOverwriteTablePaths = new Set([
  "mcp_servers.grafana",
  "mcp_servers.playwright",
  "mcp_servers.playwright_vision"
]);

function mergeTomlTable(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  pathSegments: readonly string[] = []
): Record<string, unknown> {
  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const nextPath = [...pathSegments, key];
    if (managedCodexOverwriteTablePaths.has(nextPath.join("."))) {
      merged[key] = value;
      continue;
    }

    const targetValue = merged[key];

    if (targetValue === undefined) {
      merged[key] = value;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      merged[key] = mergeTomlTable(
        targetValue as Record<string, unknown>,
        value as Record<string, unknown>,
        nextPath
      );
    }
  }

  return merged;
}

export function mergeCodexConfig(
  existingContent: string | undefined,
  sourceContent: string
): string {
  const TOML = getTomlModule();
  const source = normalizeManagedCodexConfig(TOML.parse(sourceContent) as Record<string, unknown>);
  const stringifyToml = (value: Record<string, unknown>): string =>
    TOML.stringify(value as unknown as Parameters<typeof TOML.stringify>[0]);

  if (!existingContent || existingContent.trim().length === 0) {
    return `${stringifyToml(sortObjectKeys(source))}`.trimEnd() + "\n";
  }

  const target = TOML.parse(existingContent) as Record<string, unknown>;
  const merged = mergeTomlTable(target, source);

  for (const key of enforcedCodexConfigKeys) {
    if (source[key] !== undefined) {
      merged[key] = source[key];
    }
  }

  const mergedFallbacks = new Set(
    ensureStringArray(source.project_doc_fallback_filenames, []).concat(
      ensureStringArray(target.project_doc_fallback_filenames, [])
    )
  );
  if (mergedFallbacks.size > 0) {
    merged.project_doc_fallback_filenames = [...mergedFallbacks];
  }

  const normalizedTarget = sortObjectKeys(target);
  const normalizedMerged = sortObjectKeys(merged);
  if (JSON.stringify(normalizedTarget) === JSON.stringify(normalizedMerged)) {
    return existingContent.endsWith("\n") ? existingContent : `${existingContent}\n`;
  }

  return `${stringifyToml(normalizedMerged)}`.trimEnd() + "\n";
}

function renderPublishedTypeScriptHookEntrypoint(): string {
  return `import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const packageRootUrl = new URL("../", import.meta.url);
const packageRootPath = fileURLToPath(packageRootUrl);
const registeredPackageRoots = new Set();

export function resolveDevgodPackagePath(relativePath) {
  return path.resolve(packageRootPath, relativePath);
}

export function registerDevgodTypeScriptHooks() {
  const packageRootHref = pathToFileURL(\`\${packageRootPath}\${path.sep}\`).href;
  if (registeredPackageRoots.has(packageRootHref)) {
    return;
  }

  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith(packageRootHref) && url.endsWith(".ts")) {
        const source = readFileSync(fileURLToPath(url), "utf8");
        return {
          format: "module",
          shortCircuit: true,
          source: stripTypeScriptTypes(source, { mode: "transform", sourceUrl: url })
        };
      }

      return nextLoad(url, context);
    }
  });

  registeredPackageRoots.add(packageRootHref);
}

export async function importDevgodTypeScriptModule(relativePath, argv = []) {
  registerDevgodTypeScriptHooks();
  const targetPath = resolveDevgodPackagePath(relativePath);
  const originalArgv = process.argv;
  process.argv = [process.argv[0] ?? process.execPath, targetPath, ...argv];

  try {
    return await import(pathToFileURL(targetPath).href);
  } finally {
    process.argv = originalArgv;
  }
}
`;
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

function collectLazyAdminWrapperExports(sourceText: string): string[] {
  return [
    ...new Set(
      [...sourceText.matchAll(/^export const (\w+): AdminModule\["\w+"\] = async /gm)].map((match) => match[1])
    )
  ].sort();
}

export function collectPublishedPublicValueExports(sourceText: string): string[] {
  const { valueExports } = collectReExportedNames(sourceText);
  return [...new Set([...valueExports, ...collectLazyAdminWrapperExports(sourceText)])].sort();
}

function sanitizePublishedDeclarationSource(
  declarationSource: string,
  options: { stripPublicAdminModuleAlias?: boolean } = {}
): string {
  let rewrittenSource = declarationSource
    .replace(/from "(\.[^"]+)\.ts"/g, 'from "$1.js"')
    .replace(/import\("(\.[^"]+)\.ts"\)/g, 'import("$1.js")');

  if (options.stripPublicAdminModuleAlias) {
    const safeWrapperSignature = [
      "(",
      "    args: readonly string[],",
      "    options: {",
      "        cwd?: string | undefined;",
      "        env?: Record<string, string | undefined> | undefined;",
      "        [key: string]: unknown;",
      "    }",
      ") => Promise<unknown>"
    ].join("\n");

    rewrittenSource = rewrittenSource
      .replace(/^type AdminModule = typeof import\("\.\/admin\.js"\);\n/m, "")
      .replace(
        /export declare const executeStatusCommandFromArgs: (?:AdminModule\["executeStatusCommandFromArgs"\]|typeof import\("\.\/admin\.js"\)\.executeStatusCommandFromArgs);/,
        `export declare const executeStatusCommandFromArgs: ${safeWrapperSignature};`
      )
      .replace(
        /export declare const executeReportCommandFromArgs: (?:AdminModule\["executeReportCommandFromArgs"\]|typeof import\("\.\/admin\.js"\)\.executeReportCommandFromArgs);/,
        `export declare const executeReportCommandFromArgs: ${safeWrapperSignature};`
      )
      .replace(
        /export declare const executeSeedModernizationProofCommandFromArgs: (?:AdminModule\["executeSeedModernizationProofCommandFromArgs"\]|typeof import\("\.\/admin\.js"\)\.executeSeedModernizationProofCommandFromArgs);/,
        `export declare const executeSeedModernizationProofCommandFromArgs: ${safeWrapperSignature};`
      );
  }

  return rewrittenSource.endsWith("\n") ? rewrittenSource : `${rewrittenSource}\n`;
}

async function renderPublishedDeclarationEntrypoints(
  packageRoot: string
): Promise<{ rootIndexText: string; emittedFiles: Array<{ relativePath: string; content: string }> }> {
  const ts = getTypeScriptModule();
  const publicSourcePath = path.join(packageRoot, "src", "public.ts");
  const emittedDeclarationRoot = path.join(packageRoot, "dist", "types");
  const compilerOptions: import("typescript").CompilerOptions = {
    allowImportingTsExtensions: true,
    declaration: true,
    emitDeclarationOnly: true,
    exactOptionalPropertyTypes: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    outDir: emittedDeclarationRoot,
    resolveJsonModule: true,
    rootDir: path.join(packageRoot, "src"),
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    types: ["node"],
    verbatimModuleSyntax: true
  };
  const declarationFiles = new Map<string, string>();
  const program = ts.createProgram([publicSourcePath], compilerOptions);
  const emitResult = program.emit(
    undefined,
    (fileName, content) => {
      if (fileName.endsWith(".d.ts")) {
        declarationFiles.set(path.resolve(fileName), content);
      }
    },
    undefined,
    true
  );

  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  const publicDeclarationPath = path.resolve(path.join(emittedDeclarationRoot, "public.d.ts"));
  if (emitResult.emitSkipped || !declarationFiles.has(publicDeclarationPath)) {
    const diagnosticHost = {
      getCanonicalFileName: (fileName: string) => fileName,
      getCurrentDirectory: () => packageRoot,
      getNewLine: () => "\n"
    };
    const renderedDiagnostics = diagnostics.length > 0
      ? ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticHost)
      : "TypeScript declaration emit skipped without diagnostics.";
    throw new Error(`Unable to generate published root declaration surface.\n${renderedDiagnostics}`);
  }

  const emittedFiles = [...declarationFiles.entries()]
    .map(([absolutePath, content]) => ({
      relativePath: path.relative(emittedDeclarationRoot, absolutePath).replace(/\\/g, "/"),
      content: sanitizePublishedDeclarationSource(content, {
        stripPublicAdminModuleAlias: absolutePath === publicDeclarationPath
      })
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    rootIndexText: 'export * from "./types/public.js";\n',
    emittedFiles
  };
}

export function renderPublishedIndexEntrypoint(publicSourceText: string): string {
  const exportLines = collectPublishedPublicValueExports(publicSourceText)
    .map((name) => `export const ${name} = publicApi.${name};`)
    .join("\n");

  return `import { importDevgodTypeScriptModule, registerDevgodTypeScriptHooks } from "./register-typescript-hooks.js";

registerDevgodTypeScriptHooks();

const publicApi = await importDevgodTypeScriptModule("src/public.ts");

${exportLines}
`;
}

function renderPublishedBinEntrypoint(): string {
  return `#!/usr/bin/env node

import process from "node:process";
import { importDevgodTypeScriptModule, registerDevgodTypeScriptHooks } from "../register-typescript-hooks.js";

const adminCommands = new Set([
  "migrate",
  "health",
  "doctor",
  "bootstrap-project",
  "verify-setup",
  "verify-live-migrations",
  "refresh-retrieval",
  "refresh-repo-context",
  "repair-task-queue",
  "run-embedding-jobs",
  "verify-review-identity",
  "record-review",
  "record-council-decision",
  "status",
  "coverage",
  "gaps",
  "checkpoint",
  "resume",
  "workflow-proof",
  "seed-workflow-proof",
  "seed-modernization-proof",
  "advance-active-task",
  "reconcile-runtime-state",
  "sync-runtime-exports",
  "daemon",
  "supervisor",
  "supervisor-history",
  "ops",
  "loop",
  "recover",
  "index-repo-markdown",
  "report",
  "plan-context",
  "export-docs",
  "/export-docs",
  "github-dispatch"
]);

const installCommands = new Set([
  "init",
  "upgrade",
  "verify",
  "scaffold-workflow",
  "upgrade-reasoning-workflow",
  "seed-happy-path-fixture"
]);

const directCommandTargets = new Map([
  ["autopilot-status", { modulePath: "src/devgod/autopilot-status.ts", stripCommand: true }],
  ["setup-git-guard", { modulePath: "src/install/setup-git-guard.ts", stripCommand: true }],
  ["verify-git-guard", { modulePath: "src/install/verify-git-guard.ts", stripCommand: true }],
  ["setup-local", { modulePath: "src/install/setup-local.ts", stripCommand: true }],
  ["setup-playwright", { modulePath: "src/install/setup-playwright.ts", stripCommand: true }],
  ["mcp", { modulePath: "src/mcp/server.ts", stripCommand: true }],
  ["serve-ui", { modulePath: "src/ui/server.ts", stripCommand: true }],
  ["grafana-mcp", { modulePath: "src/grafana/mcp-server.ts", stripCommand: true }]
]);

function printUsage() {
  process.stdout.write(
    [
      "devgod",
      "",
      "Stable public CLI entrypoint for the devgod package.",
      "",
      "Usage:",
      "  devgod <runtime-command> [args]",
      "  devgod <install-command> [args]",
      "  devgod <helper-command> [args]",
      "",
      "Runtime commands:",
      "  status | coverage | gaps | checkpoint | resume | workflow-proof | seed-workflow-proof | seed-modernization-proof | advance-active-task | reconcile-runtime-state | sync-runtime-exports | daemon | supervisor | supervisor-history | ops | loop | recover | report | plan-context | export-docs | github-dispatch",
      "  migrate | health | doctor [--repair] | bootstrap-project | verify-setup | verify-live-migrations",
      "  verify-review-identity | record-review | record-council-decision | index-repo-markdown | refresh-retrieval | refresh-repo-context | repair-task-queue | run-embedding-jobs",
      "",
      "Install commands:",
      "  init | upgrade | verify | scaffold-workflow | upgrade-reasoning-workflow | seed-happy-path-fixture",
      "",
      "Helper commands:",
      "  autopilot-status | setup-git-guard | verify-git-guard | setup-local | setup-playwright | mcp | serve-ui | grafana-mcp",
      ""
    ].join("\\n")
  );
}

async function main() {
  registerDevgodTypeScriptHooks();

  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (adminCommands.has(command)) {
    await importDevgodTypeScriptModule("src/admin.ts", [command, ...rest]);
    return;
  }

  if (installCommands.has(command)) {
    await importDevgodTypeScriptModule("src/install/cli.ts", [command, ...rest]);
    return;
  }

  const directTarget = directCommandTargets.get(command);
  if (directTarget) {
    await importDevgodTypeScriptModule(directTarget.modulePath, directTarget.stripCommand ? rest : [command, ...rest]);
    return;
  }

  throw new Error(\`Unknown devgod command: \${command}\`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
`;
}

async function writePublishedPackageFile(
  filePath: string,
  content: string,
  options: { executable?: boolean } = {}
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  if (options.executable) {
    await chmod(filePath, 0o755);
  }
}

export async function writePublishedPackageEntrypoints(packageRoot: string): Promise<void> {
  const outputRoot = path.resolve(packageRoot, "dist");
  const publicSourcePath = path.join(packageRoot, "src", "public.ts");
  const publicSourceText = await readFile(publicSourcePath, "utf8");
  const publicDeclarations = await renderPublishedDeclarationEntrypoints(packageRoot);
  await writePublishedPackageFile(
    path.join(outputRoot, "register-typescript-hooks.js"),
    renderPublishedTypeScriptHookEntrypoint()
  );
  await rm(path.join(outputRoot, "types"), { recursive: true, force: true });
  await writePublishedPackageFile(path.join(outputRoot, "index.d.ts"), publicDeclarations.rootIndexText);
  for (const declarationFile of publicDeclarations.emittedFiles) {
    await writePublishedPackageFile(path.join(outputRoot, "types", declarationFile.relativePath), declarationFile.content);
  }
  await writePublishedPackageFile(
    path.join(outputRoot, "index.js"),
    renderPublishedIndexEntrypoint(publicSourceText)
  );
  await writePublishedPackageFile(path.join(outputRoot, "bin", "devgod.js"), renderPublishedBinEntrypoint(), {
    executable: true
  });
}

export function playwrightCodexConfigFragment(): string {
  return (
    '[mcp_servers.playwright]\n' +
    'command = "npx"\n' +
    'args = ["--yes", "@playwright/mcp@latest", "--config", ".devgod/playwright/mcp.json"]\n\n' +
    '[mcp_servers.playwright_vision]\n' +
    'command = "npx"\n' +
    'args = ["--yes", "@playwright/mcp@latest", "--config", ".devgod/playwright/mcp.vision.json"]\n'
  );
}

export function grafanaCodexConfigFragment(): string {
  return (
    '[mcp_servers.grafana]\n' +
    'command = "node"\n' +
    'args = ["./node_modules/devgod/dist/bin/devgod.js", "grafana-mcp"]\n'
  );
}

export function mergeGitignore(
  existingContent: string | undefined,
  _options: InstallModuleSettings = {}
): string {
  const requiredLines = [".env.devgod", ".env.devgod.*"];
  const existingLines = new Set(
    (existingContent ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );

  const missing = requiredLines.filter((line) => !existingLines.has(line));
  if (missing.length === 0) {
    return existingContent ?? "";
  }

  const prefix = existingContent && existingContent.trim().length > 0 ? `${existingContent.trimEnd()}\n` : "";
  return `${prefix}\n# devgod\n${missing.join("\n")}\n`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function prefixedFileDependency(relativePath: string): string {
  const normalized = toPosixPath(relativePath);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return `file:${normalized}`;
  }
  if (normalized.startsWith(".")) {
    return `file:${normalized}`;
  }
  return `file:./${normalized}`;
}

export function mergePackageJson(
  existingContent: string | undefined,
  dependencyPathFromTarget: string,
  options: InstallModuleSettings = {}
): string {
  const packageJson = existingContent && existingContent.trim().length > 0
    ? (JSON.parse(existingContent) as Record<string, unknown>)
    : {
        name: "project-with-devgod",
        private: true
      };

  const scripts =
    packageJson.scripts && typeof packageJson.scripts === "object" && !Array.isArray(packageJson.scripts)
      ? { ...(packageJson.scripts as Record<string, string>) }
      : {};
  const devDependencies =
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === "object" &&
    !Array.isArray(packageJson.devDependencies)
      ? { ...(packageJson.devDependencies as Record<string, string>) }
      : {};

  const devgodEntry = "devgod";

  scripts["devgod"] = devgodEntry;
  scripts["devgod:migrate"] = `${devgodEntry} migrate`;
  scripts["devgod:health"] = `${devgodEntry} health`;
  scripts["devgod:doctor"] = `${devgodEntry} doctor`;
  scripts["devgod:heal"] = `${devgodEntry} doctor --repair`;
  scripts["devgod:bootstrap"] = `${devgodEntry} bootstrap-project`;
  scripts["devgod:verify:setup"] = `${devgodEntry} verify-setup`;
  scripts["devgod:status"] = `${devgodEntry} status`;
  scripts["devgod:coverage"] = `${devgodEntry} coverage --format text`;
  scripts["devgod:gaps"] = `${devgodEntry} gaps --format text`;
  scripts["devgod:checkpoint"] = `${devgodEntry} checkpoint --format text`;
  scripts["devgod:resume"] = `${devgodEntry} resume --format text`;
  scripts["devgod:seed-workflow-proof"] = `${devgodEntry} seed-workflow-proof`;
  scripts["devgod:seed-modernization-proof"] = `${devgodEntry} seed-modernization-proof`;
  scripts["devgod:advance-active-task"] = `${devgodEntry} advance-active-task --format text`;
  scripts["devgod:reconcile"] = `${devgodEntry} reconcile-runtime-state --apply --format text`;
  scripts["devgod:sync-runtime-exports"] = `${devgodEntry} sync-runtime-exports --format text`;
  scripts["devgod:daemon"] = `${devgodEntry} daemon --format text`;
  scripts["devgod:supervisor"] = `${devgodEntry} supervisor --format text`;
  scripts["devgod:supervisor-history"] = `${devgodEntry} supervisor-history --format text`;
  scripts["devgod:ops"] = `${devgodEntry} ops --format text`;
  scripts["devgod:focus"] = `${devgodEntry} ops --format text`;
  scripts["devgod:loop"] = `${devgodEntry} loop --format text`;
  scripts["devgod:recover"] = `${devgodEntry} recover`;
  scripts["devgod:report"] = `${devgodEntry} report --format markdown`;
  scripts["devgod:plan-context"] = `${devgodEntry} plan-context`;
  scripts["devgod:refresh-retrieval"] = `${devgodEntry} refresh-retrieval`;
  scripts["devgod:refresh-retrieval:fast"] = `${devgodEntry} refresh-retrieval --artifacts-only`;
  scripts["devgod:refresh-repo-context"] = `${devgodEntry} refresh-repo-context`;
  scripts["devgod:repair-task-queue"] = `${devgodEntry} repair-task-queue`;
  scripts["devgod:export-docs"] = `${devgodEntry} export-docs`;
  scripts["devgod:autopilot-status"] =
    `${devgodEntry} autopilot-status`;
  scripts["devgod:github-dispatch"] = `${devgodEntry} github-dispatch --target .`;
  scripts["devgod:mcp"] = `${devgodEntry} mcp`;
  scripts["devgod:ui"] = `${devgodEntry} serve-ui`;
  scripts["devgod:scaffold-workflow"] = `${devgodEntry} scaffold-workflow --target .`;
  scripts["devgod:upgrade-reasoning-workflow"] = `${devgodEntry} upgrade-reasoning-workflow --target .`;
  scripts["devgod:seed-happy-path-fixture"] = `${devgodEntry} seed-happy-path-fixture --target .`;
  scripts["devgod:check:happy-path"] = "bash scripts/check-devgod-happy-path.sh";
  scripts["devgod:check-workflow"] = "bash scripts/check-devgod-workflow.sh";
  scripts["devgod:verify:migrations:live"] = `${devgodEntry} verify-live-migrations`;
  scripts["devgod:verify:review-identity"] = `${devgodEntry} verify-review-identity`;
  scripts["devgod:verify:git-guard"] =
    `${devgodEntry} verify-git-guard`;
  scripts["devgod:record-review"] = `${devgodEntry} record-review --input .devgod/review-action.json`;
  scripts["devgod:setup:git-guard"] =
    `${devgodEntry} setup-git-guard`;
  scripts["devgod:setup:local"] = `${devgodEntry} setup-local`;

  if (options.withPlaywright) {
    scripts["devgod:setup:playwright"] =
      `${devgodEntry} setup-playwright`;
    scripts["devgod:verify:playwright"] =
      `${devgodEntry} setup-playwright --verify`;
  }

  if (options.withGrafana) {
    scripts["devgod:grafana:mcp"] =
      `${devgodEntry} grafana-mcp`;
  }

  devDependencies.devgod = prefixedFileDependency(dependencyPathFromTarget);

  packageJson.scripts = sortObjectKeys(scripts);
  packageJson.devDependencies = sortObjectKeys(devDependencies);

  return `${JSON.stringify(sortObjectKeys(packageJson), null, 2)}\n`;
}

export function agentsManagedBlock(): string {
  return renderManagedAgentsBlock();
}
