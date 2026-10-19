---
section: Added
---

## en

- Scene controls can switch the weather to rain, with streaks outside, an overcast sky and droplets running down the window; clouds are drawn with toon shading lit from the sun or moon. The monitor shows what the Bot is doing (typing code, a scrolling log, a dialog, or a music player at idle) and its glow lights the desk at night, and an open book turns its pages while loose papers and dust move in the breeze ([#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)).
- The desk view is recomposed after Chill with You: the monitor stands in front of the character, the camera sits beside the desk for a three-quarter view, the sunset is warmer and redder, and VRoid models load with the same seated choreography ([#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)).
- The room is now furnished like a lived-in study corner (a book hutch, desk clutter, a drawer cabinet, a rug, a poster, a clock showing local time, a floor lamp and string lights that brighten at night), and Scene controls can load your own `.vrm` file, including VRoid models, for the session without uploading it ([#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)).
- Room objects now follow real-world proportions (a smaller cup, keyboard, monitor and lamp) in a low-poly, flat toon-shaded style with a blue night and a warm desk-lamp pool ([#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)).
- While the Bot is idle, the seated character now occasionally looks toward the window, stretches, rests its chin on a hand, sips from its cup or glances at you, and returns to the keyboard as soon as the Bot gets to work ([#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)).
- The character's face now follows what the Bot is doing: relaxed at idle, a thoughtful upward look while thinking, focused while working, an expectant smile while waiting and a troubled look when blocked, easing between them and warming up while speaking ([#2304](https://github.com/BotHarness/DeepSeekBot/issues/2304)).
- The room now has a framed window in a plaster wall with linen curtains, soft drawn clouds and a glowing sun, a darker night lit by the desk lamp, and a desk view that keeps the lamp, cup and character in frame. MToon/lilToon remains a reversible comparison, scene choices survive the view reloading, and loading no longer looks like an error; final visual acceptance remains pending ([#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222)).

- Added an independently installable VRM character Panel with live Bot Activity, text-paced speaking, and persistent fixed-Bot instances; the first slice uses a licensed sample model and produces no audio ([#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222), [developer guide](../docs/panel-plugin.md)).
- The character now shares a full-panel 3D room: seated keyboard contact, stand/walk/return controls, camera views, and a spatial sky with drifting clouds and local-time lighting. Scene controls are overlays; movement and room time remain local presentation, independent of Bot Activity ([#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222)).

## zh

- Scene controls 可以切换为雨天：窗外下雨、天空转阴、雨滴沿玻璃滑落；云层改为随太阳或月亮方向受光的 toon 着色。显示器内容跟随 Bot 的状态（敲代码、滚动日志、对话框，空闲时是音乐播放器），入夜后屏幕光会照亮桌面；桌上翻开的书会自己翻页，纸张和灰尘随窗外的风轻轻飘动（[#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)）。
- 桌边视角参照 Chill with You 重新构图：显示器放到角色正前方，镜头移到桌边侧前方呈 3/4 视角，日落更暖更红；VRoid 模型也能以同样的坐姿和动作载入（[#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)）。
- 房间布置得更有生活感：书架、桌面小物、抽屉柜、地毯、海报、显示本地时间的挂钟，以及入夜会亮起的落地灯和窗边彩灯；Scene controls 还可以打开本机的 `.vrm` 文件（包括 VRoid 模型），仅在本次会话中使用，不会上传（[#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)）。
- 房间物件改为真实世界比例（更小的杯子、键盘、显示器和台灯），采用 low poly 平涂 toon 着色；夜晚为蓝调，由台灯在桌面投下暖光（[#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)）。
- Bot 空闲时，坐在桌前的角色会不时看向窗外、伸懒腰、托腮、端起杯子喝一口或看你一眼；Bot 一开始工作就平滑回到键盘（[#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305)）。
- 角色的表情现在跟随 Bot 的状态：空闲时放松，思考时视线上移、若有所思，工作时专注，等待时带着期待的微笑，受阻时显得困扰；表情之间平滑过渡，说话时更柔和明亮（[#2304](https://github.com/BotHarness/DeepSeekBot/issues/2304)）。
- 房间改为灰泥墙上的窗框与亚麻窗帘、柔和的绘制云层和发光太阳；夜晚整体变暗，由台灯照亮桌面；桌边视角同时保留台灯、杯子和角色。MToon／lilToon 仍可切换对比，视图重新加载后保留场景选择，加载状态不再显示为错误；最终视觉验收尚未完成（[#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222)）。

- 新增可独立安装的 VRM 角色面板，呈现 Bot 实时 Activity、文字节奏说话和可保存的固定 Bot 实例；首片采用已授权示例模型，不产生音频（[#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222)，[开发指南](../docs/panel-plugin.md)）。
- 角色现在置于铺满面板的三维房间：支持坐姿键盘接触、起身／走动／回座、镜头切换，以及有纵深的动态云层和本机时间光照。控件覆盖在画面上，角色移动和房间时间仅属于本地呈现，不改变 Bot Activity（[#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222)）。
