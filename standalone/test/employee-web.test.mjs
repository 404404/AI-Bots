import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('private employee chat remains available with persisted conversation and model commands', () => {
  assert.match(html, /id="bots" aria-label="员工列表"/u);
  assert.match(html, /id="settings-entry"[^>]*>模型账户设置/u);
  assert.match(html, /id="chat-model" aria-label="选择本次使用的模型"/u);
  assert.match(html, /id="history-entry"[^>]*>历史记录/u);
  for (const command of ['private-chat.open', 'private-chat.models', 'private-chat.select-conversation', 'private-chat.history', 'private-chat.select-model'])
    assert.ok(app.includes(command), `missing ${command}`);
  assert.doesNotMatch(html, /model-settings-source|grant-delegation|worker-policy/u);
});

test('new chat submissions pin the explicit selected model and preserve idempotent retries', () => {
  assert.match(app, /selection: model\.selection/u);
  assert.match(app, /idempotencyKey: id\(\)/u);
  assert.match(app, /localStorage\.setItem\(storageKey, JSON\.stringify\(submission\)\)/u);
  assert.match(app, /if \(!submission\)[\s\S]*?selection: model\.selection/u);
  assert.match(app, /Boolean\(pending\(\)\)/u);
  assert.doesNotMatch(app, /crypto\.randomUUID\s*\(/u);
});

test('timeline collaboration cards open canonical task details as accessible dialogs', () => {
  assert.match(html, /<dialog id="task-dialog" aria-labelledby="task-dialog-title"/u);
  assert.match(html, /id="task-dialog-content"/u);
  assert.match(app, /private-chat\.timeline/u);
  assert.match(app, /private-chat\.task-detail/u);
  assert.match(html, /id="task-detail-updated"/u);
  assert.match(app, /taskDetailEpoch/u);
  assert.match(app, /deadlineAt: Date\.now\(\) \+ 300000/u);
  assert.match(app, /setInterval\(\(\) => \{[\s\S]*?refreshTaskDetail\(context\.epoch\)/u);
  assert.match(app, /if \(initial && !\$\('task-dialog'\)\.open\) \$\('task-dialog'\)\.showModal\(\)/u);
  assert.match(app, /direction: 'backward'/u);
  assert.match(app, /task\.initiatorBotId/u);
  assert.match(app, /task\.executorBotId/u);
  assert.match(app, /current\.configSnapshot\?\.sourceBotId/u);
  assert.match(app, /const title = `\$\{initiator \?\? 'Bot'\} → \$\{executor \?\? 'Bot'\}`/u);
  assert.match(app, /detail\.items[\s\S]*?detail\.root/u);
  assert.doesNotMatch(html, /id="task-trace"/u);
});
