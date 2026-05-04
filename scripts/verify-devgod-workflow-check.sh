#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_id="task-2026-05-04-devgod-manager-delegation-cycle"
task_base="${task_id#task-}"
tmp_root="$(mktemp -d)"
fixture_root="$tmp_root/repo"

cleanup() {
  rm -rf "$tmp_root"
}
trap cleanup EXIT

mkdir -p \
  "$fixture_root/.agents/skills/devgod-intake" \
  "$fixture_root/.agents/skills/devgod-planning" \
  "$fixture_root/.agents/skills/devgod-execution" \
  "$fixture_root/.codex" \
  "$fixture_root/.devgod/templates" \
  "$fixture_root/.devgod/work/briefs" \
  "$fixture_root/.devgod/work/plans" \
  "$fixture_root/.devgod/work/tasks" \
  "$fixture_root/.devgod/work/reviews" \
  "$fixture_root/scripts"

git -C "$fixture_root" init -q

cat > "$fixture_root/.gitignore" <<'EOF'
.devgod/postgres/
.codex/skills/
EOF

cat > "$fixture_root/AGENTS.md" <<'EOF'
route every substantive build, debug, setup, or refactor ask through the department workflow
use `devgod-intake` as the default first skill for substantive work
create or update `.devgod/ACTIVE` for the current task and write the matching intake brief before moving past intake
require an intake brief for substantive work in `.devgod/work/briefs/`
require a task packet or plan artifact in `.devgod/work/plans/` or `.devgod/work/tasks/` before worker execution
require the active task id to match the current brief, plan/task, and review artifacts
run `bash scripts/check-devgod-workflow.sh --task-id <task-id>` before reporting substantive work complete
require terminal gate records under `.devgod/work/reviews/` for `reviewer`, `qa_engineer`, and `security_reviewer` before the manager reports a substantive task complete
EOF

cat > "$fixture_root/.codex/config.toml" <<'EOF'
project_doc_fallback_filenames = [
  "AGENTS.md",
  ".agents.md",
]
EOF

cat > "$fixture_root/.codex/hooks.json" <<'EOF'
{"hooks":{"SessionStart":[{"matcher":"startup|resume","hooks":[{"type":"command","command":"bash scripts/devgod-session-start.sh"}]}]}}
EOF

cat > "$fixture_root/package.json" <<'EOF'
{"scripts":{"devgod:check-workflow":"bash scripts/check-devgod-workflow.sh"}}
EOF

cat > "$fixture_root/.devgod/ACTIVE" <<EOF
task_id=$task_id
workflow=devgod
state=active
EOF

cat > "$fixture_root/.devgod/templates/intake-brief.md" <<'EOF'
template
EOF

cat > "$fixture_root/.devgod/templates/review-gate.md" <<'EOF'
template
EOF

cat > "$fixture_root/.agents/skills/devgod-intake/SKILL.md" <<'EOF'
skill
EOF

cat > "$fixture_root/.agents/skills/devgod-planning/SKILL.md" <<'EOF'
skill
EOF

cat > "$fixture_root/.agents/skills/devgod-execution/SKILL.md" <<'EOF'
skill
EOF

cat > "$fixture_root/.devgod/work/briefs/brief-$task_base.md" <<EOF
# Intake Brief

## Task ID

\`$task_id\`
EOF

cat > "$fixture_root/.devgod/work/plans/plan-$task_base.md" <<EOF
# Plan

## Task ID

\`$task_id\`
EOF

for pair in "reviewer reviewer" "qa qa_engineer" "security security_reviewer"; do
  set -- $pair
  short_role="$1"
  full_role="$2"
  cat > "$fixture_root/.devgod/work/reviews/review-$task_base-$short_role.md" <<EOF
# Review Gate

## Task ID

\`$task_id\`

## Reviewer role

\`$full_role\`

## Review state

\`passed\`

## Severity

\`low\`

## Findings

Synthetic ${full_role} findings.

## Residual risk

Synthetic ${full_role} residual risk.

## Verification evidence

Synthetic ${full_role} verification evidence.

## Waiver reason

None.

## Decision

\`approved\`

## Source handoff

Synthetic ${full_role} output.
EOF
done

cp "$repo_root/scripts/check-devgod-workflow.sh" "$fixture_root/scripts/check-devgod-workflow.sh"

positive_output="$(bash "$fixture_root/scripts/check-devgod-workflow.sh" --repo-root "$fixture_root" --task-id "$task_id")"
printf '%s\n' "$positive_output" | grep -Fq "devgod workflow check passed" || {
  printf 'positive fixture did not pass as expected\n' >&2
  exit 1
}

cat > "$fixture_root/.devgod/work/reviews/review-$task_base-qa_engineer.md" <<EOF
# Review Gate

## Task ID

\`$task_id\`

## Reviewer role

\`qa_engineer\`

## Review state

\`waived\`

## Severity

\`medium\`

## Findings

Synthetic waived qa findings.

## Residual risk

Synthetic waived qa residual risk.

## Verification evidence

Synthetic waived qa verification evidence.

## Waiver reason

Not needed in synthetic pass case.

## Decision

\`waived\`

## Source handoff

Synthetic waived qa output.
EOF
rm "$fixture_root/.devgod/work/reviews/review-$task_base-qa.md"

waived_output="$(bash "$fixture_root/scripts/check-devgod-workflow.sh" --repo-root "$fixture_root" --task-id "$task_id")"
printf '%s\n' "$waived_output" | grep -Fq "devgod workflow check passed" || {
  printf 'waived fixture did not pass as expected\n' >&2
  exit 1
}

cat > "$fixture_root/.devgod/work/reviews/review-$task_base-reviewer.md" <<EOF
# Review Gate

## Task ID

\`$task_id\`

## Reviewer role

\`reviewer\`

## Review state

\`passed\`

## Severity

\`critical\`

## Findings

Contradictory critical finding.

## Residual risk

Critical residual risk.

## Verification evidence

Synthetic critical verification evidence.

## Waiver reason

None.

## Decision

\`approved\`

## Source handoff

Synthetic contradictory reviewer output.
EOF

if bash "$fixture_root/scripts/check-devgod-workflow.sh" --repo-root "$fixture_root" --task-id "$task_id" >/dev/null 2>&1; then
  printf 'critical-severity fixture unexpectedly passed\n' >&2
  exit 1
fi

cat > "$fixture_root/.devgod/work/reviews/review-$task_base-reviewer.md" <<EOF
# Review Gate

## Task ID

\`$task_id\`

## Reviewer role

\`reviewer\`

## Review state

\`passed\`

## Severity

\`low\`

## Findings

Synthetic reviewer findings.

## Residual risk

Synthetic reviewer residual risk.

## Verification evidence

Synthetic reviewer verification evidence.

## Waiver reason

None.

## Decision

\`approved\`

## Source handoff

Synthetic reviewer output.
EOF

cat > "$fixture_root/.devgod/work/briefs/brief-unrelated-task.md" <<'EOF'
# Intake Brief

## Task ID

`task-unrelated`
EOF

pass_with_unrelated="$(bash "$fixture_root/scripts/check-devgod-workflow.sh" --repo-root "$fixture_root" --task-id "$task_id")"
printf '%s\n' "$pass_with_unrelated" | grep -Fq "devgod workflow check passed" || {
  printf 'unrelated-newer-artifact fixture did not pass as expected\n' >&2
  exit 1
}

rm "$fixture_root/.devgod/work/reviews/review-$task_base-security.md"
if bash "$fixture_root/scripts/check-devgod-workflow.sh" --repo-root "$fixture_root" --task-id "$task_id" >/dev/null 2>&1; then
  printf 'negative fixture unexpectedly passed\n' >&2
  exit 1
fi

printf 'fixture verification passed for %s\n' "$task_id"
