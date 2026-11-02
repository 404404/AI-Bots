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

## 第一轮隔离基础镜像比较

[CI 41408605955](https://github.com/404404/AI-Bots/actions/runs/41408605955)，源码 `296090e43c76f3c3e8cbecf7681625dd8e835e15`，三种 worker 镜像均在独立 runner 成功构建，严格扫描包含未修复项并保留完整 JSON/SBOM。此次数据库与旧 CI 的扫描时间不同，不能把数量差异当成漏洞已修复。

| 固定基础 | 扫描 | 运行时检查 | Chromium 沙箱/E2E |
| --- | --- | --- | --- |
| Debian Trixie | 107 HIGH、1 CRITICAL；扫描无修复版本 108 | Node 24.21.0、Chromium 156.0.8078.73，版本探针通过 | Compose tmpfs 参数被错误拆分，容器未启动；未验收。 |
| Ubuntu 24.04 Noble / Playwright | 8 HIGH，其中 6 有修复版本、2 无 | 镜像实际为 Node 26.13.0，不满足 Node 24；探针失败 | 运行时不合格，未执行。 |
| Ubuntu 26.04 Resolute / Playwright | 6 HIGH，均有修复版本 | 镜像实际为 Node 26.13.0，不满足 Node 24；探针失败 | 运行时不合格，未执行。 |

三个比较任务均失败；不能据此选定合格镜像。候选的 Node 24 和安全包修订须分别验证，且不能跨发行版覆盖系统库。安全门禁没有放宽；真实 sandbox、浏览器操作、隔离和模型工具验收仍待执行。
