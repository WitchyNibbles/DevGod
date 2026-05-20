#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
benchmark_doc="$repo_root/docs/benchmarks/orchestration-benchmark.md"
benchmark_source=""
goal_gap_audit="$repo_root/docs/devgod-goal-gap-audit.md"
current_state_doc="$repo_root/docs/current-state.md"
redesign_doc="$repo_root/docs/autonomous-execution-redesign.md"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      repo_root="$2"
      benchmark_doc="$repo_root/docs/benchmarks/orchestration-benchmark.md"
      goal_gap_audit="$repo_root/docs/devgod-goal-gap-audit.md"
      current_state_doc="$repo_root/docs/current-state.md"
      redesign_doc="$repo_root/docs/autonomous-execution-redesign.md"
      shift 2
      ;;
    --benchmark-doc)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      benchmark_doc="$2"
      shift 2
      ;;
    --benchmark-source)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      benchmark_source="$2"
      shift 2
      ;;
    --goal-gap-audit)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      goal_gap_audit="$2"
      shift 2
      ;;
    --current-state-doc)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      current_state_doc="$2"
      shift 2
      ;;
    --redesign-doc)
      [[ $# -ge 2 ]] || { printf 'missing value for %s\n' "$1" >&2; exit 2; }
      redesign_doc="$2"
      shift 2
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

fail() {
  printf 'docs/runtime drift check failed: %s\n' "$1" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing file: $1"
}

normalize_benchmark() {
  python3 - "$1" <<'EOF'
from pathlib import Path
import sys
path = Path(sys.argv[1])
lines = path.read_text().splitlines()
filtered = [line.rstrip() for line in lines if not line.startswith('Generated: ')]
print('\n'.join(filtered).strip())
EOF
}

require_file "$benchmark_doc"
require_file "$goal_gap_audit"
require_file "$current_state_doc"
require_file "$redesign_doc"

benchmark_reference_file=""
cleanup() {
  if [[ -n "$benchmark_reference_file" && -f "$benchmark_reference_file" ]]; then
    python3 -c "from pathlib import Path; import sys; Path(sys.argv[1]).unlink(missing_ok=True)" "$benchmark_reference_file"
  fi
}
trap cleanup EXIT

if [[ -n "$benchmark_source" ]]; then
  require_file "$benchmark_source"
  benchmark_reference_file="$benchmark_source"
else
  benchmark_reference_file="$(mktemp)"
  npm run benchmark:orchestration -- --format markdown > "$benchmark_reference_file"
fi

expected_benchmark="$(normalize_benchmark "$benchmark_reference_file")"
actual_benchmark="$(normalize_benchmark "$benchmark_doc")"
[[ "$actual_benchmark" == "$expected_benchmark" ]] || fail "benchmark markdown is stale: $benchmark_doc"

grep -Fq 'historical context' "$goal_gap_audit" || fail "goal gap audit must declare itself historical context"
for forbidden in   "It is not yet at the stronger goal described"   "autonomous.configured=false"   "Runtime proof: 14/14 baseline cases passed (100%)."; do
  if grep -Fq "$forbidden" "$goal_gap_audit"; then
    fail "goal gap audit still contains stale claim: $forbidden"
  fi
done

grep -Fq 'runtime-proven' "$current_state_doc" || fail "current-state doc is missing runtime-proven package status"
grep -Fq 'authoritative completion proof is run `d141baef-0f7a-40df-9aec-ac60ad9235f7`' "$current_state_doc" || fail "current-state doc lost the authoritative completion proof reference"
grep -Fq 'package-level remediation described by this redesign is now shipped' "$redesign_doc" || fail "redesign doc is missing shipped-status framing"

echo 'docs/runtime drift checks passed'
