# Design And Architecture Council Decision Packet

## Task

`2026-06-08-consuming-repo-skill-evolution-rfc`

## Proposal summary

Add a two-layer skill architecture for consuming `devgod` repos:

- canonical repo skills remain committed, reviewed, and authoritative
- a local writable overlay stores draft and evolved repo-specific skills
- autonomous agents can draft and patch overlay skills from observed task traces
- promotion into canonical repo skills always requires a human-reviewed patch flow

## User and operator

- contributors running repo tasks locally
- autonomous agents running inside consuming repos
- maintainers reviewing promoted procedures

## Problem

Repo-specific procedures are currently either static, under-specified, or trapped in transcripts. Direct autonomous mutation of canonical repo skills is too risky, but no learning loop means repeated knowledge is lost.

## Alternatives

### Leading option

Overlay-first learning plus human-gated promotion.

### Conservative option

Manual-only skill authoring by maintainers, no autonomous drafting.

### Aggressive option

Allow agents to write committed repo skills directly with rollback support.

## Why the leading option

It preserves reviewable source-of-truth while still capturing repeated repo-specific workflows automatically.

## Main risks

- draft-skill sprawl
- overfitting transient failures
- too much operator overhead in promotion

## Reversal path

Disable automatic drafting and keep overlay read-only or unused while preserving canonical repo skills.

## Dissent owner prompt

Challenge whether the draft/eval/promotion loop adds enough value over disciplined manual skill authoring for small repos.

## Decision requested

Should `devgod` adopt overlay-first repo skill evolution as the standard pattern for consuming repos?
