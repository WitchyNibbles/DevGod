import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "@iarna/toml";
import {
  agentCatalogEntries,
  agentRoleIds,
  type AgentRoleId,
  getAgentCatalogEntry
} from "./agent-catalog.ts";
import {
  cavemanDirectUserFacingExceptionRoleIds,
  verifyNonUserFacingAgentCavemanContract
} from "./caveman-policy.ts";
import { listCatalogRepoLocalSkillEntries, listCatalogRepoLocalSkillPaths } from "./repo-local-skill-surface.ts";
import { parseSkillDocument, validateSkillDocument, vendoredSkillEntries } from "./vendored-skills.ts";

export interface AgentArtifactVerificationResult {
  ok: boolean;
  missingArtifacts: string[];
  unexpectedArtifacts: string[];
  metadataMismatches: string[];
  cavemanContractMismatches: string[];
}

export interface CatalogRepoLocalSkillVerificationResult {
  ok: boolean;
  missingSkillFiles: string[];
  skillContractMismatches: string[];
}

const vendoredSkillEntriesByLocalId = new Map(
  vendoredSkillEntries.map((entry) => [entry.localSkillId, entry])
);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function normalizeManagedText(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function shippedRepoLocalSkillAbsolutePath(relativePath: string): string {
  return path.join(packageRoot, relativePath);
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
  const cavemanContractMismatches: string[] = [];
  for (const role of roles) {
    const entry = getAgentCatalogEntry(role);
    if (!entry.shipsAgentArtifact || !actualSet.has(entry.artifactPath)) {
      continue;
    }

    const rawToml = await readFile(path.join(input.repoRoot, entry.artifactPath), "utf8");
    const parsed = parseToml(rawToml) as { name?: string; developer_instructions?: string };
    if (parsed.name !== role) {
      metadataMismatches.push(
        `${entry.artifactPath}: expected name "${role}", got ${JSON.stringify(parsed.name ?? null)}`
      );
    }

    if (!cavemanDirectUserFacingExceptionRoleIds.includes(role)) {
      const cavemanResult = verifyNonUserFacingAgentCavemanContract(parsed.developer_instructions);
      if (cavemanResult.missingMarkers.length > 0) {
        cavemanContractMismatches.push(
          `${entry.artifactPath}: missing caveman markers ${cavemanResult.missingMarkers.join("; ")}`
        );
      }
      if (cavemanResult.contradictionPhrases.length > 0) {
        cavemanContractMismatches.push(
          `${entry.artifactPath}: contradictory caveman phrases ${cavemanResult.contradictionPhrases.join("; ")}`
        );
      }
    }
  }

  return {
    ok:
      missingArtifacts.length === 0 &&
      unexpectedArtifacts.length === 0 &&
      metadataMismatches.length === 0 &&
      cavemanContractMismatches.length === 0,
    missingArtifacts,
    unexpectedArtifacts,
    metadataMismatches,
    cavemanContractMismatches
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
  const expectedSkillEntries = listCatalogRepoLocalSkillEntries({ roles: input.roles });
  const missingSkillFiles: string[] = [];
  const skillContractMismatches: string[] = [];

  for (const entry of expectedSkillEntries) {
    let content: string;
    let shippedContent: string;
    try {
      content = await readFile(path.join(input.repoRoot, entry.path), "utf8");
    } catch {
      missingSkillFiles.push(entry.path);
      continue;
    }
    try {
      shippedContent = await readFile(shippedRepoLocalSkillAbsolutePath(entry.path), "utf8");
    } catch {
      skillContractMismatches.push(`${entry.path}: missing shipped repo-local skill template`);
      continue;
    }

    if (normalizeManagedText(content) !== normalizeManagedText(shippedContent)) {
      skillContractMismatches.push(`${entry.path}: content drift from shipped repo-local skill template`);
    }

    const validationIssues = validateSkillDocument(content, { expectedName: entry.skillId });
    if (validationIssues.length > 0) {
      skillContractMismatches.push(`${entry.path}: ${validationIssues.join("; ")}`);
      continue;
    }

    const parsed = parseSkillDocument(content);
    if (entry.origin === "devgod_vendored") {
      const vendoredEntry = vendoredSkillEntriesByLocalId.get(entry.skillId);
      const hasExpectedVendoredMetadata =
        parsed.frontmatter.origin === "devgod-vendored-skill" &&
        parsed.frontmatter.upstream_skill === vendoredEntry?.upstreamSkillId &&
        Boolean(parsed.frontmatter.upstream_sha256);
      if (!hasExpectedVendoredMetadata) {
        skillContractMismatches.push(`${entry.path}: expected vendored skill metadata`);
      }
      continue;
    }

    const bodyHasRepoLocalGuidance = /\b(Use|Goal|Rules|Output|When to use|Do not)\b/i.test(parsed.body);
    if (parsed.frontmatter.origin === "devgod-vendored-skill" || !bodyHasRepoLocalGuidance) {
      skillContractMismatches.push(`${entry.path}: expected non-vendored repo-local skill guidance`);
    }
  }

  return {
    ok: missingSkillFiles.length === 0 && skillContractMismatches.length === 0,
    missingSkillFiles,
    skillContractMismatches
  };
}
