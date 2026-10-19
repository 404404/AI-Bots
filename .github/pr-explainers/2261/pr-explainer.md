---
template: sheet
title: T4 嵌套功能面板外观
subtitle: "PR #2277 · 独立继承 · 共享 Memory 详情 · Human QA 待完成"
cols: 2
source: "base 07b9cea069c08a00d08d4c201cc10699e76be33b · head 38d099ba234e90ff7d1a739526a22cb6d2a060a1 · 2026-10-19"
---

## A 从子面板标题栏开始

右键 Memory、Browser、Computer 或独立贡献的 Panel 标题栏，打开同一套外观窗口。子菜单停止事件传播，不同时打开父菜单。每个字段直接继承全局值。

父面板为绿色时，未覆盖的子面板仍使用全局底色；透明子层可能看到父层颜色，这是正常叠加。

## B 同一条保存路径

```flow
[子 Header 或定向 CLI] -> [功能目标校验]
[功能目标校验] -> [Client 本地外观 owner]
[Client 本地外观 owner] -> [保存并绘制当前表面]
```

没有新增 Host 偏好副本或业务数据 owner。关闭和卸载面板保留配置；卸载目标拒绝写入，重新注册恢复。

## C 哪些内容共用设置

| 功能 | 外观身份 |
| --- | --- |
| Memory 文件列表 | memory-files |
| Memory 演化 | memory-evolution |
| 文件预览、提交详情、工作区变更 | memory-details |
| 独立插件贡献 | 已注册功能 ID |

具体文件、commit、Bot 和 Channel 不进入外观键。父恢复不清除子覆盖；子恢复只清当前目标和模式。

## D 表面与内容

Header 和 Body 直接绘制背景及模糊，不对整个子树设置透明度或滤镜。Browser 实际网页和插件输入框、颜色块保持自己的内容。

[绘制边界](https://github.com/BotHarness/DeepSeekBot/blob/38d099ba234e90ff7d1a739526a22cb6d2a060a1/packages/client/src/client/appearance-scope.ts)

[标题栏菜单](https://github.com/BotHarness/DeepSeekBot/blob/38d099ba234e90ff7d1a739526a22cb6d2a060a1/packages/client/src/client/appearance-panel-header.tsx)

[独立 QA Bundle](https://github.com/BotHarness/DeepSeekBot/tree/38d099ba234e90ff7d1a739526a22cb6d2a060a1/scripts/fixtures/appearance-panel)

测试 Bundle 仅用于验证已有贡献机制；没有迁移 #2219/#2234 的插件架构。

## E 证据与限制

| 检查 | 结果 |
| --- | --- |
| 47 个聚焦测试、静态检查、构建 | ok 通过 |
| Web 子菜单、三类详情、切 Bot、重载 | ok 通过 |
| 独立贡献卸载、重注册与草稿 | ok 通过 |
| Web/macOS 实际 Browser | ok 通过 |
| macOS 同目录重启与单目标恢复 | ok 通过 |
| Computer 本地权限界面 | ok 通过 |
| 容器桌面像素 | warn Docker 探测无响应，未验证 |
| Windows、Human QA | warn 待完成 |
| CI | warn 查看 PR 当前状态 |

当前 Computer 本地模式没有内嵌桌面 viewer。不能以本地界面的截图替代容器桌面验证。Browser 像素证据是取样检查，不是所有远端像素的逐点比较。

[完整截图、运行结果及失败边界](https://github.com/BotHarness/DeepSeekBot/blob/38d099ba234e90ff7d1a739526a22cb6d2a060a1/.github/pr-screenshots/2261-nested-appearance/README.md)
