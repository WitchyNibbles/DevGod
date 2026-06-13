import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  classifyRepoLocalSkillId,
  listCatalogRepoLocalSkillEntries,
  listCatalogRepoLocalSkillPaths
} from "../src/devgod/repo-local-skill-surface.ts";
import { verifyCatalogRepoLocalSkills } from "../src/devgod/agent-artifact-verifier.ts";
import {
  defaultVendoredSkillSourceRoots,
  parseSkillDocument,
  renderVendoredSkillDocument,
  syncVendoredSkills,
  vendoredSkillEntries,
  verifyVendoredSkills
} from "../src/devgod/vendored-skills.ts";

test("vendored skill manifest stays explicit", () => {
  assert.ok(vendoredSkillEntries.length >= 21);
  assert.ok(vendoredSkillEntries.every((entry) => entry.localSkillId.startsWith("devgod-")));
  assert.ok(vendoredSkillEntries.every((entry) => entry.sourceKind === "core"));
  assert.equal(new Set(vendoredSkillEntries.map((entry) => entry.localSkillId)).size, vendoredSkillEntries.length);
  assert.equal(new Set(vendoredSkillEntries.map((entry) => entry.upstreamSkillId)).size, vendoredSkillEntries.length);
  assert.ok(vendoredSkillEntries.every((entry) => !entry.localSkillId.startsWith("anthropic-")));
  assert.ok(vendoredSkillEntries.every((entry) => !entry.localSkillId.startsWith("superpowers-")));
});

test("repo-local skill surface separates core, vendored, and plugin wrapper skills", () => {
  assert.equal(classifyRepoLocalSkillId("devgod-intake"), "devgod_core");
  assert.equal(classifyRepoLocalSkillId("devgod-api-design"), "devgod_vendored");
  assert.equal(classifyRepoLocalSkillId("anthropic-webapp-testing"), "anthropic_plugin");
  assert.equal(classifyRepoLocalSkillId("superpowers-test-driven-development"), "superpowers_plugin");
  assert.equal(classifyRepoLocalSkillId("external-tool"), undefined);

  const entries = listCatalogRepoLocalSkillEntries({
    roles: ["planner", "qa_engineer", "tdd-guide", "solution_architect", "backend_engineer"]
  });
  const paths = listCatalogRepoLocalSkillPaths({
    roles: ["planner", "qa_engineer", "tdd-guide", "solution_architect", "backend_engineer"]
  });

  assert.deepEqual(entries.map((entry) => entry.path).sort(), paths);
  assert.ok(entries.some((entry) => entry.skillId === "devgod-intake" && entry.origin === "devgod_core"));
  assert.ok(entries.some((entry) => entry.skillId === "devgod-api-design" && entry.origin === "devgod_vendored"));
  assert.ok(entries.some((entry) => entry.skillId === "anthropic-webapp-testing" && entry.origin === "anthropic_plugin"));
  assert.ok(entries.some((entry) => entry.skillId === "superpowers-test-driven-development" && entry.origin === "superpowers_plugin"));
});

test("catalog repo-local skill verification rejects placeholder wrappers without provenance", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-catalog-contract-"));

  try {
    for (const entry of listCatalogRepoLocalSkillEntries({ roles: ["planner", "backend_engineer"] })) {
      const targetPath = path.join(repoRoot, entry.path);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(
        targetPath,
        [
          "---",
          `name: ${entry.skillId}`,
          'description: "Placeholder wrapper"',
          "---",
          "",
          "# Placeholder",
          "",
          "Temporary content"
        ].join("\n"),
        "utf8"
      );
    }

    const result = await verifyCatalogRepoLocalSkills({
      repoRoot,
      roles: ["planner", "backend_engineer"]
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.missingSkillFiles, []);
    assert.ok(
      result.skillContractMismatches.some((issue) =>
        issue.includes(".agents/skills/devgod-api-design/SKILL.md: content drift from shipped repo-local skill template")
      )
    );
    assert.ok(
      result.skillContractMismatches.some((issue) =>
        issue.includes(".agents/skills/devgod-api-design/SKILL.md: expected vendored skill metadata")
      )
    );
    assert.ok(
      result.skillContractMismatches.some((issue) =>
        issue.includes(".agents/skills/devgod-intake/SKILL.md: expected non-vendored repo-local skill")
      )
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("defaultVendoredSkillSourceRoots honors the explicit env override", () => {
  const previous = process.env.DEVGOD_VENDORED_SKILL_SOURCE_ROOTS;
  process.env.DEVGOD_VENDORED_SKILL_SOURCE_ROOTS = ["/tmp/a", "/tmp/b"].join(path.delimiter);
  try {
    assert.deepEqual(defaultVendoredSkillSourceRoots(), ["/tmp/a", "/tmp/b"]);
  } finally {
    if (previous === undefined) {
      delete process.env.DEVGOD_VENDORED_SKILL_SOURCE_ROOTS;
    } else {
      process.env.DEVGOD_VENDORED_SKILL_SOURCE_ROOTS = previous;
    }
  }
});

test("renderVendoredSkillDocument stamps upstream metadata and preserves upstream body", () => {
  const rendered = renderVendoredSkillDocument({
    localSkillId: "devgod-api-design",
    upstreamSkillId: "api-design",
    sourcePath: "/tmp/api-design/SKILL.md",
    sourceContent: [
      "---",
      "name: api-design",
      'description: "API skill"',
      "---",
      "",
      "# Body",
      "",
      "Hello"
    ].join("\n"),
    syncedAt: "2026-06-07T00:00:00.000Z"
  });

  const parsed = parseSkillDocument(rendered);
  assert.equal(parsed.frontmatter.name, "devgod-api-design");
  assert.equal(parsed.frontmatter.upstream_skill, "api-design");
  assert.equal(parsed.frontmatter.synced_at, "2026-06-07T00:00:00.000Z");
  assert.match(parsed.body, /# Body/);
  assert.match(parsed.body, /Hello/);
});

test("syncVendoredSkills writes generated repo-local mirrors and verifyVendoredSkills detects drift", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-vendored-repo-"));
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-vendored-source-"));

  try {
    for (const entry of vendoredSkillEntries) {
      const targetPath = path.join(sourceRoot, entry.upstreamSkillId, "SKILL.md");
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(
        targetPath,
        [
          "---",
          `name: ${entry.upstreamSkillId}`,
          `description: ${JSON.stringify(`${entry.upstreamSkillId} description`)}`,
          "---",
          "",
          `# ${entry.upstreamSkillId}`,
          "",
          "Sample body"
        ].join("\n"),
        "utf8"
      );
    }

    const writtenPaths = await syncVendoredSkills({
      repoRoot,
      sourceRoots: [sourceRoot],
      now: "2026-06-07T00:00:00.000Z"
    });
    assert.equal(writtenPaths.length, vendoredSkillEntries.length);

    const examplePath = path.join(repoRoot, ".agents", "skills", "devgod-api-design", "SKILL.md");
    const exampleContent = await readFile(examplePath, "utf8");
    assert.match(exampleContent, /upstream_skill: api-design/);
    assert.match(exampleContent, /Sample body/);

    assert.deepEqual(
      await verifyVendoredSkills({ repoRoot, sourceRoots: [sourceRoot] }),
      []
    );

    await writeFile(
      examplePath,
      exampleContent.replace(
        JSON.stringify(path.join(sourceRoot, "api-design", "SKILL.md")),
        JSON.stringify("/tmp/forged/api-design/SKILL.md")
      ),
      "utf8"
    );

    const upstreamPathIssues = await verifyVendoredSkills({ repoRoot, sourceRoots: [sourceRoot] });
    assert.ok(
      upstreamPathIssues.some(
        (issue) =>
          issue.localSkillId === "devgod-api-design" &&
          issue.problem.includes("frontmatter upstream_path mismatch")
      )
    );

    await syncVendoredSkills({
      repoRoot,
      sourceRoots: [sourceRoot],
      now: "2026-06-07T00:00:00.000Z"
    });

    await writeFile(
      examplePath,
      exampleContent.replace("Sample body", "Locally edited body"),
      "utf8"
    );

    const localDriftIssues = await verifyVendoredSkills({ repoRoot, sourceRoots: [sourceRoot] });
    assert.ok(
      localDriftIssues.some(
        (issue) =>
          issue.localSkillId === "devgod-api-design" &&
          issue.problem.includes("managed render drift")
      )
    );

    await syncVendoredSkills({
      repoRoot,
      sourceRoots: [sourceRoot],
      now: "2026-06-07T00:00:00.000Z"
    });

    await writeFile(
      path.join(sourceRoot, "api-design", "SKILL.md"),
      [
        "---",
        "name: api-design",
        'description: "API skill changed"',
        "---",
        "",
        "# api-design",
        "",
        "Changed body"
      ].join("\n"),
      "utf8"
    );

    const issues = await verifyVendoredSkills({ repoRoot, sourceRoots: [sourceRoot] });
    assert.ok(issues.some((issue) => issue.localSkillId === "devgod-api-design"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  }
});
