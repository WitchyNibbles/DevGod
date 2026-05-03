# Lessons Learned

## 2026-04-24 - Be honest about platform limits

Issue:

- built-in memory cannot be assumed available everywhere

Fix:

- use repo-local memory as the primary learning layer

Prevention:

- never promise persistent learning without confirming the actual storage path

## 2026-04-24 - Keep the first version operational, not mythical

Issue:

- "agents that improve themselves" can drift into hand-wavy claims

Fix:

- define improvement as reviewed memory, better prompts, safer defaults, and stronger workflows

Prevention:

- require concrete artifacts for every claimed improvement

## 2026-04-25 - Policy and runtime must not be the same thing

Issue:

- repo instructions alone do not create a reliable multi-project operating system

Fix:

- add an explicit shared-core runtime, task packets, locks, reviews, and active work artifacts

Prevention:

- when a workflow claim depends on state or enforcement, back it with code or durable artifacts
