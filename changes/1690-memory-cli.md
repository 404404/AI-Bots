---
section: Added
---

## en

- The `deepseekbot` memory commands now work against a live Host, and the CLI covers the whole Memory panel: commit graph and diffs, uncommitted changes, named versions, recovery checkpoints, restore to a checkpoint or an earlier commit, and repair. Every write names the head it expects, so a concurrent change fails instead of being overwritten ([#1690](https://github.com/BotHarness/DeepSeekBot/issues/1690)).

## zh

- `deepseekbot` 的 Memory 命令现在可以作用于在线 Host，命令行也覆盖了整个 Memory 面板：提交图与差异、未提交的改动、命名版本、恢复检查点、恢复到某个检查点或更早的提交，以及修复。每次写入都指明预期的 head，所以并发修改会失败而不会被覆盖（[#1690](https://github.com/BotHarness/DeepSeekBot/issues/1690)）。
