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

## Compose 修复后的独立诊断

[CI 41414339031](https://github.com/404404/AI-Bots/actions/runs/41414339031)，源码 `1ae9c8084795d5377f0813bd81efd8c3d5ff95fb`：四个镜像的扫描均失败，候选归档跳过。隔离 runner 成功创建服务并建立浏览器会话，但首次导航至 fixture `/count` 返回 `browser-operation-failed`（HTTP 502），浏览器操作验收失败，具体原因待定位。CI 随后删除了测试容器、网络和卷。会话创建不等于 PID namespace、Seccomp-BPF 或其他验收项全部通过。

Ubuntu 比较候选随后改用发行版自身的安全更新及 Node 官方 24.22.2 文件；其 SHA-256 已与 Node 官方发布清单核对。文件形式安装的 Node 本体是否被镜像扫描与 SBOM 覆盖仍需单独证明，不能将系统包扫描结果作为该运行时本体的漏洞扫描结论。新一轮比较见 [CI 41414613249](https://github.com/404404/AI-Bots/actions/runs/41414613249)，以该作业最终结果为准。

该轮三个候选均完成构建与运行时探针，严格扫描和 fixture E2E 均未通过：Trixie 为 107 HIGH、1 CRITICAL；Noble 为 8 HIGH（两个 GStreamer 系统包发现没有修复版本，另外六项来自 Node 官方包内 npm 的依赖）；Resolute 为 6 HIGH，均来自同一 npm 依赖。Node 24 本体漏洞覆盖仍待证明，不能把 npm 依赖扫描等同 Node 本体扫描。所有比较均未形成可发布镜像。

提交 `899a2e2b49f1bc3667e57c34390f5c78c2b0193d` 的 [CI 41415627822](https://github.com/404404/AI-Bots/actions/runs/41415627822) 在构建前的测试步骤失败：隔离测试容器缺少新加入的 Host 客户端测试文件，因此扫描与 Chromium 诊断被跳过。独立 Terra 在非容器环境执行相同源码的 Standalone 154/154、Browser 40/40 通过；这些是合成测试，不能代替真实 Chromium 或模型验收。

执行记录：一次本机 Compose 构建在获取基础镜像 metadata 时被中止，未创建项目容器、网络或卷；只读核查未发现该构建的候选镜像或基础镜像。现有 Docker 构建缓存无法逐项归因，未清理。后续容器诊断限定在 GitHub 隔离 runner。
