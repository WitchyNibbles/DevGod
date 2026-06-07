import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyPackageFileEntries } from "./package-surface.ts";

interface PackageJsonShape {
  files?: unknown;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

async function main(): Promise<void> {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJsonShape;
  const verification = verifyPackageFileEntries(asStringArray(pkg.files));

  if (verification.ok) {
    console.log("package surface verified");
    return;
  }

  const details = [
    verification.missingEntries.length > 0
      ? `missing: ${verification.missingEntries.join(", ")}`
      : null,
    verification.unexpectedEntries.length > 0
      ? `unexpected: ${verification.unexpectedEntries.join(", ")}`
      : null,
    verification.duplicateEntries.length > 0
      ? `duplicates: ${verification.duplicateEntries.join(", ")}`
      : null
  ].filter((line): line is string => line !== null);

  throw new Error(`package.json files drifted from canonical package surface\n${details.join("\n")}`);
}

await main();
