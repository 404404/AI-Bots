import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('private employee chat replaces the standalone conversation sidebar and model tab', () => {
  assert.match(html, /id="bots" aria-label="Bot 列表"/u);
  assert.doesNotMatch(html, /id="conversations"|id="new-conversation"|data-view="model"/u);
  assert.match(html, /id="settings-entry"[^>]*>模型来源与授权设置/u);
  assert.match(html, /id="model-settings-source"/u);
  assert.match(html, /id="open-model-settings"/u);
  assert.match(html, /id="chat-model" aria-label="选择当前 Bot 可用的模型"/u);
  assert.match(app, /const placeholder = node\('option', selected[\s\S]*?所选来源已失效，请重新选择[\s\S]*?选择模型/u);
  assert.match(app, /placeholder\.value = ''/u);
  assert.match(html, /id="history-entry"[^>]*>历史记录/u);
  assert.match(app, /private-chat\.open/u);
  assert.match(app, /private-chat\.models/u);
  assert.match(app, /private-chat\.select-conversation/u);
  assert.match(app, /private-chat\.history/u);
  assert.match(app, /private-chat\.select-model/u);
  assert.match(app, /async function openSourceSettings\(botId\)[\s\S]*?sourceSettingsEpoch/u);
  assert.match(app, /function fillSettings\(\) \{[\s\S]*?\n\}\nfunction fillSourceSettings/u);
  const identityFill = app.match(/function fillSettings\(\) \{([\s\S]*?)\n\}\nfunction fillSourceSettings/u)?.[1] ?? '';
  assert.doesNotMatch(identityFill, /model-provider|model-base-url|model-name|model-proxy|model-keyless|model-key|clear-credential|model-connection-status|credential-status/u);
  assert.match(app, /async function openSourceSettings\(botId\) \{[\s\S]*?sourceSettingsBot = null;[\s\S]*?\$\('model-key'\)\.value = '';[\s\S]*?\$\('codex-callback'\)\.value = '';[\s\S]*?setSourceSettingsLoading\(true\);[\s\S]*?await command\('bots\.get', \{ botId \}\)/u);
  assert.match(app, /function setSourceSettingsLoading\(loading\) \{[\s\S]*?control\.disabled = loading;[\s\S]*?codex-device-login[\s\S]*?codex-callback/u);
  assert.match(app, /const botId = bot\.id, epoch = botSelectionEpoch;[\s\S]*?const updated = await command\('bots\.update',[\s\S]*?if \(bot\?\.id !== botId \|\| botSelectionEpoch !== epoch\) return;[\s\S]*?bot = updated;/u);
  assert.match(app, /modelButton\.onclick = \(\) => void openSourceSettings\(item\.id\)/u);
  assert.match(app, /saveModel\(sourceBotId = sourceSettingsBot\?\.id/u);
  assert.doesNotMatch(app, /modelButton\.onclick = \(\) => void selectBot\(item\.id\)/u);
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
  assert.match(app, /if \(older\)[\s\S]*?timelineCursor = page\.nextCursor[\s\S]*?else if \(!timelineInitialized\)/u);
  assert.match(app, /const requestKey = `\$\{botId\}\\0\$\{conversationId\}\\0\$\{epoch\}/u);
  assert.match(app, /task\.initiatorBotId/u);
  assert.match(app, /task\.executorBotId/u);
  assert.match(app, /const title = `\$\{initiator \?\? 'Bot'\} → \$\{executor \?\? 'Bot'\}`/u);
  assert.match(app, /const requestKey = `\$\{botId\}\\0\$\{conversationId\}\\0\$\{epoch\}/u);
  assert.match(app, /detail\.items[\s\S]*?detail\.root/u);
  assert.match(app, /node\(label === '输入' \|\| label === '结果' \|\| label === '错误' \? 'pre' : 'p', String\(value\)\)/u);
  assert.doesNotMatch(html, /id="task-trace"/u);
});

test('390px chat surface allows model selection, history and timeline paging without horizontal overflow', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /\.chat-view\s*\{[^}]*width:\s*100%;[^}]*overflow:\s*hidden;/su);
  assert.match(mobile, /#chat-model\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*none;/su);
  assert.match(mobile, /\.timeline-task\s*\{[^}]*width:\s*100%;/su);
  assert.match(mobile, /\.dialog-content\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/su);
  assert.match(html, /id="load-older"[^>]*>载入后续记录/u);
});
