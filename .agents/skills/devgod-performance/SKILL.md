---
name: devgod-performance
description: Performance gate skill for devgod. Use when owning the performance_check_required gate, profiling latency-sensitive paths, or blocking regressions.
---

# Devgod Performance

Use when the performance_check_required gate is active or when a task touches latency-sensitive paths.

## Gate requirements

Every performance claim must include:
1. A replayable baseline command with measured output
2. A replayable post-change command with measured output
3. A delta with explicit pass/fail against the 10% regression threshold

Prose claims ("it feels faster") are not acceptable gate evidence.

## Profiling workflow

1. Identify the hot path — do not optimize unmeasured code
2. Capture baseline: `npm run benchmark:orchestration -- --format json`
3. Apply the change
4. Capture post-change: same command
5. Compare: flag any metric regressing >10% as a blocking finding

## Query cost

For database-touching paths:
- Run `EXPLAIN ANALYZE` before and after index or query changes
- Include actual rows, actual time, and planning time in the evidence

## Load testing

For throughput-sensitive paths:
- Use a reproducible load profile (fixed concurrency, fixed duration)
- Record p50, p95, p99 latency and error rate
- Baseline must be captured on the same hardware/environment as post-change

## Output

```
PERFORMANCE EVIDENCE
====================
Metric:      <name>
Baseline:    <value> (<command>)
Post-change: <value> (<command>)
Delta:       <±%>
Result:      PASS / REGRESSION BLOCKED
```
