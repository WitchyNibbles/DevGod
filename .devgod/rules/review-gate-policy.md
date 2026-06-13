# Review Gate Policy

- runtime task, review, approval, and council records are canonical truth for workflow state and release decisions
- markdown task packets, markdown review summaries, `product-state.md`, and `task-queue.json` are export artifacts; they may block release when stale or malformed, but they cannot override authenticated runtime truth
- `review_exports=required` means markdown review summaries are required export evidence for the task class
- `review_exports=runtime_optional` means runtime-authenticated review records may satisfy completion before markdown review summaries exist; if summaries exist they remain export evidence and must validate against runtime truth
- `specialist_verified` work always requires `completion_audit_required`; `review_exports=runtime_optional` waives only markdown review-summary exports, not the task packet or other required workflow exports
- required task gates are `reviewer`, `security_reviewer`, and `qa_engineer`
- `council_review_required` is a quality gate, not a fourth review role; it governs pre-implementation decision quality and does not replace the required review trio
- `release_readiness_required` is a quality gate, not a fourth review gate; release-sensitive work must still surface explicit release-readiness evidence in handoffs or review summaries
- `completion_audit_required` keeps specialist-verified work in gate scope until review evidence explicitly states the touched outcome is complete, clean, and has no unresolved follow-up work in scope
- a task may declare `review_exports=required` only when its allowed write scope includes the referenced markdown review artifacts; otherwise use `runtime_optional` or widen scope explicitly before execution
- a required gate satisfies completion only when its latest satisfying review has authenticated actor provenance
- a latest review state of `passed` satisfies completion only with authenticated provenance
- a `waived` gate satisfies completion only when the review stores actor, actor role, waiver authority, waiver reason, authenticated provenance, and the waiver is authorized by runtime policy
- `pending` and `blocked` remain blocking states
- handoffs must include changed files, verification notes, and context refs before review starts
- legacy-backfilled review rows are compatibility history and do not satisfy required gates
- unauthorized or actorless waivers block completion
