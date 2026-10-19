---
template: sheet
title: T7 外观恢复与完整验收
subtitle: "PR #2282 · 两种恢复范围 · Human QA 待完成"
cols: 2
source: "base 65ff85a68df5a395014ab2ec83f4708797d718e1 · head 37725cae72c39d35431bb7b4277df2f6e09a7029 · 2026-10-19"
---

## A 从任何自定义回到可用状态

全局外观设置顶部提供恢复入口。只清除当前模式全部面板覆盖，会保留全局颜色、另一模式、Primary、壁纸与布局。全部恢复先说明范围并确认，再重置深浅两套外观和共享壁纸。

恢复按钮与确认窗口保持可读。单个功能面板的编辑仍只从 Header 右键进入，不新增全局面板编辑列表。

## B 仍然由两个原有模块保存

```flow
[界面确认或定向 CLI] -> [验证两份当前修订]
[验证两份当前修订] -> [Appearance 保存默认外观]
[Appearance 保存默认外观] -> [Wallpaper 删除当前素材]
[Wallpaper 删除当前素材] -> [释放背景与预览资源]
```

[恢复协调器](https://github.com/BotHarness/DeepSeekBot/blob/37725cae72c39d35431bb7b4277df2f6e09a7029/packages/client/src/client/appearance-recovery.ts) 不建立新的持久化副本。Host 只传递明确 Client 的指令，不成为外观或媒体所有者。

## C 失败时说清楚已经发生了什么

| 失败位置 | 结果与重试 |
| --- | --- |
| 缺少确认或修订过期 | 拒绝写入 |
| 外观保存失败 | 两份旧设置都保留 |
| 外观已保存，壁纸删除失败 | 明示部分完成，保留当前壁纸；读取当前修订后重试 |
| 完成 | 两模式默认配置，无媒体记录，旧视频与预览停止 |

这是顺序恢复，不宣称跨 LocalStorage 与 IndexedDB 的原子事务。也不通过回滚覆盖其他写入者的新设置。确认删除没有撤销；代码可以回退，已删除自定义不能靠回退代码找回。

## D 预览也属于资源生命周期

[媒体 owner](https://github.com/BotHarness/DeepSeekBot/blob/37725cae72c39d35431bb7b4277df2f6e09a7029/packages/client/src/client/wallpaper.ts) 接受状态变化时推进临时资源代次；设置中的媒体编辑器重新挂载，销毁旧预览。即使从未保存壁纸，全部恢复也会释放正在预览的视频。

代次不是新的保存字段或 CLI 修订。壁纸仍只有当前素材，原图或视频、封面及取景由原来的 IndexedDB 记录管理。

## E 证据与 Human QA

原有恢复切片的 85 项测试已记录；本次 mask 修正的 84 项相关测试、lint、类型、格式与构建通过。Web 和 macOS Desktop 验证模式范围、取消确认、媒体删除失败及重试、图片/视频恢复、预览释放、布局与 DSH 不变。Web 额外验证独立客户端、CLI 拒绝、刷新与重入；Desktop 完成真实应用重启。

原有恢复运行证据保留；本次新增 mask 的 Web 与 macOS 实际界面验证。CI 单独读取最新 PR checks。完整规格逐项审计与前六个 PR 的证据位于 [验收索引](https://github.com/BotHarness/DeepSeekBot/blob/37725cae72c39d35431bb7b4277df2f6e09a7029/.github/pr-screenshots/2264-appearance-recovery/README.md)。

Windows、其他媒体编码、T4 容器远程桌面像素和 Human QA 未声明通过。七个 PR 均保持 Draft、未合并、未部署；Human 按顺序体验主题、玻璃面板、右键独立外观、图片/视频壁纸与恢复后决定是否接受。

## F 消息边缘透出真实背景

Human QA 发现顶部渐变使用 DSH 默认底色，盖住了绿色面板；底部活动条也有同类覆盖。现在 [消息滚动区](https://github.com/BotHarness/DeepSeekBot/blob/37725cae72c39d35431bb7b4277df2f6e09a7029/packages/client/src/client/styles.ts) 使用明确的 alpha mask，移除两块有色覆盖。输入框、Header 和浮动按钮位于遮罩外。

上边缘最多 24px 渐隐，下边缘 8px，并保留已测量的活动条区域。移动布局沿用顶部不渐隐规则；本次不宣称原生手机验证。

Web 与官方 macOS Desktop 均使用 32 条真实保存的测试消息完成浅深底色、透明壁纸、两端滚动、输入和重载检查。像素对比：Web 边缘 16,399 像素改变、中心 0；Desktop 边缘 65,064、中心 0。两端无页面或控制台错误。

[前后截图与可复现脚本](https://github.com/BotHarness/DeepSeekBot/blob/37725cae72c39d35431bb7b4277df2f6e09a7029/.github/pr-screenshots/2264-appearance-recovery/mask/README.md) 区分旧代码截图和临时禁用遮罩的像素诊断；本次没有实际唤醒 Bot 检查活动条，相关组件回归通过。PR 继续等待 Human QA，不合并。
