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

[CI 41416024016](https://github.com/404404/AI-Bots/actions/runs/41416024016) 的测试挂载修复后，构建成功，四个扫描仍失败，候选归档跳过。Chromium 在隔离 runner 创建会话并首次导航时给出 `ERR_PROXY_CONNECTION_FAILED`，导航失败；会话随后关闭。该错误定位到代理连接阶段，不能据此宣称已查明根因或通过任何后续浏览器操作和隔离验收。

[CI 41416625175](https://github.com/404404/AI-Bots/actions/runs/41416625175) 在比较镜像中将仅构建时使用的 npm 留在构建阶段，并保留最终镜像的系统包数据库、生产依赖及许可证。Trixie 扫描为 107 HIGH、1 CRITICAL；Noble 为 2 HIGH（GStreamer 的 CVE-2025-3887 两个包项，未提供修复版本）；Resolute 的 Trivy OS/应用扫描无 HIGH 或 CRITICAL。三种结果均未完成验收：Noble 和 Trixie 的扫描失败，Resolute 在真实容器启动时报 `chromium-sandbox-unverified`；Node 本体扫描覆盖在三种候选中均未证明且强制失败。Trivy 的零发现不代表完整发布门禁通过。

该轮 Resolute 仅在 runner 内构建的 image config ID 为 `sha256:2183c4684d6f87328c644647f384a4e6f70af1fdfb3ba83abf84cdec920974c3`，没有 registry repo digest，不能用作已发布镜像或部署身份。

[CI 41437483966](https://github.com/404404/AI-Bots/actions/runs/41437483966) 使用 `cc05b09d4638b34e09a8290eedf232545789d11d`：四个镜像扫描均失败，归档跳过。真实 Trixie Chromium 的 namespace、PID namespace 和 Seccomp-BPF 状态均为 true，隔离测试页的导航、读取、输入、滚动、点击和截图经 relay 完成；完整 E2E 随后在权限错误码断言失败（期望 `target-origin-denied`，实际 `required-policy-unmet`）。尚未完成后续取消、隔离及清理等全部用例，不能将作业标记通过。

[CI 41438552270](https://github.com/404404/AI-Bots/actions/runs/41438552270) 补齐测试所需策略参数后，metadata 地址拒绝通过，但发现 **安全失败**：严格 deny 会话访问无 query 的测试地址时，HTTP 重定向后的含 query 目标实际经过代理到达 fixture，Worker 错误地返回完成。现有 Playwright route 拦截不足以约束重定向后的请求；不能将该版本的模型 Browser 工具作为安全可用功能部署。后续必须在请求发出前覆盖重定向，HTTPS 无法证明安全时必须拒绝。

[CI 41439388440](https://github.com/404404/AI-Bots/actions/runs/41439388440) 的 Resolute 镜像由 Syft 正确识别 Node 24.22.2，Grype 对已知 NVD/CPE 匹配未报告该 Node 二进制的 HIGH/CRITICAL；这是辅助证据，CPE 匹配存在范围与误匹配限制，不证明 Node 核心漏洞的完整覆盖。该镜像沙箱探针仍失败，脱敏诊断显示失败发生在 `chrome://sandbox` 导航阶段，原因尚未确认。

[CI 41440677136](https://github.com/404404/AI-Bots/actions/runs/41440677136) 中，严格租约的 HTTPS CONNECT 在代理处返回 403；第一个会话完成基础操作后，第二个会话创建等待超时，Gateway 返回 `worker-unavailable`，因此后续 query 重定向零命中和跨会话用例未完成。[CI 41440677038](https://github.com/404404/AI-Bots/actions/runs/41440677038) 的 Resolute 使用完整 Chromium channel 后仍在沙箱页面导航阶段超时，严格沙箱门禁保持失败。此次两轮均未发布或部署。

## 当前已验证范围与剩余门禁

[CI 41445703818](https://github.com/404404/AI-Bots/actions/runs/41445703818)（源码 `6f5b8f40da1a332bd3cedd85404becb4b74f1121`）的独立 Chromium E2E 成功，四个生产候选镜像扫描仍失败，候选归档跳过。Terra 核对了真实 fixture 的导航、读取、输入、滚动、点击及截图，沙箱三项正向状态、metadata 拒绝、不同 Bot/Task 会话的 cookie 隔离、HTTP query 重定向与图片目标零命中。真实取消、超时、操作幂等重放、实际 popup、截图跨范围隔离和真实模型调用未包含在这次通过范围中；HTTPS 重定向仅验证返回错误。

[CI 41445703831](https://github.com/404404/AI-Bots/actions/runs/41445703831) 的 Resolute 比较镜像在同一源码下通过 Trivy HIGH/CRITICAL、Node 24 运行探针、沙箱及现有 fixture E2E；Syft/Grype 对已知 NVD/CPE 的 Node 二进制匹配无 HIGH/CRITICAL。比较结果仍为失败：Node 核心覆盖未完全证明的单独门禁未通过。该 runner 内 image config ID 为 `sha256:a252f0a2ef8a71f867648e729ec2d3bbf8d36a1f643cafe990d9db23402feb9a`，无 registry digest；这不是可部署镜像。比较用途的 256 PID 有界配置下，三个页面创建成功且内核上限事件为零；先前 128 上限时曾有达到上限的事件，第二个页面创建超时。

严格 `browser_read` 当前拒绝 HTTPS 和包含 query 的目标；HTTPS 支持、真实模型/工作 Bot 汇报、所有镜像的扫描与完整隔离验收仍未完成。镜像组必须来自同次构建；旧 Worker 与新 Proxy 混用会因缺少租约策略而拒绝。以上候选均未发布、未部署至 GK50。

[CI 41447306166](https://github.com/404404/AI-Bots/actions/runs/41447306166)（源码 `b63554497c8755361a05e282b3f9ed4eea0ef7cf`）的独立 Chromium 作业通过。Terra 核对：同一 operation ID 的重复点击只产生一次 fixture 副作用；截图对错误 Bot 和 Task 均返回 404；popup 初始请求到达 fixture，query 目标计数为零；慢请求到达后取消、随后拒绝会话操作；另一慢请求返回 `504 navigation-timeout`，fixture 计数增加一次且会话可恢复。Cookie 隔离、HTTP 重定向和子资源零命中及 metadata 拒绝也有真实测试证据。HTTPS 重定向只验证返回错误，TLS 目标零命中、真实模型与 Host 集成、完整跨范围状态以及崩溃重启恢复仍未覆盖。四个生产镜像扫描失败、归档跳过，整个 run 失败。

[CI 41512379257](https://github.com/404404/AI-Bots/actions/runs/41512379257)（源码 `e64f3649e10d3c907f8bdda6e7eb7544657c4b81`）独立构建了 Ubuntu 26.04 的 Proxy、Gateway、Fixture 比较镜像。三项 Trivy HIGH/CRITICAL 扫描均无发现、SBOM 均生成，但各 job 因 Node core 覆盖仍标为 `uncovered` 而失败。它们分别只生成 runner 内 image config ID，未发布 registry digest；与 Resolute Worker 同批次运行的集成验收尚未完成。旧生产镜像的四项失败不因这些比较结果而改变。

[CI 41513606564 的 integrated-resolute 作业](https://github.com/404404/AI-Bots/actions/runs/41513606564/job/125511386336)（源码 `f5431e1ab8d1fc23154cef2631161bed50dd303d`）在同一隔离 runner 构建四个比较镜像及独立 E2E runner。Terra 独立核对：五个镜像分别按 config ID 扫描，Trivy OS/library HIGH/CRITICAL 均无发现、SBOM 已记录；Compose 实际五个容器的镜像 ID 与扫描对象一致，真实 fixture E2E 和资源清理均退出 0。该 job 因 Node core 完整漏洞覆盖未建立而按门禁失败，未发布或部署。四个产品镜像的 runner 内 config ID 为：

| 镜像 | 仅供本次 CI 追踪的 config ID |
| --- | --- |
| Worker | `sha256:caee4abfb54909eeb70b3f4667a425eaf946de1277a00c9bd19da0120969a75f` |
| Proxy | `sha256:292140b9ff5136c318e24bb381838d1d6591f47df0a8c31e35b099960090d9a2` |
| Gateway | `sha256:5487c3540d8b0f4124cf9990cc49348fc08258a2858c13dd8b6ff8fe9f35754f` |
| Fixture | `sha256:61bb0b4841ef3c7bb98c39d895e19bc202a02e9e408ef9511a99935cf389a111` |

这些 ID 是本次 runner 中的镜像配置摘要，并非已发布的 registry manifest digest，也不能当作 GK50 部署身份。

[CI 41516079293 的 integrated-resolute 作业](https://github.com/404404/AI-Bots/actions/runs/41516079293/job/125519868804)（源码 `b78afea5edc8b9572c0575660a868ed0f98b61b6`）增加了逐镜像 Node 二进制辅助审计。Terra 核对五个镜像的实际容器、扫描对象与 config ID 一致；五项 Trivy HIGH/CRITICAL 为零，Syft 均识别预期 Node 24.22.2，Grype 对当时 NVD/CPE 记录的已知匹配均为零，数据库有效且包含未修复项；真实 E2E 与清理退出码均为 0。该结果只覆盖已收录的漏洞，不能证明未知或未收录漏洞不存在。作业仍按已有 Node core `uncovered` 门禁失败，未发布或部署。该轮四个产品镜像的 runner 内 config ID：

| 镜像 | 仅供本次 CI 追踪的 config ID |
| --- | --- |
| Worker | `sha256:296567687c881d35528e5b607b21e1c6bbaad5e1fbbc6298ca89b185bc800b8e` |
| Proxy | `sha256:98773471d2900025644f5b5ded7d20e0a83eae69c6f280dab070bb0220324034` |
| Gateway | `sha256:b636afb4847dcc2fd2fbe31699617c6d94d74ae27bfa5e5a05a0613b7df809a7` |
| Fixture | `sha256:e2667f9953422df931ee40f52cee54438b70a1ad6f6c6843bc049cfaf9d70414` |

执行记录：一次本机 Compose 构建在获取基础镜像 metadata 时被中止，未创建项目容器、网络或卷；只读核查未发现该构建的候选镜像或基础镜像。现有 Docker 构建缓存无法逐项归因，未清理。后续容器诊断限定在 GitHub 隔离 runner。
