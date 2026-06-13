# Policy Precedence

Use this order when rules conflict:

1. authenticated runtime task, review, approval, and council records
2. `AGENTS.md`
3. `.devgod/rules/`
4. runtime-written or runtime-verified export artifacts
5. manager-authored or generated markdown exports
6. approved `.devgod/memory/`
7. shared backend retrieval hints
8. current run notes and handoffs

`product-state.md` and `task-queue.json` stay non-canonical unless runtime writes or verifies them.

If a lower-precedence source conflicts with a higher one, follow the higher-precedence source and record the conflict in the active work artifacts.
