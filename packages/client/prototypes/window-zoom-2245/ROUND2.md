# #2245 原型第二轮：字号冲突与嵌入焦点

2026-10-19（Asia/Tokyo）。Task: `codex/local/01a1506e-87d7-7c10-b4d9-9ba86f02b264`。

**结论：在已安装 DSH 0.2.1-rc.2 的独立 Profile 中，下游兼容副本消除了固定字号注册；通过 macOS 系统输入，主文档、同源 iframe、跨源 iframe、原生 webview 获得焦点时，加减键均只产生一次整页缩放，字号 token 不变。无需修改上游或已安装 ASAR。** 这回答了有限原型问题，不代表完整 spec 或产品验收通过。

## 机制与装配

- `prepare-theme-compat.mjs` 只读提取已安装 theme 包到临时目录，保留 package identity、manifest、样式与许可证；Client 仅移除一次 `installFontSizeShortcuts` 调用。没有删除其他 Plugin 的 Registration 或竞态 monkey patch。
- 临时 Host 副本将 schema import 解析到安装包内的规范文件 URL，复用同一模块。只修改临时副本，不写入安装目录；Profile dependency 指向副本。Client 与 Host 原始文件 SHA 不匹配即拒绝适配。
- theme Client entry 实测只有一条；`fontSize.*` 固定动作列表为空；放大、Shift 放大与缩小的 Registry catalog 均无冲突。手动字号设置代码保留，但没有完成其 UI 回归。
- 原型仍是 application-defined、内存内的 zoom 状态，由自有 Client Plugin 的 Registration 消费原生 shortcuts 转发。所有成功输入样本 `mode=off`，未用 DOM capture 抢键。`KeyY` 只是原生路由正向对照。
- 运行基线：macOS arm64；DSH 0.2.1-rc.2；Electron 44.7.0 / Chromium 152.0.7977.130。原始和生成文件哈希见 `evidence/round2/compat-provenance.json`。第一轮已记录安装包 main/preload 哈希；公开源码 SHA 与安装 build id 不混用。

## 系统输入实测

输入由 `cua_repl` 发送系统按键；CDP 仅用于自有测试夹具的准备、状态测量和截图。不是 Human 物理键盘 QA。

**键位边界：** 本机 `super+equal` 与 `super+plus` 都产生 `Meta+Shift+Equal`；`super+minus` 产生 `Meta+Minus`。因此这一轮证明的是 Cmd+Shift+= 和 Cmd+-。无 Shift 的 Cmd+= 虽注册无冲突，但系统输入未独立通过资格；小键盘、Windows/Linux Ctrl 也未测。不能按工具调用名称宣称 plain Equal 已通过。

| 焦点/检查 | 可核对结果 |
| --- | --- |
| 非冲突 Cmd+Y 正向对照 | 一个 native keyboard 回调，一个 Registry action，L=0→1 |
| 主文档输入框 | 加号一个 keyboard 回调/一个 action，减号再增加各一个；L=0→1→0 |
| 同源 iframe 输入框 | 原生 kind=iframe；加减各一个回调/动作；L=0→1→0 |
| 跨源 iframe 输入框 | 原生 kind=iframe；加减各一个回调/动作；L=0→1→0 |
| 原生 webview 输入框 | 原生 kind=webview；加减各一个回调/动作；L=0→1→0；guest nativeZoom 始终为1 |
| 真实 recording API 开启，焦点在 guest | 加减均为零 callback、零 action，未缩放；随后关闭 recording |
| 字号与内容 | text/code/terminal token 始终14/11/13px；主文档和嵌入输入值保留，焦点仍在对应输入框 |
| 整页几何 | 根标尺200→240→200 CSS px，原生侧栏按钮252→302.40625→252 |
| 最终脚本全新启动复验 | 自动初启、停止、生成副本、重启到 ready 成功；guest 系统加减再次各一个回调/动作，截图内三类嵌入均可见 |
| 最终截图像素 | 三个100 CSS px嵌入标尺在120%均为240物理px，回100%均为200物理px（DPR2）；见 `fresh-embedded-pixels.json` |

`native-system-input.json` 保留17个状态快照，对应17张PNG。`main-equal-first-attempt` 是成功的 Shift+Equal 样本，文件名不代表无 Shift。`fresh-guest-plus/minus` 是最终新实例截图；此前截图中 guest 空白，不能用于其视觉通过结论。`state.errors=[]` 仅为原型捕获的错误，不等于完整浏览器 console/pageerror 审计。

## 首次失败与复现陷阱（原型运行手册）

1. **主题 Host 装载失败引发级联 pending**：临时包通过 node_modules symlink 指向 ASAR，Node ESM 仍无法解析 schemastery；theme Fiber 没起来，布局/会话等依赖都等待，出现 Human 截图中的启动失败弹窗。保留原 Client 的对照也失败，排除了移除字号安装调用本身。将临时 Host import 指向规范 ASAR 模块后装载恢复；最终新 Profile 从启动脚本复验成功。该结论仅涉及测试装配，不说明日常数据损坏。
2. **空 Patch YAML**：初始文件含 `[]`，不能直接在其后追加列表项。脚本去掉空数组行再追加 `insert`。
3. **启动/停止竞态**：直接启动二进制曾出现原生调试连接停滞；固定等待2秒也出现端口占用。最终脚本用 macOS LaunchServices，核对本任务 user-data 路径、等待准确进程退出、限时检查 ready；遇到其他任务端口会拒绝。不能据此宣称所有原生停滞根因已解决。
4. **CDP 按键不是有效原生正向对照**：此前连 Cmd+Y 都没有 callback。系统输入取得正向对照后才判断转发；没有把旧失败解释为上游不支持。
5. **后台等待与空白 guest**：默认 rAF 等待曾超时，改用有界轮询。第一组输入证据中 guest 已 ready、有焦点并回传按键，但截图显示空白；当时父文档 visibility=hidden，guest=visible，尚不足以证明原因。最终全新实例显示正常并复验加减；保留旧失败，不能将重新启动等同于彻底修复间歇绘制问题。

原始启动日志可能含本机登录 URL，仅本机保留；不发布 Human 提供的包含私有路径的错误截图。

## 依赖结论与未验证边界

- **D1 有限机制通过**：下游可消除固定字号冲突，并沿 Registry 只执行一次；帮助界面、自定义绑定、真实 IME、全部录制入口、plain Equal 和小键盘仍须验证。
- **D2 部分通过**：新实例同时具备整页几何、三类嵌入呈现及 guest 按键证据；间歇空白、极端布局、浮层坐标、拖拽、独立 WebContentsView 等未关闭。第一轮430%可操作性缺口仍有效。
- **D3 未验证**：没有持久化、默认值或窗口恢复实现。
- **D4 输入机制已取得正向证明**：三类嵌入焦点的一次转发已测；产品统一读/设/重置能力和 CLI 未实现。
- **D5 装配可行性通过，产品化未完成**：同 identity 临时副本、单一有效 theme entry、固定 hash 与全新启动已验证；发布包装、升级、回滚、手动字号及其他快捷键全面回归未验证。

不需要上游接受 PR，也不需要修改已安装桌面文件。仍需我们维护版本限定的兼容层；不能声称只追加一个普通 Plugin 就覆盖全部 spec。完整 DeepSeekBot 桌面集成、本机恢复、Windows/Linux、物理键盘、Human QA、CI、合并、发布均未取得资格。第一轮 BotHarness Web modal 测试与本轮 DSH 原生壳测试依然是不同组合。
