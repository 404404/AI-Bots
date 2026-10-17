import { appendFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const port = Number(option('--port'));
const control = option('--control');
const log = args.includes('--log') ? option('--log') : undefined;
if (
  !args.includes('--port') ||
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535 ||
  !args.includes('--control') ||
  !control
)
  throw new Error(
    'Usage: stream-replay.mjs --port <port> --control <private-json> [--log <jsonl>]',
  );

const paragraph =
  '我们用固定内容测试流式消息的渲染。每次回放的字符、分块和时间间隔保持一致，滚动时应保持阅读位置，回到底部后继续跟随。**强调文字**与列表用于覆盖 Markdown。\n\n';
const fixtures = {
  smoke: 'AX_REPLAY_OK\n\n中文👨‍👩‍👧‍👦 **完整**。\n',
  prose: Array.from(
    { length: 100 },
    (_, i) =>
      `## 第 ${i + 1} 段：稳定的流式内容\n\n${paragraph}${paragraph}- 固定分块，固定时钟\n- 原生布局与可访问文本\n\n`,
  ).join(''),
  long: Array.from(
    { length: 160 },
    () =>
      '这是一个没有段落换行的长段落，用来检查连续增长的文字是否稳定。**加粗内容**、[链接](https://example.com)、&amp; 与家庭表情👨‍👩‍👧‍👦应保持完整。',
  ).join(''),
  rich:
    '# 格式验收\n\n中文 **加粗与 _嵌套斜体_**、~~删除线~~、`inline &amp;`、&amp;、[链接](https://example.com) 和 👨‍👩‍👧‍👦。  \n硬换行\n\n3. 第三项\n4. 第四项\n   - 嵌套列表\n\n- [x] 已完成\n- [ ] 未完成\n\n> 引用第一段\n>\n> 引用第二段\n\n```ts\n' +
    Array.from({ length: 120 }, (_, i) => `const row${i} = "中文<&amp;>🙂";`).join('\n') +
    '\n```\n\n| 项目 | 值 |\n|---|---|\n' +
    Array.from({ length: 40 }, (_, i) => `| 第 ${i + 1} 行 | **稳定** |\n`).join('') +
    '\n最后一段：REPLAY_COMPLETE。\n',
};
const record = (value) => {
  if (log) appendFileSync(log, JSON.stringify(value) + '\n');
};
const consumed = new Set();
let requestCount = 0;
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          intervalMs: 32,
          chunkGraphemes: 80,
          fixtures: Object.fromEntries(
            Object.entries(fixtures).map(([name, body]) => [name, body.length]),
          ),
        }),
      );
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    const parts = [];
    let bytes = 0;
    for await (const part of req) {
      bytes += part.length;
      if (bytes > 4 * 1024 * 1024) {
        res.writeHead(413).end();
        return;
      }
      parts.push(part);
    }
    const request = JSON.parse(Buffer.concat(parts));
    const config = JSON.parse(readFileSync(control, 'utf8'));
    if (
      !/^[a-z0-9-]+$/i.test(config.slug) ||
      !Object.hasOwn(fixtures, config.fixture ?? 'prose') ||
      (config.runId !== undefined &&
        (typeof config.runId !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(config.runId)))
    )
      throw new Error('INVALID_REPLAY_CONTROL');
    const fixture = config.fixture ?? 'prose';
    const tool = (request.tools ?? []).find((entry) => entry.function?.name === 'channel_send');
    const done =
      !config.runId ||
      consumed.has(config.runId) ||
      request.messages.at(-1)?.role === 'tool' ||
      !tool;
    if (!done) {
      consumed.add(config.runId);
      if (consumed.size > 64) consumed.delete(consumed.values().next().value);
    }
    const body = fixtures[fixture];
    const id = 'qa_replay_' + ++requestCount;
    const argumentsText = JSON.stringify({ channel_id: 'dm-' + config.slug, body });
    const toolCalls = [
      { id, type: 'function', function: { name: 'channel_send', arguments: argumentsText } },
    ];
    if (!request.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id,
          object: 'chat.completion',
          created: 1,
          model: 'qa-replay',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: done ? 'Done' : null,
                ...(done ? {} : { tool_calls: toolCalls }),
              },
              finish_reason: done ? 'stop' : 'tool_calls',
            },
          ],
        }),
      );
      return;
    }
    const started = performance.now();
    let chunks = 0,
      maxLagMs = 0;
    record({ event: 'start', id, fixture, reply: !done });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.flushHeaders();
    const send = (delta, finish_reason = null) =>
      res.write(
        'data: ' +
          JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created: 1,
            model: 'qa-replay',
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          '\n\n',
      );
    if (done) {
      send({ role: 'assistant', content: 'Done' });
      send({}, 'stop');
    } else {
      send({
        role: 'assistant',
        tool_calls: [
          { index: 0, id, type: 'function', function: { name: 'channel_send', arguments: '' } },
        ],
      });
      const graphemes = Array.from(
        new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(argumentsText),
        (entry) => entry.segment,
      );
      for (let offset = 0; offset < graphemes.length; offset += 80) {
        const due = started + chunks * 32;
        await delay(Math.max(0, due - performance.now()));
        if (res.destroyed) break;
        maxLagMs = Math.max(maxLagMs, performance.now() - due);
        send({
          tool_calls: [
            { index: 0, function: { arguments: graphemes.slice(offset, offset + 80).join('') } },
          ],
        });
        chunks++;
      }
      if (!res.destroyed) send({}, 'tool_calls');
    }
    if (!res.destroyed) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
    record({
      event: 'end',
      id,
      fixture,
      reply: !done,
      characters: done ? 4 : body.length,
      chunks,
      elapsedMs: performance.now() - started,
      maxLagMs,
    });
  } catch {
    if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'INVALID_REPLAY_REQUEST' } }));
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(JSON.stringify({ listening: server.address().port })),
);
