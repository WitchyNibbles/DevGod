import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  archiveOverlaySkill,
  archivedSkillsRoot,
  detectOverlaySkillDuplicates,
  evolveOverlaySkillFromTraces,
  evaluateOverlaySkill,
  explicitEvidenceRedactionPolicyRef,
  generateSkillPromotionArtifacts,
  suggestOverlaySkillPromotionReadiness,
  validateOverlaySkillDraft,
  writeOverlaySkillDraft
} from "../src/devgod/skill-evolution.ts";

const validSkill = [
  "---",
  "name: devgod-release-playbook",
  'description: "Repo-local release skill"',
  "---",
  "",
  "# Release Playbook",
  "",
  "Ship it carefully."
].join("\n");

test("writeOverlaySkillDraft writes overlay skills and guards evidence persistence behind the explicit redaction policy", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-overlay-"));

  try {
    await assert.rejects(
      writeOverlaySkillDraft({
        repoRoot,
        skillId: "devgod-release-playbook",
        content: validSkill,
        evidence: {
          summary: "raw execution transcript",
          refs: ["task://run/task"]
        }
      }),
      /persistEvidence=true/
    );

    const result = await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill,
      sourceTaskId: "2026-06-08-consuming-repo-skill-evolution-slice-1",
      evidence: {
        summary: "redacted release rehearsal",
        refs: ["task://run/task"],
        snippets: ["npm run typecheck"]
      },
      persistEvidence: true,
      redactionPolicyRef: explicitEvidenceRedactionPolicyRef,
      now: "2026-06-08T18:00:00.000Z"
    });

    assert.equal(result.overlaySkillPath, ".devgod/skills/overlay/devgod-release-playbook/SKILL.md");
    assert.equal(result.persistedEvidence, true);

    const index = JSON.parse(
      await readFile(path.join(repoRoot, ".devgod/skills/index.json"), "utf8")
    ) as { version: number; skills: Array<{ skillId: string; promotionStatus: string }> };
    assert.equal(index.version, 1);
    assert.deepEqual(index.skills.map(({ skillId, promotionStatus }) => ({ skillId, promotionStatus })), [
      {
        skillId: "devgod-release-playbook",
        promotionStatus: "draft"
      }
    ]);

    const evidence = JSON.parse(
      await readFile(path.join(repoRoot, ".devgod/skills/evidence/devgod-release-playbook/evidence.json"), "utf8")
    ) as { redactionPolicyRef: string; refs: string[] };
    assert.equal(evidence.redactionPolicyRef, explicitEvidenceRedactionPolicyRef);
    assert.deepEqual(evidence.refs, ["task://run/task"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validateOverlaySkillDraft reuses shared SKILL.md validation and rejects support files outside allowed directories", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-validate-"));

  try {
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill,
      supportFiles: [
        {
          relativePath: "references/checklist.md",
          content: "# Checklist\n"
        }
      ]
    });

    const valid = await validateOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook"
    });
    assert.equal(valid.ok, true);
    assert.deepEqual(valid.supportFiles, ["references/checklist.md"]);

    await mkdir(path.join(repoRoot, ".devgod/skills/overlay/devgod-release-playbook/private"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".devgod/skills/overlay/devgod-release-playbook/private/notes.md"),
      "not allowed\n",
      "utf8"
    );

    const invalid = await validateOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook"
    });
    assert.equal(invalid.ok, false);
    assert.match(invalid.issues.join("\n"), /must live under references, templates, scripts/i);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("generateSkillPromotionArtifacts creates a review packet and diff without mutating canonical skills", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-promotion-"));

  try {
    const canonicalPath = path.join(repoRoot, ".agents/skills/devgod-release-playbook/SKILL.md");
    await mkdir(path.dirname(canonicalPath), { recursive: true });
    await writeFile(
      canonicalPath,
      [
        "---",
        "name: devgod-release-playbook",
        'description: "Canonical release skill"',
        "---",
        "",
        "# Release Playbook",
        "",
        "Old guidance."
      ].join("\n"),
      "utf8"
    );

    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill,
      supportFiles: [
        {
          relativePath: "templates/release-checklist.md",
          content: "# Release checklist\n"
        }
      ],
      now: "2026-06-08T18:15:00.000Z"
    });

    const promotion = await generateSkillPromotionArtifacts({
      repoRoot,
      skillId: "devgod-release-playbook",
      now: "2026-06-08T18:30:45.000Z"
    });

    const packet = await readFile(path.join(repoRoot, promotion.packetPath), "utf8");
    const patch = await readFile(path.join(repoRoot, promotion.patchPath), "utf8");
    const canonicalAfter = await readFile(canonicalPath, "utf8");

    assert.equal(promotion.createdCanonicalSkill, false);
    assert.match(packet, /Promote overlay skill `devgod-release-playbook`/);
    assert.match(packet, /shared SKILL\.md validation passed/);
    assert.match(patch, /diff --git a\/\.agents\/skills\/devgod-release-playbook\/SKILL\.md b\/\.agents\/skills\/devgod-release-playbook\/SKILL\.md/);
    assert.match(patch, /\-Old guidance\./);
    assert.match(patch, /\+Ship it carefully\./);
    assert.match(canonicalAfter, /Old guidance\./);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("generateSkillPromotionArtifacts refuses to patch vendored-managed canonical skills", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-vendored-skill-promotion-"));

  try {
    const canonicalPath = path.join(repoRoot, ".agents/skills/devgod-api-design/SKILL.md");
    await mkdir(path.dirname(canonicalPath), { recursive: true });
    await writeFile(
      canonicalPath,
      [
        "---",
        "name: devgod-api-design",
        'description: "Vendored mirror of api-design: API skill"',
        "origin: devgod-vendored-skill",
        "upstream_skill: api-design",
        'upstream_path: "/tmp/api-design/SKILL.md"',
        "upstream_sha256: abc123",
        "synced_at: 2026-06-13T00:00:00.000Z",
        "---",
        "",
        "<!-- Managed by src/devgod/sync-vendored-skills.ts from api-design. -->",
        "",
        "# API Design",
        "",
        "Old vendored guidance."
      ].join("\n"),
      "utf8"
    );

    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-api-design",
      content: [
        "---",
        "name: devgod-api-design",
        'description: "Overlay API design update"',
        "---",
        "",
        "# API Design",
        "",
        "Local overlay guidance."
      ].join("\n")
    });

    await assert.rejects(
      generateSkillPromotionArtifacts({
        repoRoot,
        skillId: "devgod-api-design"
      }),
      /Cannot promote overlay skill over vendored-managed canonical skill devgod-api-design/
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("evaluateOverlaySkill records advisory replay results without mutating canonical skills", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-eval-"));

  try {
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill
    });

    const result = await evaluateOverlaySkill({
      repoRoot,
      skillId: "devgod-release-playbook",
      replayCases: [
        {
          prompt: "release checklist",
          expectedTerms: ["release", "playbook", "ship"]
        }
      ],
      now: "2026-06-08T19:00:00.000Z"
    });

    assert.equal(result.passed, true);
    assert.equal(result.score, 1);
    const index = JSON.parse(
      await readFile(path.join(repoRoot, ".devgod/skills/index.json"), "utf8")
    ) as {
      skills: Array<{
        skillId: string;
        lifecycleStatus?: string;
        lastEval?: { passed: boolean; score: number; evaluatedAt: string };
      }>;
    };
    assert.deepEqual(index.skills[0]?.lastEval, {
      passed: true,
      score: 1,
      summary: "Overlay skill devgod-release-playbook passed advisory local evaluation",
      evaluatedAt: "2026-06-08T19:00:00.000Z"
    });
    assert.equal(index.skills[0]?.lifecycleStatus, "active_local");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("detectOverlaySkillDuplicates reports advisory overlap against overlay and canonical skills", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-duplicates-"));

  try {
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill
    });
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-checklist",
      content: [
        "---",
        "name: devgod-release-checklist",
        'description: "Repo-local release checklist skill"',
        "---",
        "",
        "# Release Checklist",
        "",
        "Ship release playbook steps carefully."
      ].join("\n")
    });
    const canonicalPath = path.join(repoRoot, ".agents/skills/devgod-release-playbook/SKILL.md");
    await mkdir(path.dirname(canonicalPath), { recursive: true });
    await writeFile(
      canonicalPath,
      [
        "---",
        "name: devgod-release-playbook",
        'description: "Canonical release skill"',
        "---",
        "",
        "# Release Playbook",
        "",
        "Ship release tasks carefully."
      ].join("\n"),
      "utf8"
    );

    const duplicates = await detectOverlaySkillDuplicates({
      repoRoot,
      skillId: "devgod-release-playbook"
    });

    assert.equal(duplicates.length, 2);
    assert.ok(duplicates.some((duplicate) => duplicate.candidateKind === "canonical"));
    assert.ok(duplicates.some((duplicate) => duplicate.candidateKind === "overlay"));
    assert.ok(duplicates.every((duplicate) => duplicate.score >= 0.35));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("archiveOverlaySkill moves overlay content into a reversible archive path and marks the index entry archived", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-archive-"));

  try {
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill,
      supportFiles: [
        {
          relativePath: "references/checklist.md",
          content: "# Checklist\n"
        }
      ]
    });

    const result = await archiveOverlaySkill({
      repoRoot,
      skillId: "devgod-release-playbook",
      reason: "unused local draft",
      now: "2026-06-08T19:15:00.000Z"
    });

    assert.equal(
      result.archivePath,
      `${archivedSkillsRoot}/devgod-release-playbook-20260608191500`
    );
    const archivedSkill = await readFile(path.join(repoRoot, result.archivePath, "SKILL.md"), "utf8");
    assert.match(archivedSkill, /Ship it carefully/);

    const index = JSON.parse(
      await readFile(path.join(repoRoot, ".devgod/skills/index.json"), "utf8")
    ) as {
      skills: Array<{
        lifecycleStatus?: string;
        archive?: { archivePath: string; reason: string; archivedAt: string };
      }>;
    };
    assert.equal(index.skills[0]?.lifecycleStatus, "archived");
    assert.deepEqual(index.skills[0]?.archive, {
      archivePath: `${archivedSkillsRoot}/devgod-release-playbook-20260608191500`,
      reason: "unused local draft",
      archivedAt: "2026-06-08T19:15:00.000Z"
    });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("evolveOverlaySkillFromTraces appends bounded local trace notes from reviewed workflow artifacts and evidence", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-trace-mining-"));

  try {
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill,
      sourceTaskId: "2026-06-08-consuming-repo-skill-evolution-trace-mining",
      evidence: {
        summary: "redacted release rehearsal",
        refs: ["task://run/task"],
        snippets: ["npm run typecheck"]
      },
      persistEvidence: true,
      redactionPolicyRef: explicitEvidenceRedactionPolicyRef,
      now: "2026-06-08T20:00:00.000Z"
    });

    const reviewPath = path.join(
      repoRoot,
      ".devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-reviewer.md"
    );
    await mkdir(path.dirname(reviewPath), { recursive: true });
    await writeFile(
      reviewPath,
      [
        "# Review",
        "",
        "Task `2026-06-08-consuming-repo-skill-evolution-trace-mining` improved `devgod-release-playbook`.",
        "",
        "- verified `npm test`",
        "- verified `npm run typecheck`"
      ].join("\n"),
      "utf8"
    );

    const mined = await evolveOverlaySkillFromTraces({
      repoRoot,
      skillId: "devgod-release-playbook",
      now: "2026-06-08T20:15:00.000Z"
    });

    assert.equal(mined.updated, true);
    assert.deepEqual(mined.commandSnippets, ["npm run typecheck", "npm test"]);
    assert.deepEqual(mined.artifactRefs, [
      ".devgod/skills/evidence/devgod-release-playbook/evidence.json",
      ".devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-reviewer.md"
    ]);

    const evolvedSkill = await readFile(
      path.join(repoRoot, ".devgod/skills/overlay/devgod-release-playbook/SKILL.md"),
      "utf8"
    );
    assert.match(evolvedSkill, /## Local Trace Notes/);
    assert.match(evolvedSkill, /Repeat verified step: `npm run typecheck`/);
    assert.match(evolvedSkill, /Repeat verified step: `npm test`/);

    const index = JSON.parse(
      await readFile(path.join(repoRoot, ".devgod/skills/index.json"), "utf8")
    ) as {
      skills: Array<{
        lifecycleStatus?: string;
        lastTraceUpdate?: { artifactRefs: string[]; commandSnippets: string[]; notesAdded: string[] };
      }>;
    };
    assert.equal(index.skills[0]?.lifecycleStatus, "active_local");
    assert.deepEqual(index.skills[0]?.lastTraceUpdate, {
      minedAt: "2026-06-08T20:15:00.000Z",
      artifactRefs: [
        ".devgod/skills/evidence/devgod-release-playbook/evidence.json",
        ".devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-reviewer.md"
      ],
      commandSnippets: ["npm run typecheck", "npm test"],
      notesAdded: ["Repeat verified step: `npm run typecheck`", "Repeat verified step: `npm test`"]
    });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("suggestOverlaySkillPromotionReadiness records advisory promotion readiness from eval, traces, and duplicate state", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "devgod-skill-readiness-"));

  try {
    await writeOverlaySkillDraft({
      repoRoot,
      skillId: "devgod-release-playbook",
      content: validSkill,
      sourceTaskId: "2026-06-08-consuming-repo-skill-evolution-trace-mining"
    });

    const reviewPath = path.join(
      repoRoot,
      ".devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-reviewer.md"
    );
    await mkdir(path.dirname(reviewPath), { recursive: true });
    await writeFile(
      reviewPath,
      [
        "# Review",
        "",
        "Task `2026-06-08-consuming-repo-skill-evolution-trace-mining` improved `devgod-release-playbook`.",
        "",
        "- verified `npm test`"
      ].join("\n"),
      "utf8"
    );

    await evaluateOverlaySkill({
      repoRoot,
      skillId: "devgod-release-playbook",
      replayCases: [
        {
          prompt: "release checklist",
          expectedTerms: ["release", "playbook", "ship"]
        }
      ],
      now: "2026-06-08T20:30:00.000Z"
    });
    await evolveOverlaySkillFromTraces({
      repoRoot,
      skillId: "devgod-release-playbook",
      now: "2026-06-08T20:35:00.000Z"
    });

    const suggestion = await suggestOverlaySkillPromotionReadiness({
      repoRoot,
      skillId: "devgod-release-playbook",
      now: "2026-06-08T20:45:00.000Z"
    });

    assert.equal(suggestion.ready, true);
    assert.equal(suggestion.score, 1);
    assert.equal(suggestion.blockers.length, 0);
    assert.match(suggestion.summary, /ready for promotion review/);

    const index = JSON.parse(
      await readFile(path.join(repoRoot, ".devgod/skills/index.json"), "utf8")
    ) as {
      skills: Array<{
        promotionSuggestion?: {
          ready: boolean;
          score: number;
          summary: string;
          blockers: string[];
          suggestedAt: string;
        };
      }>;
    };
    assert.deepEqual(index.skills[0]?.promotionSuggestion, {
      ready: true,
      score: 1,
      summary: "Overlay skill devgod-release-playbook is ready for promotion review",
      reasons: [
        "shared SKILL.md validation still passes",
        "latest advisory replay evaluation passed at score 1",
        "1 trace-informed command snippets were mined",
        "no advisory duplicate conflicts were found"
      ],
      blockers: [],
      suggestedAt: "2026-06-08T20:45:00.000Z"
    });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
