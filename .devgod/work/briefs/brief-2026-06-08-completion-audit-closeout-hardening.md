# Completion Audit Closeout Hardening Brief

## Brief ID

`brief-2026-06-08-completion-audit-closeout-hardening`

## Task ID

`2026-06-08-completion-audit-closeout-hardening`

## Request

Stop `devgod` from calling work complete when it is only partially implemented or only superficially green.

## Goal

Require explicit completion-audit evidence and preserve `approved` as distinct from `done`.

## Intended outcome

- specialist-verified work requires a completion-audit gate
- reviewer and QA evidence must explicitly certify touched scope completeness before workflow proof passes
- exported queues no longer collapse `approved` into `done`

## User

`devgod` maintainer

## Problem

The workflow could present tasks as effectively completed when they had only reached authenticated review approval or when tests passed without a true closeout audit.

## Value

This hardens `devgod` against false-complete claims and forces review loops to send half-finished work back to implementation.

## Constraints

- preserve existing runtime-authenticated review authority
- avoid weakening existing reviewer, QA, security, Playwright, and release-readiness gates

## Risks

- fixture and seed paths may rely on weaker historical specialist-verified assumptions
- queue consumers may have assumed `approved` and `done` were equivalent

## Success Criteria

- workflow schema, templates, checker, runtime proof, and seed helpers all require completion-audit evidence for specialist-verified work
- queue/status exports preserve `approved` distinctly from `done`
- focused regressions cover both new gate enforcement and the queue truth fix

## Completion bar

Code, templates, and focused regressions all agree that `approved` is not `done` and that specialist-verified work cannot close without explicit completion-audit evidence.

## Stop Go

`go`
