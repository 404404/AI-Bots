# Unreleased change fragments

Each PR that needs a Release Ledger entry adds one file here instead of editing
`CHANGELOG.md` and `CHANGELOG.zh.md`. Separate files keep parallel PRs from conflicting.
Read [the Release Ledger guide](../docs/agents/changelog.md) for what deserves an entry and how to
word it.

Name the file after its Issue or PR and a short slug, for example `1552-change-fragments.md`:

```markdown
---
section: Fixed
---

## en

- Fixed duplicate Inbox Admission after provider retries, so a PersonaBot wakes once per Source Event ([#123](https://github.com/BotHarness/BotHarness/issues/123)).

## zh

- 修复了 Provider 重试后重复准入 Inbox 的问题，PersonaBot 对每个 Source Event 只唤醒一次（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。
```

`section` is one of `Added`, `Changed`, `Fixed`, `Documentation`, `Breaking Changes`,
`Deprecated`, `Removed` or `Security`. Both blocks hold the same number of entries with the same
link targets in the same order. Run `pnpm changelog:check`; it validates every fragment and the
ledger composed with them, which is what the Development status page and candidate builds show.

The release PR runs `pnpm changelog:fold` to append the fragments to the `Unreleased` sections
of both ledgers in file-name order and delete them, then edits and archives `Unreleased` as before.
