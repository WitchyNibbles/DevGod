import path from "node:path";
import process from "node:process";
import { syncVendoredSkills } from "./vendored-skills.ts";

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const writtenPaths = await syncVendoredSkills({ repoRoot });
  console.log(`vendored skills synced: ${writtenPaths.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
