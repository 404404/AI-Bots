---
template: sheet
title: T6 视频壁纸的播放与恢复
subtitle: "PR #2281 · 静音循环 · 后台留帧 · Human QA 待完成"
cols: 2
source: "base 70e033b486eee91f0cd4c739461e727e4842b6b5 · head 65ff85a68df5a395014ab2ec83f4708797d718e1 · 2026-10-19"
---

## A 视频仍是一张壁纸

上传视频，先预览和取景，再点击使用。背景静音循环，没有控件，不拦截鼠标。Header 与 Body 继续用各自的透明和模糊；文字不跟着变透明。

原文件保持不变，不转码。视频上限 100 MiB，图片上限仍为 20 MiB。

## B 同一个媒体 owner

```flow
[本机文件或定向 CLI] -> [实际播放解码]
[实际播放解码] -> [生成静态封面]
[生成静态封面] -> [原始 Blob、封面和取景一起保存]
[原始 Blob、封面和取景一起保存] -> [切换背景]
```

保存前拒绝不支持或无法生成封面的素材。失败保留之前的图片或视频，没有第二份 Host 媒体库。

## C 播放状态可以核对

| 状态 | 可见结果 |
| --- | --- |
| 前台 | 静音循环 |
| 后台或最小化 | 暂停，保留当前帧 |
| 回到前台 | 继续播放 |
| 解码失败或播放被阻止 | 已保存封面，设置显示原因 |
| 离开 Bot mode | 卸载旧视频源 |

`wallpaper-get` 返回实际状态与错误码。它是 Client 的临时观测，不保存成 Host 偏好。

## D 审查入口

[验证与封面](https://github.com/BotHarness/DeepSeekBot/blob/65ff85a68df5a395014ab2ec83f4708797d718e1/packages/client/src/client/wallpaper-video.ts) 要求真正解码出视频帧，再生成有界封面。

[播放生命周期](https://github.com/BotHarness/DeepSeekBot/blob/65ff85a68df5a395014ab2ec83f4708797d718e1/packages/client/src/client/wallpaper-playback.ts) 处理焦点、可见性、错误与卸载。退出会停止旧解码器；再次进入使用已保存素材。

[媒体恢复](https://github.com/BotHarness/DeepSeekBot/blob/65ff85a68df5a395014ab2ec83f4708797d718e1/packages/client/src/client/wallpaper.ts) 在恢复环境无法播放时保留原视频并显示封面。

## E 已验证与限制

62 项相关测试通过；lint、类型、格式和构建通过。Web 时钟回绕与解码帧数证明至少两次循环；切后台后时间停止，回来继续。损坏媒体、超限与配额失败均保留原记录。

macOS 已操作按地址识别的主窗口，验证最小化留帧与恢复。删除源文件后，在相同应用存储、另一隔离 Host 重启，原字节、封面和取景恢复并播放。

实测编码是 VP9 WebM。其他编码、Windows 和 Human QA 未声明通过；CI 以 PR checks 为准。原视频记录需支持视频的版本读取。PR 未合并，未部署。

头像和横幅继续显示仅图片上传；完整 CI 捕获的中文文案回归已修复，原有头像测试与视频播放测试 20 项通过。媒体行为证据来自前一个仅差这两条文案的 head；最新 CI 以 PR checks 为准。
