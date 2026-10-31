import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('settings expose one shared model account and explicit multi-employee contact selection', () => {
  assert.match(html, /id="view-catalog"[\s\S]*?id="model-form"[\s\S]*?id="contact-picker"/u);
  assert.match(app, /command\('model-account\.get'\)/u);
  assert.match(app, /command\('model-account\.update'/u);
  assert.match(html, /id="model-keyless"/u);
  assert.match(html, /id="clear-model-key"/u);
  assert.match(app, /keyless: \$\('model-keyless'\)\.checked/u);
  assert.match(app, /key: \$\('clear-model-key'\)\.checked \? ''/u);
  assert.match(app, /model-account\.auth\.start/u);
  assert.match(app, /contacts\.get/u);
  assert.match(app, /contacts\.set-primary/u);
  assert.match(app, /contacts\.count === 1/u);
  assert.match(app, /contacts\.count === 1/u);
  assert.match(app, /contacts\.primaryEmployeeId/u);
  assert.match(app, /contactsRequestEpoch/u);
  assert.match(app, /if \(epoch !== contactsRequestEpoch\) return/u);
  assert.match(app, /function initialEmployeeId\(\)[\s\S]*?bots\.length === 1[\s\S]*?contacts\?\.primaryEmployeeId/u);
  assert.doesNotMatch(html, /主 Bot|Bot 管理目录|model-settings-source|grant-delegation|worker-policy/u);
  assert.doesNotMatch(app, /主 Bot|Bot 管理目录|delegation\.grant|worker-policy\.update|connections\.bind-main/u);
});

test('new employee onboarding uses the backend status and retry APIs without composing welcome text', () => {
  assert.match(app, /command\('bots\.create',[\s\S]*?name:[\s\S]*?persona:/u);
  assert.match(app, /employees\.onboarding\.status/u);
  assert.match(app, /employees\.onboarding\.retry/u);
  assert.match(app, /welcome\?\.kind === 'preset-welcome'/u);
  assert.doesNotMatch(app, /创建后.*(你好|欢迎)|员工已创建并完成首次问候/u);
});

test('group interface uses persisted groups, stable employee IDs, explicit recipients and global model IDs', () => {
  for (const command of ['groups.create', 'groups.list', 'groups.get', 'groups.messages', 'groups.members.set', 'groups.send', 'groups.cancel'])
    assert.ok(app.includes(command), `missing ${command}`);
  assert.match(app, /recipientBotIds, modelId: model\.selection\.modelId/u);
  assert.match(app, /groupMessageCursor/u);
  assert.match(app, /groups\.messages', \{ groupId, limit: 50, \.\.\.\(older && groupMessageCursor \? \{ cursor: groupMessageCursor \} : \{\}\) \}/u);
  assert.match(app, /groupMessages = older \? \[\.\.\.unseen, \.\.\.groupMessages\] : \[\.\.\.groupMessages, \.\.\.unseen\]/u);
  assert.doesNotMatch(app, /groupMessages[\s\S]{0,200}\.sort\(/u);
  assert.match(app, /function modelIsUsable\(item\)[\s\S]*?verified', 'candidate'/u);
  assert.match(app, /dataset\.senderId = message\.senderId/u);
  assert.match(html, /id="group-recipients" multiple/u);
  assert.match(html, /id="group-model"/u);
  assert.match(app, /group-recipient-required/u);
});

test('group history resolves sender avatars by stable ID and safely falls back for removed members', () => {
  assert.match(app, /message\.senderType === 'bot' \? bots\.find\(\(item\) => item\.id === message\.senderId\) : null/u);
  assert.match(app, /avatarVisual\(employee\?\.avatar, employee\?\.name \|\| message\.senderName, 'xs', employee\?\.id\)/u);
  assert.match(app, /row\.dataset\.senderId = message\.senderId/u);
  assert.match(app, /function avatarVisual\(metadata, label[\s\S]*?metadata\?\.revision[\s\S]*?else avatar\.textContent/u);
  assert.match(app, /image\.src = `\/api\/v1\/bots\/\$\{encodeURIComponent\(metadata\.botId\)\}\/avatar\/\$\{metadata\.revision\}`/u);
  assert.match(css, /\.group-message-heading\s*\{[^}]*display:\s*flex;/su);
});

test('global model selector stays before send on a narrow viewport', () => {
  assert.match(html, /id="chat-model"[\s\S]*?id="cancel-run"[\s\S]*?id="send-message"/u);
  assert.match(html, /id="group-model"[\s\S]*?id="group-send"/u);
  assert.match(css, /@media \(max-width: 750px\)/u);
  const mobileViewport = 390;
  assert.ok(mobileViewport <= 750, 'the mobile layout breakpoint covers a 390px viewport');
  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /#chat-model\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/su);
  assert.match(mobile, /#group-model\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/su);
  assert.match(mobile, /\.chat-view\s*\{[^}]*width:\s*100%;/su);
  assert.match(mobile, /\.composer-control-row\s*\{[^}]*min-width:\s*0;/su);
});
