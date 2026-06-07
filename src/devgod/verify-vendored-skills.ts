import path from "node:path";
import process from "node:process";
import { verifyVendoredSkills } from "./vendored-skills.ts";

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const issues = await verifyVendoredSkills({ repoRoot });

  if (issues.length === 0) {
    console.log(`vendored skills verified in ${repoRoot}`);
    return;
  }

  for (const issue of issues) {
    console.error(`${issue.localSkillId}: ${issue.problem}`);
  }
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
