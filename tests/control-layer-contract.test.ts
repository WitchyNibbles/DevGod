import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(sourceRoot, relativePath), "utf8");
}

test("devgod intake guidance requires clarification and explicit assumptions", async () => {
  const skill = await read(".agents/skills/devgod-intake/SKILL.md");

  assert.match(skill, /Ask concise clarifying questions before planning/i);
  assert.match(skill, /state the operating assumptions explicitly/i);
  assert.match(skill, /Treat refactors as behavior-preserving improvement work/i);
});

test("devgod autopilot guidance keeps iterating until verified completion", async () => {
  const skill = await read(".agents/skills/devgod-autopilot/SKILL.md");

  assert.match(skill, /Do not wait for the user to say "continue"/i);
  assert.match(skill, /including good-path and bad-path coverage/i);
  assert.match(skill, /never stop after a single passing command/i);
});

test("workflow templates encode clarification, regression, and risk-closure expectations", async () => {
  const intakeBrief = await read(".devgod/templates/intake-brief.md");
  const taskPacket = await read(".devgod/templates/task-packet.md");
  const qualityMatrix = await read(".devgod/rules/task-quality-matrix.md");
  const reasoningQuality = await read(".devgod/rules/reasoning-quality.md");

  assert.match(intakeBrief, /## Clarifying questions/);
  assert.match(intakeBrief, /## Assumptions/);
  assert.match(intakeBrief, /## Reasoning quality/);
  assert.match(intakeBrief, /## Bad-path or edge-case outcomes/);

  assert.match(taskPacket, /`regression_safety_required`/);
  assert.match(taskPacket, /## Behavior to preserve/);
  assert.match(taskPacket, /## Reasoning quality/);
  assert.match(taskPacket, /## Reasoning policy/);
  assert.match(taskPacket, /## Reasoning attempts/);
  assert.match(taskPacket, /## Bad-path or edge-case checks/);
  assert.match(taskPacket, /## Residual risk disposition/);

  assert.match(qualityMatrix, /refactors and rewrites must preserve intended behavior/i);
  assert.match(qualityMatrix, /### `regression_safety_required`/);
  assert.match(qualityMatrix, /### `reasoning_strict_required`/);
  assert.match(qualityMatrix, /discovered `CRITICAL` or `HIGH` defects in touched scope/i);
  assert.match(reasoningQuality, /facts, assumptions, and guesses/i);
  assert.match(reasoningQuality, /multiple plausible hypotheses/i);
  assert.match(reasoningQuality, /strict is the default reasoning mode/i);
  assert.match(reasoningQuality, /dual mode is the migration bridge/i);
  assert.match(reasoningQuality, /bounded research, debug, and review budgets/i);
});

test("reasoning-quality skills call for bounded skepticism and evidence discipline", async () => {
  const debugging = await read(".agents/skills/devgod-debugging/SKILL.md");
  const planning = await read(".agents/skills/devgod-planning/SKILL.md");
  const review = await read(".agents/skills/devgod-review/SKILL.md");
  const docsResearch = await read(".agents/skills/devgod-docs-research/SKILL.md");

  assert.match(debugging, /next most plausible hypothesis/i);
  assert.match(debugging, /debug budget/i);
  assert.match(planning, /reasoning-quality section/i);
  assert.match(planning, /strict.*default/i);
  assert.match(review, /low-confidence conclusions/i);
  assert.match(review, /unsupported reasoning verdicts/i);
  assert.match(docsResearch, /unresolved drift/i);
});
