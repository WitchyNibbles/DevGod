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

  assert.match(skill, /Ask (1-4 )?concise clarifying questions before planning/i);
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
  assert.match(taskPacket, /`council_review_required`/);
  assert.match(taskPacket, /`coverage_ledger_required`/);
  assert.match(taskPacket, /`progress_proof_required`/);
  assert.match(taskPacket, /`checkpoint_resume_required`/);
  assert.match(taskPacket, /## Behavior to preserve/);
  assert.match(taskPacket, /## Reasoning quality/);
  assert.match(taskPacket, /## Reasoning policy/);
  assert.match(taskPacket, /## Reasoning attempts/);
  assert.match(taskPacket, /## Coverage impact/);
  assert.match(taskPacket, /## Touched ledger items/);
  assert.match(taskPacket, /## Required runtime traces/);
  assert.match(taskPacket, /## Progress proof/);
  assert.match(taskPacket, /## Interrupt checkpoint policy/);
  assert.match(taskPacket, /## Workflow artifact refs/);
  assert.match(taskPacket, /## Council review/);
  assert.match(taskPacket, /### Dissent owner/);
  assert.match(taskPacket, /review_exports=required \| runtime_optional/);
  assert.match(taskPacket, /## Bad-path or edge-case checks/);
  assert.match(taskPacket, /## Residual risk disposition/);

  assert.match(qualityMatrix, /### `council_review_required`/);
  assert.match(qualityMatrix, /refactors and rewrites must preserve intended behavior/i);
  assert.match(qualityMatrix, /### `regression_safety_required`/);
  assert.match(qualityMatrix, /### `coverage_ledger_required`/);
  assert.match(qualityMatrix, /### `progress_proof_required`/);
  assert.match(qualityMatrix, /### `checkpoint_resume_required`/);
  assert.match(qualityMatrix, /### `reasoning_strict_required`/);
  assert.match(qualityMatrix, /discovered `CRITICAL` or `HIGH` defects in touched scope/i);
  assert.match(reasoningQuality, /facts, assumptions, and guesses/i);
  assert.match(reasoningQuality, /structured dissent pass/i);
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
  assert.match(debugging, /repo-local Grafana configuration/i);
  assert.match(debugging, /counter-evidence/i);
  assert.match(planning, /reasoning-quality section/i);
  assert.match(planning, /strict.*default/i);
  assert.match(review, /low-confidence conclusions/i);
  assert.match(review, /unsupported reasoning verdicts/i);
  assert.match(docsResearch, /unresolved drift/i);
  assert.match(docsResearch, /repo-local Grafana configuration/i);
  assert.match(docsResearch, /stop at the evidence boundary/i);
});

test("expanded role-local workflow skills encode the new behavior loops", async () => {
  const agentRuntime = await read(".agents/skills/devgod-agent-runtime/SKILL.md");
  const productFraming = await read(".agents/skills/devgod-product-framing/SKILL.md");
  const gitOperator = await read(".agents/skills/devgod-git-operator/SKILL.md");
  const evalEngineering = await read(".agents/skills/devgod-eval-engineering/SKILL.md");
  const skillEvals = await read(".agents/skills/devgod-skill-evals/SKILL.md");

  assert.match(agentRuntime, /continuation/i);
  assert.match(agentRuntime, /hook/i);
  assert.match(productFraming, /smallest useful milestone/i);
  assert.match(productFraming, /acceptance criteria/i);
  assert.match(gitOperator, /Stage only files that belong/i);
  assert.match(gitOperator, /do not use broad staging commands/i);
  assert.match(evalEngineering, /deterministic checks/i);
  assert.match(evalEngineering, /false-positive risk/i);
  assert.match(skillEvals, /did the right skill trigger/i);
  assert.match(skillEvals, /happy-path/i);
});

test("frontend quality controls reject generic AI UI and require browser-backed proof", async () => {
  const frontendTaste = await read(".agents/skills/devgod-frontend-taste/SKILL.md");
  const frontendRubric = await read(".devgod/rules/frontend-quality-rubric.md");
  const frontendAcceptance = await read(".devgod/rules/frontend-acceptance.md");
  const frontendRedesign = await read(".devgod/rules/frontend-redesign-contract.md");
  const frontendDesigner = await read(".codex/agents/frontend-designer.toml");
  const planner = await read(".codex/agents/planner.toml");
  const taskPacket = await read(".devgod/templates/task-packet.md");
  const agentCatalog = await read("src/devgod/agent-catalog.ts");

  assert.match(frontendTaste, /generic gradient hero/i);
  assert.match(frontendTaste, /content or asset plan/i);
  assert.match(frontendTaste, /same weak hierarchy/i);
  assert.match(frontendTaste, /mobile layout must feel composed/i);
  assert.match(frontendRubric, /generic AI-generated UI output/i);
  assert.match(frontendRubric, /same layout, hierarchy, or known misplaced controls/i);
  assert.match(frontendRubric, /palette choices that lack surface logic/i);
  assert.match(frontendRubric, /default font stack/i);
  assert.match(frontendRubric, /one desktop viewport/i);
  assert.match(frontendRubric, /one mobile viewport/i);
  assert.match(frontendRubric, /cited Playwright evidence refs/i);
  assert.match(frontendAcceptance, /redesign delta/i);
  assert.match(frontendAcceptance, /content strategy/i);
  assert.match(frontendRedesign, /preserve_and_polish/i);
  assert.match(frontendRedesign, /content and asset plan/i);
  assert.match(frontendRedesign, /same weak hierarchy/i);
  assert.match(frontendDesigner, /frontend quality rubric/i);
  assert.match(frontendDesigner, /frontend direction package/i);
  assert.match(frontendDesigner, /frontend-design/i);
  assert.match(planner, /frontend direction package/i);
  assert.match(planner, /must materially change/i);
  assert.match(taskPacket, /## Frontend direction package/);
  assert.match(taskPacket, /### Redesign intent/);
  assert.match(taskPacket, /### Content and asset plan/);
  assert.match(agentCatalog, /"frontend-design"/i);
});

test("AGENTS routes recurring control-layer work through repo-local workflow skills first", async () => {
  const agents = await read("AGENTS.md");

  assert.match(agents, /repo-local `devgod-\*` workflow skill/i);
  assert.match(agents, /agent runtime, hook, tool-contract, automation, or continuation changes/i);
  assert.match(agents, /benchmark, grader, or skill-regression work/i);
  assert.match(agents, /operator docs, migration notes, release notes, or workflow-document clarity/i);
});
