---
name: devgod-release-readiness
description: Use when devgod needs a shipment gate for package changes, installer changes, migrations, setup flows, or rollout-sensitive updates.
---

# Devgod Release Readiness

Use this skill before calling package or control-layer work ready to ship.

## Goal

Block releases that are green on paper but unsafe to ship.

## Workflow

1. Restate the shipment surface: package files, installer behavior, migrations, setup commands, and rollback path.
2. Verify the minimum release checklist:
   - tests
   - typecheck
   - package contents
   - migration safety
   - setup or upgrade notes
   - rollback notes
3. Check that no live `.devgod/work/` state or reviewed memory content is accidentally shipped.
4. Call out breaking changes, env changes, and operator steps explicitly.
5. Block completion if evidence is missing.

## Rules

- do not approve installer or migration work without replayable verification
- do not treat `npm pack --dry-run` as sufficient when runtime or schema behavior changed
- keep the gate concrete: commands, files, rollback, and operational caveats

## Output

Return a concise ship/no-ship checklist with evidence and remaining blockers.
