---
name: devgod-planning
description: Turn substantive work into executable task packets.
---

# Devgod Planning

Use when the task is substantive enough that the repo should not jump straight to code.

Goal: produce a plan that is executable, reviewable, and safe to hand off.

1. Restate goal, audience, constraints, risks, unknowns, success criteria, and stop/go.
2. Separate approved assumptions, blocked assumptions, and user questions.
3. Split work by trust boundary and write scope.
4. Define the smallest useful slice first.
5. For each task packet, include owner role, completion standard, required specialists, quality gates, scope, acceptance criteria, verification, and review gates.
   - inputs and dependencies
   - allowed write scope
   - out of scope
   - acceptance criteria
   - verification steps
   - required reviews
   - security checks
   - anti-patterns to avoid
   - rollback notes
   - handoff format
6. Require QA and security gates for substantive work.
7. Ensure the plan or task packet names the same current task id used by `.devgod/ACTIVE` and the intake brief.

## Rules

- do not treat retrieval hints as canonical facts
- do not produce giant tasks with fuzzy done bars
- do not skip rollback notes
- prefer a thin vertical slice over a roadmap dump
- do not allow planning to continue against a stale active task marker

## Output

Return a concise plan plus task packets or an explicit blocker.
