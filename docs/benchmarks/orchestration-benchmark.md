# Orchestration Benchmark

Generated from `npm run benchmark:orchestration -- --format markdown`.

Generated: 2026-05-20T11:50:19.425Z

Runtime proof: 14/14 baseline cases passed (100%).

This report mixes repo-verified `devgod` runtime proof with reviewed comparative capability fixtures for adjacent systems. It is a reproducible rubric, not an external lab certification.

| Rank | System | Score | Governance | Trusted reviews | Observability | Recovery | Evals | Ergonomics | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | devgod | 29/30 | 5 | 5 | 5 | 5 | 5 | 4 | repo_verified |
| 2 | LangGraph | 21/30 | 4 | 1 | 4 | 5 | 4 | 3 | reviewed_fixture |
| 3 | OpenAI Agents SDK | 21/30 | 4 | 2 | 4 | 4 | 3 | 4 | reviewed_fixture |
| 4 | Google ADK | 18/30 | 3 | 1 | 3 | 4 | 3 | 4 | reviewed_fixture |
| 5 | Mastra | 18/30 | 3 | 1 | 4 | 3 | 3 | 4 | reviewed_fixture |
| 6 | OpenHands | 15/30 | 2 | 1 | 3 | 3 | 2 | 4 | reviewed_fixture |

## Notes

- devgod: scores are tied to repo-shipped workflow, trust, ops, and recovery primitives; comparative entries are reviewed fixtures and should be refreshed when benchmark assumptions change
- LangGraph: strong runtime durability; review authority left to host implementation
- OpenAI Agents SDK: strong tracing and orchestration primitives; governance policy is host-owned
- Google ADK: workflow-agent primitives are strong; review trust model is host-owned
- Mastra: good observability and memory; governance and authenticated review are lighter
- OpenHands: strong coding harness posture; less explicit governance and review authority
