import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
