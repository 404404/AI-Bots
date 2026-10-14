## Why the change

Explain the user problem in one sentence / 用一句话说明要解决的问题。

Issue / Discussion: link here; use Closes only for completed work / 关联链接，部分工作用 Refs。

## Special things to note

- Merge risk: reversibility, blast radius and review focus / 回退方式、影响范围与评审重点。
- Verification: list exact checks and results; distinguish automated tests, runtime, visual evidence and Human QA. State what was not run / 列真实验证及缺口。
- CI test plan: the mode the `plan tests` job chose (affected / full / none). If this PR adds a config file, a test directory or a test that reads repo files, name the `scripts/ci-plan.mjs` rule it updated / 写明 CI 选测模式；新增配置、测试目录或读仓库文件的测试时，写明改了哪条规则。

## Change outline

Show the smallest useful before/after or structural outline / 简明展示变更形状。

For UI or interaction changes, embed sanitized GitHub-rendered before/after screenshots, or explain the concrete capture blocker and runnable review path / UI 或交互变化附脱敏前后截图，无法捕获时说明阻塞与验收路径。

AI assistance is welcome; the submitter must understand and validate the change. Do not include secrets or private data / 欢迎 AI 辅助，提交者负责理解与验证；不附敏感信息。
