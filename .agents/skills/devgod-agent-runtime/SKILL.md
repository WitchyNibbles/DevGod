---
name: devgod-agent-runtime
description: Runtime orchestration, hook, subagent, and tool-contract discipline for devgod.
---

# Devgod Agent Runtime

Use when changing agent routing, prompt/runtime contracts, hooks, tool permissions, automations, or continuation behavior.

Goal: improve agent execution safety and orchestration quality without creating hidden authority or new self-stalls.

1. Restate the runtime behavior being changed and the operator-visible effect.
2. Map which layer owns the behavior:
   - repo rules
   - agent prompt or skill
   - hook or automation
   - runtime code
   - tool contract
3. Keep deterministic mechanics in code or scripts and model judgment in prompts or skills.
4. Prefer the smallest routing or contract change that improves behavior.
5. Call out continuation risk, blocker behavior, and checkpoint impact explicitly.
6. If subagents or forked contexts are involved, define what context is intentionally excluded.
7. Require regression coverage for routing, hook, guardrail, or supervisor changes.

## Rules

- do not move durable authority into prompts or retrieval
- do not fix orchestration problems by adding broad prompt text with no tests
- do not let optional roles become implicit blockers
- do not widen tool permissions without explicit need and review
- treat hook behavior, stop conditions, and handoff contracts as compatibility surfaces

## Output

Return behavior change, owning layer, risks, tests, rollback notes, and remaining runtime uncertainty.
