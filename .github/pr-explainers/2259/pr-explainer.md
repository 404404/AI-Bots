---
template: sheet
title: T2 全局面板材质
subtitle: "PR #2275 · Header 与 Body 独立设置 · Human QA 待完成"
cols: 2
source: "base 17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae · head a376b9f4dc46609ff86cc5d2b48d0c59b32bc6f0 · 2026-10-19"
---

## A 用户能做什么

浅色与深色各自选择四套主题。全局 Header 和 Body 各有底色、不透明度与模糊控制。修改立即在本机保存。

经典蓝默认不透明。雾紫、森林绿、暖琥珀提供玻璃效果。单个 Panel 和媒体壁纸留给后续切片。

## B 同一份本地配置

```flow
[设置控件] -> [Client 外观 owner]
[定向 CLI] -> [现有临时投递通道]
[现有临时投递通道] -> [Client 外观 owner]
[Client 外观 owner] -> [本地保存]
[Client 外观 owner] -> [作用域样式]
[作用域样式] -> [Dock Header 与 Body]
```

Host 没有偏好副本。CLI 必须指定在线 Client 和读到的 revision。

## C 继承与失败边界

| 操作 | 结果 |
| --- | --- |
| 修改一个字段 | 保留同组其他字段 |
| 切换当前模式预设 | 清除当前模式已知全局调整 |
| 切换模式 | 恢复该模式保存的配置 |
| 存储拒写 | 保留已接受外观与原始字节 |
| 原生 DSH 界面 | 不修改其主题属性或全局样式 |

透明度只进入背景色。文字、控件与卡片不整体变淡。模糊读取背后的实际像素。

回退到 T1 前，请把两套预设改为经典蓝或雾紫。T1 无法读取新增预设名称。

## D 代码落点

[材质默认与验证](https://github.com/BotHarness/DeepSeekBot/blob/a376b9f4dc46609ff86cc5d2b48d0c59b32bc6f0/packages/client/src/client/appearance-materials.ts)

[局部样式生成](https://github.com/BotHarness/DeepSeekBot/blob/a376b9f4dc46609ff86cc5d2b48d0c59b32bc6f0/packages/client/src/client/appearance-scope.ts)

[可重复 Web 验证](https://github.com/BotHarness/DeepSeekBot/blob/a376b9f4dc46609ff86cc5d2b48d0c59b32bc6f0/scripts/e2e-global-materials.mjs)

## E 证据与待验收项

| 检查 | 状态 |
| --- | --- |
| 84 个聚焦回归测试 | ok 通过 |
| lint、格式、类型、构建 | ok 通过 |
| Web 设置、CLI、重载恢复 | ok 通过 |
| macOS 模式与应用重启恢复 | ok 通过 |
| Web 实际模糊 | ok 方差 16256→38 |
| macOS 实际模糊 | ok 方差 16256→47 |
| CI | warn 单独查看 PR 当前状态 |
| Windows、原生拒写与卸载 | warn 未验证 |
| Human QA、合并与部署 | warn 未完成 |

[完整截图与验证边界](https://github.com/BotHarness/DeepSeekBot/blob/a376b9f4dc46609ff86cc5d2b48d0c59b32bc6f0/.github/pr-screenshots/2259-global-materials/README.md)

请调整六个字段、混搭两套主题并重启。再检查 DSH 原生界面。T1 和 T2 都等待 Human QA。
