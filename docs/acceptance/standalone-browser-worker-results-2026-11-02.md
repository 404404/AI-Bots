# 独立 Browser Worker 验收结果（2026-11-02）

本记录分别列出真实 CI、独立应用测试和未完成的门禁。现有 23443、20443、22443 不参与测试，不能把结果视为已部署或正式发布。

## 原始 Trixie 基线

[CI 41378523337](https://github.com/404404/AI-Bots/actions/runs/41378523337) 的 worker 严格扫描为 108 HIGH、1 CRITICAL；应用包扫描为零。包、CVE、官方修复状态与构建层归因见[镜像研究](standalone-browser-image-research-2026-11-02.md)。当时其他镜像扫描及真实 sandbox/E2E 未运行。

## 拆分门禁后的真实 CI

[CI 41407365822](https://github.com/404404/AI-Bots/actions/runs/41407365822)，源码 `2795679166881ece8e0ea054fcfd4b64dbd91143`：一次构建通过，四项扫描和真实 Chromium 诊断独立运行；正式候选归档按依赖门禁跳过。

| Job | 结果 |
| --- | --- |
| Worker 扫描 | 失败：108 HIGH、1 CRITICAL。 |
| Proxy 扫描 | 失败：45 HIGH。 |
| Gateway 扫描 | 失败：45 HIGH。 |
| Fixture 扫描 | 失败：45 HIGH。 |
| Chromium sandbox / fixture E2E | 失败于 Compose YAML 解析；容器尚未启动，不能判定真实沙箱通过或失败。 |
| 合格候选归档 | 已跳过；没有发布 GHCR 或部署。 |

Ubuntu 24.04/26.04 和 Trixie 的独立构建比较尚未完成。安全门禁没有放宽；真实 sandbox、浏览器操作、隔离和模型工具验收仍待执行。
