# Patterns

## Good Patterns

- use narrow specialist agents instead of one giant "expert"
- compress agent chatter with the caveman schema
- plan first, then build the thinnest vertical slice
- run security and QA review before calling work done
- capture only durable lessons in memory
- keep repo policy in markdown and operational state in the shared core
- use explicit task packets with write scope, tests, and rollback notes
- prefer one writer per overlapping write scope

## Anti-Patterns

- vague scope with no acceptance criteria
- pretending "self-improvement" exists without stored evidence
- huge roadmaps before a working thin slice
- storing secrets in project memory
- direct worker writes to shared state outside the service layer
- broad file ownership without lock discipline
