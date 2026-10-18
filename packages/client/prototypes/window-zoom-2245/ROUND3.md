# #2245 原型第三轮：普通 Cmd+= 与 webview 空白归因

日期：2026-10-19（Asia/Tokyo）。Task: `codex/local/01a1506e-87d7-7c10-b4d9-9ba86f02b264`。基于第二轮 `6a8dbd5992120d988b39d6b2060d930319bb3d66`，仍为隔离可丢弃原型；DSH/macOS/Electron 版本和 theme 兼容副本不变。

## 普通 Cmd+=

Human 真实键盘输入已证明无 Shift 的 Cmd+= 在主页面生效。第一组连续操作记录11个 Equal、10个 Minus，全部 `meta=true, shift=false, control=false, alt=false, repeat=false`，对应21个 `registry:keyboard` 动作；与12个明确标记为 `paint-cycle` 的夹具设置操作分开计数。随后单次人工对照新增一个 Equal和一个Registry动作，100%→120%。字号 token 始终14/11/13px，guest nativeZoom=1。

证据：`physical-keys-ongoing.json`，以及 `watch.json` 中 watch-9→watch-10（native 21→22、Registry actions 21→22，后者focus=zoom-edit）。Human确认能够放大缩小。原生来源是keyboard，不能将预设guest焦点或Human操作意图当作webview路线证据；当时夹具重建与人工操作有交叠。第二轮 Shift+Equal 的 iframe/webview路由资格保持独立。

## 空白的直接原因与对照

**原型的偶发空白已归因到父页面隐藏/被遮挡时，原生 webview 的绘制提交没有跟随DOM状态完成。** 页面可以完成租约握手、导航、加载和输入，而截图仍为空白或保留旧画面。恢复真实可见性后，同一个 guest 无需导航或重建就恢复。不是把 `guestReady=true` 当成渲染成功。

这是对本机实测现象的归因，不是对 Chromium 内部具体函数或GPU根因的断言。恢复路径使用全屏再退出，它也改变原生窗口几何；因此不能只凭这一步声称排除了所有底层窗口事件因素。组合对照如下：

| 条件 | 结果 |
| --- | --- |
| 正常可见窗口，100%/120%往返12次 | 12/12三类嵌入画面正常 |
| 页面hidden，将144%改为100% | iframe标尺200/200物理px，guest仍288px；等待后仍保留旧比例 |
| 页面hidden创建guest，CSS zoom=1 | 网页complete、guest visibility=visible，父页面hidden；整窗截图只有两个iframe标尺，guest空白 |
| **移除根级CSS zoom**，hidden创建三次 | **3/3空白**；证明不需要缩放CSS即可触发 |
| hidden时局部webview宽260→261→260 | 未恢复绘制 |
| 同一guest恢复真实visible | id=9保持相同，两条dom-ready握手/导航记录不增加；三个标尺200/200/200，空白消失 |
| 真正visible时同代码创建三次 | **3/3正常**，三个标尺均200px |

混合循环里的 `visible-create-2` 实际在 hidden 开始并失败，名字不是判定依据；正式对照以 JSON 中的真实 visibility 为准。仅AX Raise、选择原生Window菜单项或“有焦点”均曾不足以保证父页面visible。最小化一个已经绘制的guest可能保留旧画面，并不必然立刻空白；**隐藏时首次创建**才是本轮稳定复现条件。

安装产物只读审计：`createWindow` 未显式关闭 `backgroundThrottling`；原生 `browser`租约装配会重设guest WebPreferences，Plugin设置任意webpreferences不能被当作可靠解决路径。Electron官方说明macOS可见性会反映遮挡，后台节流影响帧的绘制和交换；这与实测相符，但不能代替实测：[BrowserWindow Page visibility](https://www.electronjs.org/docs/latest/api/browser-window#page-visibility)、[WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)。未修改这类安装配置，也不建议通过禁用全局节流掩盖测试问题。

## 额外发现：局部截图假空白

同一个visible、已经绘制的窗口：整窗截图三个标尺正常；CDP `clip`局部截图缺guest；紧接着整窗截图又正常。`captureBeyondViewport:false`也未消除。此路径是截图采集差异，不能当作真实窗口空白。第二轮原始截图使用整窗采集，所以它不是上一轮空白的解释。

本轮测量工具默认整窗捕获；`ZOOM_PROTOTYPE_CLIP=1`只用于重现截图问题。发布前人工检查截图；有本机工作区路径tooltip的完整截图只留本机，公开JSON保留测量结果。没有对截图做生成式修改。

## 验证工具与使用边界

启动器和本地fixture仍沿用README。`recreate-guest.mjs`在正常browser租约路径中替换测试guest；`probe-paint.mjs`记录可见性、guest id、加载状态、字号、原生键与动作，并保存整窗截图。`measure-paint.py`需Pillow；检出三个teal标尺并验证宽度相等，缺失或宽度不一致退出2。它只适用于当前三标尺夹具。

```sh
# 先确认是本任务THROWAWAY窗口；BH_SOURCE_ROOT指向有依赖的checkout。
node packages/client/prototypes/window-zoom-2245/recreate-guest.mjs
node packages/client/prototypes/window-zoom-2245/probe-paint.mjs snapshot sample
# ZOOM_PROTOTYPE_PYTHON可指定有Pillow的Python。
node packages/client/prototypes/window-zoom-2245/probe-paint.mjs verify sample-qualified
```

`verify`仅在父页面visible且整窗三个标尺均绘制、宽度一致时返回0；hidden即使保留完整旧画面也不合格。`snapshot`允许保存失败现场。默认写到`evidence/round3-rerun`，不覆盖本轮提交证据；可用`ZOOM_PROTOTYPE_EVIDENCE_DIR`指定临时目录。等待dom-ready使用有界轮询，不依赖hidden页面的rAF。真实前台切换由原生UI或Human执行，工具不伪造Page Visibility。

## 对 #2245 的影响

- D1：plain Equal主页面键位由真实输入通过；不是只看绑定表。默认字号冲突仍由第二轮下游副本处理。
- D2：本轮原型空白不再是未知“缩放可能失败”；已建立隐藏首次创建/过期画面复现与可见恢复证据。正式验收仍须验证真实前台呈现、切回窗口、极端布局和独立原生子视图。
- D4：必须在输入路径、实例焦点、页面可见性和像素结果都满足时判断通过；原型测量脚本不是产品CLI。
- D3持久化、D5正式包装/升级/回滚、其他平台、小键盘、真实IME、完整DeepSeekBot桌面集成仍未完成。Human仅参与上述特定按键步骤，不等于完整Human QA通过。

没有正式实现、实现PR、合并、上游修改或已安装ASAR修改。

## 保留的人工步骤

主页面plain Equal已通过。为独立验证webview plain Equal，最后已停止重建、将guest输入标成`WEBVIEW: Cmd+=`，确认guest id=12、parent activeElement=zoom-guest、guest activeElement=edit，并清零该样本计数。发布本轮报告时尚未收到此样本按键，因此它仍是**待验证**，不借用第二轮Shift+Equal或主页面结果。隔离窗口保留供Human完成这一步；无需重新执行已完成的空白归因。
