---
section: Added
---

## en

- Added a controlled macOS desktop whole-window zoom slice with local defaults, Settings controls and an explicitly targeted CLI; activation requires the pinned downstream theme composition and native qualification ([#2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)).

- Kept Bot-mode panels aligned while zooming by correcting Dockview overlay coordinates and splitter movement in the bundled compatibility patch ([#2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)).

- Kept macOS window controls clear of zoomed panel headers by preserving the native corner footprint and converting header clearance to local layout units ([#2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)).

## zh

- 新增 macOS 桌面整页缩放受控切片，提供本地默认值、设置控件和明确指定窗口的 CLI；启用需要锁定版本的下游主题组合和原生验证（[#2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)）。

- 通过随 Client 打包的 Dockview 兼容补丁修正内容层坐标与分隔线位移，保持 Bot 模式面板在缩放后对齐（[#2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)）。

- 保持 macOS 原生窗口控制区的屏幕尺寸固定，并将相交 panel header 的留白换算到本地布局坐标，避免缩放后标题被遮挡（[#2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)）。
