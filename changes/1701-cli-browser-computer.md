---
section: Added
---

## en

- Agents can now reach the rest of the Browser and Computer panels from the CLI: read a Bot's Browser observation, takeover audit and recordings, pick its Browser profile, install missing Browser or Computer packages with `--confirm`, read Computer diagnostics and logs, and export, download, upload and import Container Computer archives (`computer-import` needs `--confirm`). A Host refusal sent with HTTP 403, such as `needs-administrator`, now keeps its own code instead of reading as an expired token ([#1701](https://github.com/BotHarness/DeepSeekBot/issues/1701)).

## zh

- Agent 现在可以用命令行完成浏览器和 Computer 面板上的其余操作：读取 Bot 浏览器的观察状态、接管审计和接管录制，选择浏览器 profile，用 `--confirm` 安装浏览器或 Computer 缺少的系统包，读取 Computer 诊断和日志，以及导出、下载、上传和导入容器 Computer 归档（`computer-import` 需要 `--confirm`）。Host 以 HTTP 403 返回的拒绝（例如 `needs-administrator`）现在保留自己的错误码，不再被当作登录 token 过期（[#1701](https://github.com/BotHarness/DeepSeekBot/issues/1701)）。
