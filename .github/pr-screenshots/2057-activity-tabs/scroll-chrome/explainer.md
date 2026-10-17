---
title: PR 2058 · 滚动时收起界面控件
lang: zh
cols: 2
---

## A 用户看到的变化

Activity 向下浏览时，大标题、筛选和搜索按钮收起，只保留安全区下方的三个 tab。列表顶部不再覆盖渐隐。向上回看或回到顶部，标题与按钮恢复。

Activity 和聊天列表共享底部导航的收起状态。短列表不隐藏导航；回弹不改变方向判断。搜索、筛选期间保留控件，避免把输入框移走。页面切换恢复导航，保留已访问列表的位置。

## B 动画如何运行

```flow
当前列表滚动 -> UI 线程判断方向: 忽略回弹与细小反向
UI 线程判断方向 -> 共享可见状态: 向下收起，向上恢复
共享可见状态 -> 平台界面控件: 位移或原生可见边界
```

Reanimated 处理滚动和动画，滚动帧不进入 React。Activity 内容区保持固定几何尺寸，用位移补回标题空间。收起后的控件退出触摸和无障碍树。iOS 使用 Expo 原生导航的 hidden 属性，需要单独原生验收。

## C 切换性能

| 每轮八次切换，中位数 | 改动前 | 当前提交 |
| --- | --- | --- |
| 页面组件渲染次数 | 48 | 16 |
| 列表行渲染次数 | 256 | 0 |
| React 累计渲染耗时 | 5062.3 ms | 1362.5 ms |

累计渲染耗时降低约 73.1%。一轮测量跨过分钟边界，15 行时间标签正常更新。其余两轮没有未变化的行重绘。

同一 Redmi、同一 SDK58 开发包、同一数据，各运行三轮，每轮八次左右切换。隔离未变化的行和非活动页，保留真实查询订阅、筛选和旧提交结果的失效规则。开发包的 React 测量不能代替 Release 持续帧率；120 FPS 的每帧预算是 8.33 ms。

原生帧耗时 p95 仍高于目标预算。没有宣称达到 120 FPS。后续需要 Release 与系统帧时间测量，继续定位选择落定时的工作。

## D 验证与评审

```kv
Source head: 1a625ba281015a6aa313b3cf97805573b3ec5935
SDK58 integration: fcf5efd295fc0a2e2158c555ccc81683e05aecb0
PR: 2058，叠在 1966 上，保持 Draft
本地检查: 447 passed / 8 skipped，SDK58 27 项重点测试
```

双端 Hermes 导出、类型、lint、格式检查通过。Android 覆盖收起、恢复、空页切换、搜索入口、长聊天列表及大字体主题组合。原速录像与截图独立保存；不提交审批或问答答案。

没有新增 Host 方法、持久化格式或原生依赖。回退这次界面提交即可撤回。评审重点是滚动方向、控件可达性、页面状态保留和原生导航兼容性。iOS、实时字体主题切换、减少动态效果和 Release 帧率仍待验收。

[Reanimated 滚动处理](https://docs.swmansion.com/react-native-reanimated/docs/scroll/useAnimatedScrollHandler/) · [Reanimated 性能指南](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/)

