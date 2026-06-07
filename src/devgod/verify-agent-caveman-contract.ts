import path from "node:path";
import process from "node:process";
import { verifyAgentCatalogArtifacts } from "./agent-artifact-verifier.ts";

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const result = await verifyAgentCatalogArtifacts({ repoRoot });

  if (!result.ok) {
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
    process.exitCode = 1;
    return;
  }

  console.log(`agent caveman contract verified in ${repoRoot}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
