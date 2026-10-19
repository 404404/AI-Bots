---
template: sheet
title: T5 图片壁纸的本机保存
subtitle: "PR #2279 · 上传取景 · 原始素材 · Human QA 待完成"
cols: 2
source: "base 38d099ba234e90ff7d1a739526a22cb6d2a060a1 · head 70e033b486eee91f0cd4c739461e727e4842b6b5 · 2026-10-19"
---

## A 先预览，再使用

上传图片后，拖动位置并调整缩放。点击使用后才保存；取消只释放预览。图片覆盖侧边栏和多面板背后的一层，不拦截鼠标，也不改变文字透明度。

浅深模式共用同一图片。原文件删除后，本机副本仍可恢复和重新取景。

## B 唯一媒体保存路径

```flow
[文件输入或指定 Client 的 CLI] -> [实际解码与取景]
[实际解码与取景] -> [本机 IndexedDB 原始 Blob 与裁切]
[本机 IndexedDB 原始 Blob 与裁切] -> [替换画面并释放旧资源]
```

Web 按浏览器站点保存；Desktop 按应用保存。Host 只转发有限大小的分块，不保存文件或路径。

## C 保存失败时

| 检查 | 结果 |
| --- | --- |
| 图片超限或不能解码 | 拒绝，旧壁纸保持 |
| 配额或事务失败 | 显示失败，旧记录保持 |
| 修订号不同 | 拒绝覆盖其他修改 |
| 取消或退出预览 | 释放临时 URL |
| 成功替换或移除 | 只更新唯一素材记录 |

最大图片大小为 20 MiB。取景保存中心坐标与缩放，按窗口比例铺满，不拉伸、不留白。

## D 审查关键边界

[媒体事务](https://github.com/BotHarness/DeepSeekBot/blob/70e033b486eee91f0cd4c739461e727e4842b6b5/packages/client/src/client/wallpaper-store.ts) 将素材和取景一起提交。

[媒体 owner](https://github.com/BotHarness/DeepSeekBot/blob/70e033b486eee91f0cd4c739461e727e4842b6b5/packages/client/src/client/wallpaper.ts) 先解码、再保存、最后切换画面。

[CLI 导入](https://github.com/BotHarness/DeepSeekBot/blob/70e033b486eee91f0cd4c739461e727e4842b6b5/packages/core/src/bots/cli-wallpaper.ts) 在操作者机器读取文件，分块传给明确选择的在线 Client。送达后超时必须重读，不能自动重放。

## E 已验证与待验收

59 项相关测试通过；lint、类型、格式和构建通过。Web 已验证拖动缩放、窗口变化、源文件删除后恢复、多分块 CLI、损坏图片和模拟配额失败。页面无未捕获错误。

macOS 已验证实际上传、重新取景，以及相同应用存储在另一隔离 Host 重启后的原始字节和裁切恢复。两端实际测试格式为 PNG。

CI 以 PR checks 为准。其他编码、Windows 和 Human QA 未在此声明通过。视频和整体恢复属于后续 T6/T7；本 PR 未合并、未部署。
