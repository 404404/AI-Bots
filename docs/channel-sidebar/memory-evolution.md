# Memory evolution

Open **Bot DM → Channel sidebar → Memory evolution**. This entry separates the repository’s current uncommitted changes from its Git history. Reading a diff does not apply it or revert a file.

## Inspect a change

1. Expand **Memory evolution**.
2. In **Current Memory**, expand a change group and click a file to open its **Uncommitted diff** in the center.
3. In **Commit history**, click a commit row to open its changed files and **Commit diff**.
4. Click **Back to chat** when finished. Use **Load more commits** to inspect older history.

![A real uncommitted topic file in the working diff](/guides/channel-sidebar/09-memory-working-diff-zh.webp)

![The repository’s branch and commit history beside a commit diff](/guides/channel-sidebar/03-memory-evolution-zh.webp)

| Control or label                        | Meaning                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| New Memory / Updates to existing Memory | A friendlier grouping of uncommitted working-tree changes.                                                               |
| Unstaged / Staged / Untracked           | The corresponding Git grouping when the display terminology is **Git**.                                                  |
| HEAD and branch labels                  | The checked-out commit and references in the Git graph.                                                                  |
| Recorded / Git commit / Needs repair    | BotHarness checkpoint annotations on Git history; they do not establish who authored the files or approve their content. |

Change the terminology with the gear in the **Memory evolution** title → **Terminology**. This changes labels and grouping, not repository contents.

## Request a branch switch

Select an existing branch in **Search branches**, then click **Switch**. The interface sends a request to this Bot’s Orchestrator; selecting an item alone does not check out a branch. Wait for the Bot’s result and verify the displayed branch and current files. If Git refuses because of unfinished changes, keep the changes and inspect the Bot’s report.

From a commit diff, **Create and switch branch from this memory** opens a new-branch name field. **Create and switch** also sends a Bot request; it creates a branch from that commit rather than undoing later commits on the original branch. Confirm the operation and resulting files after the Bot completes it.

## Restore an earlier memory

Select a commit in the graph. **Restore to this commit** appears inside that commit's block; you can also right-click any commit. The confirmation says that Memory returns to how it was right after this commit: the commit's own changes are included and later commits are not. If Memory has changes that are not committed yet, they are first saved automatically as an ordinary commit in the graph. You can also give the version before restoring a name. **Save changes and restore** (or **Restore** when there is nothing uncommitted) then adds a new commit whose files match the selected commit. Every point you can go back to stays in the same graph, and **Memory files** refreshes as soon as the restore finishes.

## Name a version

Select any commit and click **Name this version** to give it a name you will recognise later, such as "Draft before cleanup". The name appears as a badge on that commit in the graph. Remove it with the × next to the name in the commit's block. Names are stored as Git tags, so they stay with the Memory repository and do not change any commit.

## Advanced: system snapshots

**Advanced · System snapshots** lists the snapshots BotHarness takes automatically when Memory changes or a Bot session ends. Each snapshot keeps the branch, commit, staged files and uncommitted files in hidden Git objects that do not appear in the graph. They are a last-resort safety net; for everyday time travel, use the graph. Select a snapshot and use **Copy and restore** to go back to it. This fully backs up the repository first and shows the backup location. A **Repair Memory** state has its own confirmation and backup procedure.

The screenshots demonstrate reading the real repository and commit diff. They do not demonstrate a recovery or claim that the example repository needed repair.

Related: [Memory files](/docs/channel-sidebar/memory-files), [Display and layout](/docs/channel-sidebar/display), [sidebar overview](/docs/channel-sidebar).
