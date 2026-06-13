import { listCatalogAgentArtifactPaths } from "./agent-artifact-verifier.ts";
import { listCatalogRepoLocalSkillPaths } from "./repo-local-skill-surface.ts";

const shippedPackageBootstrapEntries = [
  ".githooks/",
  ".codex/config.toml",
  ".codex/hooks.json",
  ".devgod/memory/README.md",
  ".devgod/playwright/",
  ".devgod/rules/",
  ".devgod/templates/",
  ".devgod/work/README.md",
  ".devgod/work/briefs/README.md",
  ".devgod/work/plans/README.md",
  ".devgod/work/release/README.md",
  ".devgod/work/reviews/README.md",
  ".devgod/work/tasks/README.md",
  ".env.example",
  "AGENTS.md",
  "README.md",
  "docker-compose.yml"
] as const;

const shippedPackageOperatorDocsEntries = [
  "docs/autonomous-execution-redesign.md",
  "docs/benchmarks/frontier-model-benchmark.md",
  "docs/benchmarks/orchestration-benchmark.md",
  "docs/devgod-agent-team.md",
  "docs/global-setup.md"
] as const;

const shippedPackagePluginRuntimeEntries = [
  "plugins/caveman/.codex-plugin/plugin.json",
  "plugins/caveman/skills/caveman/SKILL.md",
  "plugins/devgod/.codex-plugin/plugin.json",
  "plugins/devgod/hooks/hooks.json",
  "plugins/devgod/scripts/hook-policy.mjs",
  "plugins/devgod/scripts/hook-utils.mjs",
  "plugins/devgod/scripts/permission-request.mjs",
  "plugins/devgod/scripts/post-tool-use.mjs",
  "plugins/devgod/scripts/pre-tool-use.mjs",
  "plugins/devgod/scripts/session-start.mjs",
  "plugins/devgod/scripts/stop.mjs",
  "plugins/devgod/scripts/user-prompt-submit.mjs"
] as const;

const shippedPackagePublishedEntrypointEntries = [
  "dist/"
] as const;

const shippedPackageOperatorScriptEntries = [
  "scripts/check-devgod-branch-name.sh",
  "scripts/check-devgod-commit-msg.sh",
  "scripts/check-devgod-git-guard.sh",
  "scripts/check-devgod-happy-path.sh",
  "scripts/check-devgod-workflow-live.sh",
  "scripts/check-devgod-workflow.sh",
  "scripts/check-quality.sh",
  "scripts/devgod-session-start.sh",
  "scripts/install-devgod.ps1",
  "scripts/install-devgod.sh",
  "scripts/setup-devgod.ps1",
  "scripts/setup-devgod.sh",
  "scripts/verify-devgod-workflow-check.sh",
  "scripts/verify-release-overlay.sh"
] as const;

const shippedPackageRuntimeSourceEntries = [
  "src/admin.ts",
  "src/admin/",
  "src/core/",
  "src/devgod/",
  "src/docs-export/",
  "src/domain/",
  "src/evals/orchestration-baseline.ts",
  "src/evals/orchestration-benchmark.ts",
  "src/evals/retrieval-memory-baseline.ts",
  "src/grafana/",
  "src/index.ts",
  "src/install/cli.ts",
  "src/install/git-guard.ts",
  "src/install/merge.ts",
  "src/install/setup-graphify.ts",
  "src/install/setup-git-guard.ts",
  "src/install/setup-graphify-codex.ts",
  "src/install/setup-local.ts",
  "src/install/setup-playwright.ts",
  "src/install/types.ts",
  "src/install/verify-git-guard.ts",
  "src/mcp/",
  "src/public.ts",
  "src/runtime/",
  "src/sql/migrations/",
  "src/store/",
  "src/ui/"
] as const;

export interface CanonicalPackageOwnershipGroup {
  id: string;
  title: string;
  rationale: string;
  entries: string[];
}

function listShippedPackageStaticOwnershipGroups(): CanonicalPackageOwnershipGroup[] {
  return [
    {
      id: "bootstrap",
      title: "Bootstrap and shared overlay scaffolding",
      rationale: "Files required to bootstrap, configure, and persist the downstream shared overlay.",
      entries: [...shippedPackageBootstrapEntries]
    },
    {
      id: "operator_docs",
      title: "Operator-facing shipped documentation",
      rationale: "Docs intentionally shipped because downstream installs need them during setup or operation.",
      entries: [...shippedPackageOperatorDocsEntries]
    },
    {
      id: "plugin_runtime",
      title: "Codex plugin runtime assets",
      rationale: "Plugin descriptors and hook entrypoints that power the shipped control-layer behavior.",
      entries: [...shippedPackagePluginRuntimeEntries]
    },
    {
      id: "published_entrypoints",
      title: "Published JavaScript entrypoints",
      rationale: "Stable runtime JS entrypoints that installed consumers execute through package exports and bin metadata.",
      entries: [...shippedPackagePublishedEntrypointEntries]
    },
    {
      id: "operator_scripts",
      title: "Operator commands and verification scripts",
      rationale: "Executable scripts that downstream repos run directly for setup, checks, or release-safety verification.",
      entries: [...shippedPackageOperatorScriptEntries]
    },
    {
      id: "runtime_sources",
      title: "Runtime and install source modules",
      rationale: "TypeScript entrypoints and modules intentionally shipped because install and runtime commands execute them from the package.",
      entries: [...shippedPackageRuntimeSourceEntries]
    }
  ];
}

export function listCanonicalPackageOwnershipGroups(): CanonicalPackageOwnershipGroup[] {
  return [
    ...listShippedPackageStaticOwnershipGroups(),
    {
      id: "repo_local_skills",
      title: "Repo-local skill surfaces",
      rationale: "Repo-local skills ship when the agent catalog references them by default or when package policy marks them always shipped.",
      entries: listCatalogRepoLocalSkillPaths()
    },
    {
      id: "agent_artifacts",
      title: "Shipped agent artifacts",
      rationale: "Agent TOML artifacts ship when the agent catalog marks the role as publishing a downstream artifact.",
      entries: listCatalogAgentArtifactPaths()
    }
  ];
}

export interface PackageSurfaceVerificationResult {
  ok: boolean;
  missingEntries: string[];
  unexpectedEntries: string[];
  duplicateEntries: string[];
}

export function listCanonicalPackageFileEntries(): string[] {
  return [...new Set(
    listCanonicalPackageOwnershipGroups().flatMap((group) => group.entries)
  )].sort();
}

export function verifyPackageFileEntries(actualEntries: readonly string[]): PackageSurfaceVerificationResult {
  const expectedEntries = listCanonicalPackageFileEntries();
  const actualSortedEntries = [...actualEntries].sort();
  const expectedSet = new Set(expectedEntries);
  const actualSet = new Set(actualSortedEntries);
  const seen = new Set<string>();
  const duplicateEntries = actualSortedEntries.filter((entry) => {
    if (seen.has(entry)) {
      return true;
    }
    seen.add(entry);
    return false;
  });

  return {
    ok: duplicateEntries.length === 0 &&
      expectedEntries.every((entry) => actualSet.has(entry)) &&
      actualSortedEntries.every((entry) => expectedSet.has(entry)),
    missingEntries: expectedEntries.filter((entry) => !actualSet.has(entry)),
    unexpectedEntries: actualSortedEntries.filter((entry) => !expectedSet.has(entry)),
    duplicateEntries
  };
}
