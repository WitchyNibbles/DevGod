import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "@iarna/toml";
import {
  agentCatalogEntries,
  agentRoleIds,
  type AgentRoleId,
  getAgentCatalogEntry
} from "./agent-catalog.ts";
import { listCatalogRepoLocalSkillPaths } from "./repo-local-skill-surface.ts";

export interface AgentArtifactVerificationResult {
  ok: boolean;
  missingArtifacts: string[];
  unexpectedArtifacts: string[];
  metadataMismatches: string[];
}

export interface CatalogRepoLocalSkillVerificationResult {
  ok: boolean;
  missingSkillFiles: string[];
}

export async function verifyAgentCatalogArtifacts(input: {
  repoRoot: string;
  roles?: readonly AgentRoleId[] | undefined;
}): Promise<AgentArtifactVerificationResult> {
  const roles = input.roles?.length ? [...input.roles] : [...agentRoleIds];
  const expectedArtifactPaths = roles
    .filter((role) => getAgentCatalogEntry(role).shipsAgentArtifact)
    .map((role) => getAgentCatalogEntry(role).artifactPath)
    .sort();

  const agentsRoot = path.join(input.repoRoot, ".codex", "agents");
  let actualFiles: string[] = [];
  try {
    const entries = await readdir(agentsRoot, { withFileTypes: true });
    actualFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".toml"))
      .map((entry) => path.posix.join(".codex/agents", entry.name))
      .sort();
  } catch {
    actualFiles = [];
  }

  const expectedSet = new Set<string>(expectedArtifactPaths);
  const actualSet = new Set<string>(actualFiles);
  const missingArtifacts = expectedArtifactPaths.filter((artifactPath) => !actualSet.has(artifactPath));
  const unexpectedArtifacts = actualFiles.filter((artifactPath) => !expectedSet.has(artifactPath));

  const metadataMismatches: string[] = [];
  for (const role of roles) {
    const entry = getAgentCatalogEntry(role);
    if (!entry.shipsAgentArtifact || !actualSet.has(entry.artifactPath)) {
      continue;
    }

    const rawToml = await readFile(path.join(input.repoRoot, entry.artifactPath), "utf8");
    const parsed = parseToml(rawToml) as { name?: string };
    if (parsed.name !== role) {
      metadataMismatches.push(
        `${entry.artifactPath}: expected name "${role}", got ${JSON.stringify(parsed.name ?? null)}`
      );
    }
  }

  return {
    ok: missingArtifacts.length === 0 && unexpectedArtifacts.length === 0 && metadataMismatches.length === 0,
    missingArtifacts,
    unexpectedArtifacts,
    metadataMismatches
  };
}

export function listCatalogAgentArtifactPaths(input?: {
  roles?: readonly AgentRoleId[] | undefined;
}): string[] {
  const roles = input?.roles?.length ? [...input.roles] : [...agentRoleIds];
  return roles
    .filter((role) => getAgentCatalogEntry(role).shipsAgentArtifact)
    .map((role) => getAgentCatalogEntry(role).artifactPath)
    .sort();
}

export function listCatalogAgentRoles(): AgentRoleId[] {
  return [...agentRoleIds];
}

export function listCatalogShippedAgentEntries(): typeof agentCatalogEntries {
  return agentCatalogEntries.filter((entry) => entry.shipsAgentArtifact);
}

export async function verifyCatalogRepoLocalSkills(input: {
  repoRoot: string;
  roles?: readonly AgentRoleId[] | undefined;
}): Promise<CatalogRepoLocalSkillVerificationResult> {
  const expectedSkillFiles = listCatalogRepoLocalSkillPaths({ roles: input.roles });
  const missingSkillFiles: string[] = [];

  for (const relativePath of expectedSkillFiles) {
    try {
      await readFile(path.join(input.repoRoot, relativePath), "utf8");
    } catch {
      missingSkillFiles.push(relativePath);
    }
  }

  return {
    ok: missingSkillFiles.length === 0,
    missingSkillFiles
  };
}
