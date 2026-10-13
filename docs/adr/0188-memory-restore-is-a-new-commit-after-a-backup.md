---
Status: Accepted
Date: 2026-10-13
---

# Restoring a Memory commit is a new commit after a backup

## Context

Memory evolution showed recovery checkpoints (ADR-0097) as a separate list next to the Git graph. The Human could not go back to an older commit from the graph itself, and the separate list read as a duplicate of Git history. The Human wants to move Memory to any point in the graph with confidence, and to be able to return to the previous state at any time. Git checkout alone does not cover this: the working tree is current Memory (ADR-0068), so uncommitted files would be lost, and a reset would drop later commits from the branch.

## Decision

The Memory evolution graph offers **Restore to this commit** inside the block of any selected commit other than HEAD, so it is clear which commit the action belongs to. The confirmation states that Memory returns to the state right after that commit: its own changes are included, later commits are not. After the Human confirms, the Host refuses when a Memory turn is active, a repair is pending, or HEAD differs from the graph the Human saw. It then forces a Human-command recovery checkpoint of the current branch, HEAD, index and working tree. It commits the selected commit's tree as a new child of the current HEAD and moves the branch with a compare-and-swap. Finally it resets the index and working tree to that commit and removes untracked files. Ignored files stay in place. Git history is never rewritten, so every later commit stays in the graph and can be restored again. Uncommitted work lives in the checkpoint taken just before the restore. The recovery list is renamed **Automatic backups**, and its action is **Restore to this backup**. The interface uses plain restore and backup wording rather than game terms. After any restore the Memory file list reloads at once instead of waiting for its next poll.

## Consequences

Restoring is ordinary forward Git history, so the Bot, Git tools and remotes see a normal commit and need no new concept. A restore whose tree equals HEAD makes no commit and only discards uncommitted changes, which the backup keeps. The restore and its backup reuse the `human-edit` cause kind, so the schema needs no migration. A dedicated cause can follow if the backup list needs to label restores separately. Creating a new PersonaBot from a commit (a fork) is a separate decision: a fork receives a copy of the Memory Repository but not the original Bot's Channels, Inbox or Session history.
