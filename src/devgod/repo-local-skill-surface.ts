import path from "node:path";
import { agentRoleIds, getAgentCatalogEntry, type AgentRoleId } from "./agent-catalog.ts";
import { vendoredSkillEntries } from "./vendored-skills.ts";

export const repoLocalSkillIdPrefixes = ["devgod-", "anthropic-", "superpowers-"] as const;
export const alwaysShippedRepoLocalSkillIds = [
  "caveman",
  "devgod-autopilot",
  "devgod-repair-loop"
] as const;

export type RepoLocalSkillOrigin =
  | "devgod_core"
  | "devgod_vendored"
  | "anthropic_plugin"
  | "superpowers_plugin";

export interface CatalogRepoLocalSkillEntry {
  skillId: string;
  path: string;
  origin: RepoLocalSkillOrigin;
}

const vendoredLocalSkillIds = new Set(vendoredSkillEntries.map((entry) => entry.localSkillId));

export function classifyRepoLocalSkillId(skillId: string): RepoLocalSkillOrigin | undefined {
  if (vendoredLocalSkillIds.has(skillId)) {
    return "devgod_vendored";
  }
  if (skillId === "caveman" || skillId.startsWith("devgod-")) {
    return "devgod_core";
  }
  if (skillId.startsWith("anthropic-")) {
    return "anthropic_plugin";
  }
  if (skillId.startsWith("superpowers-")) {
    return "superpowers_plugin";
  }
  return undefined;
}

export function isRepoLocalSkillId(skillId: string): boolean {
  return classifyRepoLocalSkillId(skillId) !== undefined;
}

export function repoLocalSkillPathForId(skillId: string): string {
  return path.posix.join(".agents/skills", skillId, "SKILL.md");
}

export function listCatalogRepoLocalSkillEntries(input?: {
  roles?: readonly AgentRoleId[] | undefined;
}): CatalogRepoLocalSkillEntry[] {
  const roles = input?.roles?.length ? [...input.roles] : [...agentRoleIds];
  const expectedSkills = new Map<string, CatalogRepoLocalSkillEntry>();

  for (const role of roles) {
    for (const skillId of getAgentCatalogEntry(role).defaultSkillIds) {
      const origin = classifyRepoLocalSkillId(skillId);
      if (!origin) {
        continue;
      }
      expectedSkills.set(skillId, {
        skillId,
        path: repoLocalSkillPathForId(skillId),
        origin
      });
    }
  }

  for (const skillId of alwaysShippedRepoLocalSkillIds) {
    const origin = classifyRepoLocalSkillId(skillId);
    if (!origin) {
      continue;
    }
    expectedSkills.set(skillId, {
      skillId,
      path: repoLocalSkillPathForId(skillId),
      origin
    });
  }

  return [...expectedSkills.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function listCatalogRepoLocalSkillPaths(input?: {
  roles?: readonly AgentRoleId[] | undefined;
}): string[] {
  return listCatalogRepoLocalSkillEntries(input).map((entry) => entry.path);
}
