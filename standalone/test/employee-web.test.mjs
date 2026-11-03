import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('private employee chat remains available with persisted conversation and model commands', () => {
  assert.match(html, /id="new-chat-bots" class="new-chat-bot-list" aria-label="选择 Bot 开始私聊"/u);
  assert.match(html, /id="new-chat-dialog"/u);
  assert.match(html, /id="settings-entry"[^>]*>模型账户设置/u);
  assert.match(html, /id="chat-model" aria-label="选择本次使用的模型"/u);
  assert.match(html, /id="history-entry"[^>]*>历史记录/u);
  for (const command of [
    'private-chat.open',
    'private-chat.models',
    'private-chat.select-conversation',
    'private-chat.history',
    'private-chat.select-model',
  ])
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
  assert.match(
    app,
    /if \(initial && !\$\('task-dialog'\)\.open\) \$\('task-dialog'\)\.showModal\(\)/u,
  );
  assert.match(app, /direction: 'backward'/u);
  assert.match(app, /task\.initiatorBotId/u);
  assert.match(app, /task\.executorBotId/u);
  assert.match(app, /current\.configSnapshot\?\.sourceBotId/u);
  assert.match(app, /const title = `\$\{initiator \?\? 'Bot'\} → \$\{executor \?\? 'Bot'\}`/u);
  assert.match(app, /detail\.items[\s\S]*?detail\.root/u);
  assert.doesNotMatch(html, /id="task-trace"/u);
});

test('session workspace uses server inbox items for pinning, unread state, and private or group navigation', () => {
  assert.match(html, /<nav id="pinned-conversations"[^>]*aria-label="置顶会话"/u);
  assert.match(html, /<nav id="inbox-list"[^>]*aria-label="私聊与群聊"/u);
  assert.match(html, /<aside id="conversation-detail"[^>]*aria-label="会话详情"/u);
  assert.match(html, /id="account-menu-toggle"[^>]*aria-haspopup="menu"/u);
  assert.match(html, /id="workspace-role-unavailable"[^>]*disabled/u);
  for (const command of [
    'inbox.list',
    'inbox.pin',
    'inbox.read',
    'groups.get',
    'private-chat.select-conversation',
  ])
    assert.ok(app.includes(command), `missing ${command}`);
  assert.match(app, /type: item\.type, id: item\.id, pinned/u);
  assert.match(app, /through: \{ createdAt: message\.createdAt, id: message\.id \}/u);
  assert.match(app, /startPrivateChat\(chat\.botId\)\.catch\(showError\)/u);
  assert.match(
    app,
    /selectedInboxItem\?\.type === 'private'[\s\S]*?selectedInboxItem\.unreadCount > 0[\s\S]*?markInboxRead\(selectedInboxItem, latestMessage/u,
  );
  assert.match(
    app,
    /selectedInboxItem\?\.type === 'group'[\s\S]*?selectedInboxItem\.unreadCount > 0[\s\S]*?markInboxRead\(selectedInboxItem, latestGroupMessage/u,
  );
  assert.match(app, /inboxReadRequests = new Set\(\)/u);
  assert.match(app, /if \(inboxReadRequests\.has\(key\)\) return/u);
  assert.match(app, /inbox\.startChats|inboxStartChats/u);
  assert.match(
    app,
    /if \(item\.type === 'private' && item\.id === communicationTimeline\.conversationId\)/u,
  );
  assert.match(
    app,
    /else if \(!communicationTimeline\.loaded\)[\s\S]*?正在读取此会话的 Bot 间通信事件/u,
  );
  assert.match(
    app,
    /else if \(!communicationTimeline\.items\.length\)[\s\S]*?此会话尚无关联的 Bot 间通信事件/u,
  );
  assert.match(app, /Bot 间通信暂时无法读取；私聊消息仍可查看/u);
  assert.match(app, /command\('bot-messages\.timeline'/u);
  assert.match(app, /memory\.list/u);
  assert.match(app, /browser\.origins\.list/u);
  assert.match(app, /协作任务/u);
  assert.match(app, /普通文件/u);
  assert.match(html, /id="summary-dialog"[^>]*aria-labelledby="summary-title"/u);
  assert.match(app, /summary-dialog'\)\.addEventListener\('click'/u);
  assert.match(app, /event\.key === 'Escape'/u);
  assert.match(css, /\.workspace\.details-open\s*\{/u);
  assert.match(css, /@media \(max-width: 980px\)/u);
  assert.match(css, /@media \(max-width: 420px\)/u);
});
