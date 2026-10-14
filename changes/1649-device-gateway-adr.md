---
section: Documentation
---

## en

- Documented how a paired phone keeps reaching the Host across restarts: a device gateway on the same `dsh web` listener verifies a per-device credential, forwards to the native carriers, and revokes one device at once, including its open streams; runtime behavior is unchanged ([ADR-0199](../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md), [#1649](https://github.com/BotHarness/DeepSeekBot/issues/1649)).

## zh

- 记录配对手机如何在 Host 重启后继续访问：同一 `dsh web` 监听器上的设备网关校验每台设备的凭据，转发到原生通道，并可立即撤销单台设备及其已打开的数据流；运行时行为不变（[ADR-0199](../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)，[#1649](https://github.com/BotHarness/DeepSeekBot/issues/1649)）。
