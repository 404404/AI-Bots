# #2245 最小原型验证结果

> **最新见 [第三轮报告](ROUND3.md)**：普通 Cmd+= 的实际按键验证、hidden 页面 webview 空白与截图边界。第二轮和以下第一轮作为历史保留。

> **最新进展见 [第二轮报告](ROUND2.md)**：下游兼容副本和系统输入已取得固定字号冲突消除、三类嵌入焦点单次转发的有限证明。以下保留第一轮原始结论；其中快捷键/装配待验证项已由第二轮推进，完整 spec 仍未通过。

日期：2026-10-19（Asia/Tokyo）。Task: `codex/local/01a1506e-87d7-7c10-b4d9-9ba86f02b264`。范围：Human 授权的可丢弃原型；没有正式实现、实现 PR、合并或发布。

## 结论

**不改上游，已能通过普通 Client Plugin 实现主文档缩放；本次样本中的 DSH 页面、Bot Settings modal、同源 iframe、跨源 iframe 和原生 webview 均有正向呈现证据。完整 #2245 仍未通过：默认加减键冲突没有被正式解决，嵌入焦点的原生按键转发未取得有效正向对照，极端比例仍有布局问题。**

不需要恢复“等待 DSH PR”的依赖。下一步若另行授权，重点应是我们自己的快捷键兼容与输入资格验证，而不是开始大面积制作设置 UI。此次没有实现或验证下游兼容包，因此也不能断言“只增加一个 Plugin 就能完成所有条款”。

## 运行基线

- 原型分支基线：BotHarness main `915b9049882b0a7583bc07b193b73ee48f59f6db`。仅原型目录新增代码；现有正式模块未改。
- 原生：已安装 DSH `0.2.1-rc.2`，Chromium `152.0.7977.130`，macOS；独立 DSH_HOME、browser user-data 和调试端口。普通 Profile Patch `insert` 加载自有 Client Plugin。安装目录、ASAR、官方包内容均未改。
- 已安装 main SHA-256：`6f3d1ddd1106371452c2204be6dfb2e5460a8e8259cdd05cdccb5387b3f9a85a`；preload SHA-256：`f323eb67f7ace407d3b1d858f264f7846e436d9ba3e80c02b0454a6da0aed968`。源码审计基线沿用上一条调查；桌面 build id 不等同公开源码 SHA。
- BotHarness 布局：另一个由 `verify-app` 启动、doctor 通过的隔离 Web Host，DSH `0.2.0-rc.2`，1440×900 viewport，使用本机已有构建，**不是本原型分支的完整重新构建**。Client SHA-256 `84a4ebe92dbed82d5a3c32059c0eacd24ff7184ba4b25aeca4f69970ff20c67b`；Core SHA-256 `463677454822167de972fe5a760e3bc0c1388d4c9f2a06486517f721fcc3f525`。
- 上述两项是分别运行的真实页面与壳机制实验，不能相加称为“已通过集成后的 DeepSeekBot 桌面验收”。

## 实测矩阵

| 检查 | 结果 | 证据与解释 |
| --- | --- | --- |
| 正常 Plugin 装载 | 通过 | 原型经 Profile Patch 和 Client module loader 加载；没有使用 DevTools 注入来冒充 Plugin 安装 |
| DSH 整个主文档呈现 | 通过，本次范围 | 根级 CSS zoom=1/1.2/1.44，200 CSS px 标尺变为 200/240/288；原生侧栏按钮宽 252→302.40625→362.8984375，主内容与固定原型面板同步变化 |
| Bot Settings modal | 通过，本次布局范围 | 100% 为 760×640，120% 为 912×768，144% 宽约1094.39且高度受可视区限制，83% 约633.33×533.33；恢复100%回到760×640。两次最终 Web 测量 console/pageerror 均无条目 |
| 普通加减注册 | **冲突已复现** | `zoomPrototype.increase/decrease` 的真实 catalog 分别列出 `fontSize.increase/decrease` 冲突；注册本身未移除固定动作 |
| 未拦截的 Cmd+= | **确实调整字号** | level保持0；文字/代码/终端 token 从15/12/14 px变为16/13/15 px；Cmd+-还原 |
| 主文档 capture 原型 | 局部通过 | 输入框内 Cmd+= 后level=1，标尺240；字号token保持15/12/14；原型input内容与焦点保留。原生帮助仍保留字号条目，冲突没有被产品级解决 |
| 录制 / 组字保护 | 有限通过 | 调用真实 recording API并设置原型本地guard后不缩放；合成composition事件也不缩放。没有验证所有实际录制入口或真实IME，不可扩大为完整保护通过 |
| 同源iframe / 跨源iframe / webview呈现 | **通过，100%→120%样本** | 三个100 CSS px标尺在DPR2截图中均从200物理px变为240物理px；webview由正常browser.acquire租约+about:blank握手创建，原生guest zoom仍为1，无需改变其自有zoom值 |
| iframe焦点下Cmd+= | DOM capture不足 | 同源/跨源iframe内level均保持0；父文档capture没有收到这一路输入。但此项不能单独否定原生转发 |
| 原生转发正向对照 | **未取得有效证明** | 不冲突的Cmd+Y也没有触发；CDP主文档/iframe输入及webview.sendInputEvent试验均未获得native callback。第二次guest试验已确认父文档activeElement为webview，仍无callback。保留为驱动/原生焦点路径未归因，不能把它写成DSH能力失败或已通过 |
| 极端430% | **可操作性未通过资格** | 设置左导航占去大部分宽度，内容逐字换行；带教程叠层时顶部越出viewport。没有证明完整滚动、恢复入口或所有控件可达 |
| 独立WebContentsView | 未运行 | 平台原生子视图不在本次fixture；不能用iframe/webview结果覆盖它 |

原始像素测量见 `embedded-pixel-measurements.json`；测量使用原始PNG实际颜色（截图颜色配置使teal成为RGB55/126/127）。曾按缩略图初步误判跨源内容未缩放，原始像素测量纠正了该判断；最终结论以200→240为准。

## 首次失败与恢复

- 首次新行用了仅覆盖已有行的Patch形状，原型没有装载；改为`insert`后正常装载。
- 首次快捷键defaults误用了`desktop`，原生拒绝`Invalid shortcut profile`；修正为`desktop:macos`并重新加载，最终catalog如上。首次日志留在本机，未发布含登录URL的原始日志。
- 首次webview直接导航fixture，未完成租约要求的`about:blank#lease`初始握手，未能附着；修正后guestReady与实际画面通过。
- 重启时曾遇到端口/进程退出竞态；一次焦点探测期间原生调试连接无响应，停止并重启任务自己的进程后恢复，根因未定。未操作日常实例。
- Web helper首次停在预览说明；doctor仍健康。显式处理“继续”并保留首次失败后进入页面。第一次布局实验也保留教程叠层，第二次关闭教程后单独测量设置。
- 一次Web页面出现Activity重连/模型加载文字；它不是缩放渲染通过的证明，也没有用于声称Host数据或模型功能通过。没有发送模型消息。

## 对 D1–D5 的影响

- **D1部分证实，未关闭**：固定字号冲突是实测事实。capture可以覆盖主文档一次动作，但不是帮助/自定义绑定/所有录制入口的一体解决方案；仍需下游兼容处理。
- **D2部分证实，未关闭**：根级CSS方案对真实主页面、modal及三类嵌入样本可行；需要继续处理极端布局、坐标相关交互以及独立原生子视图。
- **D3未验证**：原型刻意不保存；默认值、退出恢复、多窗口不在本轮。
- **D4未关闭**：嵌入键盘与原生正向对照仍需可靠驱动/实际键盘资格，agent正式读设重置路径未实现。测量脚本不等于产品CLI。
- **D5未验证**：本轮只加载附加Plugin，没有制作、替换或验证theme/shortcuts兼容包。

Windows/Linux、真实物理键盘、小键盘、真实输入法、全套浮层/拖拽/终端/画布、持久化、Human QA、CI、合并和发布均未通过本轮资格。原型证据只支持上述有限可行性结论。
