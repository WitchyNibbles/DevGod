import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyAgentCatalogArtifacts } from "./agent-artifact-verifier.ts";
import { verifyRootCavemanPolicyContract } from "./caveman-policy.ts";

async function verifyPolicySurface(repoRoot: string, relativePath: string): Promise<string[]> {
  try {
    const content = await readFile(path.join(repoRoot, relativePath), "utf8");
    const result = verifyRootCavemanPolicyContract(content);
    const failures: string[] = [];
    if (result.missingPatterns.length > 0) {
      failures.push(`${relativePath}: missing root caveman policy ${result.missingPatterns.join("; ")}`);
    }
    if (result.forbiddenPatterns.length > 0) {
      failures.push(`${relativePath}: forbidden root caveman policy ${result.forbiddenPatterns.join("; ")}`);
    }
    return failures;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const result = await verifyAgentCatalogArtifacts({ repoRoot });
  const policyMismatches = (
    await Promise.all(
      ["AGENTS.md", ".agents.md", "README.md"].map((relativePath) =>
        verifyPolicySurface(repoRoot, relativePath)
      )
    )
  ).flat();

  if (!result.ok || policyMismatches.length > 0) {
    for (const item of result.missingArtifacts) {
      console.error(`missing agent artifact: ${item}`);
    }
    for (const item of result.unexpectedArtifacts) {
      console.error(`unexpected agent artifact: ${item}`);
    }
    for (const item of result.metadataMismatches) {
      console.error(`agent metadata drift: ${item}`);
    }
    for (const item of result.cavemanContractMismatches) {
      console.error(`agent caveman drift: ${item}`);
    }
    for (const item of policyMismatches) {
      console.error(`policy caveman drift: ${item}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`agent caveman contract verified in ${repoRoot}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
