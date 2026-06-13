# Design And Architecture Council Decision Packet

## Task ID

`2026-06-08-devgod-consistency-repair-roadmap`

## Decision type

`mixed`

## Problem

`devgod` currently has confirmed drift between canonical workflow-schema code, managed workflow artifacts, runtime validation rules, tests, and status-truth summaries. Maintainers need a repair sequence that restores trust without weakening the newer completion-audit model.

## User

Source-repo maintainers.

## Value

Restores truthful workflow authority, reduces false-green completion claims, and gives maintainers a bounded path back to reliable quality gates.

## Proposal

Adopt a four-slice remediation program:

1. reconcile managed workflow artifacts to the canonical renderer
2. backfill `specialist_verified` fixtures and task builders for `completion_audit_required`
3. rerun and repair the maintainer quality path until the intended verification commands are genuinely green
4. only then update product-state, queue, and documentation summaries to match the new evidence

## Alternatives

List at least two alternatives, including one conservative option.

- conservative: patch only stale status artifacts and defer workflow-schema and test repair
- rollback-first: weaken or remove the `completion_audit_required` validation rule to restore green tests quickly
- broad-sweep: attempt one large “consistency hardening” implementation across templates, tests, status, and CI without slice boundaries

## Evidence refs

- `.devgod/work/briefs/brief-2026-06-08-devgod-consistency-repair-roadmap.md`
- `.devgod/templates/task-packet.md`
- `.devgod/templates/review-gate.md`
- `.devgod/rules/review-gate-policy.md`
- `src/devgod/workflow-schema.ts`
- `src/domain/contracts.ts`
- `tests/actions.test.ts`
- `tests/workflow-integrity.test.ts`
- `tests/control-layer-contract.test.ts`
- `scripts/check-quality.sh`

## Counter-evidence

- some secondary failures may remain after the first two slices, especially in install or happy-path fixtures
- status-truth repair cannot be completed honestly until fresh verification is green

## Consequences

- keeps the stronger completion-audit contract intact
- forces status updates to follow evidence rather than precede it
- increases near-term planning and review overhead in exchange for clearer repair boundaries

## Rollback or reversal path

If the leading program proves too broad, keep slice 1 and slice 2 as the minimum contract-repair baseline and defer status-summary cleanup until after implementation evidence exists. Do not revert the completion-audit rule without an explicit replacement control.

## Council question

Should maintainers repair `devgod` by preserving the stricter completion-audit model and executing a narrow four-slice remediation sequence, rather than weakening the rule or performing another undifferentiated consistency sweep?

## Proposed council members

- `solution_architect`
- `product_strategist`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Proposed dissent owner

`reviewer`

## Outcome

`approved_with_conditions`

## Conditions or actions

- protect the completion-audit rule unless a stronger replacement is approved
- do not allow status-truth updates to claim passed verification before the commands are rerun successfully
- keep the first implementation slice limited to canonical artifact reconciliation
- if the quality gate restoration slice still leaves red commands, write a new narrow blocker slice per failure family instead of widening the roadmap opportunistically

## Exception expiry

`none`

## Decision summary

Approved with conditions. The council direction is to preserve the stricter completion-audit model, repair canonical managed artifacts first, backfill `specialist_verified` fixtures second, restore the maintainer quality path third, and only then reconcile status-truth surfaces.

The dissent view accepted the sequence but argued against broadening Slice 1 or weakening closure truth to recover green status faster. That objection is carried forward as an explicit implementation condition.
