---
title: PR 2058 · 原生滑动 Activity tabs
lang: zh
---

## A 点按与整页滑动

三个 tab 平分宽度。选中的图标与文字整体居中，下沿线铺满一个 tab，随页面拖动连续移动。

使用 React Navigation 的 react-native-tab-view 与 Expo 匹配的 react-native-pager-view。Android 使用对应 SDK 的原生分页组件（SDK 58 的 pager 9 为 Compose HorizontalPager）；手势不依赖 JS 猜测滑动阈值。

[React Navigation 文档](https://reactnavigation.org/docs/tab-view/) · [Expo SDK 58 兼容组件](https://docs.expo.dev/versions/v58.0.0/sdk/view-pager/)

## B 各页保留自己的列表

```flow
整页横向拖动 -> 原生 pager: 页面跟手
原生 pager -> 指示线: 共享分页位置
原生 pager -> 选中 category: 继续使用已有筛选条件
选中 category -> 当前 Host 查询: 复用 inbox 查询缓存
当前 Host 查询 -> 该页的虚拟列表: 首次访问按需挂载
```

访问过的页面继续挂载，因此切回时保留纵向滚动位置。空页也可以横向滑动。搜索、排序、Bot、会话和未读条件由外层统一保存。

全部和已处理仍在筛选里，显示于当前页且不选中顶部 tab；切到其他 tab 时恢复对应分类。

## C 异步提交边界

每页使用已有的 Host inbox 查询与订阅。切走后，其提交回调失效；旧的拒绝结果不能把待办恢复到新页。重新进入也不复活旧回调。

没有新增 Host 方法、存储格式或第二套数据缓存。分页组件负责手势，Host 继续负责待办与已处理历史。

## D 评审与验证

```kv
PR: #2058，叠在 #1966 上
Base: 37b2bc02eb47e76bc753d8c8a21e5c3590281fed
Head: fdca077473ad5838f65869449a5960cea2065dc2
日期: 2026-10-17
```

源码移动端全量 443 passed / 8 skipped；23 项重点测试通过，包含翻页保留筛选和异步拒绝隔离。源码类型、lint、格式、双端 Hermes 导出通过。Android SDK 58 集成另有 23 项重点测试及类型检查。

Android 开发包已重新构建并保留原配对。实机验证整页左右切换、短拖取消、纵向滚动与切回原位置。截图与原速录屏另行保存，不以源码测试代替原生证据。

原生依赖变更，现有开发客户端需要重建。源码栈仍是 SDK 57（pager 8.0.2）；Android QA 为显式 SDK 58 集成（pager 9.0.7），两者均由 Expo CLI 选择版本。iOS 原生与 Human 体验验收待完成。静态字体截图不代表实时系统字体切换已通过。

回退 UI 和依赖提交、恢复旧的同签名开发包即可撤回。重点评审分页与筛选映射、保留的各页列表、非活动页回调和原生依赖兼容性。
