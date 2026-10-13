---
Status: Accepted
Date: 2026-10-13
---

# Restoring a Memory commit is a new commit after a backup commit

## Context

Memory evolution showed recovery checkpoints (ADR-0097) as a separate list next to the Git graph. The Human could not go back to an older commit from the graph itself, and the separate list read as a duplicate of Git history. The Human wants to move Memory to any point in the graph with confidence, and to be able to return to the previous state at any time. Git checkout alone does not cover this: the working tree is current Memory (ADR-0068), so uncommitted files would be lost, and a reset would drop later commits from the branch.

## Decision

The Memory evolution graph offers **Restore to this commit** inside the block of any selected commit other than HEAD, so it is clear which commit the action belongs to. The confirmation states that Memory returns to the state right after that commit: its own changes are included, later commits are not. After the Human confirms, the Host refuses when a Memory turn is active, a repair is pending, or HEAD differs from the graph the Human saw. It then forces a Human-command recovery checkpoint of the current branch, HEAD, index and working tree. When the working tree differs from HEAD, it commits that working tree as a backup commit with a fixed message. It commits the selected commit's tree as a new child of that commit and moves the branch with a compare-and-swap. Finally it resets the index and working tree to that commit and removes untracked files. Ignored files stay in place. Git history is never rewritten, so every later commit stays in the graph and can be restored again. Uncommitted work therefore lives in the graph itself, so the Human never has to understand a second, hidden history to get it back.

The Human does not write commit messages. To remember what a version is, the Human gives any commit a **version name**, either from the commit's block or optionally while restoring (it then names the version just before the restore). A version name is an annotated Git tag: the tag message holds the name as typed, and the tag ref is derived from it (whitespace becomes `-`, an invalid ref falls back to `version-<sha7>`, and a clash gets a numeric suffix). Names stay with the repository, survive clones, and never change a commit. The graph shows them as badges, and removing one deletes only the tag. Memory evolution can also switch from the graph to a **Named versions** list, read from all tags newest first, so a Human finds the versions they care about without scrolling the graph. The recovery list stays as a last-resort safety net under **Advanced · System snapshots**, with **Restore this snapshot**. The interface uses plain restore and backup wording rather than game terms. After any restore the Memory file list reloads at once instead of waiting for its next poll.

## Consequences

Restoring is ordinary forward Git history, so the Bot, Git tools and remotes see a normal commit and need no new concept. A restore whose tree equals the backup or HEAD tree adds no restore commit. Committing uncommitted work means a Bot's unfinished edits become history on restore, which is the point: nothing is lost and everything is visible. The restore and backup commits and the checkpoint reuse the `human-edit` cause kind, so the schema needs no migration. A dedicated cause can follow if the snapshot list needs to label restores separately. Creating a new PersonaBot from a commit (a fork) is a separate decision: a fork receives a copy of the Memory Repository but not the original Bot's Channels, Inbox or Session history.
