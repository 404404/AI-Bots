---
template: sheet
title: T3 功能面板独立外观
subtitle: "PR #2276 · 右键入口 · 逐项继承 · Human QA 待完成"
cols: 2
source: "base a376b9f4dc46609ff86cc5d2b48d0c59b32bc6f0 · head 07b9cea069c08a00d08d4c201cc10699e76be33b · 2026-10-19"
---

## A 从标题栏开始

右键 Messages 或 Home 的 Header，打开以面板名称命名的外观窗口。窗口说明当前深浅模式。Header 与 Body 各自提供底色、不透明度和模糊控制。

每个属性都能恢复跟随全局。恢复此面板只清除当前模式的当前功能目标。嵌套目标属于 T4。

## B 功能身份与数据路径

```flow
[Header 右键 modal] -> [Client 外观 owner]
[定向 CLI] -> [Client 外观 owner]
[Client 外观 owner] -> [本地配置]
[功能 Panel 注册目录] -> [目标发现与校验]
[目标发现与校验] -> [Client 外观 owner]
[本地配置] -> [当前活动 Dock 组表面]
```

目标使用稳定功能 ID。Bot、Channel 和文件不是外观键。关闭面板保留设置；目标卸载后拒绝写入。

## C 每个字段如何求值

| 顺序 | 来源 |
| --- | --- |
| 1 | 当前模式、当前功能 Panel 的覆盖 |
| 2 | 当前模式的全局设置 |
| 3 | 当前模式主题默认值 |

切换主题保留 Panel 覆盖。字段传 null 只移除该字段。单 Panel 恢复不影响其他目标或另一模式。

表面通过背景 alpha 和 backdrop blur 合成。文字、卡片、输入框及 modal 不整体变淡。

## D 代码与回退

[本地 owner 与目标拒绝](https://github.com/BotHarness/DeepSeekBot/blob/07b9cea069c08a00d08d4c201cc10699e76be33b/packages/client/src/client/appearance.ts)

[属性解析与单目标修改](https://github.com/BotHarness/DeepSeekBot/blob/07b9cea069c08a00d08d4c201cc10699e76be33b/packages/client/src/client/appearance-panels.ts)

[Header 菜单与 modal](https://github.com/BotHarness/DeepSeekBot/blob/07b9cea069c08a00d08d4c201cc10699e76be33b/packages/client/src/client/channel-dock.tsx)

回退到 T2 会保留但忽略 Panel 配置。Host 不保存外观副本。原生 DSH 的主题属性和样式不变。

## E 已验证与待验收

| 检查 | 状态 |
| --- | --- |
| 66 个聚焦回归测试 | ok 通过 |
| lint、格式、类型、构建 | ok 通过 |
| Web UI、CLI、继承与恢复 | ok 通过 |
| 切频道、关闭重开、重载 | ok 通过 |
| macOS 重启与单目标恢复 | ok 通过 |
| CI | warn 查看 PR 当前状态 |
| 拖动与全部内容菜单 | warn Human QA |
| Windows、原生拒写、卸载 | warn 未验证 |
| 合并与部署 | warn 未执行 |

[完整截图与验证边界](https://github.com/BotHarness/DeepSeekBot/blob/07b9cea069c08a00d08d4c201cc10699e76be33b/.github/pr-screenshots/2260-panel-appearance/README.md)

请分别修改 Messages 和 Home，切换模式并重启。恢复一个目标后，检查其他目标和另一模式仍保留。
