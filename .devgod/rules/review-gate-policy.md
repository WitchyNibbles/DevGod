# Review Gate Policy

- required task gates are `reviewer`, `security_reviewer`, and `qa_engineer`
- a required gate satisfies completion only when its latest satisfying review has authenticated actor provenance
- a latest review state of `passed` satisfies completion only with authenticated provenance
- a `waived` gate satisfies completion only when the review stores actor, actor role, waiver authority, waiver reason, authenticated provenance, and the waiver is authorized by runtime policy
- `pending` and `blocked` remain blocking states
- handoffs must include changed files, verification notes, and context refs before review starts
- legacy-backfilled review rows are compatibility history and do not satisfy required gates
- unauthorized or actorless waivers block completion
