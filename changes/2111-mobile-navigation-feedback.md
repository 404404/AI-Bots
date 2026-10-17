---
section: Fixed
---

## en

- Chats and Activity avoid repainting their loaded lists on every tab switch. Activity presents its shell before mounting heavy content, reuses Host-scoped query snapshots during refresh, and pauses hidden query subscriptions. Chats prepares Activity during idle time ([#2111](https://github.com/BotHarness/DeepSeekBot/issues/2111)).

## zh

- 聊天与动态切换时避免重复重绘已加载的列表；动态先显示页面外壳，再挂载较重的内容，刷新时复用按 Host 隔离的查询缓存，并暂停隐藏查询的视图订阅。聊天页会在空闲时预加载动态（[#2111](https://github.com/BotHarness/DeepSeekBot/issues/2111)）。
