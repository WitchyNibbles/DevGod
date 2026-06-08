# Skill Evidence Redaction Policy For `devgod`

## Status

Proposed

## Date

2026-06-08

## Purpose

Define the minimum explicit redaction rules that must hold before `devgod` persists skill-evolution evidence under `.devgod/skills/evidence/`.

## Scope

This policy applies to any persisted evidence produced for:

- overlay skill drafting
- overlay skill patching
- promotion packets
- local replay or trace-derived skill evaluation

## Authority

This policy constrains evidence persistence only. It does not change review authority, council authority, or canonical skill promotion authority.

## Hard rules

1. Do not persist raw transcript spans by default.
2. Persist only minimized evidence needed to explain why a skill changed or why promotion was suggested.
3. Redact or drop any secret, token, credential, cookie, session identifier, private key, connection string, or environment variable value before persistence.
4. Redact or drop any user-specific or machine-local path/value that is not required for reusable repo procedure.
5. Redact or drop copied shell history that contains inline credentials, bearer headers, signed URLs, or one-time auth material.
6. Mark evidence provenance as `trusted_repo`, `operator_asserted`, or `untrusted_transcript`.
7. Never auto-promote evidence with `untrusted_transcript` provenance without human review and explicit summarization.
8. If safe redaction is uncertain, do not persist the evidence; store only a short summary pointing back to the task id.

## Allowed persisted shapes

- task id and timestamp
- concise task summary
- normalized command pattern with sensitive arguments removed
- failure class and recovery class
- verification pattern
- overlap note against canonical skill coverage
- redaction status and provenance label

## Disallowed persisted shapes

- raw terminal dumps
- raw transcript excerpts copied verbatim
- environment-file contents
- request headers with auth material
- tokens, secrets, passwords, cookies, or connection strings
- machine-specific absolute paths unless reduced to placeholders

## Required placeholders

When a value must remain structurally visible, replace it with placeholders such as:

- `<REDACTED_SECRET>`
- `<REDACTED_TOKEN>`
- `<REPO_RELATIVE_PATH>`
- `<HOST_LOCAL_PATH>`

## Slice-1 implication

Until implementation proves these rules are enforced, slice 1 may define the evidence storage contract but must defer raw evidence persistence and persist only redaction-safe summaries.

## Verification expectation

Any future implementation that persists skill evidence must include tests showing:

- secret-like strings are removed or replaced
- machine-local paths are normalized
- unsafe transcript inputs are downgraded to summaries or rejected
- promotion packets do not embed disallowed raw evidence
