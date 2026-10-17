# 选定内容与进度：验证边界

[#2134](https://github.com/BotHarness/DeepSeekBot/issues/2134) 是 #2081 子任务；[任务认领](https://github.com/BotHarness/DeepSeekBot/issues/2134#issuecomment-6242316479)。基线 `5d44b7a6507d661415881808ab67e74275d54182`，产品 `895efde6aa3aa616d3f0968f23d4363477fbf2c7`，检查和测试修正 `850996f987b43244575af4f97467f29bd29e57b9`。之后仅修改验证器、文档和证据，不改变已构建产品；没有新 schema。

## 源码与检查

五个受影响文件共170个不同 focused case 通过：初次未受失败影响134项，最终内容/RPC36项。根类型检查、lint、定向格式、十项源码/变更/ADR/CLI/feature map 等规则和一次产品构建通过。独立 Spec 与 Standards 审查发现的未签名游标位置篡改、Unicode 总遍历边界问题已在895修复并复审关闭。初次错误测试假设和类型错误保留，修正后重跑通过；初次19faf全套CI仅 plugin 注册名清单失败；测试修正 `b60b246767cfe59fa59d4e66262075838b70c906` 补两个实际方法，单项回归先红后绿（其余16项未选）。累计六个文件171个不同 focused case，不声称本地全套测试。

## 真实隔离 Web

DSH 固定 `0.2.0-rc.2`，Bot 实际计划使用官方 `deepseek-official/deepseek-flash`。Human 请求仅列出精确 Channel/Bot ID，没有给出 marker 答案。Tob 经四个真实完成的原生 Shell 调用读取 Human DM、Bot 间 DM、没有 Tob 的 Group，以及另一 Bot 进度。回复包含全部三个规范 marker、来源 ID、真实的空 Assignment 结果，并区分 Bot 自报与 owner 事实。被引用的“删除 Alpha”只作为数据，选定 Bot 身份/模型计划和 Channel 成员前后完全一致。

Turn1 completed；Source Event `c6016320-078c-44c7-9efa-af649cd66cca` handled；回复 `2ea05c62-95b3-4e9a-b53d-9266ae79219a` 已提交，随后 idle。浏览器 console/error 均为空。直接 CLI 页、正文和进度与现有 Human owner 查询一致；错误目标拒绝。同一绝对 canonical home 的 Host 重启后新读通过，旧进程游标拒绝；真实签名篡改拒绝，新增 Group 消息使旧页拒绝 `stale-read-revision`。四个正文块逐字还原多字节消息，每块不超过1,000 UTF-8字节，最大响应2,223字节。

三张截图为当前产品1440×1000深色中文界面的请求前、真实回复后、重启后只读展开状态。不是基线/新版布局比较，也不声称 UI 改版。继承的 Home 配置提示及默认 composer 模型标签不代表 Bot 的实际计划；官方路由由规范计划和真实执行确认。

## 真实 macOS Native 与重启

root 使用真实 Desktop renderer、同一 canonical home 和产品895完成新的 Human 请求。保留的 Tob Session 中 Turn2 completed，八个原生 Shell 调用成功，包含四块多字节正文读取；回复 `50722715-ebf8-4c86-9cc2-4576a50b72dc` 已提交，Source Event `24fa2493-5cfb-4f6a-bf1f-b737bdd3e75f` resolved/handled，随后 idle。选定 Bot 身份/模型计划及三个 Channel 成员前后相同，console/error 为空。

第二个真实 Desktop 进程启动后，同 home 新内容/正文/进度读取通过。初次完成截图停留在旧消息和“跳到最新”按钮，保留在私有证据，不当作可见回复证明。第三次只读截图使用真实“跳到最新”控件并展开保留回复，没有新请求或模型执行。已检查截图显示第二轮对应的来源修订及 DM marker。

Native 图片为2522×1640物理像素，深色中文界面；Web仍为1440×1000。这些是交互状态证据，不是响应式布局比较。root 每次精确停止候选并恢复主应用。Desktop Profile 仅使用明确配置/包链接白名单，不复制 Session 或凭据。

## 首次失败与未验证项

保留了中文界面导致英文 stock selector 超时、无可信 Source Event 的直接 Bot DM seed 正常拒绝、首次验证器在 Tob Session 创建前查询而失败（尚未发请求）、两个可选截图 selector 超时。之后通过可见行成功打开原回复，没有重复发模型请求。原始失败截图/日志保留在私有任务证据，不冒充功能通过。

Native 模型、重启和保留回复截图已完成；最终 head CI、集成栈和 Human QA 仍是独立待办。清除、可见性、身份代次、普通 Bot 成员限制及 Memory Assignment 拒绝有源码回归，不声称 Web 逐一重演。未读取真实私人会话、下载附件或发送外部消息，没有成员扩权、管理委托、合并或发布。

现有脚本支持 direct/model/restart-read/capture。Native 由 root 独占启动真实 Desktop，使用同一 canonical home、新的 Profile 配置和当前登录清单；不复制 Session 或凭据。脚本只连接候选实例，不启动/停止 Host、不改变模型配置。
