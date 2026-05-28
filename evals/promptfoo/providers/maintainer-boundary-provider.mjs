import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const execFileAsync = promisify(execFile);

const maintainerOnlyPathPrefixes = [
  "docs/maintainers/",
  "evals/promptfoo/"
];

const maintainerOnlyExactPaths = [
  "stryker-maintainer-boundary.config.json"
];

function auditMaintainerOnlyPublishedPaths(paths) {
  return [...new Set(paths.filter((relativePath) =>
    maintainerOnlyPathPrefixes.some((prefix) => relativePath.startsWith(prefix)) ||
    maintainerOnlyExactPaths.includes(relativePath)
  ))].sort();
}

async function runTypescriptBoundaryAudit() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      [
        `import { mergePackageJson } from ${JSON.stringify(path.join(repoRoot, "src/install/merge.ts"))};`,
        `import { auditMaintainerOnlyPackageJson } from ${JSON.stringify(path.join(repoRoot, "src/install/maintainer-boundary.ts"))};`,
        "const merged = JSON.parse(mergePackageJson(JSON.stringify({ name: 'fixture', private: true, scripts: { test: 'node --test' }, devDependencies: { typescript: '^5.8.3' } }), '../devgod'));",
        "process.stdout.write(JSON.stringify(auditMaintainerOnlyPackageJson(merged)));"
      ].join("\n")
    ],
    { cwd: repoRoot }
  );

  return JSON.parse(stdout);
}

async function evaluateScenario(prompt) {
  switch (prompt.trim()) {
    case "packlist-excludes-maintainer-only": {
      const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
      const leaks = auditMaintainerOnlyPublishedPaths(packageJson.files ?? []);
      return `status=${leaks.length === 0 ? "pass" : "fail"} check=packlist leaks=${leaks.length}`;
    }
    case "merge-package-json-excludes-maintainer-only": {
      const audit = await runTypescriptBoundaryAudit();
      return [
        `status=${audit.scriptLeaks.length === 0 && audit.devDependencyLeaks.length === 0 ? "pass" : "fail"}`,
        "check=merge-package-json",
        `scriptLeaks=${audit.scriptLeaks.length}`,
        `devDependencyLeaks=${audit.devDependencyLeaks.length}`
      ].join(" ");
    }
    case "sentinel-detects-maintainer-only-path": {
      const leaks = auditMaintainerOnlyPublishedPaths([
        "src/admin.ts",
        "docs/maintainers/quality-tooling.md",
        "evals/promptfoo/maintainer-boundary.promptfooconfig.yaml"
      ]);
      return `status=${leaks.length === 2 ? "pass" : "fail"} check=sentinel expectedLeaks=2 actualLeaks=${leaks.length}`;
    }
    default:
      throw new Error(`unknown maintainer-boundary scenario: ${prompt}`);
  }
}

export default class MaintainerBoundaryProvider {
  id() {
    return "devgod-maintainer-boundary";
  }

  async callApi(prompt) {
    return {
      output: await evaluateScenario(prompt)
    };
  }
}
