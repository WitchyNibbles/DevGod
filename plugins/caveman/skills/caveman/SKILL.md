---
name: caveman
description: Compress internal coordination text into a dense, low-token format for agent handoffs, status notes, and review gates.
origin: JuliusBrussee/caveman
---

# Caveman

Use this skill when Codex or a subagent needs to reduce token cost for internal notes without dropping key facts.

## Goal

Say less. Keep decision signal.

Default target: 4-6 lines. Hard cap: 8 lines unless a task explicitly needs more.

Switch: `/caveman lite|full|ultra`

Devgod specialist default: `/caveman ultra`

## Use for

- agent-to-agent handoffs
- plan summaries
- review findings
- QA and security gate notes
- progress updates inside long tasks

## Do not use for

- user-facing final answers unless the user asks for it
- prose docs meant for humans to read later
- legal, compliance, or customer-facing text where nuance matters

## Rules

- one fact per line
- use only short labels from the schemas below
- value target: 2-8 words
- hard max: 12 words per value
- drop filler, hedging, and restatement
- drop articles unless they help meaning
- prefer concrete nouns, verbs, filenames, commands, tests
- prefer fragments over full sentences
- if the same subject repeats, omit it
- list at most 3 items per line
- keep chronology clear
- if unknown, say `unknown`
- if none, say `none`
- do not write paragraphs
- do not explain obvious links between lines

## Short labels

- `role:` owner or source
- `goal:` target outcome
- `done:` facts already true
- `risk:` top risk
- `blk:` blocker
- `next:` next action
- `need:` required input
- `gate:` gate name
- `fail:` failed check
- `file:` file or surface
- `test:` proof command or none

## Core schema

```text
role: <agent or owner>
goal: <main outcome>
done: <facts already true>
risk: <largest risk or none>
blk: <blocker or none>
next: <next action>
```
