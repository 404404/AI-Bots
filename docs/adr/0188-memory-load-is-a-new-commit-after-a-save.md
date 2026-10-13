---
Status: Accepted
Date: 2026-10-13
---

# Loading a Memory commit is a new commit after a save

## Context

Memory evolution showed recovery checkpoints (ADR-0097) as a separate list next to the Git graph. The Human could not go back to an older commit from the graph itself, and the separate list read as a duplicate of Git history. The Human wants Memory to behave like game saves: pick any point in the graph, load it, and be able to load the previous state again at any time. Git checkout alone does not cover this: the working tree is current Memory (ADR-0068), so uncommitted files would be lost, and a reset would drop later commits from the branch.

## Decision

The Memory evolution graph offers **Load this memory** on any commit other than HEAD. After the Human confirms, the Host refuses when a Memory turn is active, a repair is pending, or HEAD differs from the graph the Human saw. It then forces a Human-command recovery checkpoint of the current branch, HEAD, index and working tree. It commits the selected commit's tree as a new child of the current HEAD and moves the branch with a compare-and-swap. Finally it resets the index and working tree to that commit and removes untracked files. Ignored files stay in place. Git history is never rewritten, so every later commit stays in the graph and can be loaded again. Uncommitted work lives in the checkpoint taken just before the load. The recovery list is renamed **Saves**, and its restore action is renamed **Load**.

## Consequences

Loading is ordinary forward Git history, so the Bot, Git tools and remotes see a normal commit and need no new concept. A load whose tree equals HEAD makes no commit and only discards uncommitted changes, which the save keeps. The load and its save reuse the `human-edit` cause kind, so the schema needs no migration. A dedicated cause can follow if the Saves list needs to label loads separately. Creating a new PersonaBot from a commit (a fork) is a separate decision: a fork receives a copy of the Memory Repository but not the original Bot's Channels, Inbox or Session history.
