import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('small-screen Bot navigation becomes a closable drawer and keeps the chat usable', () => {
  assert.match(html, /id="bot-sidebar" class="sidebar"/u);
  assert.match(
    html,
    /id="mobile-bots-toggle"[^>]*aria-controls="bot-sidebar"[^>]*aria-expanded="false"/u,
  );
  assert.match(html, /id="nav-scrim"[^>]*aria-label="关闭 Bot 导航"/u);
  assert.match(html, /id="new-group"[^>]*aria-label="新建群聊"/u);
  assert.match(html, /id="new-chat-dialog"[\s\S]*?id="new-chat-bots"[^>]*aria-label="选择 Bot 开始私聊"/u);
  assert.doesNotMatch(html, /<summary>Bot 列表<\/summary>|id="bots"/u);
  assert.match(app, /\$\('new-chat'\)\.onclick = \(\) => \{ renderBots\(\); \$\('new-chat-dialog'\)\.showModal\(\); \}/u);
  assert.match(app, /async function startPrivateChatWithBot\(employeeId\)[\s\S]*?private-chat\.history[\s\S]*?selectBot\(employeeId, \{ inboxEpoch: selectionEpoch \}\)/u);
  assert.match(html, /id="chat-entry"[^>]*hidden>返回聊天/u);
  assert.match(html, /id="conversation-detail"[^>]*aria-label="会话详情"/u);
  assert.doesNotMatch(html, /class="tabs"|data-view=/u);
  assert.doesNotMatch(html, /id="contact-shortcut"/u);
  assert.match(app, /detail-feature-nav/u);
  assert.match(
    app,
    /\['identity', '身份'\][\s\S]*?\['memory', '文件记忆'\][\s\S]*?\['browser', '浏览器'\][\s\S]*?\['diagnostics', '诊断'\]/u,
  );
  assert.match(app, /function closeMobileNav\(\)[\s\S]*?classList\.remove\('mobile-nav-open'\)/u);
  assert.match(app, /event\.key === 'Escape'[\s\S]*?closeMobileNav\(\)/u);
  assert.match(
    app,
    /async function selectBot\(botId, \{ inboxEpoch = null \} = \{\}\) \{\s*if \(inboxEpoch === null\) invalidatePendingSelections\(\);\s*closeMobileNav\(\)/u,
  );

  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /\.workspace\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;/su);
  assert.match(
    mobile,
    /\.sidebar\s*\{[^}]*position:\s*fixed;[^}]*width:\s*min\(300px,\s*84vw\);[^}]*transform:\s*translateX\(-105%\)/su,
  );
  assert.match(mobile, /body\.mobile-nav-open \.sidebar\s*\{[^}]*transform:\s*translateX\(0\)/su);
  assert.match(mobile, /main\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/su);
  assert.match(
    css,
    /\.session-list\s*\{[^}]*align-content:\s*start;[^}]*grid-auto-rows:\s*max-content;/su,
  );
  assert.match(
    css,
    /\.detail-feature-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/su,
  );
  assert.match(
    mobile,
    /\.chat-view\s*\{[^}]*height:\s*calc\(100dvh - 180px\);[^}]*min-height:\s*300px;/su,
  );
  assert.match(
    css,
    /\.composer-control-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/su,
  );
  assert.doesNotMatch(css, /\.composer-control-row\s*\{[^}]*flex-wrap:\s*wrap;/su);
  assert.match(mobile, /\.composer-control-row\s*\{[^}]*min-width:\s*0;[^}]*gap:\s*6px;/su);
  assert.match(mobile, /#chat-model\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/su);
  assert.doesNotMatch(mobile, /grid-template-columns:\s*160px/u);
});

test('group chat shares the unified chat workspace and reports unavailable group features honestly', () => {
  assert.match(html, /<nav id="inbox-list"[^>]*aria-label="私聊与群聊"/u);
  assert.match(html, /<section id="view-groups" class="view group-chat-view" hidden>/u);
  assert.match(html, /class="group-tabs"[^>]*aria-label="群聊页面"/u);
  assert.match(html, /title="独立版未提供群文件"/u);
  assert.match(html, /title="独立版未提供群记忆"/u);
  assert.match(html, /title="群内执行不等同于委派任务"/u);
  assert.match(html, /id="group-model"[^>]*aria-label="选择群聊使用的模型"/u);
  assert.match(app, /command\('groups\.messages'/u);
  assert.match(app, /group\.members\.length\} 位成员/u);
  assert.match(app, /独立版未提供群文件或附件/u);
  assert.match(app, /独立版未提供群记忆/u);
  assert.match(app, /avatarVisual\(employee\?\.avatar, employee\?\.name \|\| message\.senderName, 'sm'/u);
  assert.match(app, /memberSelect\.id = 'group-members-editor'/u);
  assert.match(app, /async function openGroup\(groupId, options = \{\}\)[\s\S]*?renderGroup\(groupId, options\)/u);
  const openGroupFlow = app.slice(app.indexOf('async function openGroup('), app.indexOf('function setGroupComposerEnabled('));
  assert.doesNotMatch(openGroupFlow, /view\('groups'\)/u, 'background refresh must not reclaim the group view');
  assert.match(app, /if \(shouldSelectGroupAfterRequest\(requestEpoch, groupSelectionEpoch\)\) \{\s*invalidatePendingSelections\(\);\s*view\('groups'\);\s*await openGroup/u);
  assert.match(app, /const runStatus = \$\('group-run-status'\);[\s\S]*?runStatus\.append\(row\)/u);
  const groupRunRows = app.slice(app.indexOf('for (const run of result.runs || [])'), app.indexOf('const latestGroupMessage = groupMessages.at(-1)'));
  assert.match(groupRunRows, /runStatus\.append\(row\)/u);
  assert.doesNotMatch(groupRunRows, /list\.append\(row\)/u);
  assert.match(app, /async function returnToPrivateChat\(\)[\s\S]*?await selectInboxItem\(item\)/u);
  assert.match(app, /\$\('chat-entry'\)\.onclick = \(\) => void returnToPrivateChat\(\)\.catch\(showError\)/u);
  assert.match(app, /async function selectInboxItem\(item\)[\s\S]*?await selectBot\(item\.botId, \{ inboxEpoch: epoch \}\)[\s\S]*?await selectConversation\(/u);
  assert.match(css, /\.group-chat-view\s*\{[^}]*height:\s*calc\(100dvh - 94px\)/su);
  assert.match(css, /\.workspace\.details-open\s*\{[^}]*260px minmax\(0, 1fr\) 300px/su);
  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /\.group-chat-view\s*\{[^}]*height:\s*calc\(100dvh - 140px\)/su);
  assert.match(mobile, /\.group-composer\s*\{[^}]*padding:\s*8px/su);
});
