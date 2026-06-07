---
name: devgod-web-design-guidelines
description: "Vendored mirror of web-design-guidelines: Review UI code for Web Interface Guidelines compliance. Use when asked to \"review my UI\", \"check accessibility\", \"audit design\", \"review UX\", or \"check my site against best practices\"."
origin: devgod-vendored-skill
upstream_skill: web-design-guidelines
upstream_path: "/home/eimi/.agents/skills/web-design-guidelines/SKILL.md"
upstream_sha256: f4647ca866a3accf763777f83e7682954f0187cd6bea7eea0399796652414e8f
synced_at: 2026-06-07T20:56:20.957Z
---

<!-- Managed by src/devgod/sync-vendored-skills.ts from web-design-guidelines. -->

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

